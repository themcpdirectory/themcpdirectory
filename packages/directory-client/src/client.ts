import {
  parseClientsCollectionResponse,
  parseInstallManifestResponse,
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  parseServerDetailResponse,
  parseApiErrorResponse,
  UnsupportedManifestVersionError,
  type ClientsCollectionResponse,
  type InstallManifestResponse,
  type ResolvedServerResponse,
  type ServerCollectionResponse,
  type ServerDetailResponse,
  type SupportedClientId,
} from "@themcpdirectory/api-contract";
import { DirectoryClientError } from "./errors.js";

export interface DirectoryClientOptions {
  readonly baseUrl: string | URL;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
}

const MAX_ERROR_BODY_BYTES = 64 * 1024;

export interface SearchServersParams {
  readonly q?: string;
  readonly client?: SupportedClientId;
  readonly category?: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: "recent" | "name" | "relevance";
}

export class DirectoryClient {
  readonly #apiRoot: string;
  readonly #fetchImpl: typeof fetch;
  readonly #timeoutMs: number;
  readonly #userAgent: string | undefined;

  constructor(options: DirectoryClientOptions) {
    this.#apiRoot = normalizeApiRoot(options.baseUrl);
    this.#fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#userAgent = options.userAgent;
  }

  async resolveServer(_identifier: string): Promise<ResolvedServerResponse> {
    return this.#requestJson(
      `resolve/${encodeURIComponent(_identifier)}`,
      parseResolvedServerResponse,
    );
  }

  async resolveInstall(_identifier: string): Promise<InstallManifestResponse> {
    return this.#requestJson(
      `resolve/${encodeURIComponent(_identifier)}/install`,
      parseInstallManifestResponse,
    );
  }

  async getServer(_slug: string): Promise<ServerDetailResponse> {
    return this.#requestJson(`servers/${encodeURIComponent(_slug)}`, parseServerDetailResponse);
  }

  async searchServers(_params: SearchServersParams): Promise<ServerCollectionResponse> {
    const query = buildSearchQuery(_params);
    return this.#requestJson(query ? `search?${query}` : "search", parseServerCollectionResponse);
  }

  async listClients(): Promise<ClientsCollectionResponse> {
    return this.#requestJson("clients", parseClientsCollectionResponse);
  }

  async #requestJson<TEnvelope extends { data: unknown }>(
    path: string,
    parser: (input: unknown) => TEnvelope,
  ): Promise<TEnvelope> {
    const url = new URL(path, this.#apiRoot);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...(this.#userAgent ? { "user-agent": this.#userAgent } : {}),
        },
      });

      if (!response.ok) {
        throw await this.#httpErrorFor(path, response);
      }

      try {
        const payload = await readJsonBody(response);
        return parser(payload);
      } catch (error) {
        if (error instanceof UnsupportedManifestVersionError) {
          throw error;
        }

        throw new DirectoryClientError(
          "DIRECTORY_INVALID_RESPONSE",
          "Directory response did not match the expected schema",
          response.status,
          error,
        );
      }
    } catch (error) {
      if (error instanceof UnsupportedManifestVersionError) {
        throw error;
      }

      if (error instanceof DirectoryClientError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new DirectoryClientError(
          "DIRECTORY_TIMEOUT",
          `Request timed out after ${this.#timeoutMs}ms`,
          undefined,
          error,
        );
      }

      throw new DirectoryClientError(
        "DIRECTORY_HTTP_ERROR",
        error instanceof Error ? error.message : "Directory request failed",
        undefined,
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async #httpErrorFor(path: string, response: Response): Promise<DirectoryClientError> {
    const status = response.status;
    const apiErrorCode = await readApiErrorCode(response);
    if (status === 409) {
      return new DirectoryClientError("DIRECTORY_AMBIGUOUS", `HTTP 409 for ${path}`, status);
    }

    if (status === 410 && apiErrorCode === "UPSTREAM_DELETED") {
      return new DirectoryClientError("DIRECTORY_UPSTREAM_DELETED", `HTTP 410 for ${path}`, status);
    }

    if (status === 410 && path.includes("/install")) {
      return new DirectoryClientError(
        "DIRECTORY_INSTALL_UNAVAILABLE",
        `HTTP 410 for ${path}`,
        status,
      );
    }

    return new DirectoryClientError("DIRECTORY_HTTP_ERROR", `HTTP ${status} for ${path}`, status);
  }
}

async function readApiErrorCode(response: Response) {
  try {
    const body = await readBoundedErrorBody(response);
    if (body === undefined) return undefined;
    return parseApiErrorResponse(JSON.parse(body) as unknown).error.code;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return undefined;
  }
}

async function readBoundedErrorBody(response: Response): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;

  const decoder = new TextDecoder();
  let byteCount = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      byteCount += value.byteLength;
      if (byteCount > MAX_ERROR_BODY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function normalizeApiRoot(baseUrl: string | URL): string {
  const url = new URL(baseUrl.toString());
  url.hash = "";
  url.search = "";

  const pathnameSegments = url.pathname.split("/").filter(Boolean);
  const apiRootSegments = endsWithApiRoot(pathnameSegments)
    ? pathnameSegments
    : [...pathnameSegments, "api", "v1"];

  if (apiRootSegments.length === 0) {
    url.pathname = "/api/v1/";
    return url.toString();
  }

  url.pathname = `/${apiRootSegments.join("/")}/`;
  return url.toString();
}

function endsWithApiRoot(pathnameSegments: readonly string[]): boolean {
  return (
    pathnameSegments.length >= 2 &&
    pathnameSegments.at(-2) === "api" &&
    pathnameSegments.at(-1) === "v1"
  );
}

function buildSearchQuery(params: SearchServersParams): string {
  const entries: Array<[string, string]> = [];

  if (params.q !== undefined) entries.push(["q", params.q]);
  if (params.client !== undefined) entries.push(["client", params.client]);
  if (params.category !== undefined) entries.push(["category", params.category]);
  if (params.cursor !== undefined) entries.push(["cursor", params.cursor]);
  if (params.limit !== undefined) entries.push(["limit", String(params.limit)]);
  if (params.sort !== undefined) entries.push(["sort", params.sort]);

  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    throw new SyntaxError("Empty JSON response body");
  }

  return JSON.parse(text) as unknown;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
