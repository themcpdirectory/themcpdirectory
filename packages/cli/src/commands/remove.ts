import type { InstalledMcpServer } from "@themcpdirectory/client-adapters";
import {
  PlanValidationError,
  validateRemovalPlan,
  type ClientId,
  type ClientScope,
  type RemovalPlan,
} from "@themcpdirectory/install-engine";
import type { InstallationReceipt } from "../config/receipt-store.js";
import type { CliDependencies } from "../dependencies.js";
import { inspectAdapters } from "./list.js";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";

export interface RemoveCommandOptions {
  readonly slug: string;
  readonly targetClient?: ClientId;
  readonly scope?: ClientScope;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
}

interface RemovalTargetSummary {
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly managedBy: "mcpdir" | "external";
  readonly receiptFound: boolean;
}

interface RemovalPreview {
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly plan: RemovalPlan;
  readonly receiptFound: boolean;
}

export interface RemovalResult {
  readonly slug: string;
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly status: "removed" | "failed" | "skipped";
  readonly executionMessage: string;
  readonly verificationMessage: string;
  readonly receiptFound: boolean;
  readonly receiptRemoved: boolean;
  readonly recoveryHint: string;
}

export interface RemovalAmbiguityResult {
  readonly slug: string;
  readonly status: "ambiguous";
  readonly availableTargets: readonly RemovalTargetSummary[];
  readonly message: string;
}

export interface RemovalNotInstalledResult {
  readonly slug: string;
  readonly status: "not_installed";
  readonly availableTargets: readonly [];
  readonly message: string;
}

type RemoveCommandData = RemovalResult | RemovalAmbiguityResult | RemovalNotInstalledResult;
type RemovalPhase =
  "discovery" | "planning" | "confirmation" | "execution" | "verification" | "receipt";

export const REMOVE_USAGE =
  "Usage: mcpdir remove <slug> [--to <client>] [--scope <user|project|global>] [--yes] [--dry-run] [--json]";

export async function runRemoveCliCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult<RemoveCommandData>> {
  const parsed = parseRemoveArgs(argv);
  if (!parsed.ok) {
    return {
      exitCode: 2,
      stdout: {
        schemaVersion: 1,
        command: "remove",
        ok: false,
        error: { code: "USAGE_ERROR", message: parsed.message },
        warnings: [],
      },
      stderrLines: [REMOVE_USAGE],
      warnings: [],
    };
  }

  return runRemoveCommand(parsed.options, deps);
}

