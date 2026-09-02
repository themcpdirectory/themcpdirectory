import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { describe, expect, it } from "vitest";
import { createInstallInputDefinitions, validateInputValues } from "../index.js";
import type { InstallInputValue, ResolvedInstallIntent } from "../index.js";

type RemoteVariant = Extract<InstallManifestV1["variants"][number], { kind: "remote" }>;

const REMOTE_VARIANT_ID = "22222222-2222-4222-8222-222222222222";

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

function expectValidationError(
  action: () => unknown,
  reason: string,
  inputKey: string,
): Record<string, unknown> {
  try {
    action();
    throw new Error("Expected validateInputValues to throw");
  } catch (error) {
    expect(error).toMatchObject({ reason, inputKey });
    return error as Record<string, unknown>;
  }
}

function makeIntent(): Pick<ResolvedInstallIntent, "inputs"> {
  const inputs = [
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
      key: "repository",
      source: "package-argument",
      argumentType: "positional",
      index: 0,
      name: null,
      valueHint: "repository",
      description: "Repository slug.",
      required: false,
      accepts: ["text"],
    },
    {
      key: "GITHUB_TOKEN",
      source: "environment-variable",
      name: "GITHUB_TOKEN",
      description: "GitHub access token.",
      required: true,
      accepts: ["env-reference"],
    },
    {
      key: "workspaceId",
      source: "remote-variable",
      name: "workspaceId",
      description: "Workspace identifier.",
      required: true,
      accepts: ["text"],
    },
    {
      key: "token",
      source: "remote-header",
      headerName: "Authorization",
      placeholder: "token",
      description: null,
      required: true,
      accepts: ["env-reference", "secret-value"],
    },
  ];

  return {
    inputs: inputs as unknown as ResolvedInstallIntent["inputs"],
  };
}

function makeValidValues(
  overrides: Record<string, InstallInputValue> = {},
): Record<string, InstallInputValue> {
  return {
    config: { kind: "text", value: "/tmp/test-config.json" },
    repository: { kind: "text", value: "octo/example" },
    GITHUB_TOKEN: { kind: "env-reference", envName: "CI_GITHUB_TOKEN" },
    workspaceId: { kind: "text", value: "workspace-123" },
    token: {
      kind: "secret-value",
      value: "super-secret-token",
      allowPersistence: true,
    },
    ...overrides,
  };
}

describe("createInstallInputDefinitions", () => {
  it("dedupes duplicate header placeholders and keeps colliding keys stable", () => {
    const definitions = createInstallInputDefinitions(
      makeRemoteVariant({
        variables: [
          {
            name: "token",
            description: "Token override.",
            required: false,
            defaultValue: null,
          },
        ],
        headers: [
          { name: "Authorization", value: "Bearer {token}" },
          { name: "Proxy-Authorization", value: "Basic {token}" },
          { name: "X-API-Key", value: "{apiKey}:{apiKey}" },
        ],
      }),
    );

    expect(definitions).toMatchObject([
      {
        key: "token",
        source: "remote-variable",
        name: "token",
        accepts: ["text"],
      },
      {
        key: "remote-header:token",
        source: "remote-header",
        headerName: "Authorization",
        placeholder: "token",
        accepts: ["env-reference", "secret-value"],
      },
      {
        key: "apiKey",
        source: "remote-header",
        headerName: "X-API-Key",
        placeholder: "apiKey",
        accepts: ["env-reference", "secret-value"],
      },
    ]);
    expect(
      definitions.filter(
        (definition) => definition.source === "remote-header" && definition.placeholder === "token",
      ),
    ).toHaveLength(1);
    expect(definitions[1]).not.toHaveProperty("template");
    expect(definitions[2]).not.toHaveProperty("template");
  });
});

describe("validateInputValues", () => {
  it("validates package and remote inputs while keeping secret values in the runtime-only map", () => {
    const validated = validateInputValues(makeIntent(), makeValidValues());

    expect([...validated.entries()]).toEqual([
      ["config", { kind: "text", value: "/tmp/test-config.json" }],
      ["repository", { kind: "text", value: "octo/example" }],
      ["GITHUB_TOKEN", { kind: "env-reference", envName: "CI_GITHUB_TOKEN" }],
      ["workspaceId", { kind: "text", value: "workspace-123" }],
      [
        "token",
        {
          kind: "secret-value",
          value: "super-secret-token",
          allowPersistence: true,
        },
      ],
    ]);
  });

  it("rejects unknown keys before attempting to resolve missing values", () => {
    expectValidationError(
      () =>
        validateInputValues(makeIntent(), {
          ...makeValidValues(),
          unexpected: { kind: "text", value: "should-not-appear" },
        }),
      "UNKNOWN_INPUT",
      "unexpected",
    );
  });

  it("rejects missing required values, invalid kinds, and invalid env names without echoing secrets", () => {
    expectValidationError(
      () =>
        validateInputValues(makeIntent(), {
          config: { kind: "text", value: "/tmp/test-config.json" },
          GITHUB_TOKEN: { kind: "env-reference", envName: "CI_GITHUB_TOKEN" },
          workspaceId: { kind: "text", value: "workspace-123" },
        }),
      "MISSING_REQUIRED_INPUT",
      "token",
    );

    const wrongKind = () =>
      validateInputValues(
        makeIntent(),
        makeValidValues({
          GITHUB_TOKEN: { kind: "text", value: "literal-secret-token" },
        }),
      );

    const wrongKindError = expectValidationError(wrongKind, "INVALID_INPUT_KIND", "GITHUB_TOKEN");
    expect(String(wrongKindError)).not.toContain("literal-secret-token");

    expectValidationError(
      () =>
        validateInputValues(
          makeIntent(),
          makeValidValues({
            GITHUB_TOKEN: { kind: "env-reference", envName: "TOKEN-NAME" },
          }),
        ),
      "INVALID_ENV_REFERENCE",
      "GITHUB_TOKEN",
    );
  });

  it("accepts portable env names and rejects leading digits or punctuation", () => {
    for (const envName of ["Path", "PathExt", "Mixed_Case9", "_PRIVATE"]) {
      const validated = validateInputValues(
        makeIntent(),
        makeValidValues({
          GITHUB_TOKEN: { kind: "env-reference", envName },
        }),
      );

      expect(validated.get("GITHUB_TOKEN")).toEqual({ kind: "env-reference", envName });
    }

    for (const envName of ["1TOKEN", "TOKEN-NAME", "TOKEN.NAME"]) {
      expectValidationError(
        () =>
          validateInputValues(
            makeIntent(),
            makeValidValues({
              GITHUB_TOKEN: { kind: "env-reference", envName },
            }),
          ),
        "INVALID_ENV_REFERENCE",
        "GITHUB_TOKEN",
      );
    }
  });

  it("returns a runtime read-only facade for validated inputs", () => {
    const validated = validateInputValues(makeIntent(), makeValidValues());
    const mutableView = validated as unknown as {
      set: (key: string, value: InstallInputValue) => unknown;
      delete: (key: string) => unknown;
      clear: () => unknown;
    };

    expect(() => mutableView.set("config", { kind: "text", value: "mutated" })).toThrow();
    expect(() => mutableView.delete("config")).toThrow();
    expect(() => mutableView.clear()).toThrow();
    expect(validated.get("config")).toEqual({ kind: "text", value: "/tmp/test-config.json" });
  });
});
