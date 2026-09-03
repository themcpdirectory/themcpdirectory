import { createFakeProcessRuntime } from "@themcpdirectory/test-utils";
import type {
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import {
  applyCursorConfigMutation,
  createCursorAdapter,
  createCursorConfigMutation,
  createCursorDeeplink,
  CursorAdapterError,
  CursorJsonError,
  resolveCursorScopePaths,
} from "../index.js";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const MANIFEST_HASH = "a".repeat(64);
const INTENT_HASH = "b".repeat(64);
const USER_ROOT = "/Users/fake-runtime/Library/Application Support/Cursor/User";
const USER_CONFIG_PATH = `${USER_ROOT}/mcp.json`;
const PROJECT_ROOT = "/workspace/.cursor";
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
        name: "OPTIONAL_LABEL",
        description: "Optional label.",
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
    client: "cursor",
    scope,
    variant,
    warnings: [],
    inputs: [
      {
        key: "OPTIONAL_LABEL",
        source: "environment-variable",
        name: "OPTIONAL_LABEL",
        description: "Optional label.",
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
    headers: [{ name: "Authorization", value: "Bearer {token}" }],
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
    client: "cursor",
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
    ],
    remoteAuth: {
      kind: "env-reference",
      bindings: [{ kind: "env-reference", inputKey: "token", envName: "GITHUB_TOKEN" }],
    },
    requiredEnvReferences: ["GITHUB_TOKEN"],
  };
}

