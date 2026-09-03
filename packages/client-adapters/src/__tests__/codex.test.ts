import { createFakeProcessRuntime } from "@themcpdirectory/test-utils";
import type {
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import { CodexAdapterError, createCodexAdapter, probeCodexCapabilities } from "../index.js";

const CODEX_PATH = "/usr/local/bin/codex";
const WINDOWS_CODEX_PATH = "C:\\Tools\\codex.exe";
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
    { exitCode: 0, stdout: "codex-cli 0.146.0\n", stderr: "" },
    { exitCode: 0, stdout: "Commands:\n  add\n  list\n  remove\n", stderr: "" },
    {
      exitCode: 0,
      stdout:
        overrides.addHelp ??
        "Usage: codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)\n--bearer-token-env-var <ENV_VAR>\n",
      stderr: "",
    },
    {
      exitCode: 0,
      stdout: overrides.listHelp ?? "Usage: codex mcp list [OPTIONS]\n--json\n",
      stderr: "",
    },
    {
      exitCode: 0,
      stdout: overrides.removeHelp ?? "Usage: codex mcp remove [OPTIONS] <NAME>\n",
      stderr: "",
    },
  ];
}

function createCodexRuntime(execResults = makeProbeResults()) {
  return createFakeProcessRuntime({
    env: { PATH: "/usr/local/bin:/usr/bin" },
    entries: {
      "/usr/local/bin/codex": { type: "file", content: "", mode: 0o755 },
    },
    execResults,
  });
}

