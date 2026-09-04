import { isIP, isIPv4 } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { isPublicIpAddress, validatePublicHttpUrl, type DnsResolver } from "./url.js";

const FIXED_PROBE_HEADERS = Object.freeze({
  accept: "application/json, text/event-stream",
  "accept-encoding": "identity",
  "user-agent": "TheMcpDirectoryHealthProbe/1",
});
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ProbeRequestInit {
  readonly method: "HEAD" | "GET";
  readonly redirect: "manual";
  readonly credentials: "omit";
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly dispatcher?: Dispatcher;
}

export interface ProbeResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
}

export type ProbeFetch = (input: string, init?: ProbeRequestInit) => Promise<ProbeResponse>;

export interface PinnedDispatcherOptions {
  readonly hostname: string;
  readonly servername?: string;
  readonly pinnedAddress: string;
  readonly connectTimeoutMs: number;
  readonly maxHeaderBytes: number;
  readonly maxResponseBytes: number;
}

export interface PinnedProbeRequestOptions {
  readonly fetchImpl?: ProbeFetch;
  readonly resolve: DnsResolver;
  readonly beforeRequest?: () => Promise<void>;
  readonly withOriginLimit?: <T>(origin: string, request: () => Promise<T>) => Promise<T>;
  readonly dispatcherFactory?: (options: PinnedDispatcherOptions) => Dispatcher | undefined;
  readonly method: "HEAD" | "GET";
  readonly connectTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxRedirects: number;
  readonly maxHeaderBytes: number;
  readonly maxResponseBytes: number;
  readonly maxDecompressedBytes: number;
}

export interface PinnedProbeResponse {
  readonly outcome:
    | "healthy"
    | "degraded"
    | "unreachable"
    | "timed_out"
    | "unsafe_destination"
    | "response_too_large";
  readonly methodUsed: "HEAD" | "GET";
  readonly finalOrigin: string | null;
  readonly httpStatus: number | null;
  readonly redirectCount: number;
  readonly durationMs: number;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
}

interface HopValidationResult {
  readonly ok: boolean;
  readonly url: string | null;
  readonly addresses: string[];
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
}

class ProbeRequestPreconditionError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super("Probe request precondition failed.");
    this.name = "ProbeRequestPreconditionError";
    this.originalError = originalError;
  }
}

function durationSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function blocked(
  options: PinnedProbeRequestOptions,
  startedAt: number,
  redirects: number,
  outcome: PinnedProbeResponse["outcome"],
  errorCode: string,
  errorSummary: string,
  finalOrigin: string | null = null,
): PinnedProbeResponse {
  return {
    outcome,
    methodUsed: options.method,
    finalOrigin,
    httpStatus: null,
    redirectCount: redirects,
    durationMs: durationSince(startedAt),
    errorCode,
    errorSummary,
  };
}

function createPinnedDispatcher(options: PinnedDispatcherOptions): Agent {
  const family = isIPv4(options.pinnedAddress) ? 4 : 6;
  return new Agent({
    connections: 1,
    pipelining: 0,
    maxHeaderSize: options.maxHeaderBytes,
    maxResponseSize: options.maxResponseBytes,
    connect: {
      ...(options.servername ? { servername: options.servername } : {}),
      timeout: options.connectTimeoutMs,
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) {
          callback(null, [{ address: options.pinnedAddress, family }]);
          return;
        }
        callback(null, options.pinnedAddress, family);
      },
    },
  });
}

async function withTotalTimeout<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;

  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function validateHop(
  value: string,
  options: PinnedProbeRequestOptions,
  signal: AbortSignal,
): Promise<HopValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return {
      ok: false,
      url: null,
      addresses: [],
      errorCode: "invalid_url",
      errorSummary: "probe URL is invalid",
    };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      url: null,
      addresses: [],
      errorCode: "https_required",
      errorSummary: "probe URL must use HTTPS",
    };
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    return {
      ok: false,
      url: null,
      addresses: [],
      errorCode: "unsafe_port",
      errorSummary: "probe URL must use HTTPS port 443",
    };
  }

  let resolvedAddresses: string[] = [];
  const validation = await withTotalTimeout(
    validatePublicHttpUrl(parsed.href, {
      resolve: async (hostname) => {
        resolvedAddresses = await options.resolve(hostname);
        return resolvedAddresses;
      },
    }),
    signal,
  );
  if (!validation.ok) {
    const hasPublic = resolvedAddresses.some(isPublicIpAddress);
    const hasBlocked = resolvedAddresses.some((address) => !isPublicIpAddress(address));
    return {
      ok: false,
      url: null,
      addresses: resolvedAddresses,
      errorCode: hasPublic && hasBlocked ? "mixed_dns" : "unsafe_destination",
      errorSummary: validation.reason,
    };
  }

  if (resolvedAddresses.length === 0) {
    resolvedAddresses = [parsed.hostname.replace(/^\[|\]$/g, "")];
  }
  return {
    ok: true,
    url: validation.url,
    addresses: resolvedAddresses,
    errorCode: null,
    errorSummary: null,
  };
}

