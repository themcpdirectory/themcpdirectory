import { parseSemVer, type ClientId } from "@themcpdirectory/install-engine";
import { DirectoryClientError } from "@themcpdirectory/directory-client";
import { isSupportedClientId } from "@themcpdirectory/client-adapters";
import type { InstallationReceipt } from "../config/receipt-store.js";
import { getCliCommandMetadata } from "../command-metadata.js";
import type { CliDependencies } from "../dependencies.js";
import { sanitizeTerminalText } from "../output/render.js";
import { executeAddCommand, type TargetInstallResultV1 } from "./add-execute.js";
import { planAddCommand, type TargetInstallPreview } from "./add-plan.js";
import { createSuccessResult, type CommandResult } from "./result.js";

const COMMAND_NAME = "update";

export interface UpdateCommandOptions {
  readonly identifier?: string;
  readonly targetClients?: readonly ClientId[];
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
}

export interface UpdateCandidate {
  readonly receipt: InstallationReceipt;
  readonly latestServerVersion: string;
  readonly latestManifestHash: string;
  readonly diffLines: readonly string[];
  readonly preview: TargetInstallPreview;
}

export interface UpdateResult {
  readonly exitCode: number;
  readonly updated: readonly TargetInstallResultV1[];
  readonly skipped: readonly string[];
}

export const UPDATE_USAGE = getCliCommandMetadata("update")!.usage;

export async function runUpdateCliCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult<UpdateResult>> {
  const parsed = parseUpdateArgs(argv);
  if (!parsed.ok) {
    return {
      exitCode: 2,
      stdout: {
        schemaVersion: 1,
        command: COMMAND_NAME,
        ok: false,
        error: { code: "USAGE_ERROR", message: parsed.message },
        warnings: [],
      },
      stderrLines: [UPDATE_USAGE],
      warnings: [],
    };
  }

  return runUpdateCommand(parsed.options, deps);
}

export async function runUpdateCommand(
  options: UpdateCommandOptions,
  deps: CliDependencies,
): Promise<CommandResult<UpdateResult>> {
  let receipts: readonly InstallationReceipt[];
  try {
    receipts = (await deps.receiptStore.list())
      .filter(
        (receipt) =>
          (!options.identifier || receipt.slug === options.identifier) &&
          (!options.targetClients || options.targetClients.includes(receipt.client)),
      )
      .sort(compareReceiptKey);
  } catch {
    return failure([], [], "RECEIPT_STATE_IO", "Update receipts could not be read.");
  }

  if (receipts.length === 0) {
    return createSuccessResult(COMMAND_NAME, {
      exitCode: 0,
      updated: [],
      skipped: ["No Directory-managed installations matched."],
    });
  }

  const listingPreflight = await preflightUpdateListings(receipts, deps);
  if (!listingPreflight.ok) {
    return failure([], [], listingPreflight.code, listingPreflight.message);
  }

  const candidates: UpdateCandidate[] = [];
  const skipped: string[] = [];
  const planningFailures: string[] = [];
  const warnings: string[] = [];

  for (const receipt of receipts) {
    const planned = await planAddCommand(
      {
        identifier: receipt.slug,
        targetClients: [receipt.client],
        requestedScope: receipt.scope,
        requestedVariantId: receipt.variantId,
        dryRun: true,
        yes: true,
        json: options.json,
      },
      deps,
    );
    warnings.push(...planned.warnings);

    const preview = planned.stdout?.data?.previews[0];
    if (planned.exitCode !== 0 || !preview) {
      if (planned.stdout?.error?.code === "UPSTREAM_DELETED") {
        return failure(
          [],
          skipped,
          "UPSTREAM_DELETED",
          "Update blocked: Listing deleted upstream; no changes were made.",
          warnings,
        );
      }
      const reason = planned.stdout?.error?.message ?? "Update planning failed.";
      planningFailures.push(`${targetLabel(receipt)}: ${reason}`);
      continue;
    }

    const selectedPackageVersion = packageVersion(preview);
    if (selectedPackageVersion && parseSemVer(selectedPackageVersion) === null) {
      planningFailures.push(
        `${targetLabel(receipt)}: selected package version is not an exact SemVer version.`,
      );
      continue;
    }

    const latestServerVersion = preview.intent.server.version ?? "unversioned";
    const latestManifestHash = preview.plan.manifestHash;
    const diffLines = buildDiffLines(
      receipt,
      latestServerVersion,
      latestManifestHash,
      selectedPackageVersion,
    );
    if (!hasChanged(receipt, preview)) {
      skipped.push(`${targetLabel(receipt)}: already current. ${diffLines.join(" ")}`);
      continue;
    }

    candidates.push({
      receipt,
      latestServerVersion,
      latestManifestHash,
      diffLines,
      preview,
    });
  }

  if (planningFailures.length > 0) {
    return failure(
      [],
      [...skipped, ...planningFailures],
      "UPDATE_PLANNING_FAILED",
      "One or more updates could not be planned; no changes were made.",
      warnings,
    );
  }

  if (candidates.length === 0) {
    return createSuccessResult(COMMAND_NAME, { exitCode: 0, updated: [], skipped }, warnings);
  }

  if (options.dryRun) {
    return createSuccessResult(
      COMMAND_NAME,
      {
        exitCode: 0,
        updated: [],
        skipped: [...skipped, ...candidates.map((candidate) => dryRunSummary(candidate))],
      },
      warnings,
    );
  }

  if (!options.yes) {
    if (!deps.promptIO.isInteractive) {
      return failure(
        [],
        [...skipped, ...candidates.map((candidate) => pendingSummary(candidate))],
        "REQUIRED_INPUT",
        "Update requires --yes in noninteractive mode.",
        warnings,
      );
    }

    const confirmed = await deps.promptIO.confirm(
      sanitizeTerminalText(buildConfirmationMessage(candidates)),
    );
    if (!confirmed) {
      return failure(
        [],
        [...skipped, ...candidates.map((candidate) => cancelledSummary(candidate))],
        "USER_CANCELLED",
        "Update was cancelled.",
        warnings,
      );
    }
  }

  const updated: TargetInstallResultV1[] = [];
  let failureCode: string | undefined;

  for (const candidate of candidates) {
    const executed = await executeAddCommand([candidate.preview], deps);
    warnings.push(...executed.warnings);
    const target = executed.stdout?.data?.targets[0];
    if (!target) {
      failureCode ??= executed.stdout?.error?.code ?? "EXECUTION_FAILED";
      updated.push(failedTarget(candidate, "Update execution returned no target result."));
      continue;
    }

    updated.push(withUpdateDetails(candidate, target));
    if (executed.exitCode !== 0) {
      failureCode ??= executed.stdout?.error?.code ?? "EXECUTION_FAILED";
    }
  }

  if (failureCode) {
    return failure(
      updated,
      skipped,
      failureCode,
      "One or more updates failed. Successful targets kept their refreshed receipts.",
      warnings,
    );
  }

  return createSuccessResult(COMMAND_NAME, { exitCode: 0, updated, skipped }, warnings);
}

