import { createFakeProcessRuntime } from "@themcpdirectory/test-utils";
import type {
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import {
  ClaudeCodeAdapterError,
  createClaudeCodeAdapter,
  probeClaudeCodeCapabilities,
} from "../index.js";

const CLAUDE_PATH = "/usr/local/bin/claude";
const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const MANIFEST_HASH = "a".repeat(64);
const INTENT_HASH = "b".repeat(64);
const EXEC_OPTIONS = {
  timeoutMs: 5_000,
  maxStdoutBytes: 65_536,
  maxStderrBytes: 16_384,
  shell: false,
  stdin: "ignore",
} as const;

function makeProbeResults(
  overrides: {
    readonly addHelp?: string;
    readonly listHelp?: string;
    readonly removeHelp?: string;
  } = {},
) {
  return [
    { exitCode: 0, stdout: "1.0.0\n", stderr: "" },
    { exitCode: 0, stdout: "Commands:\n  add\n  add-json\n  list\n  remove\n", stderr: "" },
    {
      exitCode: 0,
      stdout:
        overrides.addHelp ??
        "Usage: claude mcp add [OPTIONS] <NAME> [-- <COMMAND>...]\n--transport <http|sse>\n--scope <local|project|user>\n--env <KEY=VALUE>\n",
      stderr: "",
    },
    {
      exitCode: 0,
      stdout: overrides.listHelp ?? "Usage: claude mcp list [OPTIONS]\n--json\n",
      stderr: "",
    },
    {
      exitCode: 0,
      stdout: overrides.removeHelp ?? "Usage: claude mcp remove [OPTIONS] <NAME>\n",
      stderr: "",
    },
  ];
}

function createClaudeRuntime(execResults = makeProbeResults()) {
  return createFakeProcessRuntime({
    env: { PATH: "/usr/local/bin:/usr/bin" },
    entries: {
      "/usr/local/bin/claude": { type: "file", content: "", mode: 0o755 },
    },
    execResults,
  });
}

function makePackageIntent(scope: "global" | "project" | "user" = "project"): ResolvedInstallIntent {
  const variant: InstallManifestPackageVariantV1 = {
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
        name: "registry",
        valueHint: "url",
        description: "Registry URL.",
        required: true,
      },
    ],
    packageArguments: [
      {
        type: "positional",
        name: null,
        valueHint: "workspace",
        description: "Workspace.",
        required: true,
      },
    ],
    environmentVariables: [],
    integrity: null,
  };

  return {
    schemaVersion: 1,
    server: { slug: "github", title: "GitHub", version: "1.2.3" },
    client: "claude-code",
    scope,
    variant,
    warnings: [],
    inputs: [
      {
        key: "registry",
        source: "package-runtime-argument",
        argumentType: "named",
        index: 0,
        name: "registry",
        valueHint: "url",
        description: "Registry URL.",
        required: true,
        accepts: ["text"],
      },
      {
        key: "workspace",
        source: "package-argument",
        argumentType: "positional",
        index: 0,
        name: null,
        valueHint: "workspace",
        description: "Workspace.",
        required: true,
        accepts: ["text"],
      },
    ],
    remoteAuth: { kind: "none" },
    requiredEnvReferences: [],
  };
}

function makeRemoteIntent(remoteAuthKind: "env-reference" | "persisted-secret"): ResolvedInstallIntent {
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
    client: "claude-code",
    scope: "project",
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
    remoteAuth:
      remoteAuthKind === "env-reference"
        ? {
            kind: "env-reference",
            bindings: [{ kind: "env-reference", inputKey: "token", envName: "GITHUB_TOKEN" }],
          }
        : {
            kind: "persisted-secret",
            bindings: [{ kind: "persisted-secret", inputKey: "token" }],
            requiresInteractiveConsent: true,
          },
    requiredEnvReferences: remoteAuthKind === "env-reference" ? ["GITHUB_TOKEN"] : [],
  };
}

