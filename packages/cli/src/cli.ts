#!/usr/bin/env node

import { dispatchCommand } from "./command-dispatch.js";
import { renderCliHelp } from "./command-metadata.js";
import { createDefaultCliDependencies, type CliDependencies } from "./dependencies.js";
import { runInteractiveSession } from "./interactive/session.js";
import packageMetadata from "../package.json" with { type: "json" };

export const CLI_HELP_TEXT = renderCliHelp();
export const CLI_VERSION = packageMetadata.version;

export async function runCli(argv: readonly string[]): Promise<number>;
export async function runCli(argv: readonly string[], deps: CliDependencies): Promise<number>;
export async function runCli(argv: readonly string[], deps?: CliDependencies): Promise<number> {
  const ownsProcessExit = deps === undefined;
  const resolvedDeps = deps ?? createDefaultCliDependencies();
  const [command, ...commandArgs] = argv;

  if (!command) {
    if (resolvedDeps.promptIO.isInteractive) {
      const sessionExitCode = await runInteractiveSession(resolvedDeps);
      return finalizeExitCode(sessionExitCode, ownsProcessExit);
    }

    resolvedDeps.output.writeStdout(`${CLI_HELP_TEXT}\n`);
    return finalizeExitCode(0, ownsProcessExit);
  }

  if (command === "help" || command === "--help" || command === "-h") {
    resolvedDeps.output.writeStdout(`${CLI_HELP_TEXT}\n`);
    return finalizeExitCode(0, ownsProcessExit);
  }

  if (command === "--version" || command === "-v") {
    resolvedDeps.output.writeStdout(`${CLI_VERSION}\n`);
    return finalizeExitCode(0, ownsProcessExit);
  }

  return finalizeExitCode(
    await dispatchCommand(command, commandArgs, resolvedDeps),
    ownsProcessExit,
  );
}

export async function runCliMain(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  await runCli(argv);
}

function finalizeExitCode(exitCode: number, ownsProcessExit: boolean): number {
  if (ownsProcessExit) {
    process.exitCode = exitCode;
  }

  return exitCode;
}
