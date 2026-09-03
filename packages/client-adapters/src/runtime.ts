import { constants as fsConstants } from "node:fs";
import {
  chmod as chmodFs,
  copyFile as copyFileFs,
  lstat as lstatFs,
  mkdir as mkdirFs,
  open as openFs,
  readFile as readFileFs,
  realpath as realpathFs,
  rename as renameFs,
  stat as statFs,
  unlink as unlinkFs,
  writeFile as writeFileFs,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import type {
  AdapterRuntime,
  CopyFileOptions,
  ExecFileOptions,
  ExecResult,
  FileStatSnapshot,
  MkdirOptions,
  WriteFileOptions,
} from "./types.js";

export type AdapterRuntimeErrorCode =
  | "EXEC_INVALID_OPTIONS"
  | "EXEC_SPAWN_FAILED"
  | "EXEC_TIMEOUT"
  | "EXEC_OUTPUT_LIMIT"
  | "FS_OPERATION_FAILED"
  | "OPEN_URL_FAILED";

export type AdapterRuntimeOperation =
  | "execFile"
  | "readFile"
  | "writeFile"
  | "rename"
  | "mkdir"
  | "lstat"
  | "stat"
  | "realpath"
  | "unlink"
  | "chmod"
  | "copyFile"
  | "fsyncFile"
  | "fsyncDirectory"
  | "openUrl";

export interface NodeAdapterRuntimeOptions {
  readonly platform?: NodeJS.Platform;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
}

export class AdapterRuntimeError extends Error {
  readonly code: AdapterRuntimeErrorCode;
  readonly operation: AdapterRuntimeOperation;
  readonly causeCode: string | undefined;

  constructor(
    code: AdapterRuntimeErrorCode,
    operation: AdapterRuntimeOperation,
    message: string,
    options?: { readonly causeCode?: string | undefined; readonly cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AdapterRuntimeError";
    this.code = code;
    this.operation = operation;
    this.causeCode = options?.causeCode;
  }
}

function createFrozenEnv(env: NodeJS.ProcessEnv | undefined): Readonly<NodeJS.ProcessEnv> {
  return Object.freeze({ ...(env ?? process.env) });
}

function createStatSnapshot(stats: {
  mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FileStatSnapshot {
  return {
    mode: stats.mode,
    isFile: () => stats.isFile(),
    isDirectory: () => stats.isDirectory(),
    isSymbolicLink: () => stats.isSymbolicLink(),
  };
}

function asNodeError(error: unknown): NodeJS.ErrnoException {
  return error as NodeJS.ErrnoException;
}

function wrapFsError(
  operation: AdapterRuntimeOperation,
  message: string,
  error: unknown,
): AdapterRuntimeError {
  const nodeError = asNodeError(error);
  return new AdapterRuntimeError("FS_OPERATION_FAILED", operation, message, {
    cause: error,
    causeCode: nodeError.code,
  });
}

function bufferChunkBytes(chunk: string | Buffer): number {
  return Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
}

function toStringChunk(chunk: string | Buffer): string {
  return Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
}

async function syncPath(path: string): Promise<void> {
  const handle = await openFs(path, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function getOpenCommand(platform: NodeJS.Platform): readonly [string, readonly string[]] {
  switch (platform) {
    case "darwin":
      return ["open", []];
    case "win32":
      return ["explorer.exe", []];
    default:
      return ["xdg-open", []];
  }
}

export function createNodeAdapterRuntime(options: NodeAdapterRuntimeOptions = {}): AdapterRuntime {
  const env = createFrozenEnv(options.env);
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? env.HOME ?? env.USERPROFILE ?? process.cwd();

  return Object.freeze({
    platform,
    cwd,
    env,
    homeDirectory,
    async execFile(
      executable: string,
      args: readonly string[],
      execOptions: ExecFileOptions,
    ): Promise<ExecResult> {
      if (execOptions.shell !== false || execOptions.stdin !== "ignore") {
        throw new AdapterRuntimeError(
          "EXEC_INVALID_OPTIONS",
          "execFile",
          "Adapter commands require shell: false and stdin: ignore",
        );
      }

      return await new Promise<ExecResult>((resolve, reject) => {
        let settled = false;
        let forcedError: AdapterRuntimeError | undefined;
        let stdout = "";
        let stderr = "";
        let stdoutBytes = 0;
        let stderrBytes = 0;

        const child = spawn(executable, [...args], {
          cwd,
          env,
          shell: execOptions.shell,
          stdio: [execOptions.stdin, "pipe", "pipe"],
        });

        const timeout = setTimeout(() => {
          if (settled || forcedError) {
            return;
          }

          forcedError = new AdapterRuntimeError(
            "EXEC_TIMEOUT",
            "execFile",
            `Command timed out after ${execOptions.timeoutMs}ms: ${executable}`,
          );
          child.kill("SIGKILL");
        }, execOptions.timeoutMs);

        const finalize = (callback: () => void) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeout);
          callback();
        };

        child.on("error", (error) => {
          finalize(() => {
            reject(
              new AdapterRuntimeError(
                "EXEC_SPAWN_FAILED",
                "execFile",
                `Unable to start command: ${executable}`,
                { cause: error, causeCode: asNodeError(error).code },
              ),
            );
          });
        });

        const onLimitExceeded = (streamName: "stdout" | "stderr", limit: number) => {
          if (settled || forcedError) {
            return;
          }

          forcedError = new AdapterRuntimeError(
            "EXEC_OUTPUT_LIMIT",
            "execFile",
            `Command exceeded ${streamName} limit of ${limit} bytes: ${executable}`,
          );
          child.kill("SIGKILL");
        };

        child.stdout?.on("data", (chunk: string | Buffer) => {
          stdoutBytes += bufferChunkBytes(chunk);
          if (stdoutBytes > execOptions.maxStdoutBytes) {
            onLimitExceeded("stdout", execOptions.maxStdoutBytes);
            return;
          }

          stdout += toStringChunk(chunk);
        });

        child.stderr?.on("data", (chunk: string | Buffer) => {
          stderrBytes += bufferChunkBytes(chunk);
          if (stderrBytes > execOptions.maxStderrBytes) {
            onLimitExceeded("stderr", execOptions.maxStderrBytes);
            return;
          }

          stderr += toStringChunk(chunk);
        });

        child.on("close", (code) => {
          finalize(() => {
            if (forcedError) {
              reject(forcedError);
              return;
            }

            resolve({
              exitCode: code ?? 1,
              stdout,
              stderr,
            });
          });
        });
      });
    },
    async readFile(path: string): Promise<string> {
      try {
        return await readFileFs(path, "utf8");
      } catch (error) {
        throw wrapFsError("readFile", `Unable to read file: ${path}`, error);
      }
    },
    async writeFile(path: string, content: string, writeOptions?: WriteFileOptions): Promise<void> {
      try {
        await writeFileFs(path, content, {
          encoding: "utf8",
          flag: writeOptions?.exclusive ? "wx" : "w",
          mode: writeOptions?.mode,
        });
      } catch (error) {
        throw wrapFsError("writeFile", `Unable to write file: ${path}`, error);
      }
    },
    async rename(from: string, to: string): Promise<void> {
      try {
        await renameFs(from, to);
      } catch (error) {
        throw wrapFsError("rename", `Unable to rename path: ${from}`, error);
      }
    },
    async mkdir(path: string, mkdirOptions?: MkdirOptions): Promise<void> {
      try {
        await mkdirFs(path, {
          recursive: mkdirOptions?.recursive,
          mode: mkdirOptions?.mode,
        });
      } catch (error) {
        throw wrapFsError("mkdir", `Unable to create directory: ${path}`, error);
      }
    },
    async lstat(path: string): Promise<FileStatSnapshot> {
      try {
        return createStatSnapshot(await lstatFs(path));
      } catch (error) {
        throw wrapFsError("lstat", `Unable to lstat path: ${path}`, error);
      }
    },
    async stat(path: string): Promise<FileStatSnapshot> {
      try {
        return createStatSnapshot(await statFs(path));
      } catch (error) {
        throw wrapFsError("stat", `Unable to stat path: ${path}`, error);
      }
    },
    async realpath(path: string): Promise<string> {
      try {
        return await realpathFs(path, "utf8");
      } catch (error) {
        throw wrapFsError("realpath", `Unable to resolve realpath: ${path}`, error);
      }
    },
    async unlink(path: string): Promise<void> {
      try {
        await unlinkFs(path);
      } catch (error) {
        throw wrapFsError("unlink", `Unable to remove path: ${path}`, error);
      }
    },
    async chmod(path: string, mode: number): Promise<void> {
      try {
        await chmodFs(path, mode);
      } catch (error) {
        throw wrapFsError("chmod", `Unable to chmod path: ${path}`, error);
      }
    },
    async copyFile(from: string, to: string, copyOptions?: CopyFileOptions): Promise<void> {
      try {
        await copyFileFs(from, to, copyOptions?.exclusive ? fsConstants.COPYFILE_EXCL : 0);
      } catch (error) {
        throw wrapFsError("copyFile", `Unable to copy file: ${from}`, error);
      }
    },
    async fsyncFile(path: string): Promise<void> {
      try {
        await syncPath(path);
      } catch (error) {
        throw wrapFsError("fsyncFile", `Unable to fsync file: ${path}`, error);
      }
    },
    async fsyncDirectory(path: string): Promise<void> {
      if (platform === "win32") {
        return;
      }

      try {
        await syncPath(path);
      } catch (error) {
        throw wrapFsError("fsyncDirectory", `Unable to fsync directory: ${path}`, error);
      }
    },
    async openUrl(url: string): Promise<void> {
      const [command, commandArgs] = getOpenCommand(platform);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, [...commandArgs, url], {
          cwd,
          env,
          shell: false,
          stdio: "ignore",
        });

        child.on("error", (error) => {
          reject(
            new AdapterRuntimeError("OPEN_URL_FAILED", "openUrl", "Unable to open URL", {
              cause: error,
              causeCode: asNodeError(error).code,
            }),
          );
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(
            new AdapterRuntimeError(
              "OPEN_URL_FAILED",
              "openUrl",
              `URL opener exited with code ${code ?? 1}`,
            ),
          );
        });
      });
    },
  });
}
