import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { describe, expect, it } from "vitest";
import * as installEngine from "../index.js";
import type { ResolveIntentOptions, ResolvedInstallIntent } from "../index.js";

type CreateResolvedInstallIntent = (
  manifest: InstallManifestV1,
  options: ResolveIntentOptions,
) => ResolvedInstallIntent;

type PackageVariant = Extract<InstallManifestV1["variants"][number], { kind: "package" }>;
type RemoteVariant = Extract<InstallManifestV1["variants"][number], { kind: "remote" }>;

const PACKAGE_VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const REMOTE_VARIANT_ID = "22222222-2222-4222-8222-222222222222";

function getCreateResolvedInstallIntent(): CreateResolvedInstallIntent {
  const candidate = Reflect.get(installEngine, "createResolvedInstallIntent");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("Expected createResolvedInstallIntent to be exported");
  }

  return candidate as unknown as CreateResolvedInstallIntent;
}

function expectIntentError(
  action: () => unknown,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  try {
    action();
    throw new Error("Expected createResolvedInstallIntent to throw");
  } catch (error) {
    expect(error).toMatchObject(expected);
    return error as Record<string, unknown>;
  }
}

function makePackageVariant(overrides: Partial<PackageVariant> = {}): PackageVariant {
  return {
    id: PACKAGE_VARIANT_ID,
    kind: "package",
    registryType: "npm",
    identifier: "@example/test-server",
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
        name: null,
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
    integrity: null,
    ...overrides,
  };
}

function makeRemoteVariant(overrides: Partial<RemoteVariant> = {}): RemoteVariant {
  return {
    id: REMOTE_VARIANT_ID,
    kind: "remote",
    transport: "streamable-http",
    urlTemplate: "https://example.com/mcp/{workspaceId}",
    headers: [{ name: "Authorization", value: "Bearer {token}" }],
    variables: [
      {
        name: "workspaceId",
        description: "Workspace identifier.",
        required: true,
        defaultValue: null,
      },
    ],
    ...overrides,
  };
}

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

