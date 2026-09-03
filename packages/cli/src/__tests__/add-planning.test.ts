import type { InstallManifestResponse, InstallManifestV1 } from "@themcpdirectory/api-contract";
import type {
  AdapterRegistry,
  ClientDetection,
  InstallVerificationResult,
  McpClientAdapter,
  RemoveVerificationResult,
} from "@themcpdirectory/client-adapters";
import type {
  AdapterCapability,
  AdapterSafetyDescriptor,
  ClientId,
  InstallPlan,
  RemovalPlan,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import { UnsupportedVariantError } from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import type { CliDependencies, PromptIO } from "../dependencies.js";
import { planAddCommand } from "../commands/add-plan.js";

type PackageVariant = Extract<InstallManifestV1["variants"][number], { kind: "package" }>;
type RemoteVariant = Extract<InstallManifestV1["variants"][number], { kind: "remote" }>;

interface PromptIoDouble extends PromptIO {
  readonly selectCalls: Array<{ readonly message: string; readonly options: readonly string[] }>;
  readonly inputCalls: string[];
  readonly secretInputCalls: string[];
  readonly confirmCalls: string[];
}

interface FakeAdapterState {
  readonly detectCalls: { current: number };
  readonly planCalls: {
    readonly intent: ResolvedInstallIntent;
    readonly inputs: ValidatedInstallInputMap;
    readonly manifestHash: string;
    readonly intentHash: string;
    readonly noninteractive: boolean;
  }[];
  readonly executeCalls: { current: number };
  readonly verifyCalls: { current: number };
}

describe("planAddCommand", () => {
  it("plans a slug install for the only detected client and redacts environment summaries", async () => {
    const adapter = createFakeAdapter({
      id: "codex",
      detection: createDetection("codex", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });
    const deps = createCliDependencies({
      manifest: makePackageManifest(),
      adapters: [adapter],
      environment: { GITHUB_TOKEN: "ghs_top_secret_value" },
    });

    const result = await planAddCommand(
      {
        identifier: "github",
        dryRun: false,
        yes: false,
        json: false,
      },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout?.ok).toBe(true);
    expect(result.stdout?.data).toMatchObject({
      previews: [
        expect.objectContaining({
          client: "codex",
          scope: "user",
          warnings: [],
          inputSummary: [expect.stringContaining("$GITHUB_TOKEN")],
        }),
      ],
      confirmationMessage: expect.stringContaining("GitHub"),
    });
    expect(JSON.stringify(result.stdout)).not.toContain("ghs_top_secret_value");
    expect(adapter.state.planCalls).toHaveLength(1);
    expect(adapter.state.executeCalls.current).toBe(0);
    expect(adapter.state.verifyCalls.current).toBe(0);
  });

  it("resolves aliases and plans every explicitly requested client", async () => {
    const codex = createFakeAdapter({
      id: "codex",
      detection: createDetection("codex", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });
    const cursor = createFakeAdapter({
      id: "cursor",
      detection: createDetection("cursor", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });
    const deps = createCliDependencies({
      manifest: makePackageManifest(),
      adapters: [codex, cursor],
      environment: { GITHUB_TOKEN: "ghs_alias_secret" },
    });

    const result = await planAddCommand(
      {
        identifier: "gh",
        targetClients: ["codex", "cursor"],
        dryRun: false,
        yes: false,
        json: false,
      },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(deps.resolveInstallCalls).toEqual(["gh"]);
    expect(result.stdout?.data).toMatchObject({
      previews: [
        expect.objectContaining({ client: "codex" }),
        expect.objectContaining({ client: "cursor" }),
      ],
      confirmationMessage: expect.stringContaining("2 target"),
    });
    expect(codex.state.planCalls).toHaveLength(1);
    expect(cursor.state.planCalls).toHaveLength(1);
  });

  it("supports --to all and the interactive All detected clients flow", async () => {
    const codex = createFakeAdapter({
      id: "codex",
      detection: createDetection("codex", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });
    const cursor = createFakeAdapter({
      id: "cursor",
      detection: createDetection("cursor", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });

    const allDeps = createCliDependencies({
      manifest: makePackageManifest(),
      adapters: [codex, cursor],
      environment: { GITHUB_TOKEN: "ghs_all_secret" },
    });
    const dryRunResult = await planAddCommand(
      {
        identifier: "github",
        targetClients: "all",
        dryRun: true,
        yes: false,
        json: false,
      },
      allDeps,
    );

    expect(dryRunResult.exitCode).toBe(0);
    expect(allDeps.prompt.selectCalls).toEqual([]);
    expect(dryRunResult.stdout?.data).toMatchObject({
      previews: [
        expect.objectContaining({ client: "codex" }),
        expect.objectContaining({ client: "cursor" }),
      ],
      confirmationMessage: expect.stringContaining("Dry run"),
    });

    const interactiveDeps = createCliDependencies({
      manifest: makePackageManifest(),
      adapters: [codex, cursor],
      environment: { GITHUB_TOKEN: "ghs_all_secret" },
      prompt: createPromptIoDouble({
        isInteractive: true,
        selectResponses: ["All detected clients"],
      }),
    });
    const interactiveResult = await planAddCommand(
      {
        identifier: "github",
        dryRun: false,
        yes: false,
        json: false,
      },
      interactiveDeps,
    );

    expect(interactiveResult.exitCode).toBe(0);
    expect(interactiveDeps.prompt.selectCalls).toHaveLength(1);
    expect(interactiveDeps.prompt.selectCalls[0]?.options).toEqual([
      "Codex",
      "Cursor",
      "All detected clients",
    ]);
    expect(interactiveResult.stdout?.data).toMatchObject({
      previews: [
        expect.objectContaining({ client: "codex" }),
        expect.objectContaining({ client: "cursor" }),
      ],
    });
  });

  it("fails deterministically when noninteractive client choice or required input is missing", async () => {
    const codex = createFakeAdapter({
      id: "codex",
      detection: createDetection("codex", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });
    const cursor = createFakeAdapter({
      id: "cursor",
      detection: createDetection("cursor", {
        installed: true,
        capabilities: ["native-add-stdio", "env-reference", "native-scope-user"],
      }),
    });

    const choiceFailure = await planAddCommand(
      {
        identifier: "github",
        dryRun: false,
        yes: false,
        json: false,
      },
      createCliDependencies({
        manifest: makePackageManifest(),
        adapters: [codex, cursor],
        environment: { GITHUB_TOKEN: "ghs_available" },
        prompt: createPromptIoDouble({ isInteractive: false }),
      }),
    );

    expect(choiceFailure.exitCode).toBe(1);
    expect(choiceFailure.stdout).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "REQUIRED_INPUT" }),
    });

    const inputFailure = await planAddCommand(
      {
        identifier: "github",
        targetClients: ["codex"],
        dryRun: false,
        yes: false,
        json: false,
      },
      createCliDependencies({
        manifest: makePackageManifest(),
        adapters: [codex],
        prompt: createPromptIoDouble({ isInteractive: false }),
      }),
    );

    expect(inputFailure.exitCode).toBe(1);
    expect(inputFailure.stdout).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "REQUIRED_INPUT" }),
    });
    expect(JSON.stringify(inputFailure.stdout)).not.toContain("ghs_available");
  });

  it("collects persisted secrets through masked input without exposing them in the preview", async () => {
    const adapter = createFakeAdapter({
      id: "vscode",
      detection: createDetection("vscode", {
        installed: true,
        capabilities: ["native-add-remote", "persisted-secret", "native-scope-user"],
      }),
    });
    const prompt = createPromptIoDouble({
      isInteractive: true,
      confirmResponses: [true],
      secretInputResponses: ["raw_persisted_secret"],
    });
    const deps = createCliDependencies({
      manifest: makeRemoteManifest({
        variants: [
          makeRemoteVariant({
            headers: [{ name: "Authorization", value: "Bearer {token}" }],
          }),
        ],
      }),
      adapters: [adapter],
      prompt,
    });

    const result = await planAddCommand(
      {
        identifier: "github",
        targetClients: ["vscode"],
        dryRun: true,
        yes: false,
        json: false,
      },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(prompt.inputCalls).toEqual([]);
    expect(prompt.secretInputCalls).toHaveLength(1);
    expect(JSON.stringify(result.stdout)).not.toContain("raw_persisted_secret");
  });

  it("blocks unsupported capability-gated remote variants without executing mutations", async () => {
    const codex = createFakeAdapter({
      id: "codex",
      detection: createDetection("codex", {
        installed: true,
        capabilities: ["native-add-stdio", "native-scope-user"],
      }),
    });
    const deps = createCliDependencies({
      manifest: makeRemoteManifest(),
      adapters: [codex],
    });

    const result = await planAddCommand(
      {
        identifier: "github",
        targetClients: ["codex"],
        dryRun: true,
        yes: false,
        json: false,
      },
      deps,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "UNSUPPORTED_CLIENT" }),
    });
    expect(codex.state.executeCalls.current).toBe(0);
    expect(codex.state.verifyCalls.current).toBe(0);
  });
});

