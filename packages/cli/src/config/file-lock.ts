import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface ResolvedLockOptions {
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly staleAfterMs: number;
  readonly clock: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

export interface FileLockOptions {
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly staleAfterMs?: number;
  readonly clock?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class FileLockError extends Error {
  readonly code: "LOCK_BUSY" | "LOCK_TIMEOUT" | "LOCK_IO";

  constructor(code: "LOCK_BUSY" | "LOCK_TIMEOUT" | "LOCK_IO", message: string) {
    super(message);
    this.name = "FileLockError";
    this.code = code;
  }
}

export async function withFileLock<T>(
  lockFile: string,
  action: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const resolved = resolveLockOptions(options);
  await mkdir(dirname(lockFile), { recursive: true });

  let lockOwned = false;
  for (let attempt = 0; attempt < resolved.maxAttempts; attempt += 1) {
    try {
      await writeFile(
        lockFile,
        JSON.stringify({ ownerPid: process.pid, createdAt: resolved.clock() }),
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      lockOwned = true;
      break;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw new FileLockError("LOCK_IO", `Failed to acquire lock at ${lockFile}`);
      }

      const staleRemoved = await removeStaleLockIfNeeded(lockFile, resolved);
      if (staleRemoved) {
        continue;
      }

      const isLastAttempt = attempt >= resolved.maxAttempts - 1;
      if (isLastAttempt) {
        throw new FileLockError("LOCK_BUSY", `Lock is active at ${lockFile}`);
      }

      await resolved.sleep(resolved.retryDelayMs);
    }
  }

  if (!lockOwned) {
    throw new FileLockError("LOCK_TIMEOUT", `Timed out acquiring lock at ${lockFile}`);
  }

  let outcome:
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };
  try {
    outcome = { ok: true, value: await action() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  try {
    await rm(lockFile, { force: true });
  } catch (error) {
    if (outcome.ok) {
      throw new FileLockError(
        "LOCK_IO",
        `Failed to release lock at ${lockFile}: ${toErrorMessage(error)}`,
      );
    }
  }

  if (!outcome.ok) {
    throw outcome.error;
  }

  return outcome.value;
}

function resolveLockOptions(options: FileLockOptions | undefined): ResolvedLockOptions {
  const maxAttempts = options?.maxAttempts ?? 8;
  const retryDelayMs = options?.retryDelayMs ?? 25;
  const staleAfterMs = options?.staleAfterMs ?? 60_000;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new FileLockError("LOCK_IO", "maxAttempts must be a positive integer");
  }

  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new FileLockError("LOCK_IO", "retryDelayMs must be a non-negative integer");
  }

  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new FileLockError("LOCK_IO", "staleAfterMs must be a positive integer");
  }

  return {
    maxAttempts,
    retryDelayMs,
    staleAfterMs,
    clock: options?.clock ?? (() => Date.now()),
    sleep:
      options?.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
}

async function removeStaleLockIfNeeded(
  lockFile: string,
  options: ResolvedLockOptions,
): Promise<boolean> {
  try {
    const lockStats = await stat(lockFile);
    if (options.clock() - lockStats.mtimeMs <= options.staleAfterMs) {
      return false;
    }

    await rm(lockFile, { force: true });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return true;
    }

    throw new FileLockError("LOCK_IO", `Failed to inspect lock at ${lockFile}`);
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EEXIST");
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
