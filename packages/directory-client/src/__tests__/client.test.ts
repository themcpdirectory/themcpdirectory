import { afterEach, describe, expect, it } from "vitest";
import { DirectoryClient, DirectoryClientError } from "../index.js";
import { createFixtureDirectoryApiServer } from "../../../test-utils/src/directory-api-server.js";

describe("DirectoryClient", () => {
  let activeServer: Awaited<ReturnType<typeof createFixtureDirectoryApiServer>> | null = null;

  afterEach(async () => {
    await activeServer?.close();
    activeServer = null;
  });

  it("normalizes hosted and local API roots while preserving encoded paths", async () => {
    const requestPaths: string[] = [];
    activeServer = await createFixtureDirectoryApiServer({
      onRequestPath: (path) => requestPaths.push(path),
    });

    const hostedClient = new DirectoryClient({
      baseUrl: activeServer.baseUrl,
      fetchImpl: globalThis.fetch.bind(globalThis),
    });

    await expect(hostedClient.resolveServer("github/server")).resolves.toMatchObject({
      slug: "github-server",
      matchedBy: "alias",
    });

    await expect(
      new DirectoryClient({
        baseUrl: new URL("/api/v1", activeServer.baseUrl),
        fetchImpl: globalThis.fetch.bind(globalThis),
      }).searchServers({
        q: "Cursor & docs",
        client: "cursor",
        category: "developer-tools",
        cursor: "next/1",
        limit: 2,
        sort: "name",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ slug: "github-server", title: "GitHub Server" }),
    ]);

    expect(requestPaths).toEqual([
      "/api/v1/resolve/github%2Fserver",
      "/api/v1/search?q=Cursor%20%26%20docs&client=cursor&category=developer-tools&cursor=next%2F1&limit=2&sort=name",
    ]);
  });

  it("preserves additive fields and unsupported manifest versions", async () => {
    const additiveServer = await createFixtureDirectoryApiServer({
      resolveInstallBody: {
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
                  futureArgumentField: "preserved",
                },
              ],
              packageArguments: [],
              environmentVariables: [],
              integrity: {
                algorithm: "sha256",
                digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              },
              futureVariantField: { safe: true },
            },
          ],
          compatibility: {
            codex: "supported",
            "claude-code": "supported_with_configuration",
            cursor: "unknown",
          },
          futureTopLevelField: "preserved",
        },
        meta: { requestId: "req_directory_client_006", futureMetaField: "preserved" },
      },
    });

    const additiveClient = new DirectoryClient({
      baseUrl: additiveServer.baseUrl,
      fetchImpl: globalThis.fetch.bind(globalThis),
    });

    const manifest = await additiveClient.resolveInstall("github/server");

    expect((manifest as Record<string, unknown>).futureTopLevelField).toBe("preserved");
    expect(
      (
        (manifest.variants[0] as Record<string, unknown>).futureVariantField as {
          safe: boolean;
        }
      ).safe,
    ).toBe(true);

    await additiveServer.close();

    const unsupportedServer = await createFixtureDirectoryApiServer({
      resolveInstallBody: {
        data: {
          schemaVersion: 2,
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
          variants: [],
          compatibility: {},
        },
        meta: { requestId: "req_directory_client_007" },
      },
    });

    const unsupportedClient = new DirectoryClient({
      baseUrl: unsupportedServer.baseUrl,
      fetchImpl: globalThis.fetch.bind(globalThis),
    });

    await expect(unsupportedClient.resolveInstall("github/server")).rejects.toMatchObject({
      name: "UnsupportedManifestVersionError",
    });

    await unsupportedServer.close();
  });

  it("maps HTTP failures and invalid bodies to stable directory errors", async () => {
    const server = await createFixtureDirectoryApiServer({
      statusOverrides: {
        resolveServer: 409,
        resolveInstall: 410,
        search: 500,
        serverDetail: 200,
        clients: 200,
      },
      searchBody: { data: [], meta: { requestId: "req_directory_client_008", nextCursor: null } },
      clientsBody: { data: "not-an-array", meta: { requestId: "req_directory_client_009" } },
    });

    const client = new DirectoryClient({
      baseUrl: server.baseUrl,
      fetchImpl: globalThis.fetch.bind(globalThis),
      timeoutMs: 10,
    });

    await expect(client.resolveServer("github-server")).rejects.toBeInstanceOf(
      DirectoryClientError,
    );
    await expect(client.resolveInstall("github-server")).rejects.toBeInstanceOf(
      DirectoryClientError,
    );
    await expect(client.searchServers({ q: "github" })).rejects.toBeInstanceOf(
      DirectoryClientError,
    );
    await expect(client.listClients()).rejects.toBeInstanceOf(DirectoryClientError);

    await server.close();
  });
});
