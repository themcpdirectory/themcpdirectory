import { dirname, posix, win32 } from "node:path";
import type { ClientScope, JsonValue } from "@themcpdirectory/install-engine";
import type { AdapterRuntime } from "./types.js";

export interface VsCodeConfigDocument {
  readonly servers?: Readonly<Record<string, unknown>>;
  readonly inputs?: readonly unknown[];
}

export interface VsCodeConfigMutation {
  readonly path: string;
  readonly backupPath: string;
  readonly tempPath: string;
  readonly scope: ClientScope;
  readonly serverKey: string;
}

export type VsCodeJsonErrorCode =
  | "VSCODE_UNSUPPORTED_SCOPE"
  | "VSCODE_INVALID_PATH"
  | "VSCODE_SYMLINK_NOT_ALLOWED"
  | "VSCODE_MALFORMED_CONFIG"
  | "VSCODE_INVALID_DOCUMENT"
  | "VSCODE_VERIFICATION_FAILED";

export class VsCodeJsonError extends Error {
  readonly code: VsCodeJsonErrorCode;

  constructor(code: VsCodeJsonErrorCode, message: string) {
    super(message);
    this.name = "VsCodeJsonError";
    this.code = code;
  }
}

export interface VsCodeScopePaths {
  readonly rootPath: string;
  readonly configPath: string;
}

export interface ApplyVsCodeMutationOptions {
  readonly mutation: VsCodeConfigMutation;
  readonly apply: (document: VsCodeConfigDocument) => VsCodeConfigDocument;
  readonly verify: (document: VsCodeConfigDocument) => boolean;
}

function getPathModule(platform: NodeJS.Platform) {
  return platform === "win32" ? win32 : posix;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFileSystemErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  return typeof error.causeCode === "string"
    ? error.causeCode
    : typeof error.code === "string"
      ? error.code
      : undefined;
}

function parseVsCodeConfigDocument(raw: string): VsCodeConfigDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VsCodeJsonError(
      "VSCODE_MALFORMED_CONFIG",
      "VS Code MCP config is malformed JSON and will not be overwritten",
    );
  }

  if (!isRecord(parsed)) {
    throw new VsCodeJsonError(
      "VSCODE_INVALID_DOCUMENT",
      "VS Code MCP config must be a JSON object",
    );
  }

  if (parsed.servers !== undefined && !isRecord(parsed.servers)) {
    throw new VsCodeJsonError(
      "VSCODE_INVALID_DOCUMENT",
      "VS Code MCP config servers must be a JSON object when present",
    );
  }

  if (parsed.inputs !== undefined && !Array.isArray(parsed.inputs)) {
    throw new VsCodeJsonError(
      "VSCODE_INVALID_DOCUMENT",
      "VS Code MCP config inputs must be an array when present",
    );
  }

  return parsed as VsCodeConfigDocument;
}

function toWritableDocument(document: VsCodeConfigDocument): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(document)) as Record<string, JsonValue>;
}

