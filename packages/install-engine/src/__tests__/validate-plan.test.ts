import { createHash } from "node:crypto";
import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { describe, expect, it } from "vitest";
import * as installEngine from "../index.js";
import type { ResolvedInstallIntent } from "../index.js";

type HashInstallManifest = (manifest: InstallManifestV1) => string;
type HashResolvedInstallIntent = (intent: ResolvedInstallIntent) => string;
type SerializeInstallPlan = (plan: unknown) => string;
type ValidateInstallPlan = (plan: unknown, descriptor: unknown) => unknown;

type PackageVariant = Extract<InstallManifestV1["variants"][number], { kind: "package" }>;

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const MANIFEST_HASH = "a".repeat(64);
const INTENT_HASH = "b".repeat(64);

function getHashInstallManifest(): HashInstallManifest {
  const candidate = Reflect.get(installEngine, "hashInstallManifest");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("Expected hashInstallManifest to be exported");
  }

  return candidate as HashInstallManifest;
}

function getHashResolvedInstallIntent(): HashResolvedInstallIntent {
  const candidate = Reflect.get(installEngine, "hashResolvedInstallIntent");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("Expected hashResolvedInstallIntent to be exported");
  }

  return candidate as HashResolvedInstallIntent;
}

function getSerializeInstallPlan(): SerializeInstallPlan {
  const candidate = Reflect.get(installEngine, "serializeInstallPlan");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("Expected serializeInstallPlan to be exported");
  }

  return candidate as SerializeInstallPlan;
}

function getValidateInstallPlan(): ValidateInstallPlan {
  const candidate = Reflect.get(installEngine, "validateInstallPlan");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("Expected validateInstallPlan to be exported");
  }

  return candidate as ValidateInstallPlan;
}

function makePackageVariant(overrides: Partial<PackageVariant> = {}): PackageVariant {
  return {
    id: VARIANT_ID,
    kind: "package",
    registryType: "npm",
    identifier: "@example/github-mcp",
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
    packageArguments: [],
    environmentVariables: [
      {
        name: "GITHUB_TOKEN",
        description: "GitHub token.",
        required: true,
        defaultValue: null,
        valueSource: "environment",
      },
    ],
    integrity: {
      algorithm: "sha256",
      digest: "c".repeat(64),
    },
    ...overrides,
  };
}

function makeManifest(overrides: Partial<InstallManifestV1> = {}): InstallManifestV1 {
  return {
    schemaVersion: 1,
    server: {
      id: "6c82758f-ec36-40f8-9a86-88d9f5410c4a",
      slug: "github",
      title: "GitHub",
      version: "1.2.3",
    },
    provenance: {
      registry: "registry.modelcontextprotocol.io",
      registryName: "MCP Registry",
      observedAt: "2026-09-01T00:00:00Z",
    },
    variants: [makePackageVariant()],
    compatibility: {
      codex: "supported",
      "claude-code": "supported",
      cursor: "supported",
    },
    ...overrides,
  };
}

function makeResolvedIntent(overrides: Partial<ResolvedInstallIntent> = {}): ResolvedInstallIntent {
  return {
    schemaVersion: 1,
    server: {
      slug: "github",
      title: "GitHub",
      version: "1.2.3",
    },
    client: "codex",
    scope: "user",
    variant: makePackageVariant(),
    warnings: [],
    inputs: [
      {
        key: "config",
        source: "package-runtime-argument",
        argumentType: "named",
        index: 0,
        name: "config",
        valueHint: "path",
        description: "Config file path.",
        required: true,
        accepts: ["text"],
      },
      {
        key: "GITHUB_TOKEN",
        source: "environment-variable",
        name: "GITHUB_TOKEN",
        description: "GitHub token.",
        required: true,
        accepts: ["env-reference"],
      },
    ],
    remoteAuth: { kind: "none" },
    requiredEnvReferences: ["GITHUB_TOKEN"],
    ...overrides,
  };
}

function makeDescriptor(
  overrides: Partial<{
    client: string;
    executableAllowList: readonly string[];
    configRoots: readonly string[];
    deeplinkPrefixes: readonly string[];
    supportedCapabilities: readonly string[];
  }> = {},
) {
  return {
    client: "codex",
    executableAllowList: ["codex", "/usr/local/bin/codex"],
    configRoots: ["/Users/test/.codex", "C:\\Users\\test\\.codex"],
    deeplinkPrefixes: ["cursor://anysphere.cursor-deeplink/mcp/install?"],
    supportedCapabilities: [
      "native-add-stdio",
      "native-add-remote",
      "env-reference",
      "persisted-secret",
      "cursor-deeplink",
    ],
    ...overrides,
  };
}