function makePackageVariant(overrides: Partial<PackageVariant> = {}): PackageVariant {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "package",
    registryType: "npm",
    identifier: "@modelcontextprotocol/server-github",
    version: "1.2.3",
    runtimeHint: "npx",
    transport: "stdio",
    runtimeArguments: [],
    packageArguments: [],
    environmentVariables: [
      {
        name: "GITHUB_TOKEN",
        description: "GitHub API token",
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

function makeRemoteVariant(overrides: Partial<RemoteVariant> = {}): RemoteVariant {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "remote",
    transport: "streamable-http",
    urlTemplate: "https://example.com/mcp",
    headers: [],
    variables: [],
    ...overrides,
  };
}

function makePackageManifest(overrides: Partial<InstallManifestV1> = {}): InstallManifestV1 {
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
      "claude-code": "supported",
      codex: "supported",
      cursor: "supported",
      vscode: "supported",
    },
    ...overrides,
  };
}

function makeRemoteManifest(overrides: Partial<InstallManifestV1> = {}): InstallManifestV1 {
  return makePackageManifest({
    variants: [makeRemoteVariant()],
    ...overrides,
  });
}

function createDetection(id: ClientId, overrides: Partial<ClientDetection> = {}): ClientDetection {
  return {
    id,
    installed: false,
    capabilities: [],
    ...overrides,
  };
}

