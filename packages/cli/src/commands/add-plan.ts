import { DirectoryClientError } from "@themcpdirectory/directory-client";
import {
  ClaudeCodeAdapterError,
  CodexAdapterError,
  CursorAdapterError,
  VsCodeAdapterError,
  type ClientDetection,
} from "@themcpdirectory/client-adapters";
import {
  createResolvedInstallIntent,
  hashInstallManifest,
  hashResolvedInstallIntent,
  InstallInputValidationError,
  PlanValidationError,
  ResolveIntentError,
  UnsupportedVariantError,
  validateInputValues,
  validateInstallPlan,
  type ClientId,
  type ClientScope,
  type InstallInputValue,
  type InstallPlan,
  type ResolvedInstallIntent,
} from "@themcpdirectory/install-engine";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";
import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import type { CliDependencies } from "../dependencies.js";
import { buildAddConfirmationMessage } from "../prompts/confirm.js";
import { collectInstallInputs } from "../prompts/collect-inputs.js";
import { selectTargetClients } from "../prompts/select-clients.js";
import { selectVariantForClient } from "../prompts/select-variant.js";
import { AddPlanningPromptError } from "../prompts/types.js";

const COMMAND_NAME = "add";

export interface AddCommandOptions {
  readonly identifier: string;
  readonly targetClients?: readonly ClientId[] | "all";
  readonly requestedScope?: ClientScope;
  readonly requestedVariantId?: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly json: boolean;
}

export interface TargetInstallPreview {
  readonly client: ClientId;
  readonly scope: ClientScope;
  readonly detection: ClientDetection;
  readonly intent: ResolvedInstallIntent;
  readonly plan: InstallPlan;
  readonly warnings: readonly string[];
  readonly inputSummary: readonly string[];
  readonly unsupportedReason?: string;
}

export interface AddPlanningResult {
  readonly previews: readonly TargetInstallPreview[];
  readonly confirmationMessage: string;
  readonly blockedReason?: string;
}

export async function planAddCommand(
  options: AddCommandOptions,
  deps: CliDependencies,
): Promise<CommandResult<AddPlanningResult>> {
  try {
    const manifestResponse = await deps.directoryClient.resolveInstall(options.identifier);
    const selectedTargets = await selectTargetClients(
      {
        ...(options.targetClients === undefined ? {} : { targetClients: options.targetClients }),
        ...(options.requestedScope === undefined ? {} : { requestedScope: options.requestedScope }),
      },
      deps,
    );
    const manifestHash = hashInstallManifest(manifestResponse.data);
    const previews: TargetInstallPreview[] = [];

    for (const target of selectedTargets) {
      const variant = await selectVariantForClient(
        createVariantSelectionOptions(
          manifestResponse.data,
          target.client,
          options.requestedVariantId,
        ),
        deps.promptIO,
      );
      const collectedInputs = await collectInstallInputs(
        {
          client: target.client,
          variant,
          capabilities: target.detection.capabilities,
        },
        deps.promptIO,
        deps.environment,
      );
      const intent = createResolvedInstallIntent(manifestResponse.data, {
        client: target.client,
        scope: target.scope,
        requestedVariantId: variant.id,
        inputValues: collectedInputs.values,
        noninteractive: !deps.promptIO.isInteractive,
      });
      const validatedInputs = validateInputValues(intent, collectedInputs.values);
      const intentHash = hashResolvedInstallIntent(intent);
      const adapter = deps.adapterRegistry.get(target.client);
      const plannedInstall = await adapter.planInstall({
        intent,
        inputs: validatedInputs,
        noninteractive: !deps.promptIO.isInteractive,
        manifestHash,
        intentHash,
      });
      const plan = validateInstallPlan(plannedInstall, adapter.getSafetyDescriptor());
      assertPlanDoesNotExposeSecrets(plan, collectedInputs.values);

      previews.push({
        client: target.client,
        scope: target.scope,
        detection: target.detection,
        intent,
        plan,
        warnings: [...intent.warnings, ...collectedInputs.warnings],
        inputSummary: collectedInputs.inputSummary,
      });
    }

    return createSuccessResult(COMMAND_NAME, {
      previews,
      confirmationMessage: buildAddConfirmationMessage({
        serverTitle: manifestResponse.data.server.title,
        dryRun: options.dryRun,
        yes: options.yes,
        targets: previews.map((preview) => ({ client: preview.client, scope: preview.scope })),
      }),
    });
  } catch (error) {
    return toAddPlanningFailure(error);
  }
}