describe("probeClaudeCodeCapabilities", () => {
  it("discovers executable with exact bounded probes and capability proof", async () => {
    const fake = createClaudeRuntime();

    const result = await probeClaudeCodeCapabilities(fake.runtime);

    expect(result.detection).toEqual({
      id: "claude-code",
      installed: true,
      executable: CLAUDE_PATH,
      version: "1.0.0",
      capabilities: [
        "native-add-stdio",
        "native-add-remote",
        "native-remove",
        "native-list",
        "native-list-json",
        "native-scope-global",
        "native-scope-project",
        "native-scope-user",
        "env-reference",
      ],
    });
    expect(fake.spawnCalls).toEqual([
      { executable: CLAUDE_PATH, args: ["--version"], options: EXEC_OPTIONS },
      { executable: CLAUDE_PATH, args: ["mcp", "--help"], options: EXEC_OPTIONS },
      { executable: CLAUDE_PATH, args: ["mcp", "add", "--help"], options: EXEC_OPTIONS },
      { executable: CLAUDE_PATH, args: ["mcp", "list", "--help"], options: EXEC_OPTIONS },
      { executable: CLAUDE_PATH, args: ["mcp", "remove", "--help"], options: EXEC_OPTIONS },
    ]);
  });
});

describe("createClaudeCodeAdapter", () => {
  it("maps project scope and emits exact stdio add command", async () => {
    const fake = createClaudeRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createClaudeCodeAdapter(fake.runtime);
    const inputs = new Map([
      ["registry", { kind: "text", value: "https://registry.example" } as const],
      ["workspace", { kind: "text", value: "acme/platform" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const plan = await adapter.planInstall({
      intent: makePackageIntent("project"),
      inputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    expect(plan.operations[0]).toEqual({
      type: "client-command",
      executable: CLAUDE_PATH,
      args: [
        "mcp",
        "add",
        "github",
        "--scope",
        "project",
        "--",
        "npx",
        "--yes",
        "--registry",
        "https://registry.example",
        "@example/github-mcp@1.2.3",
        "acme/platform",
      ],
      capability: "native-add-stdio",
    });
  });

  it("inspects installed servers and plans scoped remove", async () => {
    const fake = createClaudeRuntime([
      ...makeProbeResults(),
      { exitCode: 0, stdout: "github project connected\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "Name: github\nScope: project\nTransport: stdio\nStatus: connected\n",
        stderr: "",
      },
      ...makeProbeResults(),
    ]);
    const adapter = createClaudeCodeAdapter(fake.runtime);

    const installed = await adapter.inspect("project");
    expect(installed).toEqual([
      {
        name: "github",
        slug: "github",
        client: "claude-code",
        scope: "project",
        transport: "stdio",
        managedBy: "external",
        adapterMetadata: {
          scope: "project",
          status: "connected",
          transport: "stdio",
        },
      },
    ]);

    const removal = await adapter.planRemove({ slug: "github", scope: "project" });
    expect(removal.operations[0]).toEqual({
      type: "client-command",
      executable: CLAUDE_PATH,
      args: ["mcp", "remove", "github", "--scope", "project"],
      capability: "native-remove",
    });
  });

  it("uses add-json for env-reference remote auth without serializing secret values", async () => {
    const fake = createClaudeRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createClaudeCodeAdapter(fake.runtime);
    const inputs = new Map([
      ["workspace", { kind: "text", value: "acme" } as const],
      ["token", { kind: "env-reference", envName: "GITHUB_TOKEN" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const plan = await adapter.planInstall({
      intent: makeRemoteIntent("env-reference"),
      inputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    expect(plan.operations[0]?.type).toBe("client-command");
    if (plan.operations[0]?.type === "client-command") {
      expect(plan.operations[0].args[0]).toBe("mcp");
      expect(plan.operations[0].args[1]).toBe("add-json");
      expect(plan.operations[0].args[2]).toBe("github");
      expect(plan.operations[0].args[4]).toBe("--scope");
      expect(plan.operations[0].args[5]).toBe("project");
      expect(plan.operations[0].args[3]).toContain("\"url\":\"https://example.com/mcp/acme\"");
      expect(plan.operations[0].args[3]).toContain("\"Authorization\":\"Bearer ${GITHUB_TOKEN}\"");
      expect(plan.operations[0].args[3]).not.toContain("supersecret");
    }
  });

  it("rejects persisted-secret auth combinations without leaking secret text", async () => {
    const fake = createClaudeRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createClaudeCodeAdapter(fake.runtime);
    const inputs = new Map([
      ["workspace", { kind: "text", value: "acme" } as const],
      ["token", { kind: "secret-value", value: "supersecret", allowPersistence: true } as const],
    ]) satisfies ValidatedInstallInputMap;

    let error: unknown;
    try {
      await adapter.planInstall({
        intent: makeRemoteIntent("persisted-secret"),
        inputs,
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ClaudeCodeAdapterError);
    expect(error).toMatchObject({
      code: "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      message: "Claude Code adapter does not support persisted secret remote auth combinations",
    });
    expect(error).not.toHaveProperty("message", expect.stringContaining("supersecret"));
  });
});
