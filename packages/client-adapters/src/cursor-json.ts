import { dirname, posix, win32 } from "node:path";
import type { ClientScope, JsonValue } from "@themcpdirectory/install-engine";
import type { AdapterRuntime } from "./types.js";

export interface CursorConfigDocument {
  readonly mcpServers?: Readonly<Record<string, unknown>>;
}

export interface CursorConfigMutation {
  readonly path: string;
  readonly backupPath: string;
  readonly tempPath: string;
  readonly scope: ClientScope;
  readonly serverKey: string;
}

export type CursorJsonErrorCode =
  | "CURSOR_UNSUPPORTED_SCOPE"
  | "CURSOR_INVALID_PATH"
  | "CURSOR_SYMLINK_NOT_ALLOWED"
  | "CURSOR_MALFORMED_CONFIG"
  | "CURSOR_INVALID_DOCUMENT"
  | "CURSOR_VERIFICATION_FAILED";

export class CursorJsonError extends Error {
  readonly code: CursorJsonErrorCode;

  constructor(code: CursorJsonErrorCode, message: string) {
    super(message);
    this.name = "CursorJsonError";
    this.code = code;
  }
}

export interface CursorScopePaths {
  readonly rootPath: string;
  readonly configPath: string;
}

export interface ApplyCursorMutationOptions {
  readonly mutation: CursorConfigMutation;
  readonly apply: (document: CursorConfigDocument) => CursorConfigDocument;
  readonly verify: (document: CursorConfigDocument) => boolean;
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

function parseCursorConfigDocument(raw: string): CursorConfigDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CursorJsonError(
      "CURSOR_MALFORMED_CONFIG",
      "Cursor config is malformed JSON and will not be overwritten",
    );
  }

  if (!isRecord(parsed)) {
    throw new CursorJsonError("CURSOR_INVALID_DOCUMENT", "Cursor config must be a JSON object");
  }

  if (parsed.mcpServers !== undefined && !isRecord(parsed.mcpServers)) {
    throw new CursorJsonError(
      "CURSOR_INVALID_DOCUMENT",
      "Cursor config mcpServers must be a JSON object when present",
    );
  }

  return parsed as CursorConfigDocument;
}

function toWritableDocument(document: CursorConfigDocument): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(document)) as Record<string, JsonValue>;
}

function toCanonicalJson(document: CursorConfigDocument): string {
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

  throw new CursorJsonError(
    "CURSOR_INVALID_PATH",
    `Cursor ${field} must stay within the approved scope root`,
  );
}

