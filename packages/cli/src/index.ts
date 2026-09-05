#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCliMain } from "./cli.js";

export { ADD_USAGE, runAddCliCommand } from "./commands/add.js";
export {
  executeAddCommand,
  type AddExecutionResult,
  type TargetInstallResultV1,
} from "./commands/add-execute.js";
export {
  planAddCommand,
  type AddCommandOptions,
  type AddPlanningResult,
  type TargetInstallPreview,
} from "./commands/add-plan.js";
export { runInfoCommand } from "./commands/info.js";
export {
  DOCTOR_USAGE,
  runDoctorCommand,
  type DoctorCheckResult,
  type DoctorReport,
} from "./commands/doctor.js";
export {
  createFailureResult,
  createSuccessResult,
  type CommandResult,
  type JsonEnvelopeV1,
} from "./commands/result.js";
export { runSearchCommand } from "./commands/search.js";
export {
  runUpdateCliCommand,
  runUpdateCommand,
  UPDATE_USAGE,
  type UpdateCandidate,
  type UpdateCommandOptions,
  type UpdateResult,
} from "./commands/update.js";
export { CLI_HELP_TEXT, runCli, runCliMain } from "./cli.js";
export {
  CLI_COMMANDS,
  CLI_DOCUMENTATION,
  CLI_EXECUTABLE_NAME,
  CLI_REPOSITORY_INVOCATION,
  CLI_SUPPORTED_CLIENTS,
  getCliCommandMetadata,
  renderCliHelp,
  type CliCommandMetadata,
  type CliOptionMetadata,
} from "./command-metadata.js";
export { resolveCliRuntimeConfig, type CliRuntimeConfig } from "./config/runtime.js";
export { resolveCliStatePaths, type CliStatePaths } from "./config/state-paths.js";
export {
  createReceiptStore,
  ReceiptStoreError,
  type InstallationReceipt,
  type ReceiptStore,
} from "./config/receipt-store.js";
export {
  createDefaultCliDependencies,
  createOutputWriter,
  createPromptIO,
  type CliDependencies,
  type DefaultCliDependenciesOptions,
  type OutputWriter,
  type PromptIO,
} from "./dependencies.js";
export { serializeJsonEnvelope } from "./output/json.js";
export { renderHumanEnvelope } from "./output/render.js";

if (isDirectExecution(process.argv[1])) {
  void runCliMain();
}

function isDirectExecution(entryPath: string | undefined): boolean {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
