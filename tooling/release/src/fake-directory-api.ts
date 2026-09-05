import { createServer } from "node:http";
import type { Socket } from "node:net";

export interface FakeDirectoryApi {
  readonly baseUrl: string;
  close(): Promise<void>;
}

const serverId = "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb";
const variantId = "8f6c5ae7-c883-4c12-b4c1-f528d6a3c4e5";

const serverSummary = {
  id: serverId,
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
} as const;

const routeBodies = {
  search: {
    data: [serverSummary],
    meta: { requestId: "req_tarball_search", nextCursor: null },
  },
  serverDetail: {
    data: {
      id: serverId,
      slug: "github-server",
      title: "GitHub Server",
      shortDescription: "Access GitHub repositories.",
      longDescription: null,
      listingStatus: "active",
      aliases: ["github/server"],
      publisher: { slug: "github", name: "GitHub", verified: true },
      repository: { url: "https://github.com/modelcontextprotocol/servers" },
      version: "1.2.3",
      categories: [{ slug: "developer-tools", name: "Developer Tools" }],
      packages: [],
      remotes: [],
      compatibility: {
        codex: "supported",
        "claude-code": "supported",
        cursor: "supported",
        vscode: "supported",
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
    meta: { requestId: "req_tarball_detail" },
  },
  install: {
    data: {
      schemaVersion: 1,
      server: {
        id: serverId,
        slug: "github-server",
        title: "GitHub Server",
        version: "1.2.3",
      },
      provenance: {
        registry: "https://registry.modelcontextprotocol.io",
        registryName: "Model Context Protocol Registry",
        observedAt: "2026-09-01T12:00:00Z",
      },
      variants: [
        {
          id: variantId,
          kind: "package",
          registryType: "npm",
          identifier: "@modelcontextprotocol/server-github",
          version: "1.2.3",
          runtimeHint: "npx",
          transport: "stdio",
          runtimeArguments: [],
          packageArguments: [],
          environmentVariables: [],
          integrity: {
            algorithm: "sha256",
            digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          },
        },
      ],
      compatibility: {
        codex: "supported",
        "claude-code": "supported",
        cursor: "supported",
        vscode: "supported",
      },
    },
    meta: { requestId: "req_tarball_install" },
  },
  clients: {
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
    meta: { requestId: "req_tarball_clients", nextCursor: null },
  },
} as const;

export async function startFakeDirectoryApi(): Promise<FakeDirectoryApi> {
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let body: unknown;

    if (url.pathname === "/api/v1/search") body = routeBodies.search;
    else if (/^\/api\/v1\/servers\/[^/]+$/u.test(url.pathname)) body = routeBodies.serverDetail;
    else if (/^\/api\/v1\/resolve\/[^/]+\/install$/u.test(url.pathname)) body = routeBodies.install;
    else if (url.pathname === "/api/v1/clients") body = routeBodies.clients;
    else {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "Not found", requestId: "req_tarball_404" },
        }),
      );
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fake Directory API did not bind a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
