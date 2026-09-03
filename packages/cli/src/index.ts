#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { runCliMain } from "./cli.js";

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliMain();
}
