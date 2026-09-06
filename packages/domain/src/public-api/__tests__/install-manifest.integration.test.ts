import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashInstallManifest, installManifestResponseSchema } from "@themcpdirectory/api-contract";
import type { PublicApiTestContext } from "./public-api-test-context.js";
import { createPublicApiTestContext } from "./public-api-test-context.js";
import { buildInstallManifest } from "../../index.js";

let context: PublicApiTestContext;

beforeAll(async () => {
  context = await createPublicApiTestContext();
}, 30_000);

afterAll(async () => {
  await context.destroy();
});

describe("buildInstallManifest", () => {
  it("builds a contract-valid declarative manifest without executable metadata", async () => {
    const manifest = await buildInstallManifest(context.db, { identifier: "github" });

    expect(
      installManifestResponseSchema.safeParse({
        data: manifest,
        manifestHash: hashInstallManifest(manifest),
        meta: { requestId: crypto.randomUUID() },
      }).success,
    ).toBe(true);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      server: { slug: "github", version: "1.2.3" },
      provenance: {
        registry: "official",
        registryName: "Official MCP Registry",
        observedAt: "2026-09-01T12:00:00.000Z",
      },
      compatibility: {
        cursor: "supported",
        "claude-code": "unsupported",
        vscode: "unsupported",
      },
    });
    expect(manifest.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "package",
          identifier: "@github/mcp-server",
          registryType: "npm",
          version: "1.2.3",
          integrity: { algorithm: "sha256", digest: "a".repeat(64) },
          environmentVariables: [
            expect.objectContaining({
              name: "GITHUB_TOKEN",
              required: true,
              defaultValue: null,
              valueSource: "environment",
            }),
          ],
        }),
        expect.objectContaining({
          kind: "remote",
          transport: "streamable-http",
          urlTemplate: "https://api.githubcopilot.com/mcp",
        }),
        expect.objectContaining({
          kind: "package",
          registryType: "pypi",
          identifier: "github-mcp-server",
          version: "1.2.3.post1",
        }),
      ]),
    );

    const serialized = JSON.stringify(manifest).toLowerCase();
    expect(serialized).not.toContain("postinstall");
    expect(serialized).not.toContain("bash -c");
    expect(serialized).not.toContain("powershell");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("literal-secret");
    expect(serialized).not.toContain("unsafe-range");
    expect(serialized).not.toContain("javascript:");
  });

  it("builds identical plans from every canonical identifier without consulting README text", async () => {
    const identifiers = [
      "github",
      "github-server",
      "io.github/github/mcp-server",
      "@github/mcp-server",
      "github/github-mcp-server",
      "https://github.com/github/github-mcp-server/",
    ];
    const manifests = await Promise.all(
      identifiers.map(async (identifier) => await buildInstallManifest(context.db, { identifier })),
    );

    expect(manifests).toEqual(identifiers.map(() => manifests[0]));
    const serialized = JSON.stringify(manifests);
    expect(serialized).not.toContain("bad.example");
    expect(serialized).not.toContain("curl");
  });

  it("filters all variants when a requested client is unsupported", async () => {
    await expect(
      buildInstallManifest(context.db, { identifier: "github", clientId: "vscode" }),
    ).rejects.toMatchObject({ name: "InstallManifestUnavailableError" });
  });

  it("resolves contradictory compatibility rows deterministically and conservatively", async () => {
    await expect(
      buildInstallManifest(context.db, { identifier: "github", clientId: "codex" }),
    ).rejects.toMatchObject({ name: "InstallManifestUnavailableError" });
  });

  it("distinguishes missing, unavailable, and deleted-upstream installs", async () => {
    await expect(
      buildInstallManifest(context.db, { identifier: "does-not-exist" }),
    ).rejects.toMatchObject({ name: "ServerNotFoundError" });
    await expect(
      buildInstallManifest(context.db, { identifier: "install-unavailable" }),
    ).rejects.toMatchObject({ name: "InstallManifestUnavailableError" });
    await expect(
      buildInstallManifest(context.db, { identifier: "upstream-deleted-server" }),
    ).rejects.toMatchObject({ name: "UpstreamDeletedError", code: "UPSTREAM_DELETED" });
    await expect(
      buildInstallManifest(context.db, { identifier: "mismatched-current-version" }),
    ).rejects.toMatchObject({ name: "InstallManifestUnavailableError" });
  });
});
