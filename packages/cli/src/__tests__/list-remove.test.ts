import { describe, expect, it } from "vitest";
import type {
  AdapterRegistry,
  InstalledMcpServer,
  McpClientAdapter,
} from "@themcpdirectory/client-adapters";
import type {
  AdapterSafetyDescriptor,
  ClientId,
  ClientScope,
  RemovalPlan,
} from "@themcpdirectory/install-engine";
import { runListCommand } from "../commands/list.js";
import { runRemoveCommand } from "../commands/remove.js";
import type { InstallationReceipt, ReceiptStore } from "../config/receipt-store.js";
import { runCli } from "../cli.js";
import type { CliDependencies } from "../dependencies.js";
import { serializeJsonEnvelope } from "../output/json.js";
import { renderHumanEnvelope } from "../output/render.js";

const receipt: InstallationReceipt = {
  schemaVersion: 1,
  slug: "github",
  client: "codex",
  scope: "user",
  serverVersion: "1.2.3",
  variantId: "11111111-1111-4111-8111-111111111111",
  manifestHash: "a".repeat(64),
  installedAt: "2026-09-01T12:00:00.000Z",
  adapterFingerprint: "codex@1.2.3",
};

function installed(slug: string, client: ClientId, scope: ClientScope): InstalledMcpServer {
  return {
    name: slug,
    slug,
    client,
    scope,
    transport: "stdio",
    managedBy: "external",
    adapterMetadata: {},
  };
}

