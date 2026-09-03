import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ClientId, ClientScope } from "@themcpdirectory/install-engine";
import type { CliStatePaths } from "./state-paths.js";
import { FileLockError, type FileLockOptions, withFileLock } from "./file-lock.js";

interface ReceiptStateFile {
  readonly schemaVersion: 1;
  readonly receipts: readonly InstallationReceipt[];
}

interface ReceiptKey {
  readonly slug: string;
  readonly client: ClientId;
  readonly scope: ClientScope;
}

export interface InstallationReceipt {
  readonly schemaVersion: 1;
  readonly slug: string;
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly serverVersion: string;
  readonly variantId: string;
  readonly manifestHash: string;
  readonly installedAt: string;
  readonly adapterFingerprint: string;
}

export interface ReceiptStore {
  list(): Promise<readonly InstallationReceipt[]>;
  write(receipt: InstallationReceipt): Promise<void>;
  remove(key: {
    readonly slug: string;
    readonly client: ClientId;
    readonly scope: ClientScope;
  }): Promise<void>;
  find(key: {
    readonly slug: string;
    readonly client: ClientId;
    readonly scope: ClientScope;
  }): Promise<InstallationReceipt | null>;
}

interface ReceiptStoreOptions {
  readonly lock?: FileLockOptions;
  readonly now?: () => Date;
}

export class ReceiptStoreError extends Error {
  readonly code:
    "RECEIPT_STATE_IO" | "RECEIPT_STATE_LOCKED" | "RECEIPT_STATE_INVALID" | "RECEIPT_STATE_CORRUPT";

  constructor(
    code:
      | "RECEIPT_STATE_IO"
      | "RECEIPT_STATE_LOCKED"
      | "RECEIPT_STATE_INVALID"
      | "RECEIPT_STATE_CORRUPT",
    message: string,
  ) {
    super(message);
    this.name = "ReceiptStoreError";
    this.code = code;
  }
}

export function createReceiptStore(
  paths: CliStatePaths,
  options?: ReceiptStoreOptions,
): ReceiptStore {
  const now = options?.now ?? (() => new Date());

  return {
    async list(): Promise<readonly InstallationReceipt[]> {
      const state = await readState(paths, options?.lock, now);
      return state.receipts.map((receipt) => ({ ...receipt }));
    },

    async write(receipt: InstallationReceipt): Promise<void> {
      const sanitized = sanitizeReceipt(receipt);
      await mutateState(paths, options?.lock, now, (state) => {
        const nextReceipts = [
          ...state.receipts.filter((candidate) => !sameReceiptKey(candidate, sanitized)),
          sanitized,
        ];
        nextReceipts.sort(compareReceiptKey);
        return {
          schemaVersion: 1,
          receipts: nextReceipts,
        };
      });
    },

    async remove(key: ReceiptKey): Promise<void> {
      const sanitizedKey = sanitizeReceiptKey(key);
      await mutateState(paths, options?.lock, now, (state) => ({
        schemaVersion: 1,
        receipts: state.receipts.filter((candidate) => !sameReceiptKey(candidate, sanitizedKey)),
      }));
    },

    async find(key: ReceiptKey): Promise<InstallationReceipt | null> {
      const sanitizedKey = sanitizeReceiptKey(key);
      const state = await readState(paths, options?.lock, now);
      const match = state.receipts.find((candidate) => sameReceiptKey(candidate, sanitizedKey));
      return match ? { ...match } : null;
    },
  };
}

async function readState(
  paths: CliStatePaths,
  lockOptions: FileLockOptions | undefined,
  now: () => Date,
): Promise<ReceiptStateFile> {
  try {
    return await withFileLock(paths.lockFile, () => loadState(paths, now), lockOptions);
  } catch (error) {
    throw mapStoreError(error, paths, "read");
  }
}

async function mutateState(
  paths: CliStatePaths,
  lockOptions: FileLockOptions | undefined,
  now: () => Date,
  mutate: (state: ReceiptStateFile) => ReceiptStateFile,
): Promise<void> {
  try {
    await withFileLock(
      paths.lockFile,
      async () => {
        const current = await loadState(paths, now);
        const next = mutate(current);
        await writeStateAtomic(paths, next, now);
      },
      lockOptions,
    );
  } catch (error) {
    throw mapStoreError(error, paths, "update");
  }
}