describe("createResolvedInstallIntent", () => {
  it("normalizes package inputs and keeps provided values out of the serializable intent", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(makeManifest([makePackageVariant()]), {
      client: "codex",
      scope: "user",
      requestedVariantId: PACKAGE_VARIANT_ID,
      inputValues: {
        config: { kind: "text", value: "/tmp/test-config.json" },
        repository: { kind: "text", value: "octo/example" },
        GITHUB_TOKEN: { kind: "env-reference", envName: "CI_GITHUB_TOKEN" },
      },
    });

    expect(intent).toMatchObject({
      schemaVersion: 1,
      client: "codex",
      scope: "user",
      warnings: [],
      remoteAuth: { kind: "none" },
      requiredEnvReferences: ["CI_GITHUB_TOKEN"],
      inputs: [
        {
          key: "config",
          source: "package-runtime-argument",
          argumentType: "named",
          name: "config",
          valueHint: "path",
          required: true,
          accepts: ["text"],
        },
        {
          key: "repository",
          source: "package-argument",
          argumentType: "positional",
          valueHint: "repository",
          required: false,
          accepts: ["text"],
        },
        {
          key: "GITHUB_TOKEN",
          source: "environment-variable",
          name: "GITHUB_TOKEN",
          required: true,
          accepts: ["env-reference"],
        },
      ],
    });

    const serializedIntent = JSON.stringify(intent);
    expect(serializedIntent).not.toContain("/tmp/test-config.json");
    expect(serializedIntent).not.toContain("octo/example");
  });

  it("derives required env references in input-definition order instead of input record order", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const manifest = makeManifest([
      makePackageVariant({
        environmentVariables: [
          {
            name: "SECOND_TOKEN",
            description: "Second token.",
            required: true,
            defaultValue: null,
            valueSource: "environment",
          },
          {
            name: "FIRST_TOKEN",
            description: "First token.",
            required: true,
            defaultValue: null,
            valueSource: "environment",
          },
        ],
      }),
    ]);

    const forward = createResolvedInstallIntent(manifest, {
      client: "codex",
      scope: "user",
      requestedVariantId: PACKAGE_VARIANT_ID,
      inputValues: {
        FIRST_TOKEN: { kind: "env-reference", envName: "FIRST_ENV" },
        config: { kind: "text", value: "/tmp/test-config.json" },
        SECOND_TOKEN: { kind: "env-reference", envName: "SECOND_ENV" },
      },
    });

    const reverse = createResolvedInstallIntent(manifest, {
      client: "codex",
      scope: "user",
      requestedVariantId: PACKAGE_VARIANT_ID,
      inputValues: {
        SECOND_TOKEN: { kind: "env-reference", envName: "SECOND_ENV" },
        config: { kind: "text", value: "/tmp/test-config.json" },
        FIRST_TOKEN: { kind: "env-reference", envName: "FIRST_ENV" },
      },
    });

    expect(forward.requiredEnvReferences).toEqual(["SECOND_ENV", "FIRST_ENV"]);
    expect(reverse.requiredEnvReferences).toEqual(["SECOND_ENV", "FIRST_ENV"]);
  });

  it("normalizes remote variables and header placeholders while preferring env references for auth", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(makeManifest([makeRemoteVariant()]), {
      client: "cursor",
      scope: "project",
      requestedVariantId: REMOTE_VARIANT_ID,
      inputValues: {
        workspaceId: { kind: "text", value: "workspace-123" },
        token: { kind: "env-reference", envName: "MCP_AUTH_TOKEN" },
      },
    });

    expect(intent).toMatchObject({
      client: "cursor",
      scope: "project",
      warnings: [],
      remoteAuth: {
        kind: "env-reference",
        bindings: [{ kind: "env-reference", inputKey: "token", envName: "MCP_AUTH_TOKEN" }],
      },
      requiredEnvReferences: ["MCP_AUTH_TOKEN"],
      inputs: [
        {
          key: "workspaceId",
          source: "remote-variable",
          name: "workspaceId",
          required: true,
          accepts: ["text"],
        },
        {
          key: "token",
          source: "remote-header",
          headerName: "Authorization",
          placeholder: "token",
          required: true,
          accepts: ["env-reference", "secret-value"],
        },
      ],
    });

    const serializedIntent = JSON.stringify(intent);
    expect(serializedIntent).not.toContain("workspace-123");
    expect(serializedIntent).toContain("MCP_AUTH_TOKEN");
  });

  it("treats non-sensitive templated headers as text inputs and excludes them from remote auth", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(
      makeManifest([
        makeRemoteVariant({
          headers: [
            { name: "Authorization", value: "Bearer {token}" },
            { name: "X-Workspace", value: "{workspaceId}" },
          ],
        }),
      ]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          "remote-header:workspaceId": { kind: "text", value: "workspace-header-123" },
          token: { kind: "env-reference", envName: "MCP_AUTH_TOKEN" },
        },
      },
    );

    expect(intent).toMatchObject({
      warnings: [],
      remoteAuth: {
        kind: "env-reference",
        bindings: [{ kind: "env-reference", inputKey: "token", envName: "MCP_AUTH_TOKEN" }],
      },
      requiredEnvReferences: ["MCP_AUTH_TOKEN"],
      inputs: [
        {
          key: "workspaceId",
          source: "remote-variable",
          accepts: ["text"],
        },
        {
          key: "token",
          source: "remote-header",
          headerName: "Authorization",
          placeholder: "token",
          sensitive: true,
          accepts: ["env-reference", "secret-value"],
        },
        {
          key: "remote-header:workspaceId",
          source: "remote-header",
          headerName: "X-Workspace",
          placeholder: "workspaceId",
          sensitive: false,
          accepts: ["text"],
        },
      ],
    });

    const serializedIntent = JSON.stringify(intent);
    expect(serializedIntent).not.toContain("workspace-123");
    expect(serializedIntent).not.toContain("workspace-header-123");
    expect(serializedIntent).toContain("MCP_AUTH_TOKEN");
  });

  it("returns remote auth none for non-sensitive templated headers", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(
      makeManifest([
        makeRemoteVariant({ headers: [{ name: "X-Workspace", value: "{workspaceId}" }] }),
      ]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          "remote-header:workspaceId": { kind: "text", value: "workspace-header-123" },
        },
      },
    );

    expect(intent.remoteAuth).toEqual({ kind: "none" });
    expect(intent.requiredEnvReferences).toEqual([]);
    expect(intent.inputs).toMatchObject([
      {
        key: "workspaceId",
        source: "remote-variable",
        accepts: ["text"],
      },
      {
        key: "remote-header:workspaceId",
        source: "remote-header",
        headerName: "X-Workspace",
        placeholder: "workspaceId",
        sensitive: false,
        accepts: ["text"],
      },
    ]);

    const serializedIntent = JSON.stringify(intent);
    expect(serializedIntent).not.toContain("workspace-123");
    expect(serializedIntent).not.toContain("workspace-header-123");
  });

  it("records persisted-secret remote auth without serializing the secret value", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(makeManifest([makeRemoteVariant()]), {
      client: "codex",
      scope: "global",
      requestedVariantId: REMOTE_VARIANT_ID,
      inputValues: {
        workspaceId: { kind: "text", value: "workspace-123" },
        token: {
          kind: "secret-value",
          value: "super-secret-token",
          allowPersistence: true,
        },
      },
    });

    expect(intent).toMatchObject({
      warnings: [expect.stringContaining("token")],
      remoteAuth: {
        kind: "persisted-secret",
        bindings: [{ kind: "persisted-secret", inputKey: "token" }],
        requiresInteractiveConsent: true,
      },
      requiredEnvReferences: [],
    });

    expect(JSON.stringify(intent)).not.toContain("super-secret-token");
  });

  it("dedupes required env references across remote auth bindings", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(
      makeManifest([
        makeRemoteVariant({
          headers: [
            { name: "Authorization", value: "Bearer {token}" },
            { name: "X-API-Key", value: "{apiKey}" },
          ],
        }),
      ]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          apiKey: { kind: "env-reference", envName: "SHARED_ENV" },
          token: { kind: "env-reference", envName: "SHARED_ENV" },
        },
      },
    );

    expect(intent.requiredEnvReferences).toEqual(["SHARED_ENV"]);
    expect(intent.remoteAuth).toMatchObject({
      kind: "env-reference",
      bindings: [
        { kind: "env-reference", inputKey: "token", envName: "SHARED_ENV" },
        { kind: "env-reference", inputKey: "apiKey", envName: "SHARED_ENV" },
      ],
    });
  });

  it("models mixed env-reference and persisted-secret remote auth without dropping either side", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const intent = createResolvedInstallIntent(
      makeManifest([
        makeRemoteVariant({
          headers: [
            { name: "Authorization", value: "Bearer {token}" },
            { name: "X-API-Key", value: "{apiKey}" },
          ],
        }),
      ]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          apiKey: {
            kind: "secret-value",
            value: "super-secret-token",
            allowPersistence: true,
          },
          token: { kind: "env-reference", envName: "MCP_AUTH_TOKEN" },
        },
      },
    );

    expect(intent.remoteAuth).toMatchObject({
      kind: "mixed",
      bindings: [
        { kind: "env-reference", inputKey: "token", envName: "MCP_AUTH_TOKEN" },
        { kind: "persisted-secret", inputKey: "apiKey" },
      ],
      requiresInteractiveConsent: true,
    });
    expect(intent.requiredEnvReferences).toEqual(["MCP_AUTH_TOKEN"]);
    expect(intent.warnings).toEqual(["Remote auth requires persisted secret input for apiKey."]);
    expect(JSON.stringify(intent)).not.toContain("super-secret-token");
  });

  it("rejects persisted-secret remote auth in noninteractive mode", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    expectIntentError(
      () =>
        createResolvedInstallIntent(makeManifest([makeRemoteVariant()]), {
          client: "codex",
          scope: "user",
          requestedVariantId: REMOTE_VARIANT_ID,
          noninteractive: true,
          inputValues: {
            workspaceId: { kind: "text", value: "workspace-123" },
            token: {
              kind: "secret-value",
              value: "super-secret-token",
              allowPersistence: true,
            },
          },
        }),
      {
        reason: "NONINTERACTIVE_PERSISTED_SECRET",
        inputKey: "token",
      },
    );
  });

  it("rejects unsupported client-oauth requests instead of guessing remote auth support", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    expectIntentError(
      () =>
        createResolvedInstallIntent(makeManifest([makeRemoteVariant()]), {
          client: "codex",
          scope: "user",
          requestedVariantId: REMOTE_VARIANT_ID,
          remoteAuthPreference: "client-oauth",
          inputValues: {
            workspaceId: { kind: "text", value: "workspace-123" },
          },
        }),
      { reason: "UNSUPPORTED_REMOTE_AUTH" },
    );
  });

  it("rejects client-oauth preference even when a remote variant has no headers", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    expectIntentError(
      () =>
        createResolvedInstallIntent(makeManifest([makeRemoteVariant({ headers: [] })]), {
          client: "codex",
          scope: "user",
          requestedVariantId: REMOTE_VARIANT_ID,
          remoteAuthPreference: "client-oauth",
          inputValues: {
            workspaceId: { kind: "text", value: "workspace-123" },
          },
        }),
      { reason: "UNSUPPORTED_REMOTE_AUTH" },
    );
  });

  it("rejects literal sensitive header values without echoing them", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const error = expectIntentError(
      () =>
        createResolvedInstallIntent(
          makeManifest([
            makeRemoteVariant({
              headers: [{ name: "Authorization", value: "Bearer super-secret-token" }],
            }),
          ]),
          {
            client: "codex",
            scope: "user",
            requestedVariantId: REMOTE_VARIANT_ID,
            inputValues: {
              workspaceId: { kind: "text", value: "workspace-123" },
            },
          },
        ),
      { reason: "UNSAFE_REMOTE_HEADER", headerName: "Authorization" },
    );

    expect(String(error)).toContain("Authorization");
    expect(String(error)).not.toContain("super-secret-token");
  });

  it("accepts structurally safe sensitive header placeholders", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    const bearerIntent = createResolvedInstallIntent(
      makeManifest([
        makeRemoteVariant({ headers: [{ name: "Authorization", value: "Bearer {token}" }] }),
      ]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          token: { kind: "env-reference", envName: "AUTH_TOKEN" },
        },
      },
    );

    const basicIntent = createResolvedInstallIntent(
      makeManifest([
        makeRemoteVariant({
          headers: [{ name: "Proxy-Authorization", value: "Basic {credential}" }],
        }),
      ]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          credential: { kind: "env-reference", envName: "BASIC_CREDENTIAL" },
        },
      },
    );

    const exactPlaceholderIntent = createResolvedInstallIntent(
      makeManifest([makeRemoteVariant({ headers: [{ name: "X-API-Key", value: "{PathExt}" }] })]),
      {
        client: "cursor",
        scope: "project",
        requestedVariantId: REMOTE_VARIANT_ID,
        inputValues: {
          workspaceId: { kind: "text", value: "workspace-123" },
          PathExt: { kind: "env-reference", envName: "PATH_EXT" },
        },
      },
    );

    expect(bearerIntent.remoteAuth).toMatchObject({
      kind: "env-reference",
      bindings: [{ kind: "env-reference", inputKey: "token", envName: "AUTH_TOKEN" }],
    });
    expect(basicIntent.remoteAuth).toMatchObject({
      kind: "env-reference",
      bindings: [
        {
          kind: "env-reference",
          inputKey: "credential",
          envName: "BASIC_CREDENTIAL",
        },
      ],
    });
    expect(exactPlaceholderIntent.remoteAuth).toMatchObject({
      kind: "env-reference",
      bindings: [{ kind: "env-reference", inputKey: "PathExt", envName: "PATH_EXT" }],
    });
  });

  it("rejects malformed header placeholder identifiers before input validation without echoing values", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    for (const headerValue of ["{ token }", "{token extra}", "{1token}", "{token-name}"]) {
      const error = expectIntentError(
        () =>
          createResolvedInstallIntent(
            makeManifest([
              makeRemoteVariant({ headers: [{ name: "X-Workspace", value: headerValue }] }),
            ]),
            {
              client: "codex",
              scope: "user",
              requestedVariantId: REMOTE_VARIANT_ID,
              inputValues: {
                workspaceId: { kind: "text", value: "workspace-123" },
              },
            },
          ),
        { reason: "UNSAFE_REMOTE_HEADER", headerName: "X-Workspace" },
      );

      expect(String(error)).toContain("X-Workspace");
      expect(String(error)).not.toContain(headerValue);
    }
  });

  it("rejects sensitive header templates that include credential fragments or malformed structure", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    for (const headerValue of [
      "Bearer sk-live-{token}",
      "{token}-suffix",
      "Bearer {token} {backup}",
      "Bearer {token}\nextra",
    ]) {
      const error = expectIntentError(
        () =>
          createResolvedInstallIntent(
            makeManifest([
              makeRemoteVariant({
                headers: [{ name: "Authorization", value: headerValue }],
              }),
            ]),
            {
              client: "codex",
              scope: "user",
              requestedVariantId: REMOTE_VARIANT_ID,
              inputValues: {},
            },
          ),
        { reason: "UNSAFE_REMOTE_HEADER", headerName: "Authorization" },
      );

      expect(String(error)).toContain("Authorization");
      expect(String(error)).not.toContain(headerValue);
    }
  });

  it("rejects sensitive defaults before they can enter a serializable intent", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();
    const error = expectIntentError(
      () =>
        createResolvedInstallIntent(
          makeManifest([
            makePackageVariant({
              environmentVariables: [
                {
                  name: "API_TOKEN",
                  description: "Injected token.",
                  required: false,
                  defaultValue: "super-secret-token",
                  valueSource: "environment",
                },
              ],
            }),
          ]),
          {
            client: "codex",
            scope: "user",
            requestedVariantId: PACKAGE_VARIANT_ID,
            inputValues: {
              config: { kind: "text", value: "/tmp/test-config.json" },
            },
          },
        ),
      { reason: "UNSAFE_INPUT_DEFAULT", inputName: "API_TOKEN" },
    );

    expect(String(error)).toContain("API_TOKEN");
    expect(String(error)).not.toContain("super-secret-token");
  });

  it("rejects scopes outside the Phase E client scope union", () => {
    const createResolvedInstallIntent = getCreateResolvedInstallIntent();

    expectIntentError(
      () =>
        createResolvedInstallIntent(makeManifest([makePackageVariant()]), {
          client: "codex",
          scope: "workspace",
          requestedVariantId: PACKAGE_VARIANT_ID,
          inputValues: {
            config: { kind: "text", value: "/tmp/test-config.json" },
            GITHUB_TOKEN: { kind: "env-reference", envName: "CI_GITHUB_TOKEN" },
          },
        } as unknown as ResolveIntentOptions),
      { reason: "INVALID_SCOPE", scope: "workspace" },
    );
  });
});
