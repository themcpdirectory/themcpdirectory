import { createServer } from "node:http";
import {
  parseClientsCollectionResponse,
  parseInstallManifestResponse,
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  parseServerDetailResponse,
} from "../../api-contract/src/public-api/client-parsers.js";
import type { ClientsCollectionResponse } from "../../api-contract/src/public-api/discovery.js";
import type { InstallManifestResponse } from "../../api-contract/src/public-api/install.js";
import type {
  ResolvedServerResponse,
  ServerCollectionResponse,
  ServerDetailResponse,
} from "../../api-contract/src/public-api/servers.js";

export interface FixtureDirectoryApiServerOptions {
  readonly resolveServerBody?: unknown;
  readonly resolveInstallBody?: unknown;
  readonly searchBody?: unknown;
  readonly serverDetailBody?: unknown;
  readonly clientsBody?: unknown;
  readonly statusOverrides?: Partial<
    Record<"resolveServer" | "resolveInstall" | "search" | "serverDetail" | "clients", number>
  >;
  readonly onRequestPath?: (path: string) => void;
}

export interface FixtureDirectoryApiServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

const defaultResolveServerBody: ResolvedServerResponse = parseResolvedServerResponse({
  data: {
    id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
    slug: "github-server",
    title: "GitHub Server",
    version: "1.2.3",
    canonicalUrl: "https://themcpdirectory.test/github-server",
    matchedBy: "alias",
    matchedValue: "github/server",
    needsRedirect: true,
  },
  meta: { requestId: "req_directory_client_001" },
});

const defaultServerDetailBody: ServerDetailResponse = parseServerDetailResponse({
  data: {
    id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
    slug: "github-server",
    title: "GitHub Server",
    shortDescription: "Access GitHub repositories.",
    longDescription: null,
    listingStatus: "active",
    aliases: ["github/server"],
    publisher: {
      slug: "github",
      name: "GitHub",
      verified: true,
    },
    repository: { url: "https://github.com/modelcontextprotocol/servers" },
    version: "1.2.3",
    categories: [{ slug: "developer-tools", name: "Developer Tools" }],
    packages: [],
    remotes: [],
    compatibility: {
      codex: "supported",
      "claude-code": "supported_with_configuration",
      cursor: "unknown",
    },
    trustProfile: {
      officialRegistry: true,
      publisherVerified: true,
      sourceAvailable: true,
      openSource: true,
      signals: [],
    },
    timestamps: {
      firstSeenAt: "2026-09-01T12:00:00Z",
      lastSeenAt: "2026-09-01T12:00:00Z",
      publishedAt: null,
      updatedAt: null,
    },
  },
  meta: { requestId: "req_directory_client_002" },
});

const defaultSearchBody: ServerCollectionResponse = parseServerCollectionResponse({
  data: [
    {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github-server",
      title: "GitHub Server",
      description: "Access GitHub repositories.",
      publisher: { slug: "github", name: "GitHub", verified: true },
      version: "1.2.3",
      repository: { url: "https://github.com/modelcontextprotocol/servers" },
      listingStatus: "active",
      signals: {
        officialRegistry: true,
        publisherVerified: true,
        sourceAvailable: true,
        openSource: true,
      },
    },
  ],
  meta: { requestId: "req_directory_client_003", nextCursor: null },
});

const defaultClientsBody: ClientsCollectionResponse = parseClientsCollectionResponse({
  data: [
    {
      id: "cursor",
      name: "Cursor",
      capabilities: {
        deeplink: true,
        stdio: true,
        streamableHttp: true,
        headers: true,
        environmentVariables: true,
        remoteVariables: true,
      },
      serverCount: 1,
    },
  ],
  meta: { requestId: "req_directory_client_004", nextCursor: null },
});

const defaultResolveInstallBody: InstallManifestResponse = parseInstallManifestResponse({
  data: {
    schemaVersion: 1,
    server: {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github-server",
      title: "GitHub Server",
      version: "1.2.3",
    },
    provenance: {
      registry: "https://github.com/modelcontextprotocol/servers",
      registryName: "Model Context Protocol Registry",
      observedAt: "2026-09-01T12:00:00Z",
    },
    variants: [
      {
        id: "8f6c5ae7-c883-4c12-b4c1-f528d6a3c4e5",
        kind: "package",
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-github",
        version: "1.2.3",
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [
          {
            type: "named",
            name: "config",
            valueHint: "path",
            description: "Config file path.",
            required: true,
          },
        ],
        packageArguments: [
          {
            type: "positional",
            valueHint: "repository",
            description: "Repository slug.",
            required: false,
          },
        ],
        environmentVariables: [
          {
            name: "GITHUB_TOKEN",
            description: "GitHub access token.",
            required: true,
            defaultValue: null,
            valueSource: "environment",
          },
        ],
        integrity: {
          algorithm: "sha256",
          digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    ],
    compatibility: {
      codex: "supported",
      "claude-code": "supported_with_configuration",
      cursor: "unknown",
    },
  },
  meta: { requestId: "req_directory_client_005" },
});

export async function createFixtureDirectoryApiServer(
  options: FixtureDirectoryApiServerOptions = {},
): Promise<FixtureDirectoryApiServer> {
  const server = createServer((request, response) => {
    const requestPath = request.url ?? "/";
    options.onRequestPath?.(requestPath);

    const url = new URL(requestPath, "http://127.0.0.1");
    const pathname = url.pathname;

    const statusFor = (
      key: keyof NonNullable<FixtureDirectoryApiServerOptions["statusOverrides"]>,
    ) => options.statusOverrides?.[key] ?? 200;

    if (pathname === "/api/v1/resolve/github%2Fserver") {
      response.writeHead(statusFor("resolveServer"), { "content-type": "application/json" });
      response.end(JSON.stringify(options.resolveServerBody ?? defaultResolveServerBody));
      return;
    }

    if (pathname === "/api/v1/resolve/github%2Fserver/install") {
      response.writeHead(statusFor("resolveInstall"), { "content-type": "application/json" });
      response.end(JSON.stringify(options.resolveInstallBody ?? defaultResolveInstallBody));
      return;
    }

    if (pathname === "/api/v1/search") {
      response.writeHead(statusFor("search"), { "content-type": "application/json" });
      response.end(JSON.stringify(options.searchBody ?? defaultSearchBody));
      return;
    }

    if (pathname === "/api/v1/servers/github-server") {
      response.writeHead(statusFor("serverDetail"), { "content-type": "application/json" });
      response.end(JSON.stringify(options.serverDetailBody ?? defaultServerDetailBody));
      return;
    }

    if (pathname === "/api/v1/clients") {
      response.writeHead(statusFor("clients"), { "content-type": "application/json" });
      response.end(JSON.stringify(options.clientsBody ?? defaultClientsBody));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: "Not found", requestId: "req_directory_client_404" },
      }),
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fixture directory API server");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