function mapStoreError(
  error: unknown,
  paths: CliStatePaths,
  operation: "read" | "update",
): ReceiptStoreError {
  if (
    error instanceof FileLockError &&
    (error.code === "LOCK_BUSY" || error.code === "LOCK_TIMEOUT")
  ) {
    return new ReceiptStoreError("RECEIPT_STATE_LOCKED", `State is locked at ${paths.lockFile}`);
  }

  if (error instanceof ReceiptStoreError) {
    return error;
  }

  return new ReceiptStoreError(
    "RECEIPT_STATE_IO",
    `Failed to ${operation} receipts at ${paths.receiptsFile}`,
  );
}

async function loadState(paths: CliStatePaths, now: () => Date): Promise<ReceiptStateFile> {
  await ensureStateLayout(paths);

  const fileText = await readExistingStateFile(paths.receiptsFile);
  if (fileText === null) {
    const empty = createEmptyState();
    await writeStateAtomic(paths, empty, now);
    return empty;
  }

  try {
    const parsed = JSON.parse(fileText) as unknown;
    return validateStateFile(parsed);
  } catch {
    await preserveCorruptState(paths, now);
    return createEmptyState();
  }
}

async function readExistingStateFile(receiptsFile: string): Promise<string | null> {
  try {
    return await readFile(receiptsFile, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw new ReceiptStoreError(
      "RECEIPT_STATE_IO",
      `Failed to read receipt state at ${receiptsFile}`,
    );
  }
}

async function ensureStateLayout(paths: CliStatePaths): Promise<void> {
  try {
    await mkdir(paths.stateDir, { recursive: true });
    await mkdir(paths.backupsDir, { recursive: true });
  } catch {
    throw new ReceiptStoreError(
      "RECEIPT_STATE_IO",
      `Failed to prepare receipt state directory ${paths.stateDir}`,
    );
  }
}

function validateStateFile(value: unknown): ReceiptStateFile {
  const record = asRecord(value, "state file");
  const schemaVersion = readNumberField(record, "schemaVersion");
  if (schemaVersion !== 1) {
    throw new ReceiptStoreError("RECEIPT_STATE_CORRUPT", "Receipt state schemaVersion must be 1");
  }

  const receiptsRaw = record.receipts;
  if (!Array.isArray(receiptsRaw)) {
    throw new ReceiptStoreError("RECEIPT_STATE_CORRUPT", "Receipt state receipts must be an array");
  }

  const receipts = receiptsRaw.map((entry, index) => sanitizeReceipt(entry, `receipts[${index}]`));
  return {
    schemaVersion: 1,
    receipts,
  };
}

function sanitizeReceipt(input: unknown, source = "receipt"): InstallationReceipt {
  const record = asRecord(input, source);

  assertNoAccessorProperties(record, source);

  const slug = readStringField(record, "slug", source);
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(slug)) {
    throw new ReceiptStoreError(
      "RECEIPT_STATE_INVALID",
      `${source} slug must be lowercase kebab-case`,
    );
  }

  const client = readClientId(record, source);
  const scope = readScope(record, source);
  const serverVersion = readStringField(record, "serverVersion", source);
  const variantId = readStringField(record, "variantId", source);
  const manifestHash = readStringField(record, "manifestHash", source);
  const installedAt = readStringField(record, "installedAt", source);
  const adapterFingerprint = readStringField(record, "adapterFingerprint", source);

  const schemaVersion = readNumberField(record, "schemaVersion");
  if (schemaVersion !== 1) {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${source} schemaVersion must be 1`);
  }

  if (!/^[a-f0-9]{64}$/i.test(manifestHash)) {
    throw new ReceiptStoreError(
      "RECEIPT_STATE_INVALID",
      `${source} manifestHash must be a 64-char hash`,
    );
  }

  if (Number.isNaN(Date.parse(installedAt))) {
    throw new ReceiptStoreError(
      "RECEIPT_STATE_INVALID",
      `${source} installedAt must be an ISO timestamp`,
    );
  }

  return {
    schemaVersion: 1,
    slug,
    client,
    scope,
    serverVersion,
    variantId,
    manifestHash,
    installedAt,
    adapterFingerprint,
  };
}

function sanitizeReceiptKey(key: ReceiptKey): ReceiptKey {
  const record = asRecord(key, "receipt key");
  return {
    slug: readStringField(record, "slug", "receipt key"),
    client: readClientId(record, "receipt key"),
    scope: readScope(record, "receipt key"),
  };
}

function sameReceiptKey(receipt: ReceiptKey, key: ReceiptKey): boolean {
  return receipt.slug === key.slug && receipt.client === key.client && receipt.scope === key.scope;
}

function compareReceiptKey(left: ReceiptKey, right: ReceiptKey): number {
  const bySlug = left.slug.localeCompare(right.slug);
  if (bySlug !== 0) {
    return bySlug;
  }

  const byClient = left.client.localeCompare(right.client);
  if (byClient !== 0) {
    return byClient;
  }

  return left.scope.localeCompare(right.scope);
}

async function writeStateAtomic(
  paths: CliStatePaths,
  state: ReceiptStateFile,
  now: () => Date,
): Promise<void> {
  const tmpPath = join(
    dirname(paths.receiptsFile),
    `${basename(paths.receiptsFile)}.${process.pid}.${now().getTime()}.tmp`,
  );

  const content = `${JSON.stringify(state, null, 2)}\n`;

  try {
    await writeFile(tmpPath, content, {
      encoding: "utf8",
      mode: 0o600,
      flag: "w",
    });

    const tmpHandle = await open(tmpPath, "r");
    try {
      await tmpHandle.sync();
    } finally {
      await tmpHandle.close();
    }

    await rename(tmpPath, paths.receiptsFile);
    await syncDirectoryBestEffort(dirname(paths.receiptsFile));
  } catch {
    throw new ReceiptStoreError(
      "RECEIPT_STATE_IO",
      `Failed to persist receipt state at ${paths.receiptsFile}`,
    );
  } finally {
    await removeIfExists(tmpPath);
  }
}

async function preserveCorruptState(paths: CliStatePaths, now: () => Date): Promise<void> {
  const sourcePath = paths.receiptsFile;
  const backupPath = await nextCorruptBackupPath(paths.backupsDir, now);

  try {
    await rename(sourcePath, backupPath);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw new ReceiptStoreError(
        "RECEIPT_STATE_CORRUPT",
        `Failed to preserve corrupt state at ${sourcePath}`,
      );
    }
  }

  await writeStateAtomic(paths, createEmptyState(), now);
}

async function nextCorruptBackupPath(backupsDir: string, now: () => Date): Promise<string> {
  const stamp = now().toISOString().replace(/[.:]/g, "-");
  const existing = await readdir(backupsDir);
  let suffix = 0;
  while (true) {
    const filename =
      suffix === 0
        ? `receipts.v1.corrupt-${stamp}.json`
        : `receipts.v1.corrupt-${stamp}-${suffix}.json`;
    if (!existing.includes(filename)) {
      return join(backupsDir, filename);
    }
    suffix += 1;
  }
}

function createEmptyState(): ReceiptStateFile {
  return {
    schemaVersion: 1,
    receipts: [],
  };
}

function asRecord(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${source} must be an object`);
  }

  return value as Record<string, unknown>;
}