function createPromptIoDouble(options: {
  readonly isInteractive: boolean;
  readonly selectResponses?: readonly string[];
  readonly inputResponses?: readonly string[];
  readonly secretInputResponses?: readonly string[];
  readonly confirmResponses?: readonly boolean[];
}): PromptIoDouble {
  const selectResponses = [...(options.selectResponses ?? [])];
  const inputResponses = [...(options.inputResponses ?? [])];
  const secretInputResponses = [...(options.secretInputResponses ?? [])];
  const confirmResponses = [...(options.confirmResponses ?? [])];

  return {
    isInteractive: options.isInteractive,
    selectCalls: [],
    inputCalls: [],
    secretInputCalls: [],
    confirmCalls: [],
    async select<T extends string>(message: string, values: readonly T[]): Promise<T> {
      this.selectCalls.push({ message, options: values });
      const response = selectResponses.shift();
      if (response === undefined) {
        throw new Error(`Missing select response for: ${message}`);
      }
      return response as T;
    },
    async input(message: string): Promise<string> {
      this.inputCalls.push(message);
      const response = inputResponses.shift();
      if (response === undefined) {
        throw new Error(`Missing input response for: ${message}`);
      }
      return response;
    },
    async secretInput(message: string): Promise<string> {
      this.secretInputCalls.push(message);
      const response = secretInputResponses.shift();
      if (response === undefined) {
        throw new Error(`Missing secret input response for: ${message}`);
      }
      return response;
    },
    async confirm(message: string): Promise<boolean> {
      this.confirmCalls.push(message);
      const response = confirmResponses.shift();
      if (response === undefined) {
        throw new Error(`Missing confirm response for: ${message}`);
      }
      return response;
    },
  };
}

