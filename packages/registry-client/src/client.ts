import { validatePublicHttpUrl } from "@themcpdirectory/security";
import type { UrlValidationResult } from "@themcpdirectory/security";
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
  | "invalid_content_type"
  | "unsafe_url"
  | "redirect_unsafe"
  | "redirect_limit"
  | "redirect_loop"
  | "redirect_invalid";

export class RegistryError extends Error {
  readonly kind: RegistryErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly attempt: number;

  constructor(opts: {
    kind: RegistryErrorKind;
    message: string;
    status?: number;
    retryable: boolean;
    attempt: number;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "RegistryError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.attempt = opts.attempt;
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
  clock?: () => number;
  validateUrl?: (url: string) => Promise<UrlValidationResult>;
}

export interface PagesOptions {
  cursor?: string;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const FOLLOWED_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_RETRY_AFTER_MS = 60_000;

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function parseRetryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - now, 0), MAX_RETRY_AFTER_MS);
  }
  return null;
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_AFTER_MS);
}

function isAllowedJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType === "application/json") return true;
  return /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType);
}

export class OfficialRegistryClient {
  readonly #options: Required<RegistryClientOptions>;

  constructor(options: RegistryClientOptions) {
    this.#options = {
      fetch: globalThis.fetch.bind(globalThis),
      sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
      clock: Date.now,
      validateUrl: validatePublicHttpUrl,
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

    const validation = await this.#options.validateUrl(url.href);
    if (!validation.ok) {
      throw new RegistryError({
        kind: "unsafe_url",
        message: `Initial URL blocked: ${validation.reason}`,
        retryable: false,
        attempt: 0,
      });
    }

    const initialUrl = validation.url;

    const maxAttempts = this.#options.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#options.timeoutMs);

      try {
        const response = await this.#fetchWithRedirects(initialUrl, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });

        clearTimeout(timer);

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < maxAttempts) {
            const now = this.#options.clock();
            const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"), now);
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
        if (!isAllowedJsonContentType(contentType)) {
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

  async #fetchWithRedirects(initialUrl: string, init: RequestInit): Promise<Response> {
    let currentUrl = initialUrl;
    const visited = new Set<string>();
    let redirectsFollowed = 0;

    while (true) {
      const response = await this.#options.fetch(currentUrl, {
        ...init,
        redirect: "manual",
      });

      if (!FOLLOWED_REDIRECT_STATUSES.has(response.status)) {
        return response;
      }

      response.body?.cancel().catch(() => {});

      if (redirectsFollowed >= this.#options.maxRedirects) {
        throw new RegistryError({
          kind: "redirect_limit",
          message: `Exceeded ${this.#options.maxRedirects} redirects`,
          retryable: false,
          attempt: 0,
        });
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new RegistryError({
          kind: "redirect_invalid",
          message: "Redirect missing Location header",
          status: response.status,
          retryable: false,
          attempt: 0,
        });
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new RegistryError({
          kind: "redirect_invalid",
          message: `Malformed redirect Location: ${location}`,
          status: response.status,
          retryable: false,
          attempt: 0,
        });
      }

      nextUrl.username = "";
      nextUrl.password = "";
      const target = nextUrl.href;

      if (visited.has(target)) {
        throw new RegistryError({
          kind: "redirect_loop",
          message: `Redirect loop: ${target}`,
          retryable: false,
          attempt: 0,
        });
      }
      visited.add(target);

      const validation = await this.#options.validateUrl(target);
      if (!validation.ok) {
        throw new RegistryError({
          kind: "redirect_unsafe",
          message: `Redirect target blocked: ${validation.reason}`,
          retryable: false,
          attempt: 0,
        });
      }

      currentUrl = validation.url;
      redirectsFollowed++;
    }
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