function assertNoAccessorProperties(record: Record<string, unknown>, source: string): void {
  const descriptors = Object.getOwnPropertyDescriptors(record);

  for (const [propertyName, descriptor] of Object.entries(descriptors)) {
    if (typeof descriptor.get === "function" || typeof descriptor.set === "function") {
      throw new ReceiptStoreError(
        "RECEIPT_STATE_INVALID",
        `${source} property ${propertyName} must not use accessor-backed values`,
      );
    }
  }
}

function readStringField(record: Record<string, unknown>, key: string, source: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${source} ${key} must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${source} ${key} must not be empty`);
  }

  return trimmed;
}

function readNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${key} must be a finite number`);
  }

  return value;
}

function readClientId(record: Record<string, unknown>, source: string): ClientId {
  const value = readStringField(record, "client", source);
  if (value !== "claude-code" && value !== "codex" && value !== "cursor" && value !== "vscode") {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${source} client is unsupported`);
  }

  return value;
}

function readScope(record: Record<string, unknown>, source: string): ClientScope {
  const value = readStringField(record, "scope", source);
  if (value !== "user" && value !== "project" && value !== "global") {
    throw new ReceiptStoreError("RECEIPT_STATE_INVALID", `${source} scope is unsupported`);
  }

  return value;
}

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // best effort cleanup
  }
}

async function syncDirectoryBestEffort(directoryPath: string): Promise<void> {
  try {
    const handle = await open(directoryPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is best effort and unsupported on some filesystems.
  }
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
