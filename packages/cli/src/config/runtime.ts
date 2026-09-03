import { resolveCliStatePaths } from "./state-paths.js";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001/api/v1";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export interface CliRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly stateDirOverride?: string;
}

export class CliRuntimeConfigError extends Error {
  readonly code: "INVALID_API_BASE_URL" | "INVALID_REQUEST_TIMEOUT";

  constructor(code: "INVALID_API_BASE_URL" | "INVALID_REQUEST_TIMEOUT", message: string) {
    super(message);
    this.name = "CliRuntimeConfigError";
    this.code = code;
  }
}

export function resolveCliRuntimeConfig(options?: {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
}): CliRuntimeConfig {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? process.cwd();

  const apiBaseUrl = parseApiBaseUrl(env.MCPDIR_API_BASE_URL);
  const requestTimeoutMs = parseRequestTimeoutMs(env.MCPDIR_REQUEST_TIMEOUT_MS);

  const override = env.MCPDIR_STATE_DIR?.trim();
  const stateDirOverride =
    override && override.length > 0
      ? resolveCliStatePaths({
          platform: options?.platform ?? process.platform,
          env: { MCPDIR_STATE_DIR: override },
          homeDirectory: options?.homeDirectory ?? process.env.HOME ?? cwd,
          cwd,
        }).stateDir
      : undefined;

  return {
    apiBaseUrl,
    requestTimeoutMs,
    ...(stateDirOverride ? { stateDirOverride } : {}),
  };
}

function parseApiBaseUrl(value: string | undefined): string {
  const raw = value?.trim();
  const candidate = raw && raw.length > 0 ? raw : DEFAULT_API_BASE_URL;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new CliRuntimeConfigError(
      "INVALID_API_BASE_URL",
      "MCPDIR_API_BASE_URL must be an absolute http/https URL",
    );
  }
}

function parseRequestTimeoutMs(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new CliRuntimeConfigError(
      "INVALID_REQUEST_TIMEOUT",
      "MCPDIR_REQUEST_TIMEOUT_MS must be a positive integer in milliseconds",
    );
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 300_000) {
    throw new CliRuntimeConfigError(
      "INVALID_REQUEST_TIMEOUT",
      "MCPDIR_REQUEST_TIMEOUT_MS must be between 1 and 300000",
    );
  }

  return parsed;
}
