import { describe, expect, it } from "vitest";
import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { selectInstallVariant, UnsupportedVariantError } from "../index.js";

type PackageVariant = Extract<InstallManifestV1["variants"][number], { kind: "package" }>;
type RemoteVariant = Extract<InstallManifestV1["variants"][number], { kind: "remote" }>;

const PACKAGE_VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const REMOTE_VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const UPPERCASE_SHA256_DIGEST = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";

function makePackageVariant(overrides: Partial<PackageVariant> = {}): PackageVariant {
  return {
    id: PACKAGE_VARIANT_ID,
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
    ...overrides,
  };
}

function makeRemoteVariant(overrides: Partial<RemoteVariant> = {}): RemoteVariant {
  return {
    id: REMOTE_VARIANT_ID,
    kind: "remote",
    transport: "streamable-http",
    urlTemplate: "https://example.com/mcp",
    headers: [],
    variables: [],
    ...overrides,
  };
}

function makeCompatibility(
  overrides: Partial<InstallManifestV1["compatibility"]> = {},
): InstallManifestV1["compatibility"] {
  return {
    "claude-code": "supported",
    codex: "supported",
    cursor: "supported",
    ...overrides,
  };
}

function makeManifest(
  variants: InstallManifestV1["variants"],
  compatibility: InstallManifestV1["compatibility"] = makeCompatibility(),
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
  ): UnsupportedVariantError {
    try {
      action();
      throw new Error("Expected selectInstallVariant to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedVariantError);
      expect(error).toMatchObject({ reason });
      return error as UnsupportedVariantError;
    }
  }

  it("chooses the first safe compatible variant deterministically", () => {
    const manifest = makeManifest([makeRemoteVariant(), makePackageVariant()]);

    expect(selectInstallVariant(manifest, "codex")).toMatchObject({
      id: REMOTE_VARIANT_ID,
      kind: "remote",
    });
  });

  it("honors an explicit requested variant id", () => {
    const manifest = makeManifest([makeRemoteVariant(), makePackageVariant()]);

    expect(selectInstallVariant(manifest, "codex", PACKAGE_VARIANT_ID)).toMatchObject({
      id: PACKAGE_VARIANT_ID,
      kind: "package",
    });
  });

  it.each([
    {
      name: "supported",
      compatibility: makeCompatibility({ codex: "supported" }),
      shouldSelect: true,
    },
    {
      name: "supported_with_configuration",
      compatibility: makeCompatibility({ codex: "supported_with_configuration" }),
      shouldSelect: true,
    },
    {
      name: "unknown",
      compatibility: makeCompatibility({ codex: "unknown" }),
      shouldSelect: false,
    },
    {
      name: "unsupported",
      compatibility: makeCompatibility({ codex: "unsupported" }),
      shouldSelect: false,
    },
    {
      name: "missing compatibility entry",
      compatibility: {
        "claude-code": "supported",
        cursor: "supported",
      },
      shouldSelect: false,
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly compatibility: InstallManifestV1["compatibility"];
    readonly shouldSelect: boolean;
  }>)(
    "admits only explicit compatible client statuses: $name",
    ({ compatibility, shouldSelect }) => {
      const manifest = makeManifest([makePackageVariant()], compatibility);

      if (shouldSelect) {
        expect(selectInstallVariant(manifest, "codex")).toMatchObject({
          id: PACKAGE_VARIANT_ID,
          kind: "package",
        });
        return;
      }

      const error = expectVariantError(
        () => selectInstallVariant(manifest, "codex"),
        "CLIENT_INCOMPATIBLE",
      );

      expect(error.message).toBe("Client codex is not compatible with this install manifest");
      expect(error.requestedVariantId).toBeUndefined();
      expect(error.variantId).toBeUndefined();
    },
  );

  it("reports a missing requested variant with a stable client incompatibility error", () => {
    const manifest = makeManifest([makePackageVariant()]);
    const error = expectVariantError(
      () => selectInstallVariant(manifest, "codex", MISSING_VARIANT_ID),
      "CLIENT_INCOMPATIBLE",
    );

    expect(error.message).toBe(`Requested variant is not available: ${MISSING_VARIANT_ID}`);
    expect(error.requestedVariantId).toBe(MISSING_VARIANT_ID);
    expect(error.variantId).toBeUndefined();
  });

  it("keeps manifest-level client incompatibility distinct from a missing requested variant", () => {
    const manifest = makeManifest(
      [makePackageVariant()],
      makeCompatibility({ cursor: "unsupported" }),
    );
    const error = expectVariantError(
      () => selectInstallVariant(manifest, "cursor", PACKAGE_VARIANT_ID),
      "CLIENT_INCOMPATIBLE",
    );

    expect(error.message).toBe("Client cursor is not compatible with this install manifest");
    expect(error.requestedVariantId).toBeUndefined();
    expect(error.variantId).toBeUndefined();
  });

  it("rejects unsupported PyPI variants", () => {
    const manifest = makeManifest([
      {
        ...makePackageVariant(),
        registryType: "pypi",
        identifier: "example-server",
        runtimeHint: null,
      },
    ] as unknown as InstallManifestV1["variants"]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "UNSUPPORTED_REGISTRY");
  });

  it.each([
    {
      name: "accepts an uppercase SHA-256 digest",
      integrity: {
        algorithm: "sha256",
        digest: UPPERCASE_SHA256_DIGEST,
      },
      shouldSelect: true,
    },
    {
      name: "rejects a non-sha256 integrity algorithm",
      integrity: {
        algorithm: "sha512",
        digest: UPPERCASE_SHA256_DIGEST,
      } as unknown as PackageVariant["integrity"],
      shouldSelect: false,
    },
    {
      name: "rejects a malformed digest",
      integrity: {
        algorithm: "sha256",
        digest: "not-a-sha256",
      } as unknown as PackageVariant["integrity"],
      shouldSelect: false,
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly integrity: PackageVariant["integrity"];
    readonly shouldSelect: boolean;
  }>)("$name", ({ integrity, shouldSelect }) => {
    const manifest = makeManifest([makePackageVariant({ integrity })]);

    if (shouldSelect) {
      expect(selectInstallVariant(manifest, "codex")).toMatchObject({
        id: PACKAGE_VARIANT_ID,
        kind: "package",
      });
      return;
    }

    const error = expectVariantError(
      () => selectInstallVariant(manifest, "codex"),
      "MALFORMED_INTEGRITY",
    );

    expect(error.variantId).toBe(PACKAGE_VARIANT_ID);
  });

  it("rejects mutable versions", () => {
    const manifest = makeManifest([makePackageVariant({ version: "^1.2.3" })]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "MUTABLE_VERSION");
  });

  it.each([
    { transport: "streamable-http", shouldSelect: true },
    { transport: "sse", shouldSelect: false },
  ] satisfies ReadonlyArray<{
    readonly transport: RemoteVariant["transport"];
    readonly shouldSelect: boolean;
  }>)("supports only approved remote transport %s", ({ transport, shouldSelect }) => {
    const manifest = makeManifest([makeRemoteVariant({ transport })]);

    if (shouldSelect) {
      expect(selectInstallVariant(manifest, "codex")).toMatchObject({
        id: REMOTE_VARIANT_ID,
        kind: "remote",
      });
      return;
    }

    const error = expectVariantError(
      () => selectInstallVariant(manifest, "codex"),
      "UNSUPPORTED_TRANSPORT",
    );

    expect(error.message).toBe(`Unsupported remote transport: ${transport}`);
    expect(error.variantId).toBe(REMOTE_VARIANT_ID);
  });

  it("rejects unsupported package transports", () => {
    const manifest = makeManifest([
      {
        ...makePackageVariant(),
        transport: "shell",
      },
    ] as unknown as InstallManifestV1["variants"]);

    expectVariantError(() => selectInstallVariant(manifest, "codex"), "UNSUPPORTED_TRANSPORT");
  });
});
