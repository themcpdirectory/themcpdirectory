import { describe, expect, it } from "vitest";
import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { selectInstallVariant, UnsupportedVariantError } from "../index.js";

function makeManifest(
  variants: InstallManifestV1["variants"],
  compatibility: InstallManifestV1["compatibility"] = {
    "claude-code": "supported",
    codex: "supported",
    cursor: "supported",
  },
): InstallManifestV1 {
  return {
    schemaVersion: 1,
    server: {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "test-server",
      title: "Test Server",
      version: "1.2.3",
    },
    provenance: {
      registry: "registry.modelcontextprotocol.io",
      registryName: "MCP Registry",
      observedAt: "2026-09-01T00:00:00Z",
    },
    variants,
    compatibility,
  };
}

describe("selectInstallVariant", () => {
  function expectVariantError(
    action: () => unknown,
    reason: UnsupportedVariantError["reason"],
  ): void {
    try {
      action();
      throw new Error("Expected selectInstallVariant to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedVariantError);
      expect(error).toMatchObject({ reason });
    }
  }

  it("chooses the first safe compatible variant deterministically", () => {
    const manifest = makeManifest([
      {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "remote",
        transport: "streamable-http",
        urlTemplate: "https://example.com/mcp",
        headers: [],
        variables: [],
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "package",
        registryType: "npm",
        identifier: "@example/test-server",
        version: "1.2.3",
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: null,
      },
    ]);

    expect(selectInstallVariant(manifest, "codex")).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      kind: "remote",
    });
  });

  it("honors an explicit requested variant id", () => {
    const manifest = makeManifest([
      {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "remote",
        transport: "streamable-http",
        urlTemplate: "https://example.com/mcp",
        headers: [],
        variables: [],
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "package",
        registryType: "npm",
        identifier: "@example/test-server",
        version: "1.2.3",
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: null,
      },
    ]);

    expect(
      selectInstallVariant(manifest, "codex", "11111111-1111-4111-8111-111111111111"),
    ).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "package",
    });
  });

  it("rejects an explicitly requested variant when the client is incompatible", () => {
    const manifest = makeManifest(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          kind: "package",
          registryType: "npm",
          identifier: "@example/test-server",
          version: "1.2.3",
          runtimeHint: "npx",
          transport: "stdio",
          runtimeArguments: [],
          packageArguments: [],
          environmentVariables: [],
          integrity: null,
        },
      ],
      {
        "claude-code": "supported",
        codex: "supported",
        cursor: "unsupported",
      },
    );

    expectVariantError(
      () => selectInstallVariant(manifest, "cursor", "11111111-1111-4111-8111-111111111111"),
      "CLIENT_INCOMPATIBLE",
    );
  });

  it("rejects unsupported PyPI variants", () => {
    const manifest = makeManifest([
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "package",
        registryType: "pypi",
        identifier: "example-server",
        version: "1.2.3",
        runtimeHint: null,
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: null,
      },
    ] as unknown as InstallManifestV1["variants"]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "UNSUPPORTED_REGISTRY");
  });

  it("rejects malformed integrity values", () => {
    const manifest = makeManifest([
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "package",
        registryType: "npm",
        identifier: "@example/test-server",
        version: "1.2.3",
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: { algorithm: "sha256", digest: "not-a-sha256" },
      },
    ] as unknown as InstallManifestV1["variants"]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "MALFORMED_INTEGRITY");
  });

  it("rejects mutable versions", () => {
    const manifest = makeManifest([
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "package",
        registryType: "npm",
        identifier: "@example/test-server",
        version: "^1.2.3",
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: null,
      },
    ] as unknown as InstallManifestV1["variants"]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "MUTABLE_VERSION");
  });

  it("rejects unsupported transports", () => {
    const manifest = makeManifest([
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "package",
        registryType: "npm",
        identifier: "@example/test-server",
        version: "1.2.3",
        runtimeHint: "npx",
        transport: "shell",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: null,
      },
    ] as unknown as InstallManifestV1["variants"]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "UNSUPPORTED_TRANSPORT");
  });
});