function makeClientCommandOperation(
  overrides: Partial<{
    executable: string;
    args: readonly string[];
    capability: string;
  }> = {},
) {
  return {
    type: "client-command",
    executable: "codex",
    args: ["mcp", "add", "github", "--", "npx", "-y", "@example/github-mcp@1.2.3"],
    capability: "native-add-stdio",
    ...overrides,
  };
}

function makeConfigWriteOperation(
  overrides: Partial<{
    path: string;
    mutationKey: string;
    document: unknown;
  }> = {},
) {
  return {
    type: "config-write",
    path: "/Users/test/.codex/mcp.json",
    mutationKey: "mcpServers.github",
    document: {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@example/github-mcp@1.2.3"],
          env: {
            GITHUB_TOKEN: "${GITHUB_TOKEN}",
          },
        },
      },
    },
    ...overrides,
  };
}

function makeConfigRemoveOperation(
  overrides: Partial<{
    path: string;
    mutationKey: string;
  }> = {},
) {
  return {
    type: "config-remove",
    path: "/Users/test/.codex/mcp.json",
    mutationKey: "mcpServers.github",
    ...overrides,
  };
}

function makeDeeplinkOperation(overrides: Partial<{ url: string }> = {}) {
  return {
    type: "deeplink",
    url: "cursor://anysphere.cursor-deeplink/mcp/install?payload=ZXhhbXBsZQ==",
    ...overrides,
  };
}

function makeInstallPlan(
  overrides: Partial<{
    schemaVersion: number;
    serverSlug: string;
    client: string;
    scope: string;
    variantId: string;
    manifestHash: string;
    intentHash: string;
    operations: readonly unknown[];
    previewLines: readonly string[];
  }> = {},
) {
  return {
    schemaVersion: 1,
    serverSlug: "github",
    client: "codex",
    scope: "user",
    variantId: VARIANT_ID,
    manifestHash: MANIFEST_HASH,
    intentHash: INTENT_HASH,
    operations: [makeClientCommandOperation()],
    previewLines: ["Install GitHub into Codex user scope."],
    ...overrides,
  };
}

function expectPlanValidationError(
  action: () => unknown,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  try {
    action();
    throw new Error("Expected validateInstallPlan to throw");
  } catch (error) {
    expect(error).toMatchObject(expected);
    return error as Record<string, unknown>;
  }
}

