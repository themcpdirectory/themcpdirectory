import { describe, expect, it } from "vitest";
import type { RegistryServerResponse } from "@themcpdirectory/registry-client";
import { RegistryPageSchema } from "@themcpdirectory/registry-client";
import {
  hashRegistryPayload,
  normalizeRegistryServer,
  selectCurrentVersion,
  type CurrentVersionCandidate,
} from "../index.js";

function makeValidatedServerResponse(
): RegistryServerResponse {
  const parsed = RegistryPageSchema.parse({
    servers: [
      {
        server: {
          $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
          name: "io.github.example/test-server",
          description: "A deterministic test server",
          title: "Test Server",
          version: "1.2.0",
          repository: {
            url: "https://github.com/example/test-server",
            source: "github",
            id: "repo-123",
            subfolder: "packages/server",
          },
          websiteUrl: "https://example.com/test-server",
          icons: [
            {
              src: "https://example.com/icon-48.png",
              sizes: ["48x48"],
              mimeType: "image/png",
              theme: "light",
            },
          ],
          packages: [
            {
              registryType: "npm",
              registryBaseUrl: "https://registry.npmjs.org",
              identifier: "@example/test-server",
              version: "1.2.0",
              fileSha256: "deadbeef",
              runtimeHint: "npx",
              transport: { type: "stdio" },
              runtimeArguments: [
                {
                  type: "positional",
                  valueHint: "--stdio",
                },
              ],
              packageArguments: [
                {
                  type: "named",
                  name: "token",
                  isRequired: true,
                },
              ],
              environmentVariables: [
                {
                  name: "TEST_API_KEY",
                  description: "API key",
                  isRequired: true,
                  isSecret: true,
                },
              ],
            },
          ],
          remotes: [
            {
              type: "streamable-http",
              url: "https://mcp.example.com/http/{tenant}",
              headers: [
                {
                  name: "Authorization",
                  value: "Bearer ${TOKEN}",
                },
              ],
              variables: {
                tenant: {
                  description: "Tenant id",
                  isRequired: true,
                },
              },
            },
          ],
        },
        _meta: {
          "io.modelcontextprotocol.registry/official": {
            status: "active",
            statusChangedAt: "2025-06-01T12:00:00Z",
            statusMessage: "recommended",
            publishedAt: "2025-06-01T12:00:00Z",
            updatedAt: "2025-07-01T12:00:00Z",
            isLatest: true,
          },
        },
      },
    ],
    metadata: {
      count: 1,
    },
  });

  const serverResponse = parsed.servers[0];
  if (!serverResponse) {
    throw new Error("Fixture server is required");
  }

  return serverResponse;
}

describe("hashRegistryPayload", () => {
  it("produces identical hashes for object-key order differences", () => {
    const hashA = hashRegistryPayload({ b: 2, a: { z: 1, y: true } });
    const hashB = hashRegistryPayload({ a: { y: true, z: 1 }, b: 2 });

    expect(hashA).toBe(hashB);
  });

  it("preserves array-order significance", () => {
    const hashA = hashRegistryPayload({ values: ["first", "second"] });
    const hashB = hashRegistryPayload({ values: ["second", "first"] });

    expect(hashA).not.toBe(hashB);
  });
});

