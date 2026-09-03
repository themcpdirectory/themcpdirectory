import type {
  InstallManifestV1,
  ServerCollectionResponse,
  ServerDetailResponse,
} from "@themcpdirectory/api-contract";
import { createAdapterRegistry, type McpClientAdapter } from "@themcpdirectory/client-adapters";
import type {
  AdapterSafetyDescriptor,
  InstallPlan,
  RemovalPlan,
} from "@themcpdirectory/install-engine";
import { createInProcessCliHarness } from "@themcpdirectory/test-utils";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import type { CliDependencies } from "../dependencies.js";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";

describe("integrated CLI", () => {
  it("routes the complete read, install, maintenance, diagnosis, and removal workflow", async () => {
    let currentVersion = "1.2.3";
    let configuredPlan: InstallPlan | null = null;
    const calls: string[] = [];
    const adapter = createStatefulAdapter(
      calls,
      () => configuredPlan,
      (plan) => {
        configuredPlan = plan;
      },
    );
    const directoryClient = {
      async searchServers() {
        return searchResponse(currentVersion);
      },
      async getServer() {
        return infoResponse(currentVersion);
      },
      async resolveInstall() {
        return { data: installManifest(currentVersion), meta: { requestId: "req_install" } };
      },
      async listClients() {
        return { data: [], meta: { requestId: "req_clients" } };
      },
    } as unknown as CliDependencies["directoryClient"];
    const harness = createInProcessCliHarness<CliDependencies>({
      directoryClient,
      adapterRegistry: createAdapterRegistry([adapter]),
    });

    const search = await runCaptured(["search", "github", "--json"], harness);
    expect(search).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('"command":"search"'),
    });

    const info = await runCaptured(["info", "github"], harness);
    expect(info).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("GitHub MCP (github)"),
    });

    const add = await runCaptured(["add", "github", "--to", "codex", "--yes"], harness);
    expect(add).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("codex (user): installed"),
    });

    const list = await runCaptured(["list"], harness);
    expect(list).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Directory-managed"),
    });

    currentVersion = "1.2.4";
    const update = await runCaptured(["update", "github", "--to", "codex", "--yes"], harness);
    expect(update).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("1.2.3 -> 1.2.4"),
    });

    const doctor = await runCaptured(["doctor"], harness);
    expect(doctor).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("OK: Directory API"),
    });

    const remove = await runCaptured(
      ["remove", "github", "--to", "codex", "--scope", "user", "--yes"],
      harness,
    );
    expect(remove).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("github (codex, user): removed"),
    });

    const emptyList = await runCaptured(["list"], harness);
    expect(emptyList).toMatchObject({ exitCode: 0, stdout: "No installed MCP servers found.\n" });
    expect(calls).toEqual(["install:1.2.3", "install:1.2.4", "remove:github"]);
  });
});

interface CapturedHarness {
  readonly deps: CliDependencies;
  readonly stdout: string[];
  readonly stderr: string[];
}

async function runCaptured(argv: readonly string[], harness: CapturedHarness) {
  const stdoutStart = harness.stdout.length;
  const stderrStart = harness.stderr.length;
  const exitCode = await runCli(argv, harness.deps);
  return {
    exitCode,
    stdout: harness.stdout.slice(stdoutStart).join(""),
    stderr: harness.stderr.slice(stderrStart).join(""),
  };
}

