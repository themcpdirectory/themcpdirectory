import { DirectoryClientError } from "@themcpdirectory/directory-client";
import type { ClientDetection } from "@themcpdirectory/client-adapters";
import {
  createResolvedInstallIntent,
  hashInstallManifest,
  hashResolvedInstallIntent,
  validateInputValues,
  validateInstallPlan,
  type ClientId,
  type ClientScope,
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
        createVariantSelectionOptions(manifestResponse.data, target.client, options.requestedVariantId),
        deps.promptIO,
      );
      const collectedInputs = await collectInstallInputs(
        {
          client: target.client,
          variant,
          capabilities: target.detection.capabilities,
        },
        deps.promptIO,
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

  if (error instanceof Error && /does not support|unsupported/i.test(error.message)) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "UNSUPPORTED_CLIENT",
      message: error.message,
    }) as CommandResult<AddPlanningResult>;
  }

  return createFailureResult(COMMAND_NAME, {
    exitCode: 1,
    code: "COMMAND_FAILED",
    message: error instanceof Error ? error.message : "Add planning failed",
  }) as CommandResult<AddPlanningResult>;
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

function mapDirectoryError(error: DirectoryClientError): { readonly code: string; readonly message: string } {
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