describe("list and remove commands", () => {
  it("merges ownership and removes only one confirmed, verified target", async () => {
    const calls: string[] = [];
    const entries = [
      installed("github", "codex", "user"),
      installed("\u001b[31m\u061c\u200e\u200fstripe", "cursor", "project"),
    ];
    const receipts = [receipt];
    const verification = new Map<ClientId, boolean | "throw">([
      ["codex", true],
      ["cursor", true],
    ]);
    const deps = createDependencies(entries, receipts, calls, verification);

    const listResult = await runListCommand([], deps);
    expect(listResult.stdout?.data).toEqual([
      {
        name: "github",
        slug: "github",
        client: "codex",
        scope: "user",
        transport: "stdio",
        managedBy: "mcpdir",
        variantId: receipt.variantId,
        manifestHash: receipt.manifestHash,
      },
      {
        name: "\u001b[31m\u061c\u200e\u200fstripe",
        slug: "\u001b[31m\u061c\u200e\u200fstripe",
        client: "cursor",
        scope: "project",
        transport: "stdio",
        managedBy: "external",
      },
    ]);
    expect(renderHumanEnvelope(listResult.stdout!)).toEqual([
      "github (codex, user) - Directory-managed",
      "?[31m???stripe (cursor, project) - external",
    ]);
    const serializedList = serializeJsonEnvelope(listResult.stdout!);
    expect(serializedList).not.toMatch(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u);
    expect(JSON.parse(serializedList)).toEqual(listResult.stdout);

    const removed = await runRemoveCommand(
      {
        slug: "github",
        yes: false,
        dryRun: false,
        json: false,
      },
      deps,
    );
    expect(removed).toMatchObject({
      exitCode: 0,
      stdout: {
        ok: true,
        data: {
          slug: "github",
          client: "codex",
          scope: "user",
          status: "removed",
          receiptFound: true,
          receiptRemoved: true,
        },
      },
    });
    expect(calls).toEqual([
      "plan:codex:user:github",
      "confirm:Remove github from codex user scope.",
      "execute:codex:user:github",
      "verify:codex:user:github",
      "receipt-remove:codex:user:github",
    ]);
    expect(receipts).toEqual([]);

    entries.push(installed("github", "cursor", "project"));
    calls.length = 0;
    const ambiguous = await runRemoveCommand(
      { slug: "github", yes: true, dryRun: false, json: true },
      deps,
    );
    expect(ambiguous).toMatchObject({
      exitCode: 2,
      stdout: {
        ok: false,
        error: { code: "REMOVAL_TARGET_AMBIGUOUS" },
        data: {
          slug: "github",
          status: "ambiguous",
          availableTargets: [
            { client: "codex", scope: "user", managedBy: "external", receiptFound: false },
            { client: "cursor", scope: "project", managedBy: "external", receiptFound: false },
          ],
        },
      },
    });
    expect(calls).toEqual([]);

    const explicit = await runRemoveCommand(
      {
        slug: "github",
        targetClient: "cursor",
        scope: "project",
        yes: true,
        dryRun: true,
        json: true,
      },
      deps,
    );
    expect(explicit.stdout?.data).toMatchObject({
      client: "cursor",
      scope: "project",
      status: "skipped",
      executionMessage: "Dry run plan: Remove github from cursor project scope.",
      receiptRemoved: false,
    });
    expect(calls).toEqual(["plan:cursor:project:github"]);

    calls.length = 0;
    const absent = await runRemoveCommand(
      { slug: "missing", yes: true, dryRun: false, json: true },
      deps,
    );
    expect(absent).toMatchObject({
      exitCode: 0,
      stdout: {
        data: { slug: "missing", status: "not_installed", availableTargets: [] },
      },
    });
    expect(calls).toEqual([]);

    receipts.push({ ...receipt, client: "cursor", scope: "project" });
    verification.set("cursor", false);
    calls.length = 0;
    const failedVerification = await runRemoveCommand(
      {
        slug: "github",
        targetClient: "cursor",
        scope: "project",
        yes: true,
        dryRun: false,
        json: true,
      },
      deps,
    );
    expect(failedVerification).toMatchObject({
      exitCode: 1,
      stdout: {
        ok: false,
        error: { code: "VERIFICATION_FAILED" },
        data: {
          status: "failed",
          receiptFound: true,
          receiptRemoved: false,
          recoveryHint: expect.stringContaining("github --to cursor --scope project"),
        },
      },
    });
    expect(receipts).toHaveLength(1);
    expect(calls).toEqual([
      "plan:cursor:project:github",
      "execute:cursor:project:github",
      "verify:cursor:project:github",
    ]);

    verification.set("cursor", true);
    calls.length = 0;
    const receiptCleanupDeps: CliDependencies = {
      ...deps,
      receiptStore: {
        ...deps.receiptStore,
        async remove(key) {
          calls.push(`receipt-remove:${key.client}:${key.scope}:${key.slug}`);
          throw new Error("Receipt state is read-only");
        },
      },
    };
    const failedReceiptCleanup = await runRemoveCommand(
      {
        slug: "github",
        targetClient: "cursor",
        scope: "project",
        yes: true,
        dryRun: false,
        json: true,
      },
      receiptCleanupDeps,
    );
    expect(failedReceiptCleanup).toMatchObject({
      exitCode: 1,
      stdout: {
        ok: false,
        error: { code: "RECEIPT_CLEANUP_FAILED" },
        data: {
          status: "failed",
          receiptFound: true,
          receiptRemoved: false,
          recoveryHint: expect.stringContaining("github --to cursor --scope project"),
        },
      },
    });
    expect(receipts).toHaveLength(1);
    expect(calls).toEqual([
      "plan:cursor:project:github",
      "execute:cursor:project:github",
      "verify:cursor:project:github",
      "receipt-remove:cursor:project:github",
    ]);

    calls.length = 0;
    const failedConfirmation = await runRemoveCommand(
      {
        slug: "github",
        targetClient: "cursor",
        scope: "project",
        yes: false,
        dryRun: false,
        json: true,
      },
      {
        ...deps,
        promptIO: {
          ...deps.promptIO,
          isInteractive: true,
          async confirm() {
            throw new Error("Confirmation input closed");
          },
        },
      },
    );
    expect(failedConfirmation).toMatchObject({
      exitCode: 1,
      stdout: {
        ok: false,
        error: { code: "COMMAND_FAILED" },
        data: {
          executionMessage: "Removal confirmation failed before mutation.",
          recoveryHint: expect.stringContaining("github --to cursor --scope project --yes"),
        },
      },
    });
    expect(calls).toEqual(["plan:cursor:project:github"]);

    const helpOutput: string[] = [];
    const helpDeps: CliDependencies = {
      ...deps,
      output: {
        writeStdout(value) {
          helpOutput.push(value);
        },
        writeStderr(value) {
          helpOutput.push(value);
        },
      },
    };
    await expect(runCli(["remove", "--help"], helpDeps)).resolves.toBe(0);
    expect(helpOutput).toEqual([
      "Usage: mcpdir remove <slug> [--to <client>] [--scope <user|project|global>] [--yes] [--dry-run] [--json]\n",
    ]);
  });
});