function toAddPlanningFailure(error: unknown): CommandResult<AddPlanningResult> {
  if (error instanceof AddPlanningPromptError) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: error.code,
      message: error.message,
    }) as CommandResult<AddPlanningResult>;
  }

  if (error instanceof DirectoryClientError) {
    const mapped = mapDirectoryError(error);
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: mapped.code,
      message: mapped.message,
    }) as CommandResult<AddPlanningResult>;
  }

  if (error instanceof UnsupportedVariantError) {
    const unsafeReasons = new Set(["MUTABLE_VERSION", "MALFORMED_INTEGRITY"]);
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: unsafeReasons.has(error.reason) ? "UNSAFE_CONFIGURATION" : "UNSUPPORTED_CLIENT",
      message: error.message,
    }) as CommandResult<AddPlanningResult>;
  }

  if (error instanceof PlanValidationError) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "UNSAFE_CONFIGURATION",
      message: error.message,
    }) as CommandResult<AddPlanningResult>;
  }

  if (error instanceof InstallInputValidationError) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: error.reason === "MISSING_REQUIRED_INPUT" ? "REQUIRED_INPUT" : "UNSAFE_CONFIGURATION",
      message: error.message,
    }) as CommandResult<AddPlanningResult>;
  }

  if (error instanceof ResolveIntentError) {
    const code =
      error.reason === "NONINTERACTIVE_PERSISTED_SECRET"
        ? "REQUIRED_INPUT"
        : error.reason === "UNSUPPORTED_REMOTE_AUTH"
          ? "UNSUPPORTED_CLIENT"
          : "UNSAFE_CONFIGURATION";
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code,
      message: error.message,
    }) as CommandResult<AddPlanningResult>;
  }

  const adapterFailure = mapAdapterPlanningError(error);
  if (adapterFailure) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: adapterFailure.code,
      message: adapterFailure.message,
    }) as CommandResult<AddPlanningResult>;
  }

  return createFailureResult(COMMAND_NAME, {
    exitCode: 1,
    code: "COMMAND_FAILED",
    message: error instanceof Error ? error.message : "Add planning failed",
  }) as CommandResult<AddPlanningResult>;
}

function mapAdapterPlanningError(
  error: unknown,
): { readonly code: string; readonly message: string } | null {
  if (!(
    error instanceof CodexAdapterError ||
    error instanceof ClaudeCodeAdapterError ||
    error instanceof CursorAdapterError ||
    error instanceof VsCodeAdapterError
  )) {
    return null;
  }

  if (error.code.endsWith("_UNSUPPORTED_CAPABILITY")) {
    return { code: "UNSUPPORTED_CLIENT", message: error.message };
  }
  if (error.code.endsWith("_NOT_INSTALLED")) {
    return { code: "CLIENT_UNAVAILABLE", message: error.message };
  }
  if (error.code.includes("_INVALID_")) {
    return { code: "UNSAFE_CONFIGURATION", message: error.message };
  }

  return { code: "EXECUTION_FAILED", message: error.message };
}

function assertPlanDoesNotExposeSecrets(
  plan: InstallPlan,
  values: Readonly<Record<string, InstallInputValue>>,
): void {
  const secrets = Object.values(values)
    .filter((value) => value.kind === "secret-value")
    .map((value) => value.value);

  if (secrets.some((secret) => containsString(plan, secret))) {
    throw new AddPlanningPromptError(
      "UNSAFE_CONFIGURATION",
      "The selected client produced an install plan containing a persisted secret value.",
    );
  }
}

function containsString(value: unknown, expected: string): boolean {
  if (typeof value === "string") {
    return value.includes(expected);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsString(item, expected));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) => containsString(item, expected));
  }
  return false;
}

function createVariantSelectionOptions(
  manifest: InstallManifestV1,
  client: ClientId,
  requestedVariantId: string | undefined,
): {
  readonly manifest: InstallManifestV1;
  readonly client: ClientId;
  readonly requestedVariantId?: string;
} {
  return {
    manifest,
    client,
    ...(requestedVariantId === undefined ? {} : { requestedVariantId }),
  };
}

function mapDirectoryError(error: DirectoryClientError): {
  readonly code: string;
  readonly message: string;
} {
  if (error.code === "DIRECTORY_AMBIGUOUS") {
    return {
      code: "AMBIGUOUS_SERVER",
      message: "Identifier matches multiple servers.",
    };
  }

  if (error.code === "DIRECTORY_INSTALL_UNAVAILABLE") {
    return {
      code: "INSTALL_UNAVAILABLE",
      message: "Install manifest is unavailable for the requested server.",
    };
  }

  return {
    code: error.code,
    message: error.message,
  };
}
