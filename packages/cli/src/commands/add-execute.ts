import type { McpClientAdapter } from "@themcpdirectory/client-adapters";
import {
  PlanValidationError,
  validateInstallPlan,
  type ClientId,
  type ClientScope,
  type InstallPlan,
} from "@themcpdirectory/install-engine";
import type { CliDependencies } from "../dependencies.js";
import type { InstallationReceipt } from "../config/receipt-store.js";
import type { TargetInstallPreview } from "./add-plan.js";
import { createSuccessResult, type CommandResult } from "./result.js";

const COMMAND_NAME = "add";

export interface TargetInstallResultV1 {
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly status: "installed" | "failed" | "skipped";
  readonly verificationMessage: string;
  readonly receiptWritten: boolean;
  readonly recoveryHint: string;
}

export interface AddExecutionResult {
  readonly exitCode: number;
  readonly targets: readonly TargetInstallResultV1[];
}

interface PreparedTarget {
  readonly preview: TargetInstallPreview;
  readonly adapter: McpClientAdapter;
  readonly plan: InstallPlan;
}

interface TargetExecutionOutcome {
  readonly result: TargetInstallResultV1;
  readonly failureCode?: "EXECUTION_FAILED" | "UNSAFE_CONFIGURATION" | "VERIFICATION_FAILED";
}

function retryHint(preview: TargetInstallPreview): string {
  return `Retry with: mcpdir add ${preview.intent.server.slug} --to ${preview.client} --scope ${preview.scope}`;
}

export function deriveRecoveryHint(
  preview: TargetInstallPreview,
  result: TargetInstallResultV1,
): string {
  const target = `--to ${preview.client} --scope ${preview.scope}`;
  if (result.status === "skipped") {
    return retryHint(preview);
  }

  if (result.status === "failed") {
    return `Retry with: mcpdir add ${preview.intent.server.slug} ${target}. If client configuration changed, remove it with: mcpdir remove ${preview.intent.server.slug} ${target}`;
  }

  return `Remove this target with: mcpdir remove ${preview.intent.server.slug} ${target}`;
}

export async function executeAddCommand(
  previews: readonly TargetInstallPreview[],
  deps: CliDependencies,
): Promise<CommandResult<AddExecutionResult>> {
  const preflight = preflightTargets(previews, deps);
  if ("failureIndex" in preflight) {
    const targets = previews.map((preview, index): TargetInstallResultV1 => {
      const result = {
        client: preview.client,
        scope: preview.scope,
        status: index === preflight.failureIndex ? "failed" : "skipped",
        verificationMessage:
          index === preflight.failureIndex
            ? "Execution preflight failed."
            : "Not attempted because execution preflight failed.",
        receiptWritten: false,
      } as const;
      return {
        ...result,
        recoveryHint: retryHint(preview),
      };
    });
    return createFailedExecutionResult(targets, preflight.code, "Installation preflight failed.");
  }

  const targets: TargetInstallResultV1[] = [];
  let failureCode: "EXECUTION_FAILED" | "UNSAFE_CONFIGURATION" | "VERIFICATION_FAILED" | undefined;

  for (const prepared of preflight.targets) {
    const { preview } = prepared;
    if (failureCode) {
      targets.push(
        withRecoveryHint(preview, {
          client: preview.client,
          scope: preview.scope,
          status: "skipped",
          verificationMessage: "Not attempted because an earlier target failed.",
          receiptWritten: false,
        }),
      );
      continue;
    }

    const outcome = await executeTarget(prepared, deps);
    targets.push(outcome.result);
    failureCode = outcome.failureCode;
  }

  const data: AddExecutionResult = { exitCode: failureCode ? 1 : 0, targets };
  if (!failureCode) {
    return createSuccessResult(COMMAND_NAME, data);
  }

  return createFailedExecutionResult(
    targets,
    failureCode,
    "Installation stopped after a target failed.",
  );
}

