import { createFakeProcessRuntime } from "@themcpdirectory/test-utils";
import type {
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import {
  createVsCodeAdapter,
  VsCodeAdapterError,
  VsCodeJsonError,
  resolveVsCodeScopePaths,
} from "../index.js";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const MANIFEST_HASH = "a".repeat(64);
const INTENT_HASH = "b".repeat(64);
const USER_ROOT = "/Users/fake-runtime/.copilot";
const USER_CONFIG_PATH = `${USER_ROOT}/mcp-config.json`;
const PROJECT_ROOT = "/workspace/.vscode";
const PROJECT_CONFIG_PATH = `${PROJECT_ROOT}/mcp.json`;

function makePackageIntent(scope: "user" | "project"): ResolvedInstallIntent {
  const variant: InstallManifestPackageVariantV1 = {
    id: VARIANT_ID,
    kind: "package",
    registryType: "npm",
    identifier: "@example/github-mcp",
    version: "1.2.3",
    runtimeHint: "npx",
    transport: "stdio",
    runtimeArguments: [],
    packageArguments: [],
    environmentVariables: [
      {
        name: "PUBLIC_VALUE",
        description: "A plain value.",
        required: false,
        defaultValue: null,
        valueSource: "environment",
      },
      {
        name: "API_TOKEN",
        description: "An env reference.",
        required: false,
        defaultValue: null,
        valueSource: "environment",
      },
    ],
    integrity: null,
  };

  return {
    schemaVersion: 1,
    server: { slug: "github", title: "GitHub", version: "1.2.3" },
    client: "vscode",
    scope,
    variant,
    warnings: [],
    inputs: [
      {
        key: "publicValue",
        source: "environment-variable",
        name: "PUBLIC_VALUE",
        description: "A plain value.",
        required: false,
        accepts: ["text"],
      },
      {
        key: "apiToken",
        source: "environment-variable",
        name: "API_TOKEN",
        description: "An env reference.",
        required: false,
        accepts: ["env-reference"],
      },
    ],
    remoteAuth: { kind: "none" },
    requiredEnvReferences: [],
  };
}

function makeRemoteIntent(scope: "user" | "project"): ResolvedInstallIntent {
  const variant: InstallManifestRemoteVariantV1 = {
    id: VARIANT_ID,
    kind: "remote",
    transport: "streamable-http",
    urlTemplate: "https://example.com/mcp/{workspace}",
    headers: [
      { name: "Authorization", value: "Bearer {token}" },
      { name: "X-Team", value: "{team}" },
    ],
    variables: [
      {
        name: "workspace",
        description: "Workspace.",
        required: true,
        defaultValue: null,
      },
    ],
  };

  return {
    schemaVersion: 1,
    server: { slug: "github", title: "GitHub", version: null },
    client: "vscode",
    scope,
    variant,
    warnings: [],
    inputs: [
      {
        key: "workspace",
        source: "remote-variable",
        name: "workspace",
        description: "Workspace.",
        required: true,
        accepts: ["text"],
      },
      {
        key: "token",
        source: "remote-header",
        headerName: "Authorization",
        placeholder: "token",
        sensitive: true,
        description: null,
        required: true,
        accepts: ["env-reference", "secret-value"],
      },
      {
        key: "team",
        source: "remote-header",
        headerName: "X-Team",
        placeholder: "team",
        sensitive: false,
        description: null,
        required: true,
        accepts: ["text"],
      },
    ],
    remoteAuth: {
      kind: "mixed",
      bindings: [
        { kind: "persisted-secret", inputKey: "token" },
        { kind: "env-reference", inputKey: "team", envName: "TEAM_NAME" },
      ],
      requiresInteractiveConsent: true,
    },
    requiredEnvReferences: [],
  };
}

describe("vscode adapter", () => {
  it("maps user/project scope paths and rejects unsupported global scope", async () => {
    const fake = createFakeProcessRuntime({ cwd: "/workspace" });

    expect(resolveVsCodeScopePaths(fake.runtime, "user")).toEqual({
      rootPath: USER_ROOT,
      configPath: USER_CONFIG_PATH,
    });
    expect(resolveVsCodeScopePaths(fake.runtime, "project")).toEqual({
      rootPath: PROJECT_ROOT,
      configPath: PROJECT_CONFIG_PATH,
    });
    expect(() => resolveVsCodeScopePaths(fake.runtime, "global")).toThrowError(VsCodeJsonError);

    const adapter = createVsCodeAdapter(fake.runtime);
    await expect(adapter.planRemove({ slug: "github", scope: "global" })).rejects.toThrowError(
      VsCodeAdapterError,
    );
  });

  it("writes stdio and remote servers while preserving unrelated JSON with atomic mutation", async () => {
    const fake = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: {
          type: "file",
          mode: 0o640,
          content: JSON.stringify({
            note: "keep",
            servers: { keep: { type: "stdio", command: "node" } },
            inputs: [{ id: "existing", type: "promptString", description: "existing" }],
          }),
        },
      },
    });
    const adapter = createVsCodeAdapter(fake.runtime);

    const packageInputs = new Map([
      ["publicValue", { kind: "text", value: "public-value" } as const],
      ["apiToken", { kind: "env-reference", envName: "API_TOKEN" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const packagePlan = await adapter.planInstall({
      intent: makePackageIntent("project"),
      inputs: packageInputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });
    await adapter.executePlan(packagePlan);

    const remoteInputs = new Map([
      ["workspace", { kind: "text", value: "acme" } as const],
      ["token", { kind: "secret-value", value: "supersecret", allowPersistence: true } as const],
      ["team", { kind: "text", value: "platform" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const remotePlan = await adapter.planInstall({
      intent: makeRemoteIntent("project"),
      inputs: remoteInputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: "c".repeat(64),
    });
    await adapter.executePlan(remotePlan);

    expect(fake.copyCalls.length).toBeGreaterThanOrEqual(2);
    expect(fake.fileWrites[0]?.options).toMatchObject({ mode: 0o640, exclusive: true });
    expect(fake.renameCalls.length).toBeGreaterThanOrEqual(2);
    expect(fake.fsyncFileCalls.length).toBeGreaterThanOrEqual(2);
    expect(fake.fsyncDirectoryCalls).toContain(PROJECT_ROOT);

    const next = JSON.parse(await fake.runtime.readFile(PROJECT_CONFIG_PATH)) as {
      note?: string;
      servers?: Record<string, unknown>;
      inputs?: unknown[];
    };

    expect(next.note).toBe("keep");
    expect(next.servers?.keep).toEqual({ type: "stdio", command: "node" });
    expect(next.servers?.github).toMatchObject({
      type: "http",
      url: "https://example.com/mcp/acme",
      headers: {
        Authorization: expect.stringMatching(/^Bearer \$\{input:/u),
        "X-Team": "platform",
      },
    });
  });

  it("refuses malformed JSON overwrite and symlinked configs", async () => {
    const malformedRuntime = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: { type: "file", mode: 0o640, content: "{ not-json" },
      },
    });
    const malformedAdapter = createVsCodeAdapter(malformedRuntime.runtime);
    const malformedPlan = await malformedAdapter.planInstall({
      intent: makePackageIntent("project"),
      inputs: new Map() satisfies ValidatedInstallInputMap,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    await expect(malformedAdapter.executePlan(malformedPlan)).rejects.toThrowError(VsCodeJsonError);
    expect(malformedRuntime.fileWrites).toEqual([]);
    expect(malformedRuntime.renameCalls).toEqual([]);

    const symlinkRuntime = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: {
          type: "symlink",
          target: "/tmp/redirected-mcp.json",
          mode: 0o777,
        },
        "/tmp/redirected-mcp.json": { type: "file", mode: 0o600, content: "{}\n" },
      },
    });
    const symlinkAdapter = createVsCodeAdapter(symlinkRuntime.runtime);
    const symlinkPlan = await symlinkAdapter.planInstall({
      intent: makePackageIntent("project"),
      inputs: new Map() satisfies ValidatedInstallInputMap,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    await expect(symlinkAdapter.executePlan(symlinkPlan)).rejects.toThrowError(VsCodeJsonError);
    expect(symlinkRuntime.copyCalls).toEqual([]);
    expect(symlinkRuntime.renameCalls).toEqual([]);
  });

  it("stores sensitive remote headers via input references without persisting raw secrets", async () => {
    const fake = createFakeProcessRuntime({ cwd: "/workspace", entries: { [PROJECT_ROOT]: { type: "directory", mode: 0o755 } } });
    const adapter = createVsCodeAdapter(fake.runtime);

    const plan = await adapter.planInstall({
      intent: makeRemoteIntent("project"),
      inputs: new Map([
        ["workspace", { kind: "text", value: "acme" } as const],
        ["token", { kind: "secret-value", value: "supersecret", allowPersistence: true } as const],
        ["team", { kind: "text", value: "platform" } as const],
      ]) satisfies ValidatedInstallInputMap,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    expect(plan.operations[0]?.type).toBe("config-write");
    if (plan.operations[0]?.type !== "config-write") {
      throw new Error("Expected config-write operation");
    }

    const serialized = JSON.stringify(plan.operations[0].document);
    expect(serialized).toContain("${input:");
    expect(serialized).not.toContain("supersecret");

    const doc = plan.operations[0].document as {
      headers?: Record<string, string>;
      inputs?: Array<{ id?: string; type?: string; password?: boolean }>;
    };
    expect(doc.headers?.Authorization).toMatch(/^Bearer \$\{input:/u);
    expect(doc.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "promptString", password: true }),
      ]),
    );
  });

  it("supports idempotent remove without backup collisions and no-op when absent", async () => {
    const repeatedRemovalsRuntime = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: {
          type: "file",
          mode: 0o640,
          content: JSON.stringify({
            servers: {
              github: { type: "stdio", command: "npx", args: ["--yes", "@example/github-mcp@1.2.3"] },
              stripe: { type: "stdio", command: "npx", args: ["--yes", "@example/stripe-mcp@1.2.3"] },
            },
          }),
        },
      },
    });
    const repeatedRemovalsAdapter = createVsCodeAdapter(repeatedRemovalsRuntime.runtime);

    const removeGithub = await repeatedRemovalsAdapter.planRemove({ slug: "github", scope: "project" });
    await repeatedRemovalsAdapter.executeRemove(removeGithub);

    const removeStripe = await repeatedRemovalsAdapter.planRemove({ slug: "stripe", scope: "project" });
    await repeatedRemovalsAdapter.executeRemove(removeStripe);

    const uniqueBackupTargets = new Set(repeatedRemovalsRuntime.copyCalls.map((call) => call.to));
    expect(uniqueBackupTargets.size).toBeGreaterThanOrEqual(2);

    const afterRemovals = JSON.parse(await repeatedRemovalsRuntime.runtime.readFile(PROJECT_CONFIG_PATH)) as {
      servers?: Record<string, unknown>;
    };
    expect(afterRemovals.servers).toEqual({});

    const absentConfigRuntime = createFakeProcessRuntime({ cwd: "/workspace" });
    const absentConfigAdapter = createVsCodeAdapter(absentConfigRuntime.runtime);
    const absentRemovePlan = await absentConfigAdapter.planRemove({ slug: "github", scope: "project" });
    await absentConfigAdapter.executeRemove(absentRemovePlan);

    expect(absentConfigRuntime.mkdirCalls).toEqual([]);
    expect(absentConfigRuntime.copyCalls).toEqual([]);
    expect(absentConfigRuntime.fileWrites).toEqual([]);
    expect(absentConfigRuntime.renameCalls).toEqual([]);
    expect(absentConfigRuntime.fsyncFileCalls).toEqual([]);
    expect(absentConfigRuntime.fsyncDirectoryCalls).toEqual([]);
    expect(absentConfigRuntime.unlinkCalls).toEqual([]);
  });
});
