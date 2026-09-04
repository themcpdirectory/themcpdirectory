import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import type { ClientId, InstallPlan, ResolvedInstallIntent } from "@themcpdirectory/install-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetInstallPreview } from "../commands/add-plan.js";
import type { InstallationReceipt } from "../config/receipt-store.js";
import type { CliDependencies } from "../dependencies.js";
import { runCli } from "../cli.js";
import { renderHumanEnvelope } from "../output/render.js";

const mocks = vi.hoisted(() => ({
  planAddCommand: vi.fn(),
  executeAddCommand: vi.fn(),
}));

vi.mock("../commands/add-plan.js", () => ({ planAddCommand: mocks.planAddCommand }));
vi.mock("../commands/add-execute.js", () => ({ executeAddCommand: mocks.executeAddCommand }));

import { runUpdateCommand } from "../commands/update.js";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
type PackageVariant = Extract<InstallManifestV1["variants"][number], { kind: "package" }>;

function receipt(slug: string, client: ClientId): InstallationReceipt {
  return {
    schemaVersion: 1,
    slug,
    client,
    scope: "user",
    serverVersion: "1.0.0-beta.1+old",
    variantId: VARIANT_ID,
    manifestHash: "a".repeat(64),
    installedAt: "2026-09-01T12:00:00.000Z",
    adapterFingerprint: `${client}@1.0.0`,
  };
}

function preview(slug: string, client: ClientId, version: string): TargetInstallPreview {
  const variant: PackageVariant = {
    id: VARIANT_ID,
    kind: "package",
    registryType: "npm",
    identifier: `@example/${slug}`,
    version,
    runtimeHint: "npx",
    transport: "stdio",
    runtimeArguments: [],
    packageArguments: [],
    environmentVariables: [],
    integrity: null,
  };
  const intent: ResolvedInstallIntent = {
    schemaVersion: 1,
    server: { slug, title: slug, version },
    client,
    scope: "user",
    variant,
    warnings: [],
    inputs: [],
    remoteAuth: { kind: "none" },
    requiredEnvReferences: [],
  };
  const plan: InstallPlan = {
    schemaVersion: 1,
    serverSlug: slug,
    client,
    scope: "user",
    variantId: VARIANT_ID,
    manifestHash: "b".repeat(64),
    intentHash: "c".repeat(64),
    operations: [],
    previewLines: [`Update ${slug} in ${client}.\u001b[31m`],
  };
  return {
    client,
    scope: "user",
    detection: { id: client, installed: true, capabilities: [] },
    intent,
    plan,
    warnings: [],
    inputSummary: [],
  };
}

function dependencies(
  receipts: InstallationReceipt[],
  confirmations: boolean[] = [],
  deletedSlugs: readonly string[] = [],
): CliDependencies & {
  readonly stdoutLines: string[];
  readonly confirmationMessages: string[];
} {
  const stdoutLines: string[] = [];
  const confirmationMessages: string[] = [];
  return {
    stdoutLines,
    confirmationMessages,
    directoryClient: {
      async getServer(slug: string) {
        return {
          data: {
            listingStatus: deletedSlugs.includes(slug) ? "deleted_upstream" : "active",
          },
          meta: { requestId: `req_${slug}` },
        };
      },
    } as unknown as CliDependencies["directoryClient"],
    receiptStore: {
      async list() {
        return receipts;
      },
      async write(next: InstallationReceipt) {
        const index = receipts.findIndex(
          (current) =>
            current.slug === next.slug &&
            current.client === next.client &&
            current.scope === next.scope,
        );
        if (index >= 0) receipts[index] = next;
        else receipts.push(next);
      },
      async remove() {},
      async find() {
        return null;
      },
    },
    promptIO: {
      isInteractive: true,
      async confirm(message: string) {
        confirmationMessages.push(message);
        return confirmations.shift() ?? true;
      },
      async select() {
        throw new Error("not used");
      },
      async input() {
        throw new Error("not used");
      },
      async secretInput() {
        throw new Error("not used");
      },
    },
    output: {
      writeStdout(value: string) {
        stdoutLines.push(value);
      },
      writeStderr() {},
    },
  } as unknown as CliDependencies & {
    readonly stdoutLines: string[];
    readonly confirmationMessages: string[];
  };
}