function createAdapter(
  client: ClientId,
  entries: InstalledMcpServer[],
  calls: string[],
  verification: ReadonlyMap<ClientId, boolean | "throw">,
): McpClientAdapter {
  const supportedScope = client === "cursor" ? "project" : "user";
  const safety: AdapterSafetyDescriptor = {
    client,
    executableAllowList: [`/opt/${client}`],
    configRoots: ["/tmp/mcpdir-tests"],
    supportedCapabilities: ["native-remove", `native-scope-${supportedScope}`],
  };
  let detected = false;

  return {
    id: client,
    inspectionSafety: "configuration-only",
    async detect() {
      detected = true;
      return {
        id: client,
        installed: true,
        executable: `/opt/${client}`,
        version: "1.2.3",
        capabilities: safety.supportedCapabilities,
      };
    },
    async inspect(scope) {
      return entries.filter((entry) => entry.client === client && entry.scope === scope);
    },
    async planInstall() {
      throw new Error("not used");
    },
    async executePlan() {
      throw new Error("not used");
    },
    async verifyInstall() {
      throw new Error("not used");
    },
    async planRemove(options) {
      const scope = options.scope ?? supportedScope;
      calls.push(`plan:${client}:${scope}:${options.slug}`);
      return removalPlan(client, scope, options.slug);
    },
    async executeRemove(plan) {
      calls.push(`execute:${client}:${plan.scope}:${plan.serverSlug}`);
    },
    async verifyRemove(plan) {
      calls.push(`verify:${client}:${plan.scope}:${plan.serverSlug}`);
      const ok = verification.get(client) ?? true;
      if (ok === "throw") {
        throw new Error("Removal verification probe failed");
      }
      return { ok, message: ok ? "Removal verified." : "Server is still installed." };
    },
    async diagnose() {
      throw new Error("not used");
    },
    getSafetyDescriptor() {
      return detected ? safety : { ...safety, supportedCapabilities: [] };
    },
  };
}

function removalPlan(client: ClientId, scope: ClientScope, slug: string): RemovalPlan {
  return {
    schemaVersion: 1,
    serverSlug: slug,
    client,
    scope,
    operations: [
      {
        type: "client-command",
        executable: `/opt/${client}`,
        args: ["mcp", "remove", slug],
        capability: "native-remove",
      },
    ],
    previewLines: [`Remove ${slug} from ${client} ${scope} scope.`],
  };
}

function createDependencies(
  entries: InstalledMcpServer[],
  receipts: InstallationReceipt[],
  calls: string[],
  verification: ReadonlyMap<ClientId, boolean | "throw">,
): CliDependencies {
  const adapters = [
    createAdapter("codex", entries, calls, verification),
    createAdapter("cursor", entries, calls, verification),
  ];
  const adapterRegistry: AdapterRegistry = {
    list: () => adapters,
    get(client) {
      const adapter = adapters.find((candidate) => candidate.id === client);
      if (!adapter) {
        throw new Error(`Missing adapter: ${client}`);
      }
      return adapter;
    },
    async detectAll() {
      return [];
    },
  };
  const receiptStore: ReceiptStore = {
    async list() {
      return receipts;
    },
    async write() {
      throw new Error("not used");
    },
    async remove(key) {
      calls.push(`receipt-remove:${key.client}:${key.scope}:${key.slug}`);
      const index = receipts.findIndex(
        (candidate) =>
          candidate.slug === key.slug &&
          candidate.client === key.client &&
          candidate.scope === key.scope,
      );
      if (index >= 0) {
        receipts.splice(index, 1);
      }
    },
    async find(key) {
      return (
        receipts.find(
          (candidate) =>
            candidate.slug === key.slug &&
            candidate.client === key.client &&
            candidate.scope === key.scope,
        ) ?? null
      );
    },
  };

  return {
    adapterRegistry,
    receiptStore,
    promptIO: {
      isInteractive: true,
      async confirm(message) {
        calls.push(`confirm:${message}`);
        return true;
      },
    },
  } as CliDependencies;
}