async function preflightUpdateListings(
  receipts: readonly InstallationReceipt[],
  deps: CliDependencies,
): Promise<
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string }
> {
  const checkedSlugs = new Set<string>();
  for (const receipt of receipts) {
    if (checkedSlugs.has(receipt.slug)) continue;
    checkedSlugs.add(receipt.slug);

    try {
      const detail = (await deps.directoryClient.getServer(receipt.slug)).data;
      if (
        detail.listingStatus === "deleted_upstream" ||
        detail.installAvailability === "upstream_deleted"
      ) {
        return {
          ok: false,
          code: "UPSTREAM_DELETED",
          message: "Update blocked: Listing deleted upstream; no changes were made.",
        };
      }
    } catch (error) {
      if (error instanceof DirectoryClientError && error.code === "DIRECTORY_UPSTREAM_DELETED") {
        return {
          ok: false,
          code: "UPSTREAM_DELETED",
          message: "Update blocked: Listing deleted upstream; no changes were made.",
        };
      }
      return {
        ok: false,
        code: "UPDATE_PLANNING_FAILED",
        message: "Update listings could not be checked; no changes were made.",
      };
    }
  }
  return { ok: true };
}

export function parseUpdateArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly options: UpdateCommandOptions }
  | { readonly ok: false; readonly message: string } {
  let identifier: string | undefined;
  const targetClients: ClientId[] = [];
  let yes = false;
  let dryRun = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--yes") yes = true;
    else if (token === "--dry-run") dryRun = true;
    else if (token === "--json") json = true;
    else if (token === "--to") {
      const value = argv[++index];
      if (!isClientId(value)) {
        return { ok: false, message: "update requires a supported --to value" };
      }
      if (!targetClients.includes(value)) targetClients.push(value);
    } else if (token?.startsWith("--")) {
      return { ok: false, message: `update does not support option ${token}` };
    } else if (token && !identifier) identifier = token;
    else return { ok: false, message: "update accepts at most one server identifier" };
  }

  return {
    ok: true,
    options: {
      ...(identifier ? { identifier } : {}),
      ...(targetClients.length > 0 ? { targetClients } : {}),
      yes,
      dryRun,
      json,
    },
  };
}

