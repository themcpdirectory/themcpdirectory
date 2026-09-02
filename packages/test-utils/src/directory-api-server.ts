import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import {
  parseClientsCollectionResponse,
  parseInstallManifestResponse,
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  parseServerDetailResponse,
  type ClientsCollectionResponse,
  type InstallManifestResponse,
  type ResolvedServerResponse,
  type ServerCollectionResponse,
  type ServerDetailResponse,
} from "@themcpdirectory/api-contract";

type FixtureRouteKey = "resolveServer" | "resolveInstall" | "search" | "serverDetail" | "clients";

export interface FixtureDirectoryApiServerOptions {
  readonly apiBasePath?: string;
  readonly resolveServerBody?: unknown;
  readonly resolveInstallBody?: unknown;
  readonly searchBody?: unknown;
  readonly serverDetailBody?: unknown;
  readonly clientsBody?: unknown;
  readonly statusOverrides?: Partial<Record<FixtureRouteKey, number>>;
  readonly rawBodyOverrides?: Partial<Record<FixtureRouteKey, string>>;
  readonly delayOverridesMs?: Partial<Record<FixtureRouteKey, number>>;
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
  const apiBasePath = normalizeApiBasePath(options.apiBasePath);
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const sockets = new Set<Socket>();

  const statusFor = (key: FixtureRouteKey) => options.statusOverrides?.[key] ?? 200;
  const rawBodyFor = (key: FixtureRouteKey) => options.rawBodyOverrides?.[key];
  const delayMsFor = (key: FixtureRouteKey) => options.delayOverridesMs?.[key] ?? 0;

  const routeBodies: Record<FixtureRouteKey, unknown> = {
    resolveServer: options.resolveServerBody ?? defaultResolveServerBody,
    resolveInstall: options.resolveInstallBody ?? defaultResolveInstallBody,
    search: options.searchBody ?? defaultSearchBody,
    serverDetail: options.serverDetailBody ?? defaultServerDetailBody,
    clients: options.clientsBody ?? defaultClientsBody,
  };

  const server = createServer((request, response) => {
    const requestPath = request.url ?? "/";
    options.onRequestPath?.(requestPath);

    const url = new URL(requestPath, "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname.startsWith(`${apiBasePath}/resolve/`) && pathname.endsWith("/install")) {
      scheduleResponse("resolveInstall", response, pendingTimers, delayMsFor, () => {
        sendRouteResponse(
          response,
          statusFor("resolveInstall"),
          rawBodyFor("resolveInstall"),
          routeBodies.resolveInstall,
        );
      });
      return;
    }

    if (pathname.startsWith(`${apiBasePath}/resolve/`)) {
      scheduleResponse("resolveServer", response, pendingTimers, delayMsFor, () => {
        sendRouteResponse(
          response,
          statusFor("resolveServer"),
          rawBodyFor("resolveServer"),
          routeBodies.resolveServer,
        );
      });
      return;
    }

    if (pathname === `${apiBasePath}/search`) {
      scheduleResponse("search", response, pendingTimers, delayMsFor, () => {
        sendRouteResponse(response, statusFor("search"), rawBodyFor("search"), routeBodies.search);
      });
      return;
    }

    if (pathname.startsWith(`${apiBasePath}/servers/`)) {
      scheduleResponse("serverDetail", response, pendingTimers, delayMsFor, () => {
        sendRouteResponse(
          response,
          statusFor("serverDetail"),
          rawBodyFor("serverDetail"),
          routeBodies.serverDetail,
        );
      });
      return;
    }

    if (pathname === `${apiBasePath}/clients`) {
      scheduleResponse("clients", response, pendingTimers, delayMsFor, () => {
        sendRouteResponse(
          response,
          statusFor("clients"),
          rawBodyFor("clients"),
          routeBodies.clients,
        );
      });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: "Not found", requestId: "req_directory_client_404" },
      }),
    );
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
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
        for (const timer of pendingTimers) {
          clearTimeout(timer);
        }
        pendingTimers.clear();

        for (const socket of sockets) {
          socket.destroy();
        }

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

function normalizeApiBasePath(pathname: string | undefined): string {
  if (!pathname || pathname === "/") {
    return "/api/v1";
  }

  const trimmedPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return trimmedPathname.startsWith("/") ? trimmedPathname : `/${trimmedPathname}`;
}

function scheduleResponse(
  route: FixtureRouteKey,
  response: ServerResponse,
  pendingTimers: Set<ReturnType<typeof setTimeout>>,
  delayMsFor: (route: FixtureRouteKey) => number,
  send: () => void,
): void {
  const delayMs = delayMsFor(route);
  if (delayMs <= 0) {
    send();
    return;
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(timer);
    send();
  }, delayMs);

  pendingTimers.add(timer);
}

function sendRouteResponse(
  response: ServerResponse,
  status: number,
  rawBody: string | undefined,
  body: unknown,
): void {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  response.writeHead(status, { "content-type": "application/json" });
  response.end(rawBody ?? JSON.stringify(body));
}
