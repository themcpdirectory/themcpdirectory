import type {
  AdapterRegistry,
  ClientDetection,
  McpClientAdapter,
} from "@themcpdirectory/client-adapters";
import type {
  AdapterCapability,
  AdapterSafetyDescriptor,
  ClientId,
  ClientScope,
  InstallPlan,
  ResolvedInstallIntent,
} from "@themcpdirectory/install-engine";
import { describe, expect, it } from "vitest";
import { executeAddCommand } from "../commands/add-execute.js";
import type { TargetInstallPreview } from "../commands/add-plan.js";
import type { InstallationReceipt, ReceiptStore } from "../config/receipt-store.js";
import type { CliDependencies } from "../dependencies.js";
import { renderHumanEnvelope } from "../output/render.js";

const CLIENTS = ["codex", "cursor", "vscode"] as const;

describe("executeAddCommand", () => {
  it("executes sequentially, writes verified receipts, and stops with concrete recovery", async () => {
    const calls: string[] = [];
    const receipts: InstallationReceipt[] = [];
    const adapters = CLIENTS.map((client) => createAdapter(client, calls, client !== "cursor"));
    const previews = CLIENTS.map((client) => createPreview(client));

    const result = await executeAddCommand(
      previews,
      createDependencies(adapters, createReceiptStore(receipts, calls)),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatchObject({
      ok: false,
      error: { code: "VERIFICATION_FAILED" },
      data: {
        exitCode: 1,
        targets: [
          {
            client: "codex",
            scope: "user",
            status: "installed",
            verificationMessage: "github verified in codex",
            receiptWritten: true,
            recoveryHint: expect.stringContaining("mcpdir remove github --to codex --scope user"),
          },
          {
            client: "cursor",
            scope: "user",
            status: "failed",
            receiptWritten: false,
            recoveryHint: expect.stringContaining("mcpdir remove github --to cursor --scope user"),
          },
          {
            client: "vscode",
            scope: "user",
            status: "skipped",
            receiptWritten: false,
            recoveryHint: expect.stringContaining("mcpdir add github --to vscode --scope user"),
          },
        ],
      },
    });
    expect(calls).toEqual([
      "execute:codex",
      "verify:codex",
      "receipt:codex",
      "execute:cursor",
      "verify:cursor",
    ]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      slug: "github",
      client: "codex",
      scope: "user",
      serverVersion: "1.2.3",
      variantId: "11111111-1111-4111-8111-111111111111",
      manifestHash: "a".repeat(64),
      installedAt: "2026-09-01T12:00:00.000Z",
      adapterFingerprint: "codex@1.2.3",
    });
    expect(renderHumanEnvelope(result.stdout!)).toEqual([
      "codex (user): installed",
      "  Verification: github verified in codex",
      "  Recovery: Remove this target with: mcpdir remove github --to codex --scope user",
      "cursor (user): failed",
      "  Verification: github verified in cursor",
      "  Recovery: Retry with: mcpdir add github --to cursor --scope user. If client configuration changed, remove it with: mcpdir remove github --to cursor --scope user",
      "vscode (user): skipped",
      "  Verification: Not attempted because an earlier target failed.",
      "  Recovery: Retry with: mcpdir add github --to vscode --scope user",
    ]);

    const preflightCalls: string[] = [];
    const preflightAdapters = CLIENTS.map((client) => createAdapter(client, preflightCalls, true));
    const malformedPreviews = CLIENTS.map((client) => createPreview(client));
    malformedPreviews[1] = {
      ...malformedPreviews[1]!,
      plan: {
        ...malformedPreviews[1]!.plan,
        operations: [
          {
            type: "client-command",
            executable: "/not-allowed/cursor",
            args: ["mcp", "add", "github"],
            capability: "native-add-stdio",
          },
        ],
      },
    };

    const preflightResult = await executeAddCommand(
      malformedPreviews,
      createDependencies(preflightAdapters, createReceiptStore([], preflightCalls)),
    );

    expect(preflightResult.exitCode).toBe(1);
    expect(preflightResult.stdout).toMatchObject({
      error: { code: "UNSAFE_CONFIGURATION" },
      data: {
        targets: [
          { client: "codex", status: "skipped" },
          {
            client: "cursor",
            status: "failed",
            recoveryHint: expect.stringContaining("mcpdir add github --to cursor --scope user"),
          },
          { client: "vscode", status: "skipped" },
        ],
      },
    });
    expect(preflightCalls).toEqual([]);
  });
});