async function ensureDirectoryNotSymlink(runtime: AdapterRuntime, path: string): Promise<void> {
  try {
    const stat = await runtime.lstat(path);
    if (stat.isSymbolicLink()) {
      throw new CursorJsonError(
        "CURSOR_SYMLINK_NOT_ALLOWED",
        `Cursor configuration directory is a symlink: ${path}`,
      );
    }
    if (!stat.isDirectory()) {
      throw new CursorJsonError(
        "CURSOR_INVALID_PATH",
        `Cursor configuration root is not a directory: ${path}`,
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
      throw new CursorJsonError(
        "CURSOR_SYMLINK_NOT_ALLOWED",
        `Cursor configuration file is a symlink: ${path}`,
      );
    }
    if (!stat.isFile()) {
      throw new CursorJsonError(
        "CURSOR_INVALID_PATH",
        `Cursor configuration path is not a file: ${path}`,
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

export function resolveCursorScopePaths(
  runtime: AdapterRuntime,
  scope: ClientScope,
): CursorScopePaths {
  const pathModule = getPathModule(runtime.platform);
  if (scope === "global") {
    throw new CursorJsonError(
      "CURSOR_UNSUPPORTED_SCOPE",
      "Cursor adapter does not support global scope",
    );
  }

  const rootPath =
    scope === "project"
      ? pathModule.join(runtime.cwd, ".cursor")
      : runtime.platform === "darwin"
        ? pathModule.join(runtime.homeDirectory, "Library", "Application Support", "Cursor", "User")
        : runtime.platform === "win32"
          ? pathModule.join(
              runtime.env.APPDATA ?? pathModule.join(runtime.homeDirectory, "AppData", "Roaming"),
              "Cursor",
              "User",
            )
          : pathModule.join(
              runtime.env.XDG_CONFIG_HOME ?? pathModule.join(runtime.homeDirectory, ".config"),
              "Cursor",
              "User",
            );

  return Object.freeze({
    rootPath,
    configPath: pathModule.join(rootPath, "mcp.json"),
  });
}

export function createCursorConfigMutation(
  runtime: AdapterRuntime,
  options: { readonly scope: ClientScope; readonly serverKey: string; readonly intentHash: string },
): CursorConfigMutation {
  const scopePaths = resolveCursorScopePaths(runtime, options.scope);
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

export async function readCursorConfigDocument(
  runtime: AdapterRuntime,
  mutation: CursorConfigMutation,
): Promise<CursorConfigDocument | null> {
  const scopePaths = resolveCursorScopePaths(runtime, mutation.scope);
  assertInsideRoot(runtime.platform, mutation.path, scopePaths.rootPath, "config path");

  const exists = await assertFileNotSymlink(runtime, mutation.path);
  if (!exists) {
    return null;
  }

  const raw = await runtime.readFile(mutation.path);
  return parseCursorConfigDocument(raw);
}

export async function applyCursorConfigMutation(
  runtime: AdapterRuntime,
  options: ApplyCursorMutationOptions,
): Promise<void> {
  const { mutation } = options;
  const scopePaths = resolveCursorScopePaths(runtime, mutation.scope);

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
    throw new CursorJsonError(
      "CURSOR_INVALID_PATH",
      "Cursor config parent resolves outside the approved root",
    );
  }
  if (pathModule.relative(scopePaths.rootPath, mutation.path).startsWith("..")) {
    throw new CursorJsonError(
      "CURSOR_INVALID_PATH",
      "Cursor config path must remain within the approved root",
    );
  }

  const fileExists = await assertFileNotSymlink(runtime, mutation.path);
  const currentMode = fileExists ? (await runtime.stat(mutation.path)).mode : 0o600;
  const currentDocument = fileExists
    ? parseCursorConfigDocument(await runtime.readFile(mutation.path))
    : ({} satisfies CursorConfigDocument);

  const nextDocument = options.apply(currentDocument);
  if (!isRecord(nextDocument)) {
    throw new CursorJsonError(
      "CURSOR_INVALID_DOCUMENT",
      "Cursor mutation must produce a JSON object document",
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

  let verified: CursorConfigDocument;
  try {
    verified = parseCursorConfigDocument(await runtime.readFile(mutation.path));
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
    throw new CursorJsonError(
      "CURSOR_VERIFICATION_FAILED",
      "Cursor configuration verification failed after write; restored backup",
    );
  }
}

export function setCursorServerEntry(
  document: CursorConfigDocument,
  serverKey: string,
  entry: JsonValue,
): CursorConfigDocument {
  const writable = toWritableDocument(document);
  const currentServers = isRecord(writable.mcpServers)
    ? { ...(writable.mcpServers as Record<string, JsonValue>) }
    : {};
  currentServers[serverKey] = entry;
  writable.mcpServers = currentServers;
  return writable as CursorConfigDocument;
}

export function removeCursorServerEntry(
  document: CursorConfigDocument,
  serverKey: string,
): CursorConfigDocument {
  const writable = toWritableDocument(document);
  if (!isRecord(writable.mcpServers)) {
    return writable as CursorConfigDocument;
  }

  const nextServers = { ...(writable.mcpServers as Record<string, JsonValue>) };
  delete nextServers[serverKey];
  writable.mcpServers = nextServers;
  return writable as CursorConfigDocument;
}

export function getCursorServerEntry(document: CursorConfigDocument, serverKey: string): unknown {
  if (!document.mcpServers || !isRecord(document.mcpServers)) {
    return undefined;
  }
  return document.mcpServers[serverKey];
}
