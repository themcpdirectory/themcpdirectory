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

    await expect(
      supportedAdapter.planInstall({
        intent: makeRemoteIntent(),
        inputs,
        noninteractive: true,
        manifestHash: MANIFEST_HASH,
        intentHash: INTENT_HASH,
      }),
    ).resolves.toMatchObject({
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
});