describe("runUpdateCommand", () => {
  beforeEach(() => {
    mocks.planAddCommand.mockReset();
    mocks.executeAddCommand.mockReset();
  });

  it("plans all managed diffs before confirmed execution and reports dry runs and partial failures", async () => {
    const receipts = [receipt("github", "codex"), receipt("playwright", "cursor")];
    mocks.planAddCommand.mockImplementation(
      async (options: { identifier: string; targetClients: readonly ClientId[] }) => {
        const target = preview(options.identifier, options.targetClients[0]!, "1.0.0-rc.1+build.7");
        const warnings =
          options.identifier === "github"
            ? ["Latest remote health: degraded (checked 2026-09-03T11:55:00.000Z)."]
            : [];
        return {
          exitCode: 0,
          stdout: {
            schemaVersion: 1,
            command: "add",
            ok: true,
            data: { previews: [target], confirmationMessage: "unused" },
            warnings,
          },
          stderrLines: [],
          warnings,
        };
      },
    );

    const dryRun = await runUpdateCommand(
      { identifier: "github", yes: false, dryRun: true, json: true },
      dependencies(receipts),
    );
    expect(dryRun).toMatchObject({
      exitCode: 0,
      stdout: {
        data: {
          exitCode: 0,
          updated: [],
          skipped: [
            expect.stringContaining("Server version: 1.0.0-beta.1+old -> 1.0.0-rc.1+build.7"),
          ],
        },
      },
    });
    expect(mocks.executeAddCommand).not.toHaveBeenCalled();
    expect(dryRun.warnings).toEqual([
      "Latest remote health: degraded (checked 2026-09-03T11:55:00.000Z).",
    ]);
    expect(renderHumanEnvelope(dryRun.stdout!)).toEqual([
      expect.stringContaining("github (codex, user): dry run."),
      "Warning: Latest remote health: degraded (checked 2026-09-03T11:55:00.000Z).",
    ]);
    expect(mocks.planAddCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        identifier: "github",
        targetClients: ["codex"],
        requestedScope: "user",
        requestedVariantId: VARIANT_ID,
      }),
      expect.anything(),
    );

    mocks.executeAddCommand.mockImplementation(
      async (targets: readonly TargetInstallPreview[], deps: CliDependencies) => {
        const target = targets[0];
        if (!target) throw new Error("Expected one update target");
        const ok = target.client === "codex";
        if (ok) {
          await deps.receiptStore.write({
            ...receipt(target.intent.server.slug, target.client),
            serverVersion: target.intent.server.version!,
            manifestHash: target.plan.manifestHash,
          });
        }
        const result = {
          client: target.client,
          scope: target.scope,
          status: ok ? "installed" : "failed",
          verificationMessage: ok ? "Update verified." : "Update verification failed.",
          receiptWritten: ok,
          recoveryHint: `Retry ${target.intent.server.slug}.`,
        } as const;
        return {
          exitCode: ok ? 0 : 1,
          stdout: {
            schemaVersion: 1,
            command: "add",
            ok,
            data: { exitCode: ok ? 0 : 1, targets: [result] },
            ...(ok ? {} : { error: { code: "VERIFICATION_FAILED", message: "Update failed." } }),
            warnings: [],
          },
          stderrLines: ok ? [] : ["Update failed."],
          warnings: [],
        };
      },
    );

    const updateDeps = dependencies(receipts, [true]);
    const updated = await runUpdateCommand(
      { targetClients: ["codex", "cursor"], yes: false, dryRun: false, json: true },
      updateDeps,
    );
    expect(updated).toMatchObject({
      exitCode: 1,
      stdout: {
        ok: false,
        error: { code: "VERIFICATION_FAILED" },
        data: {
          exitCode: 1,
          updated: [
            {
              client: "codex",
              status: "installed",
              verificationMessage: expect.stringContaining(
                "Package version: unknown in receipt schema v1 -> 1.0.0-rc.1+build.7",
              ),
            },
            { client: "cursor", status: "failed" },
          ],
        },
      },
    });
    expect(mocks.planAddCommand).toHaveBeenCalledTimes(3);
    expect(mocks.executeAddCommand).toHaveBeenCalledTimes(2);
    expect(updateDeps.confirmationMessages).toHaveLength(1);
    expect(updateDeps.confirmationMessages[0]).not.toContain("\u001b");
    expect(receipts[0]).toMatchObject({
      slug: "github",
      serverVersion: "1.0.0-rc.1+build.7",
      manifestHash: "b".repeat(64),
    });
    expect(receipts[1]).toMatchObject({
      slug: "playwright",
      serverVersion: "1.0.0-beta.1+old",
      manifestHash: "a".repeat(64),
    });

    mocks.planAddCommand.mockClear();
    const externalOnly = await runUpdateCommand(
      { yes: true, dryRun: false, json: true },
      dependencies([]),
    );
    expect(externalOnly.stdout?.data).toEqual({
      exitCode: 0,
      updated: [],
      skipped: ["No Directory-managed installations matched."],
    });
    expect(mocks.planAddCommand).not.toHaveBeenCalled();

    mocks.planAddCommand.mockClear();
    mocks.executeAddCommand.mockClear();
    const deleted = await runUpdateCommand(
      { yes: true, dryRun: false, json: true },
      dependencies([receipt("alpha", "cursor"), receipt("z-deleted", "codex")], [], ["z-deleted"]),
    );
    expect(deleted.stdout?.error).toEqual({
      code: "UPSTREAM_DELETED",
      message: "Update blocked: Listing deleted upstream; no changes were made.",
    });
    expect(mocks.planAddCommand).not.toHaveBeenCalled();
    expect(mocks.executeAddCommand).not.toHaveBeenCalled();

    const cliDeps = dependencies([]);
    await expect(runCli(["update", "--json"], cliDeps)).resolves.toBe(0);
    expect(JSON.parse(cliDeps.stdoutLines.join(""))).toMatchObject({
      command: "update",
      ok: true,
      data: { skipped: ["No Directory-managed installations matched."] },
    });
  });
});