describe("cursor adapter", () => {
  it("refuses malformed JSON overwrite and symlinked configs", async () => {
    const malformedRuntime = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: { type: "file", mode: 0o640, content: "{ not-json" },
      },
    });
    const malformedAdapter = createCursorAdapter(malformedRuntime.runtime);
    const malformedPlan = await malformedAdapter.planInstall({
      intent: makePackageIntent("project"),
      inputs: new Map() satisfies ValidatedInstallInputMap,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });
    await expect(malformedAdapter.executePlan(malformedPlan)).rejects.toThrowError(CursorJsonError);
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
    const symlinkAdapter = createCursorAdapter(symlinkRuntime.runtime);
    const symlinkPlan = await symlinkAdapter.planInstall({
      intent: makePackageIntent("project"),
      inputs: new Map() satisfies ValidatedInstallInputMap,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });
    await expect(symlinkAdapter.executePlan(symlinkPlan)).rejects.toThrowError(CursorJsonError);
    expect(symlinkRuntime.copyCalls).toEqual([]);
    expect(symlinkRuntime.renameCalls).toEqual([]);
  });

  it("performs backup + exclusive temp write + fsync + atomic rename while preserving mode and unrelated JSON", async () => {
    const fake = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: {
          type: "file",
          mode: 0o640,
          content: JSON.stringify({ theme: "midnight", mcpServers: { keep: { command: "node" } } }),
        },
      },
    });
    const adapter = createCursorAdapter(fake.runtime);
    const plan = await adapter.planInstall({
      intent: makePackageIntent("project"),
      inputs: new Map() satisfies ValidatedInstallInputMap,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    await adapter.executePlan(plan);

    expect(fake.copyCalls).toHaveLength(1);
    expect(fake.copyCalls[0]?.from).toBe(PROJECT_CONFIG_PATH);
    expect(fake.copyCalls[0]?.to).toContain(".bak.");
    expect(fake.fileWrites).toHaveLength(1);
    expect(fake.fileWrites[0]?.options).toMatchObject({ mode: 0o640, exclusive: true });
    expect(fake.fsyncFileCalls).toHaveLength(1);
    expect(fake.renameCalls).toHaveLength(1);
    expect(fake.renameCalls[0]).toEqual({
      from: expect.stringContaining(".tmp."),
      to: PROJECT_CONFIG_PATH,
    });
    expect(fake.fsyncDirectoryCalls).toContain(PROJECT_ROOT);

    const next = JSON.parse(await fake.runtime.readFile(PROJECT_CONFIG_PATH)) as Record<
      string,
      unknown
    >;
    expect(next.theme).toBe("midnight");
    expect(next.mcpServers).toMatchObject({
      keep: { command: "node" },
      github: { command: "npx" },
    });
  });

  it("rolls back deterministically when post-write verification fails", async () => {
    const fake = createFakeProcessRuntime({
      entries: {
        [USER_ROOT]: { type: "directory", mode: 0o755 },
        [USER_CONFIG_PATH]: {
          type: "file",
          mode: 0o640,
          content: JSON.stringify({ mcpServers: { keep: { command: "node" } } }),
        },
      },
    });
    const mutation = createCursorConfigMutation(fake.runtime, {
      scope: "user",
      serverKey: "github",
      intentHash: INTENT_HASH,
    });

    await expect(
      applyCursorConfigMutation(fake.runtime, {
        mutation,
        apply: (document) => ({
          ...document,
          mcpServers: {
            ...(document.mcpServers ?? {}),
            github: { command: "npx" },
          },
        }),
        verify: () => false,
      }),
    ).rejects.toThrowError(CursorJsonError);

    const restored = JSON.parse(await fake.runtime.readFile(USER_CONFIG_PATH)) as Record<
      string,
      unknown
    >;
    expect(restored).toEqual({ mcpServers: { keep: { command: "node" } } });
    expect(fake.copyCalls.length).toBeGreaterThanOrEqual(2);
    expect(fake.chmodCalls.at(-1)).toEqual({ path: USER_CONFIG_PATH, mode: 0o640 });
  });

  it("handles repeated removals without backup collisions and no-ops when config is absent", async () => {
    const repeatedRemovalsRuntime = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: {
        [PROJECT_ROOT]: { type: "directory", mode: 0o755 },
        [PROJECT_CONFIG_PATH]: {
          type: "file",
          mode: 0o640,
          content: JSON.stringify({
            mcpServers: {
              github: { command: "npx", args: ["--yes", "@example/github-mcp@1.2.3"] },
              stripe: { command: "npx", args: ["--yes", "@example/stripe-mcp@1.2.3"] },
            },
          }),
        },
      },
    });
    const repeatedRemovalsAdapter = createCursorAdapter(repeatedRemovalsRuntime.runtime);

    const removeGithub = await repeatedRemovalsAdapter.planRemove({
      slug: "github",
      scope: "project",
    });
    await repeatedRemovalsAdapter.executeRemove(removeGithub);

    const removeStripe = await repeatedRemovalsAdapter.planRemove({
      slug: "stripe",
      scope: "project",
    });
    await repeatedRemovalsAdapter.executeRemove(removeStripe);

    const uniqueBackupTargets = new Set(repeatedRemovalsRuntime.copyCalls.map((call) => call.to));
    expect(uniqueBackupTargets.size).toBeGreaterThanOrEqual(2);

    const afterRepeatedRemovals = JSON.parse(
      await repeatedRemovalsRuntime.runtime.readFile(PROJECT_CONFIG_PATH),
    ) as Record<string, unknown>;
    expect(afterRepeatedRemovals.mcpServers).toEqual({});

    const absentConfigRuntime = createFakeProcessRuntime({ cwd: "/workspace" });
    const absentConfigAdapter = createCursorAdapter(absentConfigRuntime.runtime);
    const absentRemovePlan = await absentConfigAdapter.planRemove({
      slug: "github",
      scope: "project",
    });
    await absentConfigAdapter.executeRemove(absentRemovePlan);

    expect(absentConfigRuntime.mkdirCalls).toEqual([]);
    expect(absentConfigRuntime.copyCalls).toEqual([]);
    expect(absentConfigRuntime.fileWrites).toEqual([]);
    expect(absentConfigRuntime.renameCalls).toEqual([]);
    expect(absentConfigRuntime.fsyncFileCalls).toEqual([]);
    expect(absentConfigRuntime.fsyncDirectoryCalls).toEqual([]);
    expect(absentConfigRuntime.unlinkCalls).toEqual([]);
  });

  it("maps user/project scopes to explicit paths and rejects unsupported global scope", async () => {
    const fake = createFakeProcessRuntime({ cwd: "/workspace" });

    expect(resolveCursorScopePaths(fake.runtime, "user")).toEqual({
      rootPath: USER_ROOT,
      configPath: USER_CONFIG_PATH,
    });
    expect(resolveCursorScopePaths(fake.runtime, "project")).toEqual({
      rootPath: PROJECT_ROOT,
      configPath: PROJECT_CONFIG_PATH,
    });
    expect(() => resolveCursorScopePaths(fake.runtime, "global")).toThrowError(CursorJsonError);

    const adapter = createCursorAdapter(fake.runtime);
    await expect(adapter.planRemove({ slug: "github", scope: "global" })).rejects.toThrowError(
      CursorAdapterError,
    );
  });

  it("writes secret-safe env references for sensitive remote auth and rejects raw secret values", async () => {
    const fake = createFakeProcessRuntime({
      cwd: "/workspace",
      entries: { [PROJECT_ROOT]: { type: "directory", mode: 0o755 } },
    });
    const adapter = createCursorAdapter(fake.runtime);
    const safeInputs = new Map([
      ["workspace", { kind: "text", value: "acme" } as const],
      ["token", { kind: "env-reference", envName: "GITHUB_TOKEN" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const safePlan = await adapter.planInstall({
      intent: makeRemoteIntent("project"),
      inputs: safeInputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });
    expect(safePlan.operations[0]?.type).toBe("config-write");
    if (safePlan.operations[0]?.type === "config-write") {
      expect(JSON.stringify(safePlan.operations[0].document)).toContain("${GITHUB_TOKEN}");
      expect(JSON.stringify(safePlan.operations[0].document)).not.toContain("supersecret");
    }

    const unsafeInputs = new Map([
      ["workspace", { kind: "text", value: "acme" } as const],
      ["token", { kind: "secret-value", value: "supersecret", allowPersistence: true } as const],
    ]) satisfies ValidatedInstallInputMap;

    await expect(
      adapter.planInstall({
        intent: makeRemoteIntent("project"),
        inputs: unsafeInputs,
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).rejects.toThrowError(CursorAdapterError);
  });

  it("creates structurally valid Cursor deeplinks when safely and exactly representable", async () => {
    const fake = createFakeProcessRuntime();
    const adapter = createCursorAdapter(fake.runtime);
    const inputs = new Map([
      ["workspace", { kind: "text", value: "acme" } as const],
      ["token", { kind: "env-reference", envName: "GITHUB_TOKEN" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const plan = await adapter.planInstall({
      intent: makeRemoteIntent("user"),
      inputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    expect(plan.operations[0]?.type).toBe("deeplink");
    if (plan.operations[0]?.type !== "deeplink") {
      throw new Error("Expected deeplink operation");
    }

    const deeplink = createCursorDeeplink(plan);
    const parsed = new URL(deeplink);
    expect(parsed.protocol).toBe("cursor:");
    expect(parsed.host).toBe("anysphere.cursor-deeplink");
    expect(parsed.pathname).toBe("/mcp/install");
    expect(Array.from(parsed.searchParams.keys())).toEqual(["payload"]);

    const payloadRaw = parsed.searchParams.get("payload");
    expect(payloadRaw).toBeTruthy();
    const payload = JSON.parse(decodeURIComponent(payloadRaw ?? "")) as Record<string, unknown>;
    expect(payload.serverSlug).toBe("github");
    expect(payload.scope).toBe("user");
    expect(payload.server).toMatchObject({ url: "https://example.com/mcp/acme" });
  });
});