function createFakeAdapter(options: {
  readonly id: ClientId;
  readonly detection: ClientDetection;
}): McpClientAdapter & { readonly state: FakeAdapterState } {
  const state: FakeAdapterState = {
    detectCalls: { current: 0 },
    planCalls: [],
    executeCalls: { current: 0 },
    verifyCalls: { current: 0 },
  };
  const executable = `/opt/${options.id}`;

  return {
    id: options.id,
    state,
    async detect(): Promise<ClientDetection> {
      state.detectCalls.current += 1;
      return options.detection;
    },
    async inspect(): Promise<readonly []> {
      return [];
    },
    async planInstall(planOptions): Promise<InstallPlan> {
      state.planCalls.push({
        intent: planOptions.intent,
        inputs: planOptions.inputs,
        manifestHash: planOptions.manifestHash,
        intentHash: planOptions.intentHash,
        noninteractive: planOptions.noninteractive,
      });

      const requiredCapability: AdapterCapability =
        planOptions.intent.variant.kind === "remote" ? "native-add-remote" : "native-add-stdio";
      if (!options.detection.capabilities.includes(requiredCapability)) {
        throw new UnsupportedVariantError(
          "CLIENT_INCOMPATIBLE",
          options.id,
          `${options.id} is not compatible with ${requiredCapability}`,
        );
      }

      return {
        schemaVersion: 1,
        serverSlug: planOptions.intent.server.slug,
        client: options.id,
        scope: planOptions.intent.scope,
        variantId: planOptions.intent.variant.id,
        manifestHash: planOptions.manifestHash,
        intentHash: planOptions.intentHash,
        operations: [
          {
            type: "client-command",
            executable,
            args: [options.id, "mcp", "add", planOptions.intent.server.slug],
            capability: requiredCapability,
          },
        ],
        previewLines: [`Add ${planOptions.intent.server.title} to ${options.id}.`],
      };
    },
    async executePlan(): Promise<void> {
      state.executeCalls.current += 1;
    },
    async verifyInstall(plan: InstallPlan): Promise<InstallVerificationResult> {
      state.verifyCalls.current += 1;
      const firstOperation = plan.operations[0];
      const transport =
        firstOperation?.type === "client-command" &&
        firstOperation.capability === "native-add-remote"
          ? "streamable-http"
          : "stdio";
      return {
        ok: true,
        installedEntry: {
          name: plan.serverSlug,
          slug: plan.serverSlug,
          client: options.id,
          scope: plan.scope,
          transport,
          managedBy: "external",
          adapterMetadata: {},
        },
        message: `${plan.serverSlug} installed`,
      };
    },
    async planRemove(removeOptions): Promise<RemovalPlan> {
      return {
        schemaVersion: 1,
        serverSlug: removeOptions.slug,
        client: options.id,
        scope: removeOptions.scope ?? "user",
        operations: [],
        previewLines: [],
      };
    },
    async executeRemove(): Promise<void> {},
    async verifyRemove(plan: RemovalPlan): Promise<RemoveVerificationResult> {
      return { ok: true, message: `${plan.serverSlug} removed` };
    },
    async diagnose() {
      return { client: options.id, ok: true, issues: [] };
    },
    getSafetyDescriptor(): AdapterSafetyDescriptor {
      return {
        client: options.id,
        executableAllowList: [executable],
        configRoots: ["/tmp/mcpdir-tests"],
        supportedCapabilities: options.detection.capabilities,
      };
    },
  };
}

function createFakeAdapterRegistry(
  adapters: readonly (McpClientAdapter & { readonly state: FakeAdapterState })[],
): AdapterRegistry {
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));

  return {
    list(): readonly McpClientAdapter[] {
      return adapters;
    },
    get(id: ClientId): McpClientAdapter {
      const adapter = byId.get(id);
      if (!adapter) {
        throw new Error(`Missing fake adapter for ${id}`);
      }
      return adapter;
    },
    async detectAll(): Promise<readonly ClientDetection[]> {
      return await Promise.all(adapters.map(async (adapter) => await adapter.detect()));
    },
  };
}

function createCliDependencies(options: {
  readonly manifest: InstallManifestV1;
  readonly adapters: readonly (McpClientAdapter & { readonly state: FakeAdapterState })[];
  readonly prompt?: PromptIoDouble;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
}): CliDependencies & {
  readonly resolveInstallCalls: string[];
  readonly prompt: PromptIoDouble;
} {
  const resolveInstallCalls: string[] = [];
  const prompt = options.prompt ?? createPromptIoDouble({ isInteractive: false });
  const manifestResponse: InstallManifestResponse = {
    data: options.manifest,
    meta: { requestId: "req_add_plan_001" },
  };

  return {
    resolveInstallCalls,
    prompt,
    directoryClient: {
      resolveInstall: async (identifier: string) => {
        resolveInstallCalls.push(identifier);
        return manifestResponse;
      },
    } as unknown as CliDependencies["directoryClient"],
    adapterRegistry: createFakeAdapterRegistry(options.adapters),
    receiptStore: {
      async list() {
        return [];
      },
      async write() {},
      async remove() {},
      async find() {
        return null;
      },
    },
    promptIO: prompt,
    output: {
      writeStdout() {},
      writeStderr() {},
    },
    runtime: {
      apiBaseUrl: "http://127.0.0.1:3001/api/v1",
      requestTimeoutMs: 15_000,
    },
    environment: options.environment ?? {},
    clock: () => new Date("2026-09-03T12:00:00.000Z"),
  };
}