function createPreview(client: ClientId, scope: ClientScope = "user"): TargetInstallPreview {
  const capability: AdapterCapability = "native-add-stdio";
  const detection: ClientDetection = {
    id: client,
    installed: true,
    executable: `/opt/${client}`,
    version: "1.2.3",
    capabilities: [capability, "native-scope-user"],
  };
  const intent: ResolvedInstallIntent = {
    schemaVersion: 1,
    server: { slug: "github", title: "GitHub", version: "1.2.3" },
    client,
    scope,
    variant: {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "package",
      registryType: "npm",
      identifier: "@example/github-mcp",
      version: "1.2.3",
      runtimeHint: "npx",
      transport: "stdio",
      runtimeArguments: [],
      packageArguments: [],
      environmentVariables: [],
      integrity: null,
    },
    warnings: [],
    inputs: [],
    remoteAuth: { kind: "none" },
    requiredEnvReferences: [],
  };
  const plan: InstallPlan = {
    schemaVersion: 1,
    serverSlug: "github",
    client,
    scope,
    variantId: intent.variant.id,
    manifestHash: "a".repeat(64),
    intentHash: "b".repeat(64),
    operations: [
      {
        type: "client-command",
        executable: `/opt/${client}`,
        args: ["mcp", "add", "github"],
        capability,
      },
    ],
    previewLines: [`Install github in ${client}.`],
  };

  return { client, scope, detection, intent, plan, warnings: [], inputSummary: [] };
}

function createAdapter(
  client: ClientId,
  calls: string[],
  verificationOk: boolean,
): McpClientAdapter {
  const safety: AdapterSafetyDescriptor = {
    client,
    executableAllowList: [`/opt/${client}`],
    configRoots: ["/tmp/mcpdir-tests"],
    supportedCapabilities: ["native-add-stdio", "native-scope-user"],
  };

  return {
    id: client,
    async detect() {
      throw new Error("not used");
    },
    async inspect() {
      throw new Error("not used");
    },
    async planInstall() {
      throw new Error("not used");
    },
    async executePlan() {
      calls.push(`execute:${client}`);
    },
    async verifyInstall(plan) {
      calls.push(`verify:${client}`);
      return { ok: verificationOk, message: `${plan.serverSlug} verified in ${client}` };
    },
    async planRemove() {
      throw new Error("not used");
    },
    async executeRemove() {
      throw new Error("not used");
    },
    async verifyRemove() {
      throw new Error("not used");
    },
    async diagnose() {
      throw new Error("not used");
    },
    getSafetyDescriptor() {
      return safety;
    },
  };
}

function createReceiptStore(receipts: InstallationReceipt[], calls: string[]): ReceiptStore {
  return {
    async list() {
      return receipts;
    },
    async write(receipt) {
      calls.push(`receipt:${receipt.client}`);
      receipts.push(receipt);
    },
    async remove() {},
    async find() {
      return null;
    },
  };
}

function createDependencies(
  adapters: readonly McpClientAdapter[],
  receiptStore: ReceiptStore,
): CliDependencies {
  const byClient = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const adapterRegistry: AdapterRegistry = {
    list: () => adapters,
    get(client) {
      const adapter = byClient.get(client);
      if (!adapter) {
        throw new Error(`Missing adapter: ${client}`);
      }
      return adapter;
    },
    async detectAll() {
      return [];
    },
  };

  return {
    adapterRegistry,
    receiptStore,
    clock: () => new Date("2026-09-01T12:00:00.000Z"),
  } as CliDependencies;
}