describe("normalizeRegistryServer", () => {
  it("normalizes server fields used by versions/packages/remotes/icons", () => {
    const input = makeValidatedServerResponse();

    const normalized = normalizeRegistryServer(input);

    expect(normalized.canonicalRegistryName).toBe("io.github.example/test-server");
    expect(normalized.version).toBe("1.2.0");
    expect(normalized.schemaUri).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    expect(normalized.repository).toEqual({
      url: "https://github.com/example/test-server",
      source: "github",
      externalId: "repo-123",
      subfolder: "packages/server",
    });
    expect(normalized.icons).toEqual([
      {
        src: "https://example.com/icon-48.png",
        mimeType: "image/png",
        sizes: ["48x48"],
        theme: "light",
      },
    ]);
    expect(normalized.packages).toEqual([
      {
        registryType: "npm",
        registryBaseUrl: "https://registry.npmjs.org",
        identifier: "@example/test-server",
        version: "1.2.0",
        fileSha256: "deadbeef",
        runtimeHint: "npx",
        transportType: "stdio",
        runtimeArguments: [
          {
            type: "positional",
            valueHint: "--stdio",
          },
        ],
        packageArguments: [
          {
            type: "named",
            name: "token",
            isRequired: true,
          },
        ],
        environmentVariables: [
          {
            name: "TEST_API_KEY",
            description: "API key",
            isRequired: true,
            isSecret: true,
          },
        ],
      },
    ]);
    expect(normalized.remotes).toEqual([
      {
        transportType: "streamable-http",
        urlTemplate: "https://mcp.example.com/http/{tenant}",
        headers: [
          {
            name: "Authorization",
            value: "Bearer ${TOKEN}",
          },
        ],
        variables: {
          tenant: {
            description: "Tenant id",
            isRequired: true,
          },
        },
      },
    ]);
    expect(normalized.upstream).toEqual({
      status: "active",
      statusChangedAt: "2025-06-01T12:00:00Z",
      statusMessage: "recommended",
      publishedAt: "2025-06-01T12:00:00Z",
      updatedAt: "2025-07-01T12:00:00Z",
      isLatest: true,
    });
    expect(normalized.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves unknown validated upstream fields in normalizedPayload", () => {
    const page = structuredClone(
      RegistryPageSchema.parse({
        servers: [
          {
            server: {
              $schema:
                "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
              name: "io.github.example/future-server",
              description: "Future field server",
              version: "9.9.9",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@example/future",
                  transport: { type: "stdio" },
                  runtimeArguments: [{ type: "named", name: "future" }],
                },
              ],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                statusChangedAt: "2026-01-01T00:00:00Z",
                publishedAt: "2026-01-01T00:00:00Z",
                isLatest: false,
              },
            },
          },
        ],
        metadata: { count: 1 },
      }),
    );

    const raw = page.servers[0] as RegistryServerResponse & {
      server: RegistryServerResponse["server"] & { futureField?: string };
    };

    raw.server.futureField = "preserve-me";
    if (raw.server.packages?.[0]) {
      (raw.server.packages[0] as Record<string, unknown>)["futurePackageField"] = {
        nested: "yes",
      };
    }
    if (raw._meta) {
      (raw._meta as Record<string, unknown>)["io.modelcontextprotocol.registry/custom"] = {
        customState: "experimental",
      };
    }

    const normalized = normalizeRegistryServer(raw);
    const payload = normalized.normalizedPayload as {
      server: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };

    expect(payload.server["futureField"]).toBe("preserve-me");
    const firstPackage = payload.server["packages"] as Array<Record<string, unknown>>;
    expect(firstPackage[0]?.["futurePackageField"]).toEqual({ nested: "yes" });
    expect(payload._meta?.["io.modelcontextprotocol.registry/custom"]).toEqual({
      customState: "experimental",
    });
  });
});

describe("selectCurrentVersion", () => {
  it("prefers highest valid SemVer among active versions", () => {
    const versions: CurrentVersionCandidate[] = [
      { version: "1.2.0", upstreamStatus: "active" },
      { version: "1.10.0", upstreamStatus: "active" },
      { version: "1.3.0", upstreamStatus: "active" },
    ];

    const selected = selectCurrentVersion(versions);
    expect(selected?.version).toBe("1.10.0");
  });

  it("falls back to deterministic publication date and upstream order when SemVer is unavailable", () => {
    const versions: CurrentVersionCandidate[] = [
      { version: "stable", upstreamStatus: "active", publishedAt: "2026-01-01T00:00:00Z" },
      { version: "canary", upstreamStatus: "active", publishedAt: "2026-02-01T00:00:00Z" },
      { version: "nightly", upstreamStatus: "active", publishedAt: "invalid-date" },
    ];

    const selected = selectCurrentVersion(versions);
    expect(selected?.version).toBe("canary");

    const tieBreak: CurrentVersionCandidate[] = [
      { version: "a", upstreamStatus: "active" },
      { version: "b", upstreamStatus: "active" },
    ];
    expect(selectCurrentVersion(tieBreak)?.version).toBe("a");
  });

  it("uses SemVer ordering when mixed with non-SemVer versions", () => {
    const versions: CurrentVersionCandidate[] = [
      { version: "latest", upstreamStatus: "active" },
      { version: "2.0.1", upstreamStatus: "active" },
      { version: "2.1.0", upstreamStatus: "active" },
    ];

    const selected = selectCurrentVersion(versions);
    expect(selected?.version).toBe("2.1.0");
  });

  it("prefers active versions over deprecated ones", () => {
    const versions: CurrentVersionCandidate[] = [
      { version: "3.0.0", upstreamStatus: "deprecated" },
      { version: "2.5.0", upstreamStatus: "active" },
    ];

    const selected = selectCurrentVersion(versions);
    expect(selected?.version).toBe("2.5.0");
  });

  it("returns null for empty input", () => {
    expect(selectCurrentVersion([])).toBeNull();
  });
});