export async function runRemoveCommand(
  options: RemoveCommandOptions,
  deps: CliDependencies,
): Promise<CommandResult<RemoveCommandData>> {
  let resolvedTarget: RemovalTargetSummary | undefined;
  let phase: RemovalPhase = "discovery";

  try {
    const [installed, receipts] = await Promise.all([
      inspectAdapters(deps.adapterRegistry.list()),
      deps.receiptStore.list(),
    ]);
    const targets = discoverTargets(options, installed, receipts);

    if (targets.length === 0) {
      return createSuccessResult("remove", {
        slug: options.slug,
        status: "not_installed",
        availableTargets: [],
        message: `${options.slug} is not installed in the selected targets.`,
      });
    }

    if (targets.length > 1) {
      const message = `Multiple installed targets match ${options.slug}; specify --to and --scope.`;
      return createFailureWithData(
        {
          slug: options.slug,
          status: "ambiguous",
          availableTargets: targets,
          message,
        },
        "REMOVAL_TARGET_AMBIGUOUS",
        message,
        2,
      );
    }

    const target = targets[0]!;
    resolvedTarget = target;
    phase = "planning";
    const adapter = deps.adapterRegistry.get(target.client);
    const plan = validateRemovalPlan(
      await adapter.planRemove({ slug: options.slug, scope: target.scope }),
      adapter.getSafetyDescriptor(),
    );
    const preview: RemovalPreview = { ...target, plan };

    if (options.dryRun) {
      return createSuccessResult(
        "remove",
        resultFor(preview, "skipped", {
          executionMessage: `Dry run plan: ${plan.previewLines.join(" ")}`,
          verificationMessage: "Removal was not verified during dry run.",
        }),
      );
    }

    if (!options.yes) {
      if (!deps.promptIO.isInteractive) {
        return createFailureWithData(
          resultFor(preview, "skipped", {
            executionMessage: "Removal requires confirmation.",
            verificationMessage: "Removal was not attempted.",
          }),
          "REQUIRED_INPUT",
          "Removal requires --yes in noninteractive mode.",
        );
      }

      phase = "confirmation";
      const confirmed = await deps.promptIO.confirm(plan.previewLines.join("\n"));
      if (!confirmed) {
        return createFailureWithData(
          resultFor(preview, "skipped", {
            executionMessage: "Removal was cancelled.",
            verificationMessage: "Removal was not attempted.",
          }),
          "USER_CANCELLED",
          "Removal was cancelled.",
        );
      }
    }

    phase = "planning";
    const currentPlan = validateRemovalPlan(plan, adapter.getSafetyDescriptor());
    phase = "execution";
    await adapter.executeRemove(currentPlan);
    phase = "verification";
    const verification = await adapter.verifyRemove(currentPlan);
    if (!verification.ok) {
      return createFailureWithData(
        resultFor(preview, "failed", {
          executionMessage: "Removal execution completed.",
          verificationMessage: verification.message,
          recoveryHint: removalRecoveryHint(options.slug, preview, "verification"),
        }),
        "VERIFICATION_FAILED",
        verification.message,
      );
    }

    if (preview.receiptFound) {
      phase = "receipt";
      await deps.receiptStore.remove({
        slug: options.slug,
        client: preview.client,
        scope: preview.scope,
      });
    }

    return createSuccessResult(
      "remove",
      resultFor(preview, "removed", {
        executionMessage: "Removal executed.",
        verificationMessage: verification.message,
        receiptRemoved: preview.receiptFound,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Removal failed";
    const code =
      error instanceof PlanValidationError ? "UNSAFE_CONFIGURATION" : removalFailureCode(phase);

    if (!resolvedTarget) {
      return createFailureResult("remove", {
        exitCode: 1,
        code,
        message,
      }) as CommandResult<RemoveCommandData>;
    }

    return createFailureWithData(
      failedRemovalResult(options.slug, resolvedTarget, phase, message),
      code,
      message,
    );
  }
}

function discoverTargets(
  options: RemoveCommandOptions,
  installed: readonly InstalledMcpServer[],
  receipts: readonly InstallationReceipt[],
): readonly RemovalTargetSummary[] {
  return installed
    .filter(
      (entry) =>
        entry.slug === options.slug &&
        (!options.targetClient || entry.client === options.targetClient) &&
        (!options.scope || entry.scope === options.scope),
    )
    .map((entry) => {
      const receiptFound = receipts.some(
        (receipt) =>
          receipt.slug === options.slug &&
          receipt.client === entry.client &&
          receipt.scope === entry.scope,
      );
      return {
        client: entry.client,
        scope: entry.scope,
        managedBy: receiptFound ? "mcpdir" : "external",
        receiptFound,
      } as const;
    })
    .sort(
      (left, right) =>
        left.client.localeCompare(right.client) || left.scope.localeCompare(right.scope),
    );
}

function parseRemoveArgs(argv: readonly string[]):
  | { readonly ok: true; readonly options: RemoveCommandOptions }
  | {
      readonly ok: false;
      readonly message: string;
    } {
  let slug: string | undefined;
  let targetClient: ClientId | undefined;
  let scope: ClientScope | undefined;
  let yes = false;
  let dryRun = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--yes") {
      yes = true;
    } else if (token === "--dry-run") {
      dryRun = true;
    } else if (token === "--json") {
      json = true;
    } else if (token === "--to") {
      const value = argv[++index];
      if (!isClientId(value)) {
        return { ok: false, message: "remove requires a supported --to value" };
      }
      targetClient = value;
    } else if (token === "--scope") {
      const value = argv[++index];
      if (!isClientScope(value)) {
        return { ok: false, message: "remove requires a supported --scope value" };
      }
      scope = value;
    } else if (token?.startsWith("--")) {
      return { ok: false, message: `remove does not support option ${token}` };
    } else if (token && !slug) {
      slug = token;
    } else {
      return { ok: false, message: "remove accepts exactly one server slug" };
    }
  }

  if (!slug) {
    return { ok: false, message: "remove requires a server slug" };
  }

  return {
    ok: true,
    options: {
      slug,
      ...(targetClient ? { targetClient } : {}),
      ...(scope ? { scope } : {}),
      yes,
      dryRun,
      json,
    },
  };
}

function isClientId(value: string | undefined): value is ClientId {
  return value === "claude-code" || value === "codex" || value === "cursor" || value === "vscode";
}

function isClientScope(value: string | undefined): value is ClientScope {
  return value === "user" || value === "project" || value === "global";
}

function resultFor(
  preview: RemovalPreview,
  status: RemovalResult["status"],
  details: {
    readonly executionMessage: string;
    readonly verificationMessage: string;
    readonly receiptRemoved?: boolean;
    readonly recoveryHint?: string;
  },
): RemovalResult {
  return {
    slug: preview.plan.serverSlug,
    client: preview.client,
    scope: preview.scope,
    status,
    executionMessage: details.executionMessage,
    verificationMessage: details.verificationMessage,
    receiptFound: preview.receiptFound,
    receiptRemoved: details.receiptRemoved ?? false,
    recoveryHint: details.recoveryHint ?? "No recovery is needed.",
  };
}

function failedRemovalResult(
  slug: string,
  target: RemovalTargetSummary,
  phase: RemovalPhase,
  message: string,
): RemovalResult {
  const executionMessage =
    phase === "planning"
      ? "Removal planning failed before mutation."
      : phase === "confirmation"
        ? "Removal confirmation failed before mutation."
        : phase === "execution"
          ? "Removal execution failed; client state may have changed."
          : "Removal execution completed.";
  const verificationMessage =
    phase === "verification"
      ? `Removal verification failed: ${message}`
      : phase === "receipt"
        ? "Removal verified, but receipt deletion failed."
        : "Removal was not verified.";

  return {
    slug,
    client: target.client,
    scope: target.scope,
    status: "failed",
    executionMessage,
    verificationMessage,
    receiptFound: target.receiptFound,
    receiptRemoved: false,
    recoveryHint: removalRecoveryHint(slug, target, phase),
  };
}

function removalFailureCode(phase: RemovalPhase): string {
  switch (phase) {
    case "discovery":
      return "COMMAND_FAILED";
    case "planning":
      return "CLIENT_UNAVAILABLE";
    case "confirmation":
      return "COMMAND_FAILED";
    case "execution":
      return "EXECUTION_FAILED";
    case "verification":
      return "VERIFICATION_FAILED";
    case "receipt":
      return "RECEIPT_CLEANUP_FAILED";
  }
}

function removalRecoveryHint(
  slug: string,
  target: Pick<RemovalTargetSummary, "client" | "scope">,
  phase: RemovalPhase,
): string {
  const targetDescription = `${slug} --to ${target.client} --scope ${target.scope}`;
  if (phase === "receipt") {
    return `Removal is verified for ${targetDescription}, but its receipt remains; restore write access to the CLI state directory before updating this target.`;
  }
  if (phase === "execution" || phase === "verification") {
    return `Inspect ${target.client} ${target.scope} scope, then retry: mcpdir remove ${targetDescription}`;
  }
  if (phase === "confirmation") {
    return `Retry with explicit confirmation: mcpdir remove ${targetDescription} --yes`;
  }
  return `Retry after resolving the reported error: mcpdir remove ${targetDescription}`;
}

function createFailureWithData<T extends RemoveCommandData>(
  data: T,
  code: string,
  message: string,
  exitCode = 1,
): CommandResult<T> {
  return {
    exitCode,
    stdout: {
      schemaVersion: 1,
      command: "remove",
      ok: false,
      data,
      error: { code, message },
      warnings: [],
    },
    stderrLines: [message],
    warnings: [],
  };
}
