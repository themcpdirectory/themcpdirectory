#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { runCliMain } from "./cli.js";

export { CLI_HELP_TEXT, runCli, runCliMain, type CliIo } from "./cli.js";
export { resolveCliRuntimeConfig, type CliRuntimeConfig } from "./config/runtime.js";
export { resolveCliStatePaths, type CliStatePaths } from "./config/state-paths.js";
export {
  createReceiptStore,
  ReceiptStoreError,
  type InstallationReceipt,
  type ReceiptStore,
} from "./config/receipt-store.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliMain();
}