function pickDeterministicAddress(addresses: readonly string[]): string {
  return [...addresses].sort((left, right) => left.localeCompare(right))[0]!;
}

function countHeaderBytes(headers: ProbeResponse["headers"]): number {
  let total = 0;
  for (const [name, value] of headers) {
    total += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
  }
  return total;
}

function contentLength(headers: ProbeResponse["headers"]): number | null {
  const value = headers.get("content-length");
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function exceedsStreamLimit(response: ProbeResponse, limit: number): Promise<boolean> {
  if (!response.body) return false;

  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      total += value.byteLength;
      if (total > limit) {
        cancelReader(reader);
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().catch(() => {
      // Stream cancellation must not replace or delay the probe outcome.
    });
  } catch {
    // Stream cancellation must not replace or delay the probe outcome.
  }
}

function cancelBody(response: ProbeResponse): void {
  try {
    void response.body?.cancel().catch(() => {
      // Body cancellation must not replace or delay the probe outcome.
    });
  } catch {
    // Body cancellation must not replace or delay the probe outcome.
  }
}

function destroyDispatcher(dispatcher: Dispatcher): void {
  try {
    void dispatcher.destroy().catch(() => {
      // Dispatcher cleanup must not replace or delay the probe outcome.
    });
  } catch {
    // Dispatcher cleanup must not replace or delay the probe outcome.
  }
}

function timeoutCode(
  error: unknown,
  signal: AbortSignal,
): "connect_timeout" | "total_timeout" | null {
  if (signal.aborted) return "total_timeout";
  if (typeof error !== "object" || error === null) return null;

  const record = error as { code?: unknown; cause?: unknown; name?: unknown };
  const cause =
    typeof record.cause === "object" && record.cause !== null
      ? (record.cause as { code?: unknown })
      : undefined;
  if (record.code === "UND_ERR_CONNECT_TIMEOUT" || cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
    return "connect_timeout";
  }
  return record.name === "AbortError" || record.name === "TimeoutError" ? "total_timeout" : null;
}

function responseLimitCode(error: unknown): "header_limit" | "response_body_limit" | null {
  let current = error;
  while (typeof current === "object" && current !== null) {
    const record = current as { code?: unknown; cause?: unknown };
    if (record.code === "UND_ERR_HEADERS_OVERFLOW") return "header_limit";
    if (record.code === "UND_ERR_RES_EXCEEDED_MAX_SIZE") return "response_body_limit";
    current = record.cause;
  }
  return null;
}

export async function performPinnedProbe(
  url: string,
  options: PinnedProbeRequestOptions,
): Promise<PinnedProbeResponse> {
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(Math.max(1, options.totalTimeoutMs));
  let currentUrl = url;
  let redirects = 0;
  let lastValidatedOrigin: string | null = null;

  try {
    while (true) {
      const validation = await validateHop(currentUrl, options, signal);
      if (!validation.ok || !validation.url) {
        return blocked(
          options,
          startedAt,
          redirects,
          "unsafe_destination",
          validation.errorCode ?? "unsafe_destination",
          validation.errorSummary ?? "probe destination is unsafe",
          lastValidatedOrigin,
        );
      }

      const validatedUrl = validation.url;
      const parsed = new URL(validatedUrl);
      lastValidatedOrigin = parsed.origin;
      const pinnedAddress = pickDeterministicAddress(validation.addresses);
      const dispatcherOptions: PinnedDispatcherOptions = {
        hostname: parsed.hostname,
        ...(isIP(parsed.hostname.replace(/^\[|\]$/gu, "")) === 0
          ? { servername: parsed.hostname }
          : {}),
        pinnedAddress,
        connectTimeoutMs: options.connectTimeoutMs,
        maxHeaderBytes: options.maxHeaderBytes,
        maxResponseBytes: options.maxResponseBytes,
      };
      const injectedDispatcher = options.dispatcherFactory?.(dispatcherOptions);
      const ownsDispatcher = injectedDispatcher === undefined;
      const dispatcher = injectedDispatcher ?? createPinnedDispatcher(dispatcherOptions);

      try {
        const fetchImpl: ProbeFetch =
          options.fetchImpl ??
          (async (input, init) =>
            init
              ? undiciFetch(input, { ...init, headers: { ...init.headers } })
              : undiciFetch(input));
        const request = async (): Promise<
          { readonly nextUrl: string } | { readonly result: PinnedProbeResponse }
        > => {
          if (options.beforeRequest) {
            try {
              await withTotalTimeout(options.beforeRequest(), signal);
            } catch (error) {
              if (signal.aborted) throw error;
              throw new ProbeRequestPreconditionError(error);
            }
          }
          const response = await withTotalTimeout(
            fetchImpl(validatedUrl, {
              method: options.method,
              redirect: "manual",
              credentials: "omit",
              headers: FIXED_PROBE_HEADERS,
              signal,
              ...(dispatcher ? { dispatcher } : {}),
            }),
            signal,
          );

          if (countHeaderBytes(response.headers) > options.maxHeaderBytes) {
            cancelBody(response);
            return {
              result: blocked(
                options,
                startedAt,
                redirects,
                "response_too_large",
                "header_limit",
                `response headers exceed ${options.maxHeaderBytes} bytes`,
                parsed.origin,
              ),
            };
          }

          if (REDIRECT_STATUSES.has(response.status)) {
            if (redirects >= options.maxRedirects) {
              cancelBody(response);
              return {
                result: blocked(
                  options,
                  startedAt,
                  redirects,
                  "unsafe_destination",
                  "redirect_limit",
                  `probe exceeded ${options.maxRedirects} redirects`,
                  parsed.origin,
                ),
              };
            }
            const location = response.headers.get("location");
            cancelBody(response);
            if (!location) {
              return {
                result: blocked(
                  options,
                  startedAt,
                  redirects,
                  "unsafe_destination",
                  "invalid_redirect",
                  "redirect response has no location",
                  parsed.origin,
                ),
              };
            }
            try {
              return { nextUrl: new URL(location, validatedUrl).href };
            } catch {
              return {
                result: blocked(
                  options,
                  startedAt,
                  redirects,
                  "unsafe_destination",
                  "invalid_redirect",
                  "redirect location is invalid",
                  parsed.origin,
                ),
              };
            }
          }

          const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
          const isCompressed = Boolean(encoding && encoding !== "identity");
          const declaredLength = contentLength(response.headers);
          if (declaredLength !== null && declaredLength > options.maxResponseBytes) {
            cancelBody(response);
            return {
              result: blocked(
                options,
                startedAt,
                redirects,
                "response_too_large",
                isCompressed ? "compressed_body_limit" : "body_limit",
                `response exceeds ${options.maxResponseBytes} bytes`,
                parsed.origin,
              ),
            };
          }

          const streamLimit = isCompressed
            ? options.maxDecompressedBytes
            : options.maxResponseBytes;
          if (await withTotalTimeout(exceedsStreamLimit(response, streamLimit), signal)) {
            return {
              result: blocked(
                options,
                startedAt,
                redirects,
                "response_too_large",
                isCompressed ? "decompressed_body_limit" : "body_limit",
                `response exceeds ${streamLimit} bytes`,
                parsed.origin,
              ),
            };
          }

          return {
            result: {
              outcome: response.ok ? "healthy" : "degraded",
              methodUsed: options.method,
              finalOrigin: parsed.origin,
              httpStatus: response.status,
              redirectCount: redirects,
              durationMs: durationSince(startedAt),
              errorCode: response.ok ? null : "http_error",
              errorSummary: response.ok ? null : `remote returned HTTP ${response.status}`,
            },
          };
        };
        const hop = await withTotalTimeout(
          options.withOriginLimit ? options.withOriginLimit(parsed.origin, request) : request(),
          signal,
        );
        if ("nextUrl" in hop) {
          currentUrl = hop.nextUrl;
          redirects += 1;
          continue;
        }
        return hop.result;
      } finally {
        if (ownsDispatcher) destroyDispatcher(dispatcher);
      }
    }
  } catch (error) {
    if (error instanceof ProbeRequestPreconditionError) throw error.originalError;
    const limitCode = responseLimitCode(error);
    if (limitCode) {
      return blocked(
        options,
        startedAt,
        redirects,
        "response_too_large",
        limitCode,
        limitCode === "header_limit"
          ? `response headers exceed ${options.maxHeaderBytes} bytes`
          : `response exceeds ${options.maxResponseBytes} bytes`,
        lastValidatedOrigin,
      );
    }
    const code = timeoutCode(error, signal);
    return blocked(
      options,
      startedAt,
      redirects,
      code ? "timed_out" : "unreachable",
      code ?? "network_error",
      code ? "probe timed out" : "probe request failed",
      lastValidatedOrigin,
    );
  }
}