function makePackageIntent(): ResolvedInstallIntent {
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
    client: "codex",
    scope: "user",
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

function makeRemoteIntent(): ResolvedInstallIntent {
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
    client: "codex",
    scope: "user",
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

describe("probeCodexCapabilities", () => {
  it("discovers an absolute executable and derives capabilities from exact bounded probes", async () => {
    const fake = createCodexRuntime();

    const result = await probeCodexCapabilities(fake.runtime);

    expect(result.detection).toEqual({
      id: "codex",
      installed: true,
      executable: CODEX_PATH,
      version: "0.146.0",
      capabilities: [
        "native-add-stdio",
        "native-add-remote",
        "native-remove",
        "native-list",
        "native-list-json",
        "native-scope-user",
        "env-reference",
      ],
    });
    expect(result.helpText).toEqual({
      root: "Commands:\n  add\n  list\n  remove\n",
      add: expect.stringContaining("--bearer-token-env-var"),
      list: "Usage: codex mcp list [OPTIONS]\n--json\n",
      remove: "Usage: codex mcp remove [OPTIONS] <NAME>\n",
    });
    expect(fake.spawnCalls).toEqual([
      { executable: CODEX_PATH, args: ["--version"], options: EXEC_OPTIONS },
      { executable: CODEX_PATH, args: ["mcp", "--help"], options: EXEC_OPTIONS },
      { executable: CODEX_PATH, args: ["mcp", "add", "--help"], options: EXEC_OPTIONS },
      { executable: CODEX_PATH, args: ["mcp", "list", "--help"], options: EXEC_OPTIONS },
      { executable: CODEX_PATH, args: ["mcp", "remove", "--help"], options: EXEC_OPTIONS },
    ]);
  });

  it("does not execute a current-directory binary from PATH", async () => {
    const fake = createFakeProcessRuntime({
      cwd: "/repo",
      env: { PATH: ".:/usr/bin" },
      entries: {
        "/repo/codex": { type: "file", content: "", mode: 0o755 },
      },
    });

    await expect(probeCodexCapabilities(fake.runtime)).resolves.toMatchObject({
      detection: { id: "codex", installed: false, capabilities: [] },
    });
    expect(fake.spawnCalls).toEqual([]);
  });

  it("discovers a directly executable Windows binary from Path without accepting cmd shims", async () => {
    const fake = createFakeProcessRuntime({
      platform: "win32",
      env: { Path: "C:\\Tools;C:\\Windows\\System32" },
      entries: {
        [WINDOWS_CODEX_PATH]: { type: "file", content: "", mode: 0o755 },
        "C:\\Tools\\codex.cmd": { type: "file", content: "", mode: 0o755 },
      },
      execResults: makeProbeResults(),
    });

    await expect(probeCodexCapabilities(fake.runtime)).resolves.toMatchObject({
      detection: { installed: true, executable: WINDOWS_CODEX_PATH },
    });
    expect(fake.spawnCalls).toHaveLength(5);
    expect(fake.spawnCalls.every((call) => call.executable === WINDOWS_CODEX_PATH)).toBe(true);
    expect(fake.spawnCalls.every((call) => call.options.shell === false)).toBe(true);
  });
});

describe("createCodexAdapter", () => {
  it("builds and executes an exact stdio command with arguments separated after --", async () => {
    const fake = createCodexRuntime([
      ...makeProbeResults(),
      ...makeProbeResults(),
      { exitCode: 0, stdout: "", stderr: "" },
    ]);
    const adapter = createCodexAdapter(fake.runtime);
    const inputs = new Map([
      ["registry", { kind: "text", value: "https://registry.example" } as const],
      ["workspace", { kind: "text", value: "acme/platform" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const plan = await adapter.planInstall({
      intent: makePackageIntent(),
      inputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    expect(plan).toEqual({
      schemaVersion: 1,
      serverSlug: "github",
      client: "codex",
      scope: "user",
      variantId: VARIANT_ID,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
      operations: [
        {
          type: "client-command",
          executable: CODEX_PATH,
          args: [
            "mcp",
            "add",
            "github",
            "--",
            "npx",
            "--yes",
            "--registry",
            "https://registry.example",
            "@example/github-mcp@1.2.3",
            "acme/platform",
          ],
          capability: "native-add-stdio",
        },
      ],
      previewLines: [
        "Add GitHub to Codex user configuration.",
        "Run npx --yes --registry https://registry.example @example/github-mcp@1.2.3 acme/platform.",
      ],
    });

    await adapter.executePlan(plan);

    expect(fake.spawnCalls.at(-1)).toEqual({
      executable: CODEX_PATH,
      args: plan.operations[0]?.type === "client-command" ? plan.operations[0].args : [],
      options: EXEC_OPTIONS,
    });
  });

  it("builds remote URL and bearer environment-reference arguments only when proven", async () => {
    const supportedFake = createCodexRuntime();
    const supportedAdapter = createCodexAdapter(supportedFake.runtime);
    const inputs = new Map([
      ["workspace", { kind: "text", value: "acme team" } as const],
      ["token", { kind: "env-reference", envName: "GITHUB_TOKEN" } as const],
    ]) satisfies ValidatedInstallInputMap;

    const plan = await supportedAdapter.planInstall({
      intent: makeRemoteIntent(),
      inputs,
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    expect(plan).toMatchObject({
      previewLines: [
        "Add GitHub to Codex user configuration.",
        "Configure remote URL https://example.com/mcp/acme%20team.",
      ],
      operations: [
        {
          type: "client-command",
          executable: CODEX_PATH,
          args: [
            "mcp",
            "add",
            "github",
            "--url",
            "https://example.com/mcp/acme%20team",
            "--bearer-token-env-var",
            "GITHUB_TOKEN",
          ],
          capability: "native-add-remote",
        },
      ],
    });

    const unsupportedFake = createCodexRuntime(
      makeProbeResults({
        addHelp: "Usage: codex mcp add [OPTIONS] <NAME> -- <COMMAND>...\n",
      }),
    );
    const unsupportedAdapter = createCodexAdapter(unsupportedFake.runtime);

    await expect(
      unsupportedAdapter.planInstall({
        intent: makeRemoteIntent(),
        inputs,
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).rejects.toMatchObject({ code: "CODEX_UNSUPPORTED_CAPABILITY" });
  });

  it("rejects intents resolved for another client and unresolved remote URL placeholders", async () => {
    const clientFake = createCodexRuntime();
    const clientAdapter = createCodexAdapter(clientFake.runtime);

    await expect(
      clientAdapter.planInstall({
        intent: { ...makePackageIntent(), client: "claude-code" },
        inputs: new Map(),
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).rejects.toMatchObject({ code: "CODEX_INVALID_INPUT" });
    expect(clientFake.spawnCalls).toEqual([]);

    const placeholderFake = createCodexRuntime();
    const placeholderAdapter = createCodexAdapter(placeholderFake.runtime);
    const remoteIntent = makeRemoteIntent();
    if (remoteIntent.variant.kind !== "remote") {
      throw new Error("Expected remote intent fixture");
    }
    const intentWithOptionalPlaceholder: ResolvedInstallIntent = {
      ...remoteIntent,
      variant: {
        ...remoteIntent.variant,
        urlTemplate: "https://example.com/mcp/{region}",
        headers: [],
        variables: [
          {
            name: "region",
            description: "Region.",
            required: false,
            defaultValue: null,
          },
        ],
      },
      inputs: [
        {
          key: "region",
          source: "remote-variable",
          name: "region",
          description: "Region.",
          required: false,
          accepts: ["text"],
        },
      ],
      remoteAuth: { kind: "none" },
      requiredEnvReferences: [],
    };

    await expect(
      placeholderAdapter.planInstall({
        intent: intentWithOptionalPlaceholder,
        inputs: new Map(),
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).rejects.toMatchObject({ code: "CODEX_INVALID_INPUT" });
  });

  it("rejects unsafe npx runtime flags and sensitive remote URL variables", async () => {
    const runtimeFlagFake = createCodexRuntime();
    const runtimeFlagAdapter = createCodexAdapter(runtimeFlagFake.runtime);
    const packageIntent = makePackageIntent();
    if (packageIntent.variant.kind !== "package") {
      throw new Error("Expected package intent fixture");
    }
    const unsafeRuntimeIntent: ResolvedInstallIntent = {
      ...packageIntent,
      variant: {
        ...packageIntent.variant,
        packageArguments: [],
        runtimeArguments: [
          {
            type: "named",
            name: "call",
            valueHint: "command",
            description: "Command.",
            required: true,
          },
        ],
      },
      inputs: [
        {
          key: "command",
          source: "package-runtime-argument",
          argumentType: "named",
          index: 0,
          name: "call",
          valueHint: "command",
          description: "Command.",
          required: true,
          accepts: ["text"],
        },
      ],
    };

    await expect(
      runtimeFlagAdapter.planInstall({
        intent: unsafeRuntimeIntent,
        inputs: new Map([["command", { kind: "text", value: "sh -c whoami" }]]),
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).rejects.toMatchObject({ code: "CODEX_UNSUPPORTED_CAPABILITY" });

    const sensitiveUrlFake = createCodexRuntime();
    const sensitiveUrlAdapter = createCodexAdapter(sensitiveUrlFake.runtime);
    const remoteIntent = makeRemoteIntent();
    if (remoteIntent.variant.kind !== "remote") {
      throw new Error("Expected remote intent fixture");
    }
    const sensitiveUrlIntent: ResolvedInstallIntent = {
      ...remoteIntent,
      variant: {
        ...remoteIntent.variant,
        urlTemplate: "https://example.com/mcp?api_key={api_key}",
        headers: [],
        variables: [
          {
            name: "api_key",
            description: "API key.",
            required: true,
            defaultValue: null,
          },
        ],
      },
      inputs: [
        {
          key: "api_key",
          source: "remote-variable",
          name: "api_key",
          description: "API key.",
          required: true,
          accepts: ["text"],
        },
      ],
      remoteAuth: { kind: "none" },
      requiredEnvReferences: [],
    };

    await expect(
      sensitiveUrlAdapter.planInstall({
        intent: sensitiveUrlIntent,
        inputs: new Map([["api_key", { kind: "text", value: "do-not-serialize" }]]),
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).rejects.toMatchObject({ code: "CODEX_INVALID_INPUT" });
  });

  it("uses JSON listing only when the installed CLI proves the flag", async () => {
    const fake = createCodexRuntime([
      ...makeProbeResults(),
      {
        exitCode: 0,
        stdout: JSON.stringify([
          {
            name: "github",
            enabled: true,
            transport: {
              type: "streamable_http",
              url: "https://example.com/mcp",
              bearer_token_env_var: "GITHUB_TOKEN",
            },
            auth_status: "unsupported",
          },
        ]),
        stderr: "",
      },
    ]);
    const adapter = createCodexAdapter(fake.runtime);

    await expect(adapter.inspect("user")).resolves.toEqual([
      {
        name: "github",
        slug: "github",
        client: "codex",
        scope: "user",
        transport: "streamable-http",
        managedBy: "external",
        adapterMetadata: {
          enabled: true,
          authStatus: "unsupported",
          bearerTokenEnvVar: "GITHUB_TOKEN",
        },
      },
    ]);
    expect(fake.spawnCalls.at(-1)).toEqual({
      executable: CODEX_PATH,
      args: ["mcp", "list", "--json"],
      options: EXEC_OPTIONS,
    });

    const unsupportedFake = createCodexRuntime(
      makeProbeResults({ listHelp: "Usage: codex mcp list [OPTIONS]\n" }),
    );
    await expect(createCodexAdapter(unsupportedFake.runtime).inspect()).rejects.toBeInstanceOf(
      CodexAdapterError,
    );
  });

  it("plans and executes removal only while remove support remains proven", async () => {
    const fake = createCodexRuntime([
      ...makeProbeResults(),
      ...makeProbeResults(),
      { exitCode: 0, stdout: "", stderr: "" },
    ]);
    const adapter = createCodexAdapter(fake.runtime);

    const plan = await adapter.planRemove({ slug: "github", scope: "user" });

    expect(plan.operations).toEqual([
      {
        type: "client-command",
        executable: CODEX_PATH,
        args: ["mcp", "remove", "github"],
        capability: "native-remove",
      },
    ]);
    await adapter.executeRemove(plan);
    expect(fake.spawnCalls.at(-1)).toEqual({
      executable: CODEX_PATH,
      args: ["mcp", "remove", "github"],
      options: EXEC_OPTIONS,
    });

    const changedFake = createCodexRuntime([
      ...makeProbeResults(),
      ...makeProbeResults({ removeHelp: "Usage: codex mcp remove [OPTIONS] <NAME>\n" }).map(
        (result, index) =>
          index === 1 ? { ...result, stdout: "Commands:\n  add\n  list\n" } : result,
      ),
    ]);
    const changedAdapter = createCodexAdapter(changedFake.runtime);
    const changedPlan = await changedAdapter.planRemove({ slug: "github" });

    await expect(changedAdapter.executeRemove(changedPlan)).rejects.toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });
    expect(changedFake.spawnCalls).toHaveLength(10);
  });

  it("rejects substitution of a planned removal target", async () => {
    const fake = createCodexRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createCodexAdapter(fake.runtime);
    const plan = await adapter.planRemove({ slug: "github" });

    await expect(
      adapter.executeRemove({
        ...plan,
        serverSlug: "production",
        operations: [
          {
            type: "client-command",
            executable: CODEX_PATH,
            args: ["mcp", "remove", "production"],
            capability: "native-remove",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CODEX_INVALID_PLAN" });
    expect(fake.spawnCalls).toHaveLength(10);
  });

  it("rejects unsupported scopes and malformed JSON listing output", async () => {
    const scopeFake = createCodexRuntime();
    const scopeAdapter = createCodexAdapter(scopeFake.runtime);

    await expect(scopeAdapter.inspect("project")).rejects.toMatchObject({
      code: "CODEX_UNSUPPORTED_CAPABILITY",
    });
    expect(scopeFake.spawnCalls).toEqual([]);

    const malformedFake = createCodexRuntime([
      ...makeProbeResults(),
      { exitCode: 0, stdout: "not-json", stderr: "" },
    ]);

    await expect(createCodexAdapter(malformedFake.runtime).inspect()).rejects.toMatchObject({
      code: "CODEX_INVALID_LIST_OUTPUT",
    });
  });

  it("rejects altered install arguments immediately before mutation", async () => {
    const fake = createCodexRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createCodexAdapter(fake.runtime);
    const plan = await adapter.planInstall({
      intent: makePackageIntent(),
      inputs: new Map([
        ["registry", { kind: "text", value: "https://registry.example" } as const],
        ["workspace", { kind: "text", value: "acme/platform" } as const],
      ]),
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    await expect(
      adapter.executePlan({
        ...plan,
        operations: [
          {
            type: "client-command",
            executable: CODEX_PATH,
            args: ["mcp", "remove", "github"],
            capability: "native-add-stdio",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CODEX_INVALID_PLAN" });
    expect(fake.spawnCalls).toHaveLength(10);
  });

  it("rejects substitution of only the planned stdio command tail", async () => {
    const fake = createCodexRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createCodexAdapter(fake.runtime);
    const plan = await adapter.planInstall({
      intent: makePackageIntent(),
      inputs: new Map([
        ["registry", { kind: "text", value: "https://registry.example" } as const],
        ["workspace", { kind: "text", value: "acme/platform" } as const],
      ]),
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    await expect(
      adapter.executePlan({
        ...plan,
        operations: [
          {
            type: "client-command",
            executable: CODEX_PATH,
            args: ["mcp", "add", "github", "--", "sh", "-c", "whoami"],
            capability: "native-add-stdio",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CODEX_INVALID_PLAN" });
    expect(fake.spawnCalls).toHaveLength(10);
  });

  it("rejects altered install scope immediately before mutation", async () => {
    const fake = createCodexRuntime([...makeProbeResults(), ...makeProbeResults()]);
    const adapter = createCodexAdapter(fake.runtime);
    const plan = await adapter.planInstall({
      intent: makePackageIntent(),
      inputs: new Map([
        ["registry", { kind: "text", value: "https://registry.example" } as const],
        ["workspace", { kind: "text", value: "acme/platform" } as const],
      ]),
      noninteractive: true,
      manifestHash: MANIFEST_HASH,
      intentHash: INTENT_HASH,
    });

    await expect(adapter.executePlan({ ...plan, scope: "project" })).rejects.toMatchObject({
      code: "CODEX_UNSUPPORTED_CAPABILITY",
    });
    expect(fake.spawnCalls).toHaveLength(10);
  });
});
