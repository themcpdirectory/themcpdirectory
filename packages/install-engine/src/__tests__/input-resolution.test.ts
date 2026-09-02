import { describe, expect, it } from "vitest";
import * as installEngine from "../index.js";
import type { InstallInputValue, ResolvedInstallIntent } from "../index.js";

type ValidateInputValues = (
  intent: Pick<ResolvedInstallIntent, "inputs">,
  values: Record<string, InstallInputValue>,
) => ReadonlyMap<string, InstallInputValue>;

function getValidateInputValues(): ValidateInputValues {
  const candidate = Reflect.get(installEngine, "validateInputValues");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("Expected validateInputValues to be exported");
  }

  return candidate as unknown as ValidateInputValues;
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
  return {
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
        defaultValue: null,
        accepts: ["env-reference"],
      },
      {
        key: "workspaceId",
        source: "remote-variable",
        name: "workspaceId",
        description: "Workspace identifier.",
        required: true,
        defaultValue: null,
        accepts: ["text"],
      },
      {
        key: "token",
        source: "remote-header",
        headerName: "Authorization",
        template: "Bearer {token}",
        placeholder: "token",
        description: null,
        required: true,
        accepts: ["env-reference", "secret-value"],
      },
    ],
  };
}

describe("validateInputValues", () => {
  it("validates package and remote inputs while keeping secrets out of JSON map serialization", () => {
    const validateInputValues = getValidateInputValues();
    const validated = validateInputValues(makeIntent(), {
      config: { kind: "text", value: "/tmp/test-config.json" },
      repository: { kind: "text", value: "octo/example" },
      GITHUB_TOKEN: { kind: "env-reference", envName: "CI_GITHUB_TOKEN" },
      workspaceId: { kind: "text", value: "workspace-123" },
      token: {
        kind: "secret-value",
        value: "super-secret-token",
        allowPersistence: true,
      },
    });

    expect(validated).toBeInstanceOf(Map);
    expect(validated).toEqual(
      new Map([
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
      ]),
    );
    expect(JSON.stringify(validated)).not.toContain("super-secret-token");
  });

  it("rejects unknown keys before attempting to resolve missing values", () => {
    const validateInputValues = getValidateInputValues();

    expectValidationError(
      () =>
        validateInputValues(makeIntent(), {
          config: { kind: "text", value: "/tmp/test-config.json" },
          repository: { kind: "text", value: "octo/example" },
          GITHUB_TOKEN: { kind: "env-reference", envName: "CI_GITHUB_TOKEN" },
          workspaceId: { kind: "text", value: "workspace-123" },
          token: {
            kind: "secret-value",
            value: "super-secret-token",
            allowPersistence: true,
          },
          unexpected: { kind: "text", value: "should-not-appear" },
        }),
      "UNKNOWN_INPUT",
      "unexpected",
    );
  });

  it("rejects missing required values, invalid kinds, and invalid env names without echoing secrets", () => {
    const validateInputValues = getValidateInputValues();

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
      validateInputValues(makeIntent(), {
        config: { kind: "text", value: "/tmp/test-config.json" },
        GITHUB_TOKEN: { kind: "text", value: "literal-secret-token" },
        workspaceId: { kind: "text", value: "workspace-123" },
        token: {
          kind: "secret-value",
          value: "super-secret-token",
          allowPersistence: true,
        },
      });

    const wrongKindError = expectValidationError(wrongKind, "INVALID_INPUT_KIND", "GITHUB_TOKEN");
    expect(String(wrongKindError)).not.toContain("literal-secret-token");

    expectValidationError(
      () =>
        validateInputValues(makeIntent(), {
          config: { kind: "text", value: "/tmp/test-config.json" },
          GITHUB_TOKEN: { kind: "env-reference", envName: "github-token" },
          workspaceId: { kind: "text", value: "workspace-123" },
          token: {
            kind: "secret-value",
            value: "super-secret-token",
            allowPersistence: true,
          },
        }),
      "INVALID_ENV_REFERENCE",
      "GITHUB_TOKEN",
    );
  });
});
