import type { ClientsCollectionResponse } from "../../api-contract/src/public-api/discovery.js";
import type { InstallManifestResponse } from "../../api-contract/src/public-api/install.js";
import type {
  ResolvedServerResponse,
  ServerCollectionResponse,
  ServerDetailResponse,
  SupportedClientId,
} from "../../api-contract/src/public-api/servers.js";
import { DirectoryClientError } from "./errors.js";
import {
  UnsupportedManifestVersionError,
  parseClientsCollectionResponse,
  parseInstallManifestResponse,
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  parseServerDetailResponse,
} from "../../api-contract/src/public-api/client-parsers.js";

export interface DirectoryClientOptions {
  readonly baseUrl: string | URL;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
}

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

  async resolveServer(_identifier: string): Promise<ResolvedServerResponse["data"]> {
    const response = await this.#requestJson(
      `resolve/${encodeURIComponent(_identifier)}`,
      parseResolvedServerResponse,
    );
    return response.data;
  }

  async resolveInstall(_identifier: string): Promise<InstallManifestResponse["data"]> {
    const response = await this.#requestJson(
      `resolve/${encodeURIComponent(_identifier)}/install`,
      parseInstallManifestResponse,
    );
    return response.data;
  }

  async getServer(_slug: string): Promise<ServerDetailResponse["data"]> {
    const response = await this.#requestJson(
      `servers/${encodeURIComponent(_slug)}`,
      parseServerDetailResponse,
    );
    return response.data;
  }

  async searchServers(_params: SearchServersParams): Promise<ServerCollectionResponse["data"]> {
    const query = buildSearchQuery(_params);
    const response = await this.#requestJson(
      query ? `search?${query}` : "search",
      parseServerCollectionResponse,
    );
    return response.data;
  }

  async listClients(): Promise<ClientsCollectionResponse["data"]> {
    const response = await this.#requestJson("clients", parseClientsCollectionResponse);
    return response.data;
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
        response.body?.cancel().catch(() => {});
        throw this.#httpErrorFor(path, response.status);
      }

      const payload = await readJsonBody(response);

      try {
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

  #httpErrorFor(path: string, status: number): DirectoryClientError {
    if (status === 409) {
      return new DirectoryClientError("DIRECTORY_AMBIGUOUS", `HTTP 409 for ${path}`, status);
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

function normalizeApiRoot(baseUrl: string | URL): string {
  const url = new URL(baseUrl.toString());
  url.hash = "";
  url.search = "";

  if (url.pathname === "/api/v1" || url.pathname === "/api/v1/") {
    url.pathname = "/api/v1/";
    return url.toString();
  }

  url.pathname = "/api/v1/";
  return url.toString();
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