function toCanonicalJson(document: VsCodeConfigDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function normalizeForComparison(platform: NodeJS.Platform, value: string): string {
  return platform === "win32" ? value.toLowerCase() : value;
}

function assertInsideRoot(
  platform: NodeJS.Platform,
  candidatePath: string,
  rootPath: string,
  field: string,
): void {
  const pathModule = getPathModule(platform);
  const relative = pathModule.relative(rootPath, candidatePath);
  if (
    relative.length === 0 ||
    relative === "." ||
    (!relative.startsWith("..") && !pathModule.isAbsolute(relative))
  ) {
    return;
  }

  throw new VsCodeJsonError(
    "VSCODE_INVALID_PATH",
    `VS Code ${field} must stay within the approved scope root`,
  );
}

async function ensureDirectoryNotSymlink(runtime: AdapterRuntime, path: string): Promise<void> {
  try {
    const stat = await runtime.lstat(path);
    if (stat.isSymbolicLink()) {
      throw new VsCodeJsonError(
        "VSCODE_SYMLINK_NOT_ALLOWED",
        `VS Code configuration directory is a symlink: ${path}`,
      );
    }
    if (!stat.isDirectory()) {
      throw new VsCodeJsonError(
        "VSCODE_INVALID_PATH",
        `VS Code configuration root is not a directory: ${path}`,
      );
    }
  } catch (error) {
    const code = getFileSystemErrorCode(error);
    if (code !== "ENOENT") {
      throw error;
    }
    await runtime.mkdir(path, { recursive: true, mode: 0o700 });
  }
}

async function assertFileNotSymlink(runtime: AdapterRuntime, path: string): Promise<boolean> {
  try {
    const stat = await runtime.lstat(path);
    if (stat.isSymbolicLink()) {
      throw new VsCodeJsonError(
        "VSCODE_SYMLINK_NOT_ALLOWED",
        `VS Code configuration file is a symlink: ${path}`,
      );
    }
    if (!stat.isFile()) {
      throw new VsCodeJsonError(
        "VSCODE_INVALID_PATH",
        `VS Code configuration path is not a file: ${path}`,
      );
    }
    return true;
  } catch (error) {
    const code = getFileSystemErrorCode(error);
    if (code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function safeFsyncDirectory(runtime: AdapterRuntime, path: string): Promise<void> {
  try {
    await runtime.fsyncDirectory(path);
  } catch (error) {
    const code = getFileSystemErrorCode(error);
    if (code !== "ENOTSUP" && code !== "EINVAL" && code !== "ENOSYS") {
      throw error;
    }
  }
}

async function safeUnlink(runtime: AdapterRuntime, path: string): Promise<void> {
  try {
    await runtime.unlink(path);
  } catch (error) {
    const code = getFileSystemErrorCode(error);
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function copyFileToAvailableBackupPath(
  runtime: AdapterRuntime,
  fromPath: string,
  preferredBackupPath: string,
): Promise<string> {
  let suffix = 0;
  while (true) {
    const candidatePath = suffix === 0 ? preferredBackupPath : `${preferredBackupPath}.${suffix}`;
    try {
      await runtime.copyFile(fromPath, candidatePath, { exclusive: true });
      return candidatePath;
    } catch (error) {
      const code = getFileSystemErrorCode(error);
      if (code !== "EEXIST") {
        throw error;
      }
      suffix += 1;
    }
  }
}

export function resolveVsCodeScopePaths(
  runtime: AdapterRuntime,
  scope: ClientScope,
): VsCodeScopePaths {
  const pathModule = getPathModule(runtime.platform);
  if (scope === "global") {
    throw new VsCodeJsonError(
      "VSCODE_UNSUPPORTED_SCOPE",
      "VS Code adapter does not support global scope",
    );
  }

  const rootPath =
    scope === "project"
      ? pathModule.join(runtime.cwd, ".vscode")
      : pathModule.join(runtime.homeDirectory, ".copilot");

  return Object.freeze({
    rootPath,
    configPath:
      scope === "project"
        ? pathModule.join(rootPath, "mcp.json")
        : pathModule.join(rootPath, "mcp-config.json"),
  });
}

export function createVsCodeConfigMutation(
  runtime: AdapterRuntime,
  options: { readonly scope: ClientScope; readonly serverKey: string; readonly intentHash: string },
): VsCodeConfigMutation {
  const scopePaths = resolveVsCodeScopePaths(runtime, options.scope);
  assertInsideRoot(runtime.platform, scopePaths.configPath, scopePaths.rootPath, "config path");

  const suffix = options.intentHash.slice(0, 12);
  return Object.freeze({
    path: scopePaths.configPath,
    backupPath: `${scopePaths.configPath}.bak.${suffix}`,
    tempPath: `${scopePaths.configPath}.tmp.${suffix}`,
    scope: options.scope,
    serverKey: options.serverKey,
  });
}

export async function readVsCodeConfigDocument(
  runtime: AdapterRuntime,
  mutation: VsCodeConfigMutation,
): Promise<VsCodeConfigDocument | null> {
  const scopePaths = resolveVsCodeScopePaths(runtime, mutation.scope);
  assertInsideRoot(runtime.platform, mutation.path, scopePaths.rootPath, "config path");

  const exists = await assertFileNotSymlink(runtime, mutation.path);
  if (!exists) {
    return null;
  }

  const raw = await runtime.readFile(mutation.path);
  return parseVsCodeConfigDocument(raw);
}

export async function applyVsCodeConfigMutation(
  runtime: AdapterRuntime,
  options: ApplyVsCodeMutationOptions,
): Promise<void> {
  const { mutation } = options;
  const scopePaths = resolveVsCodeScopePaths(runtime, mutation.scope);

  assertInsideRoot(runtime.platform, mutation.path, scopePaths.rootPath, "config path");
  assertInsideRoot(runtime.platform, mutation.backupPath, scopePaths.rootPath, "backup path");
  assertInsideRoot(runtime.platform, mutation.tempPath, scopePaths.rootPath, "temp path");

  await ensureDirectoryNotSymlink(runtime, scopePaths.rootPath);
  const pathModule = getPathModule(runtime.platform);
  const rootRealpath = await runtime.realpath(scopePaths.rootPath);
  const configParent = dirname(mutation.path);
  const configParentRealpath = await runtime.realpath(configParent);
  if (
    !normalizeForComparison(runtime.platform, configParentRealpath).startsWith(
      normalizeForComparison(runtime.platform, rootRealpath),
    )
  ) {
    throw new VsCodeJsonError(
      "VSCODE_INVALID_PATH",
      "VS Code config parent resolves outside the approved root",
    );
  }
  if (pathModule.relative(scopePaths.rootPath, mutation.path).startsWith("..")) {
    throw new VsCodeJsonError(
      "VSCODE_INVALID_PATH",
      "VS Code config path must remain within the approved root",
    );
  }

  const fileExists = await assertFileNotSymlink(runtime, mutation.path);
  const currentMode = fileExists ? (await runtime.stat(mutation.path)).mode : 0o600;
  const currentDocument = fileExists
    ? parseVsCodeConfigDocument(await runtime.readFile(mutation.path))
    : ({} satisfies VsCodeConfigDocument);

  const nextDocument = options.apply(currentDocument);
  if (!isRecord(nextDocument)) {
    throw new VsCodeJsonError(
      "VSCODE_INVALID_DOCUMENT",
      "VS Code mutation must produce a JSON object document",
    );
  }

  let backupPathUsed: string | null = null;
  await safeUnlink(runtime, mutation.tempPath);
  if (fileExists) {
    backupPathUsed = await copyFileToAvailableBackupPath(
      runtime,
      mutation.path,
      mutation.backupPath,
    );
  }

  await runtime.writeFile(mutation.tempPath, toCanonicalJson(nextDocument), {
    mode: currentMode,
    exclusive: true,
  });
  await runtime.fsyncFile(mutation.tempPath);
  await runtime.rename(mutation.tempPath, mutation.path);
  await safeFsyncDirectory(runtime, scopePaths.rootPath);

  let verified: VsCodeConfigDocument;
  try {
    verified = parseVsCodeConfigDocument(await runtime.readFile(mutation.path));
  } catch (error) {
    if (fileExists && backupPathUsed !== null) {
      await runtime.copyFile(backupPathUsed, mutation.path);
      await runtime.chmod(mutation.path, currentMode);
      await runtime.fsyncFile(mutation.path);
      await safeFsyncDirectory(runtime, scopePaths.rootPath);
    } else {
      await safeUnlink(runtime, mutation.path);
      await safeFsyncDirectory(runtime, scopePaths.rootPath);
    }
    throw error;
  }

  if (!options.verify(verified)) {
    if (fileExists && backupPathUsed !== null) {
      await runtime.copyFile(backupPathUsed, mutation.path);
      await runtime.chmod(mutation.path, currentMode);
      await runtime.fsyncFile(mutation.path);
      await safeFsyncDirectory(runtime, scopePaths.rootPath);
    } else {
      await safeUnlink(runtime, mutation.path);
      await safeFsyncDirectory(runtime, scopePaths.rootPath);
    }
    throw new VsCodeJsonError(
      "VSCODE_VERIFICATION_FAILED",
      "VS Code configuration verification failed after write; restored backup",
    );
  }
}

export function setVsCodeServerEntry(
  document: VsCodeConfigDocument,
  serverKey: string,
  entry: JsonValue,
): VsCodeConfigDocument {
  const writable = toWritableDocument(document);
  const currentServers = isRecord(writable.servers)
    ? { ...(writable.servers as Record<string, JsonValue>) }
    : {};
  currentServers[serverKey] = entry;
  writable.servers = currentServers;
  return writable as VsCodeConfigDocument;
}

export function removeVsCodeServerEntry(
  document: VsCodeConfigDocument,
  serverKey: string,
): VsCodeConfigDocument {
  const writable = toWritableDocument(document);
  if (!isRecord(writable.servers)) {
    return writable as VsCodeConfigDocument;
  }

  const nextServers = { ...(writable.servers as Record<string, JsonValue>) };
  delete nextServers[serverKey];
  writable.servers = nextServers;
  return writable as VsCodeConfigDocument;
}

export function setVsCodeInputs(
  document: VsCodeConfigDocument,
  nextInputs: readonly JsonValue[],
): VsCodeConfigDocument {
  const writable = toWritableDocument(document);
  writable.inputs = [...nextInputs] as JsonValue;
  return writable as VsCodeConfigDocument;
}

export function getVsCodeServerEntry(document: VsCodeConfigDocument, serverKey: string): unknown {
  if (!document.servers || !isRecord(document.servers)) {
    return undefined;
  }
  return document.servers[serverKey];
}
