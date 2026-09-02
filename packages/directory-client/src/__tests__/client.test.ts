import { createFixtureDirectoryApiServer } from "@themcpdirectory/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { clientsResponseFixture, searchServersResponseFixture } from "../fixtures.js";
import { DirectoryClient, DirectoryClientError, type DirectoryClientErrorCode } from "../index.js";

describe("DirectoryClient", () => {
  const activeServers: Array<Awaited<ReturnType<typeof createFixtureDirectoryApiServer>>> = [];

  afterEach(async () => {
    await Promise.all(activeServers.splice(0).map((server) => server.close()));
  });

  async function startServer(
    options: Parameters<typeof createFixtureDirectoryApiServer>[0] = {},
  ): Promise<Awaited<ReturnType<typeof createFixtureDirectoryApiServer>>> {
    const server = await createFixtureDirectoryApiServer(options);
    activeServers.push(server);
    return server;
  }

  function createClient(baseUrl: string | URL, timeoutMs = 10_000): DirectoryClient {
    return new DirectoryClient({
      baseUrl,
      fetchImpl: globalThis.fetch.bind(globalThis),
      timeoutMs,
    });
  }

  async function expectDirectoryError(
    promise: Promise<unknown>,
    expected: {
      code: DirectoryClientErrorCode;
      status: number | undefined;
      message?: RegExp;
    },
  ): Promise<DirectoryClientError> {
    try {
      await promise;
    } catch (error) {
      const directoryError = error as DirectoryClientError;

      expect(directoryError).toBeInstanceOf(DirectoryClientError);
      expect(directoryError.code).toBe(expected.code);
      expect(directoryError.status).toBe(expected.status);
      if (expected.message) {
        expect(directoryError.message).toMatch(expected.message);
      }

      return directoryError;
    }

    throw new Error("Expected promise to reject");
  }

  it("preserves hosted, local, and prefixed api roots without dropping configured path segments", async () => {
    const hostedRequestPaths: string[] = [];
    const hostedServer = await startServer({
      onRequestPath: (path) => hostedRequestPaths.push(path),
      searchBody: {
        ...searchServersResponseFixture,
        meta: {
          ...searchServersResponseFixture.meta,
          nextCursor: "next/2",
        },
      },
    });

    const hostedClient = createClient(hostedServer.baseUrl);

    await expect(
      hostedClient.resolveServer("github/server beta?tab=issues#frag"),
    ).resolves.toMatchObject({
      data: {
        slug: "github-server",
        matchedBy: "alias",
      },
      meta: {
        requestId: "req_directory_client_001",
      },
    });

    await expect(
      createClient(new URL("/api/v1?preview=true#fragment", hostedServer.baseUrl)).searchServers({
        q: "Cursor & docs",
        client: "cursor",
        category: "developer-tools",
        cursor: "next/1",
        limit: 2,
        sort: "name",
      }),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ slug: "github-server", title: "GitHub Server" })],
      meta: {
        requestId: "req_directory_client_003",
        nextCursor: "next/2",
      },
    });

    expect(hostedRequestPaths).toEqual([
      "/api/v1/resolve/github%2Fserver%20beta%3Ftab%3Dissues%23frag",
      "/api/v1/search?q=Cursor%20%26%20docs&client=cursor&category=developer-tools&cursor=next%2F1&limit=2&sort=name",
    ]);

    const prefixedRequestPaths: string[] = [];
    const prefixedServer = await startServer({
      apiBasePath: "/directory/api/v1",
      onRequestPath: (path) => prefixedRequestPaths.push(path),
      clientsBody: {
        ...clientsResponseFixture,
        meta: {
          ...clientsResponseFixture.meta,
          nextCursor: "clients/2",
        },
      },
    });

    await expect(
      createClient(
        new URL("/directory/api/v1?draft=true#details", prefixedServer.baseUrl),
      ).getServer("github-server"),
    ).resolves.toMatchObject({
      data: {
        slug: "github-server",
      },
      meta: {
        requestId: "req_directory_client_002",
      },
    });

    await expect(
      createClient(new URL("/directory?draft=true#clients", prefixedServer.baseUrl)).listClients(),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: "cursor", name: "Cursor" })],
      meta: {
        requestId: "req_directory_client_004",
        nextCursor: "clients/2",
      },
    });

    expect(prefixedRequestPaths).toEqual([
      "/directory/api/v1/servers/github-server",
      "/directory/api/v1/clients",
    ]);
  });

  it("returns full validated envelopes and preserves additive manifest fields", async () => {
    const additiveServer = await startServer({
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

    const additiveClient = createClient(additiveServer.baseUrl);

    const manifestResponse = await additiveClient.resolveInstall("github/server");

    expect(manifestResponse.meta.requestId).toBe("req_directory_client_006");
    expect((manifestResponse.meta as Record<string, unknown>).futureMetaField).toBe("preserved");
    expect((manifestResponse.data as Record<string, unknown>).futureTopLevelField).toBe(
      "preserved",
    );
    expect(
      (
        (manifestResponse.data.variants[0] as Record<string, unknown>).futureVariantField as {
          safe: boolean;
        }
      ).safe,
    ).toBe(true);
  });

  it("preserves UnsupportedManifestVersionError with an actionable upgrade instruction", async () => {
    const unsupportedServer = await startServer({
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

    const unsupportedClient = createClient(unsupportedServer.baseUrl);

    await expect(unsupportedClient.resolveInstall("github/server")).rejects.toMatchObject({
      name: "UnsupportedManifestVersionError",
      message: expect.stringContaining("Upgrade"),
    });
  });

  it("maps HTTP status failures to stable directory errors and hits the intended routes", async () => {
    const requestPaths: string[] = [];
    const server = await startServer({
      statusOverrides: {
        resolveServer: 409,
        resolveInstall: 410,
        search: 500,
      },
      onRequestPath: (path) => requestPaths.push(path),
    });

    const client = createClient(server.baseUrl, 50);

    await expectDirectoryError(client.resolveServer("github/server ambiguity?value=two"), {
      code: "DIRECTORY_AMBIGUOUS",
      status: 409,
      message: /resolve\/github%2Fserver%20ambiguity%3Fvalue%3Dtwo/,
    });
    await expectDirectoryError(client.resolveInstall("github/server unavailable?install=1"), {
      code: "DIRECTORY_INSTALL_UNAVAILABLE",
      status: 410,
      message: /resolve\/github%2Fserver%20unavailable%3Finstall%3D1\/install/,
    });
    await expectDirectoryError(client.searchServers({ q: "github" }), {
      code: "DIRECTORY_HTTP_ERROR",
      status: 500,
      message: /search/,
    });

    expect(requestPaths).toEqual([
      "/api/v1/resolve/github%2Fserver%20ambiguity%3Fvalue%3Dtwo",
      "/api/v1/resolve/github%2Fserver%20unavailable%3Finstall%3D1/install",
      "/api/v1/search?q=github",
    ]);
  });

  it("maps invalid schema, malformed JSON, and empty successful bodies to DIRECTORY_INVALID_RESPONSE", async () => {
    const requestPaths: string[] = [];
    const server = await startServer({
      clientsBody: {
        data: "not-an-array",
        meta: { requestId: "req_directory_client_008", nextCursor: null },
      },
      rawBodyOverrides: {
        serverDetail: '{"data":',
        resolveServer: "",
      },
      onRequestPath: (path) => requestPaths.push(path),
    });

    const client = createClient(server.baseUrl, 50);

    await expectDirectoryError(client.listClients(), {
      code: "DIRECTORY_INVALID_RESPONSE",
      status: 200,
    });
    await expectDirectoryError(client.getServer("github-server"), {
      code: "DIRECTORY_INVALID_RESPONSE",
      status: 200,
    });
    await expectDirectoryError(client.resolveServer("github/server empty"), {
      code: "DIRECTORY_INVALID_RESPONSE",
      status: 200,
    });

    expect(requestPaths).toEqual([
      "/api/v1/clients",
      "/api/v1/servers/github-server",
      "/api/v1/resolve/github%2Fserver%20empty",
    ]);
  });

  it("maps delayed fixture responses to DIRECTORY_TIMEOUT without leaking open handles", async () => {
    const requestPaths: string[] = [];
    const server = await startServer({
      delayOverridesMs: {
        resolveInstall: 100,
      },
      onRequestPath: (path) => requestPaths.push(path),
    });

    const client = createClient(server.baseUrl, 10);

    await expectDirectoryError(client.resolveInstall("github/server slow"), {
      code: "DIRECTORY_TIMEOUT",
      status: undefined,
      message: /10ms/,
    });

    expect(requestPaths).toEqual(["/api/v1/resolve/github%2Fserver%20slow/install"]);
  });
});