describe("install plan hashing and validation", () => {
  it("hashes manifests and resolved intents with deterministic canonical json", () => {
    const hashInstallManifest = getHashInstallManifest();
    const hashResolvedInstallIntent = getHashResolvedInstallIntent();

    const manifestA = makeManifest({
      server: {
        id: "6c82758f-ec36-40f8-9a86-88d9f5410c4a",
        slug: "github",
        title: "GitHub",
        version: "1.2.3",
      },
    });
    const manifestB = {
      compatibility: {
        cursor: "supported",
        codex: "supported",
        "claude-code": "supported",
      },
      variants: [
        {
          integrity: { digest: "c".repeat(64), algorithm: "sha256" },
          environmentVariables: [
            {
              valueSource: "environment",
              defaultValue: null,
              required: true,
              description: "GitHub token.",
              name: "GITHUB_TOKEN",
            },
          ],
          packageArguments: [],
          runtimeArguments: [
            {
              required: true,
              description: "Config file path.",
              valueHint: "path",
              name: "config",
              type: "named",
            },
          ],
          transport: "stdio",
          runtimeHint: "npx",
          version: "1.2.3",
          identifier: "@example/github-mcp",
          registryType: "npm",
          kind: "package",
          id: VARIANT_ID,
        },
      ],
      provenance: {
        observedAt: "2026-09-01T00:00:00Z",
        registryName: "MCP Registry",
        registry: "registry.modelcontextprotocol.io",
      },
      server: {
        version: "1.2.3",
        title: "GitHub",
        slug: "github",
        id: "6c82758f-ec36-40f8-9a86-88d9f5410c4a",
      },
      schemaVersion: 1,
    } satisfies InstallManifestV1;

    const manifestCanonical =
      '{"compatibility":{"claude-code":"supported","codex":"supported","cursor":"supported"},"provenance":{"observedAt":"2026-09-01T00:00:00Z","registry":"registry.modelcontextprotocol.io","registryName":"MCP Registry"},"schemaVersion":1,"server":{"id":"6c82758f-ec36-40f8-9a86-88d9f5410c4a","slug":"github","title":"GitHub","version":"1.2.3"},"variants":[{"environmentVariables":[{"defaultValue":null,"description":"GitHub token.","name":"GITHUB_TOKEN","required":true,"valueSource":"environment"}],"id":"11111111-1111-4111-8111-111111111111","identifier":"@example/github-mcp","integrity":{"algorithm":"sha256","digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"kind":"package","packageArguments":[],"registryType":"npm","runtimeArguments":[{"description":"Config file path.","name":"config","required":true,"type":"named","valueHint":"path"}],"runtimeHint":"npx","transport":"stdio","version":"1.2.3"}]}';

    expect(hashInstallManifest(manifestA)).toBe(hashInstallManifest(manifestB));
    expect(hashInstallManifest(manifestA)).toBe(
      createHash("sha256").update(manifestCanonical).digest("hex"),
    );
    expect(
      hashInstallManifest(
        makeManifest({
          server: { id: manifestA.server.id, slug: "github", title: "GitHub", version: "1.2.4" },
        }),
      ),
    ).not.toBe(hashInstallManifest(manifestA));

    const intentA = makeResolvedIntent();
    const intentB = {
      warnings: [],
      variant: {
        integrity: { digest: "c".repeat(64), algorithm: "sha256" },
        environmentVariables: [
          {
            valueSource: "environment",
            defaultValue: null,
            required: true,
            description: "GitHub token.",
            name: "GITHUB_TOKEN",
          },
        ],
        packageArguments: [],
        runtimeArguments: [
          {
            required: true,
            description: "Config file path.",
            valueHint: "path",
            name: "config",
            type: "named",
          },
        ],
        transport: "stdio",
        runtimeHint: "npx",
        version: "1.2.3",
        identifier: "@example/github-mcp",
        registryType: "npm",
        kind: "package",
        id: VARIANT_ID,
      },
      scope: "user",
      schemaVersion: 1,
      server: {
        version: "1.2.3",
        title: "GitHub",
        slug: "github",
      },
      requiredEnvReferences: ["GITHUB_TOKEN"],
      remoteAuth: { kind: "none" },
      inputs: [
        {
          source: "package-runtime-argument",
          required: true,
          name: "config",
          key: "config",
          index: 0,
          description: "Config file path.",
          argumentType: "named",
          accepts: ["text"],
          valueHint: "path",
        },
        {
          source: "environment-variable",
          required: true,
          name: "GITHUB_TOKEN",
          key: "GITHUB_TOKEN",
          description: "GitHub token.",
          accepts: ["env-reference"],
        },
      ],
      client: "codex",
    } satisfies ResolvedInstallIntent;

    expect(hashResolvedInstallIntent(intentA)).toBe(hashResolvedInstallIntent(intentB));
    expect(
      hashResolvedInstallIntent(makeResolvedIntent({ requiredEnvReferences: ["OTHER_TOKEN"] })),
    ).not.toBe(hashResolvedInstallIntent(intentA));
  });

  it("serializes install plans canonically and rejects unsupported values", () => {
    const serializeInstallPlan = getSerializeInstallPlan();
    const planA = makeInstallPlan({
      operations: [
        makeConfigWriteOperation({
          document: {
            nested: { z: 2, a: 1 },
            alpha: true,
          },
        }),
      ],
    });
    const planB = {
      previewLines: ["Install GitHub into Codex user scope."],
      operations: [
        {
          document: {
            alpha: true,
            nested: { a: 1, z: 2 },
          },
          mutationKey: "mcpServers.github",
          path: "/Users/test/.codex/mcp.json",
          type: "config-write",
        },
      ],
      intentHash: INTENT_HASH,
      manifestHash: MANIFEST_HASH,
      variantId: VARIANT_ID,
      scope: "user",
      client: "codex",
      serverSlug: "github",
      schemaVersion: 1,
    };

    const expected =
      '{"client":"codex","intentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","manifestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","operations":[{"document":{"alpha":true,"nested":{"a":1,"z":2}},"mutationKey":"mcpServers.github","path":"/Users/test/.codex/mcp.json","type":"config-write"}],"previewLines":["Install GitHub into Codex user scope."],"schemaVersion":1,"scope":"user","serverSlug":"github","variantId":"11111111-1111-4111-8111-111111111111"}';

    expect(serializeInstallPlan(planA)).toBe(expected);
    expect(serializeInstallPlan(planA)).toBe(serializeInstallPlan(planB));

    const cyclicDocument: { self?: unknown } = {};
    cyclicDocument.self = cyclicDocument;

    for (const invalidPlan of [
      makeInstallPlan({
        operations: [makeConfigWriteOperation({ document: { value: Number.NaN } })],
      }),
      makeInstallPlan({
        operations: [makeConfigWriteOperation({ document: { value: Number.POSITIVE_INFINITY } })],
      }),
      makeInstallPlan({
        operations: [makeConfigWriteOperation({ document: { value: undefined } })],
      }),
      makeInstallPlan({
        operations: [makeConfigWriteOperation({ document: { value: 1n } })],
      }),
      makeInstallPlan({
        operations: [makeConfigWriteOperation({ document: { value: Symbol("bad") } })],
      }),
      makeInstallPlan({
        operations: [makeConfigWriteOperation({ document: { value: () => "bad" } })],
      }),
      makeInstallPlan({
        operations: [
          makeConfigWriteOperation({
            document: {
              value: new (class UnsafeDocument {
                readonly ok = true;
              })(),
            },
          }),
        ],
      }),
      makeInstallPlan({ operations: [makeConfigWriteOperation({ document: cyclicDocument })] }),
    ]) {
      expect(() => serializeInstallPlan(invalidPlan)).toThrow(/canonical|json|finite|cycle|plain/i);
    }
  });

  it("returns a deeply frozen validated install plan copy", () => {
    const validateInstallPlan = getValidateInstallPlan();
    const plan = makeInstallPlan({
      operations: [makeConfigWriteOperation()],
      previewLines: ["Write GitHub config entry."],
    });

    const validated = validateInstallPlan(plan, makeDescriptor()) as {
      readonly client: string;
      readonly operations: readonly [
        {
          readonly path: string;
          readonly document: {
            readonly mcpServers: {
              readonly github: { readonly env: { readonly GITHUB_TOKEN: string } };
            };
          };
        },
      ];
      readonly previewLines: readonly string[];
    };

    expect(validated).not.toBe(plan);
    expect(validated.operations[0]).not.toBe(plan.operations[0]);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.operations)).toBe(true);
    expect(Object.isFrozen(validated.operations[0]!)).toBe(true);
    expect(Object.isFrozen(validated.operations[0]!.document)).toBe(true);
    expect(Object.isFrozen(validated.operations[0]!.document.mcpServers)).toBe(true);
    expect(validated.operations[0]!.path).toBe("/Users/test/.codex/mcp.json");

    const mutableSourceOperation = plan.operations[0] as { path: string };
    mutableSourceOperation.path = "/Users/test/.codex/evil.json";
    expect(validated.operations[0]!.path).toBe("/Users/test/.codex/mcp.json");
    expect(() => Object.assign(validated, { client: "cursor" })).toThrow(TypeError);
  });

  it("rejects malformed top-level fields and operation shapes", () => {
    const validateInstallPlan = getValidateInstallPlan();

    expectPlanValidationError(
      () => validateInstallPlan(makeInstallPlan({ schemaVersion: 2 }), makeDescriptor()),
      { name: "PlanValidationError", code: "INVALID_SCHEMA_VERSION" },
    );
    expectPlanValidationError(
      () => validateInstallPlan(makeInstallPlan({ client: "cursor" }), makeDescriptor()),
      { name: "PlanValidationError", code: "CLIENT_MISMATCH" },
    );
    expectPlanValidationError(
      () => validateInstallPlan(makeInstallPlan({ manifestHash: "short" }), makeDescriptor()),
      { name: "PlanValidationError", code: "INVALID_MANIFEST_HASH" },
    );
    expectPlanValidationError(
      () => validateInstallPlan(makeInstallPlan({ intentHash: "X".repeat(64) }), makeDescriptor()),
      { name: "PlanValidationError", code: "INVALID_INTENT_HASH" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({ previewLines: ["line one\nline two"] }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "INVALID_PREVIEW_LINE" },
    );

    const operationWithUnexpectedField = {
      ...makeClientCommandOperation(),
      unexpected: true,
    };
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({ operations: [operationWithUnexpectedField] }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "UNKNOWN_OPERATION_FIELD" },
    );
  });

  it("rejects unapproved executables and invalid install capabilities", () => {
    const validateInstallPlan = getValidateInstallPlan();

    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [makeClientCommandOperation({ executable: "/tmp/codex" })],
          }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "UNAPPROVED_EXECUTABLE" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [makeClientCommandOperation({ executable: "codex --help" })],
          }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "INVALID_EXECUTABLE" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [makeClientCommandOperation({ capability: "native-scope-project" })],
          }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "UNSUPPORTED_CAPABILITY" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [makeClientCommandOperation({ capability: "native-remove" })],
          }),
          makeDescriptor({ supportedCapabilities: ["native-remove", "env-reference"] }),
        ),
      { name: "PlanValidationError", code: "INVALID_INSTALL_CAPABILITY" },
    );
  });

  it("rejects config mutations outside approved roots on posix and windows semantics", () => {
    const validateInstallPlan = getValidateInstallPlan();

    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [makeConfigWriteOperation({ path: "/Users/test/.codex-other/mcp.json" })],
          }),
          makeDescriptor({ configRoots: ["/Users/test/.codex"] }),
        ),
      { name: "PlanValidationError", code: "PATH_OUTSIDE_ROOT" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [
              makeConfigRemoveOperation({ path: "/Users/test/.codex/../secrets/mcp.json" }),
            ],
          }),
          makeDescriptor({ configRoots: ["/Users/test/.codex"] }),
        ),
      { name: "PlanValidationError", code: "PATH_TRAVERSAL" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [
              makeConfigWriteOperation({ path: "C:\\Users\\test\\.codex-other\\mcp.json" }),
            ],
          }),
          makeDescriptor({ configRoots: ["C:\\Users\\test\\.codex"] }),
        ),
      { name: "PlanValidationError", code: "PATH_OUTSIDE_ROOT" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [
              makeConfigWriteOperation({ path: "C:\\Users\\test\\.codex\\..\\AppData\\mcp.json" }),
            ],
          }),
          makeDescriptor({ configRoots: ["C:\\Users\\test\\.codex"] }),
        ),
      { name: "PlanValidationError", code: "PATH_TRAVERSAL" },
    );
  });

  it("rejects config documents that are not plain json values", () => {
    const validateInstallPlan = getValidateInstallPlan();

    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [makeConfigWriteOperation({ document: new Map([["x", 1]]) })],
          }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "INVALID_CONFIG_DOCUMENT" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            operations: [
              makeConfigWriteOperation({
                document: { url: new URL("https://example.com/") },
              }),
            ],
          }),
          makeDescriptor(),
        ),
      { name: "PlanValidationError", code: "INVALID_CONFIG_DOCUMENT" },
    );
  });

  it("rejects invalid deeplinks including prefix confusion and encoded tricks", () => {
    const validateInstallPlan = getValidateInstallPlan();
    const descriptor = makeDescriptor({
      client: "cursor",
      executableAllowList: [],
      configRoots: ["/Users/test/.cursor"],
      supportedCapabilities: ["cursor-deeplink"],
      deeplinkPrefixes: ["cursor://anysphere.cursor-deeplink/mcp/install?"],
    });

    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            client: "cursor",
            operations: [
              makeDeeplinkOperation({
                url: "cursor://anysphere.cursor-deeplink.evil/mcp/install?payload=ZXhhbXBsZQ==",
              }),
            ],
          }),
          descriptor,
        ),
      { name: "PlanValidationError", code: "INVALID_DEEPLINK" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            client: "cursor",
            operations: [
              makeDeeplinkOperation({
                url: "cursor://anysphere.cursor-deeplink/mcp/install%2Fextra?payload=ZXhhbXBsZQ==",
              }),
            ],
          }),
          descriptor,
        ),
      { name: "PlanValidationError", code: "INVALID_DEEPLINK" },
    );
    expectPlanValidationError(
      () =>
        validateInstallPlan(
          makeInstallPlan({
            client: "cursor",
            operations: [
              makeDeeplinkOperation({
                url: "cursor://anysphere.cursor-deeplink/mcp/installx?payload=ZXhhbXBsZQ==",
              }),
            ],
          }),
          descriptor,
        ),
      { name: "PlanValidationError", code: "INVALID_DEEPLINK" },
    );
  });
});
