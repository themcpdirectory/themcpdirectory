import { RegistryPageSchema } from "./schema.js";
import type { RegistryPage } from "./schema.js";

export type RegistryErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "parse"
  | "validation"
  | "cursor_loop"
  | "response_too_large"
  | "invalid_content_type";

export class RegistryError extends Error {
  readonly kind: RegistryErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly attempt: number;
  readonly cause: unknown;

  constructor(opts: {
    kind: RegistryErrorKind;
    message: string;
    status?: number;
    retryable: boolean;
    attempt: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "RegistryError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.attempt = opts.attempt;
    this.cause = opts.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      attempt: this.attempt,
    };
  }
}

export interface RegistryClientOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxRedirects: number;
  maxResponseBytes: number;
  fetch?: (input: string | Request, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
}

export interface PagesOptions {
  cursor?: string;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 60_000;

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return null;
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_AFTER_MS);
}

export class OfficialRegistryClient {
  readonly #options: Required<RegistryClientOptions>;

  constructor(options: RegistryClientOptions) {
    this.#options = {
      fetch: globalThis.fetch.bind(globalThis),
      sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
      ...options,
    };
  }

  async *pages(opts?: PagesOptions): AsyncGenerator<RegistryPage> {
    const seenCursors = new Set<string>();
    let cursor: string | undefined = opts?.cursor;

    while (true) {
      if (cursor !== undefined) {
        if (seenCursors.has(cursor)) {
          throw new RegistryError({
            kind: "cursor_loop",
            message: `Cursor loop detected: ${cursor}`,
            retryable: false,
            attempt: 0,
          });
        }
        seenCursors.add(cursor);
      }

      const page = await this.#fetchPage(cursor);
      yield page;

      const next = page.metadata.nextCursor;
      if (!next) break;
      cursor = next;
    }
  }

  async #fetchPage(cursor: string | undefined): Promise<RegistryPage> {
    const url = new URL("/v0.1/servers", this.#options.baseUrl);
    if (cursor) url.searchParams.set("cursor", cursor);

    const maxAttempts = this.#options.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#options.timeoutMs);

      try {
        const response = await this.#options.fetch(url.href, {
          signal: controller.signal,
          redirect: "follow",
          headers: { accept: "application/json" },
        });

        clearTimeout(timer);

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < maxAttempts) {
            const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
            await this.#options.sleep(retryAfter ?? backoffMs(attempt - 1));
            continue;
          }
          throw new RegistryError({
            kind: "http",
            message: `HTTP ${response.status}`,
            status: response.status,
            retryable: isRetryableStatus(response.status),
            attempt,
          });
        }

        // Content-type validation
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new RegistryError({
            kind: "invalid_content_type",
            message: `Expected application/json, got ${contentType}`,
            retryable: false,
            attempt,
          });
        }

        // Size check
        const contentLength = response.headers.get("content-length");
        if (contentLength && Number(contentLength) > this.#options.maxResponseBytes) {
          throw new RegistryError({
            kind: "response_too_large",
            message: `Response exceeds ${this.#options.maxResponseBytes} bytes`,
            retryable: false,
            attempt,
          });
        }

        // Read body with size limit
        const text = await this.#readBodyLimited(response);

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch (e) {
          throw new RegistryError({
            kind: "parse",
            message: "Invalid JSON in response",
            retryable: false,
            attempt,
            cause: e,
          });
        }

        const result = RegistryPageSchema.safeParse(json);
        if (!result.success) {
          throw new RegistryError({
            kind: "validation",
            message: "Response does not match Registry schema",
            retryable: false,
            attempt,
          });
        }

        return result.data;
      } catch (e) {
        clearTimeout(timer);

        if (e instanceof RegistryError) throw e;

        // AbortError = timeout
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          if (attempt < maxAttempts) {
            await this.#options.sleep(backoffMs(attempt - 1));
            continue;
          }
          throw new RegistryError({
            kind: "timeout",
            message: "Request timed out",
            retryable: true,
            attempt,
            cause: e,
          });
        }

        // Network errors are retryable
        if (attempt < maxAttempts) {
          await this.#options.sleep(backoffMs(attempt - 1));
          continue;
        }

        throw new RegistryError({
          kind: "network",
          message: e instanceof Error ? e.message : "Unknown network error",
          retryable: true,
          attempt,
          cause: e,
        });
      }
    }

    throw new RegistryError({
      kind: "network",
      message: "Exhausted all retry attempts",
      retryable: true,
      attempt: maxAttempts,
    });
  }

  async #readBodyLimited(response: Response): Promise<string> {
    if (!response.body) return response.text();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > this.#options.maxResponseBytes) {
          reader.cancel().catch(() => {});
          throw new RegistryError({
            kind: "response_too_large",
            message: `Response exceeds ${this.#options.maxResponseBytes} bytes`,
            retryable: false,
            attempt: 0,
          });
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } finally {
      reader.releaseLock();
    }

    return chunks.join("");
  }
}