function hasChanged(receipt: InstallationReceipt, preview: TargetInstallPreview): boolean {
  return (
    !sameExactVersion(receipt.serverVersion, preview.intent.server.version) ||
    receipt.variantId !== preview.intent.variant.id ||
    receipt.manifestHash !== preview.plan.manifestHash
  );
}

function sameExactVersion(previous: string, next: string | null | undefined): boolean {
  if (!next) return previous === "unversioned";
  const previousParsed = parseSemVer(previous);
  const nextParsed = parseSemVer(next);
  if (!previousParsed || !nextParsed) return previous === next;
  return (
    previousParsed.major === nextParsed.major &&
    previousParsed.minor === nextParsed.minor &&
    previousParsed.patch === nextParsed.patch &&
    previousParsed.prerelease.join(".") === nextParsed.prerelease.join(".") &&
    previousParsed.build.join(".") === nextParsed.build.join(".")
  );
}

function packageVersion(preview: TargetInstallPreview): string | undefined {
  return preview.intent.variant.kind === "package" ? preview.intent.variant.version : undefined;
}

function buildDiffLines(
  receipt: InstallationReceipt,
  latestServerVersion: string,
  latestManifestHash: string,
  selectedPackageVersion: string | undefined,
): readonly string[] {
  return [
    `Server version: ${receipt.serverVersion} -> ${latestServerVersion}.`,
    selectedPackageVersion
      ? `Package version: unknown in receipt schema v1 -> ${selectedPackageVersion}.`
      : "Remote variant selected.",
    `Manifest: ${receipt.manifestHash} -> ${latestManifestHash}`,
  ];
}

function buildConfirmationMessage(candidates: readonly UpdateCandidate[]): string {
  return [
    "Apply these Directory-managed updates?",
    ...candidates.flatMap((candidate) => [
      targetLabel(candidate.receipt),
      ...candidate.diffLines.map((line) => `  ${line}`),
      ...candidate.preview.plan.previewLines.map((line) => `  ${line}`),
    ]),
  ].join("\n");
}

function withUpdateDetails(
  candidate: UpdateCandidate,
  target: TargetInstallResultV1,
): TargetInstallResultV1 {
  return {
    ...target,
    verificationMessage: `${candidate.diffLines.join(" ")} ${target.verificationMessage}`,
    recoveryHint:
      target.status === "installed"
        ? target.recoveryHint
        : `Retry with: mcpdir update ${candidate.receipt.slug} --to ${candidate.receipt.client} --yes. ${target.recoveryHint}`,
  };
}

function failedTarget(candidate: UpdateCandidate, message: string): TargetInstallResultV1 {
  return {
    client: candidate.receipt.client,
    scope: candidate.receipt.scope,
    status: "failed",
    verificationMessage: `${candidate.diffLines.join(" ")} ${message}`,
    receiptWritten: false,
    recoveryHint: `Retry with: mcpdir update ${candidate.receipt.slug} --to ${candidate.receipt.client} --yes.`,
  };
}

function dryRunSummary(candidate: UpdateCandidate): string {
  return `${targetLabel(candidate.receipt)}: dry run. ${candidate.diffLines.join(" ")} ${candidate.preview.plan.previewLines.join(" ")}`;
}

function pendingSummary(candidate: UpdateCandidate): string {
  return `${targetLabel(candidate.receipt)}: confirmation required. ${candidate.diffLines.join(" ")}`;
}

function cancelledSummary(candidate: UpdateCandidate): string {
  return `${targetLabel(candidate.receipt)}: update cancelled. ${candidate.diffLines.join(" ")}`;
}

function targetLabel(receipt: InstallationReceipt): string {
  return `${receipt.slug} (${receipt.client}, ${receipt.scope})`;
}

function compareReceiptKey(left: InstallationReceipt, right: InstallationReceipt): number {
  return (
    left.slug.localeCompare(right.slug) ||
    left.client.localeCompare(right.client) ||
    left.scope.localeCompare(right.scope)
  );
}

function isClientId(value: string | undefined): value is ClientId {
  return isSupportedClientId(value);
}

function failure(
  updated: readonly TargetInstallResultV1[],
  skipped: readonly string[],
  code: string,
  message: string,
  warnings: readonly string[] = [],
): CommandResult<UpdateResult> {
  const data: UpdateResult = { exitCode: 1, updated, skipped };
  return {
    exitCode: 1,
    stdout: {
      schemaVersion: 1,
      command: COMMAND_NAME,
      ok: false,
      data,
      error: { code, message },
      warnings,
    },
    stderrLines: [message],
    warnings,
  };
}