function createStatefulAdapter(
  calls: string[],
  getConfiguredPlan: () => InstallPlan | null,
  setConfiguredPlan: (plan: InstallPlan | null) => void,
): McpClientAdapter {
  const executable = "/opt/codex";
  const safety: AdapterSafetyDescriptor = {
    client: "codex",
    executableAllowList: [executable],
    configRoots: ["/tmp/mcpdir-integration"],
    supportedCapabilities: ["native-add-stdio", "native-remove", "native-scope-user"],
  };

  return {
    id: "codex",
    inspectionSafety: "configuration-only",
    async detect() {
      return {
        id: "codex",
        installed: true,
        executable,
        version: "1.0.0",
        capabilities: safety.supportedCapabilities,
      };
    },
    async inspect() {
      const plan = getConfiguredPlan();
      return plan
        ? [
            {
              name: plan.serverSlug,
              slug: plan.serverSlug,
              client: "codex",
              scope: plan.scope,
              transport: "stdio",
              managedBy: "external",
              variantId: plan.variantId,
              manifestHash: plan.manifestHash,
              adapterMetadata: {},
            },
          ]
        : [];
    },
    async planInstall(options) {
      return {
        schemaVersion: 1,
        serverSlug: options.intent.server.slug,
        client: "codex",
        scope: options.intent.scope,
        variantId: options.intent.variant.id,
        manifestHash: options.manifestHash,
        intentHash: options.intentHash,
        operations: [
          {
            type: "client-command",
            executable,
            args: [
              "mcp",
              "add",
              options.intent.server.slug,
              options.intent.server.version ?? "unversioned",
            ],
            capability: "native-add-stdio",
          },
        ],
        previewLines: [`Install ${options.intent.server.slug} ${options.intent.server.version}.`],
      };
    },
    async executePlan(plan) {
      const operation = plan.operations[0];
      calls.push(`install:${operation?.type === "client-command" ? operation.args[3] : "unknown"}`);
      setConfiguredPlan(plan);
    },
    async verifyInstall(plan) {
      return { ok: true, message: `${plan.serverSlug} installed` };
    },
    async planRemove(options): Promise<RemovalPlan> {
      return {
        schemaVersion: 1,
        serverSlug: options.slug,
        client: "codex",
        scope: options.scope ?? "user",
        operations: [
          {
            type: "client-command",
            executable,
            args: ["mcp", "remove", options.slug],
            capability: "native-remove",
          },
        ],
        previewLines: [`Remove ${options.slug}.`],
      };
    },
    async executeRemove(plan) {
      calls.push(`remove:${plan.serverSlug}`);
      setConfiguredPlan(null);
    },
    async verifyRemove(plan) {
      return { ok: getConfiguredPlan() === null, message: `${plan.serverSlug} removed` };
    },
    async diagnose() {
      return { client: "codex", ok: true, issues: [] };
    },
    getSafetyDescriptor() {
      return safety;
    },
  };
}

function installManifest(version: string): InstallManifestV1 {
  return {
    schemaVersion: 1,
    server: {
      id: "6c82758f-ec36-40f8-9a86-88d9f5410c4a",
      slug: "github",
      title: "GitHub MCP",
      version,
    },
    provenance: {
      registry: "registry.modelcontextprotocol.io",
      registryName: "MCP Registry",
      observedAt: "2026-09-01T00:00:00Z",
    },
    variants: [
      {
        id: VARIANT_ID,
        kind: "package",
        registryType: "npm",
        identifier: "@github/mcp-server",
        version,
        runtimeHint: "npx",
        transport: "stdio",
        runtimeArguments: [],
        packageArguments: [],
        environmentVariables: [],
        integrity: {
          algorithm: "sha256",
          digest: version === "1.2.3" ? "a".repeat(64) : "b".repeat(64),
        },
      },
    ],
    compatibility: {
      "claude-code": "supported",
      codex: "supported",
      cursor: "supported",
      vscode: "supported",
    },
  };
}

function searchResponse(version: string): ServerCollectionResponse {
  return {
    data: [
      {
        id: "6c82758f-ec36-40f8-9a86-88d9f5410c4a",
        slug: "github",
        title: "GitHub MCP",
        description: "GitHub tools.",
        publisher: { slug: "github", name: "GitHub", verified: true },
        version,
        repository: { url: "https://github.com/github/github-mcp-server" },
        listingStatus: "active",
        signals: {
          officialRegistry: true,
          publisherVerified: true,
          sourceAvailable: true,
          openSource: true,
        },
      },
    ],
    meta: { requestId: "req_search", nextCursor: null },
  };
}

function infoResponse(version: string): ServerDetailResponse {
  return {
    data: {
      id: "6c82758f-ec36-40f8-9a86-88d9f5410c4a",
      slug: "github",
      title: "GitHub MCP",
      shortDescription: "GitHub tools.",
      longDescription: "Tools for GitHub workflows.",
      listingStatus: "active",
      aliases: ["gh"],
      publisher: { slug: "github", name: "GitHub", verified: true },
      repository: { url: "https://github.com/github/github-mcp-server" },
      version,
      categories: [{ slug: "developer-tools", name: "Developer Tools" }],
      packages: [
        {
          id: VARIANT_ID,
          registryType: "npm",
          identifier: "@github/mcp-server",
          version,
          runtimeHint: "npx",
          transport: "stdio",
          runtimeArguments: [],
          packageArguments: [],
          environmentVariables: [],
        },
      ],
      remotes: [],
      compatibility: {
        "claude-code": "supported",
        codex: "supported",
        cursor: "supported",
        vscode: "supported",
      },
      trustProfile: {
        officialRegistry: true,
        publisherVerified: true,
        sourceAvailable: true,
        openSource: true,
        signals: [],
      },
      timestamps: {
        firstSeenAt: "2026-08-01T00:00:00Z",
        lastSeenAt: "2026-09-01T00:00:00Z",
        publishedAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    },
    meta: { requestId: "req_info" },
  };
}