function createFailedExecutionResult(
  targets: readonly TargetInstallResultV1[],
  code: "CLIENT_UNAVAILABLE" | "EXECUTION_FAILED" | "UNSAFE_CONFIGURATION" | "VERIFICATION_FAILED",
  message: string,
): CommandResult<AddExecutionResult> {
  return {
    exitCode: 1,
    stdout: {
      schemaVersion: 1,
      command: COMMAND_NAME,
      ok: false,
      data: { exitCode: 1, targets },
      error: { code, message },
      warnings: [],
    },
    stderrLines: [message],
    warnings: [],
  };
}

function preflightTargets(
  previews: readonly TargetInstallPreview[],
  deps: Pick<CliDependencies, "adapterRegistry">,
):
  | { readonly targets: readonly PreparedTarget[] }
  | {
      readonly failureIndex: number;
      readonly code: "CLIENT_UNAVAILABLE" | "UNSAFE_CONFIGURATION";
    } {
  const targets: PreparedTarget[] = [];

  for (const [index, preview] of previews.entries()) {
    try {
      const adapter = deps.adapterRegistry.get(preview.client);
      const plan = validateInstallPlan(preview.plan, adapter.getSafetyDescriptor());
      targets.push({ preview, adapter, plan });
    } catch (error) {
      return {
        failureIndex: index,
        code: error instanceof PlanValidationError ? "UNSAFE_CONFIGURATION" : "CLIENT_UNAVAILABLE",
      };
    }
  }

  return { targets };
}

async function executeTarget(
  prepared: PreparedTarget,
  deps: CliDependencies,
): Promise<TargetExecutionOutcome> {
  const { adapter, preview } = prepared;
  let phase: "execution" | "verification" | "receipt" = "execution";
  let plan: InstallPlan;

  try {
    plan = validateInstallPlan(prepared.plan, adapter.getSafetyDescriptor());
  } catch {
    return {
      result: {
        client: preview.client,
        scope: preview.scope,
        status: "failed",
        verificationMessage: "Plan revalidation failed before execution.",
        receiptWritten: false,
        recoveryHint: retryHint(preview),
      },
      failureCode: "UNSAFE_CONFIGURATION",
    };
  }

  try {
    await adapter.executePlan(plan);
    phase = "verification";
    const verification = await adapter.verifyInstall(plan);
    if (!verification.ok) {
      return {
        result: withRecoveryHint(preview, {
          client: preview.client,
          scope: preview.scope,
          status: "failed",
          verificationMessage: verification.message,
          receiptWritten: false,
        }),
        failureCode: "VERIFICATION_FAILED",
      };
    }

    phase = "receipt";
    await deps.receiptStore.write(createReceipt(preview, deps));
    return {
      result: withRecoveryHint(preview, {
        client: preview.client,
        scope: preview.scope,
        status: "installed",
        verificationMessage: verification.message,
        receiptWritten: true,
      }),
    };
  } catch {
    return {
      result: withRecoveryHint(preview, {
        client: preview.client,
        scope: preview.scope,
        status: "failed",
        verificationMessage:
          phase === "verification"
            ? "Post-install verification failed."
            : phase === "receipt"
              ? "Installation verified, but receipt persistence failed."
              : "Installation execution failed.",
        receiptWritten: false,
      }),
      failureCode: phase === "verification" ? "VERIFICATION_FAILED" : "EXECUTION_FAILED",
    };
  }
}

function createReceipt(
  preview: TargetInstallPreview,
  deps: Pick<CliDependencies, "clock">,
): InstallationReceipt {
  return {
    schemaVersion: 1,
    slug: preview.intent.server.slug,
    client: preview.client,
    scope: preview.scope,
    serverVersion: preview.intent.server.version ?? "unversioned",
    variantId: preview.intent.variant.id,
    manifestHash: preview.plan.manifestHash,
    installedAt: deps.clock().toISOString(),
    adapterFingerprint: `${preview.detection.id}@${preview.detection.version ?? "unknown"}`,
  };
}

function withRecoveryHint(
  preview: TargetInstallPreview,
  result: Omit<TargetInstallResultV1, "recoveryHint">,
): TargetInstallResultV1 {
  const provisional = { ...result, recoveryHint: "" };
  return { ...provisional, recoveryHint: deriveRecoveryHint(preview, provisional) };
}
