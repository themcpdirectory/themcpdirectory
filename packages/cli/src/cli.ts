#!/usr/bin/env node

import { runInfoCommand } from "./commands/info.js";
import { runListCommand } from "./commands/list.js";
import { REMOVE_USAGE, runRemoveCliCommand } from "./commands/remove.js";
import type { CommandResult } from "./commands/result.js";
import { runSearchCommand } from "./commands/search.js";
import { createDefaultCliDependencies, type CliDependencies } from "./dependencies.js";
import { serializeJsonEnvelope } from "./output/json.js";
import { renderHumanEnvelope, sanitizeTerminalText } from "./output/render.js";

export const CLI_HELP_TEXT = [
  "Usage: mcpdir <command> [options]",
  "",
  "Commands:",
  "  help     Show this help",
  "  search   Search directory listings",
  "  info     Show directory details for one server",
  "  list                                  List installed MCP servers",
  "  remove <slug> [--to <client>]         Remove an installed MCP server",
].join("\n");

type CliCommandHandler = (argv: readonly string[], deps: CliDependencies) => Promise<CommandResult>;

const COMMAND_HANDLERS: Readonly<Record<string, CliCommandHandler>> = Object.freeze({
  search: runSearchCommand,
  info: runInfoCommand,
  list: runListCommand,
  remove: runRemoveCliCommand,
});

export async function runCli(argv: readonly string[]): Promise<number>;
export async function runCli(argv: readonly string[], deps: CliDependencies): Promise<number>;
export async function runCli(argv: readonly string[], deps?: CliDependencies): Promise<number> {
  const ownsProcessExit = deps === undefined;
  const resolvedDeps = deps ?? createDefaultCliDependencies();
  const [command, ...commandArgs] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    resolvedDeps.output.writeStdout(`${CLI_HELP_TEXT}\n`);
    return finalizeExitCode(0, ownsProcessExit);
  }

  if (command === "remove" && (commandArgs.includes("--help") || commandArgs.includes("-h"))) {
    resolvedDeps.output.writeStdout(`${REMOVE_USAGE}\n`);
    return finalizeExitCode(0, ownsProcessExit);
  }

  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    resolvedDeps.output.writeStderr(`Unknown command: ${sanitizeTerminalText(command)}\n`);
    resolvedDeps.output.writeStderr("Run mcpdir --help for available commands.\n");
    return finalizeExitCode(1, ownsProcessExit);
  }

  const result = await handler(commandArgs, resolvedDeps);
  writeCommandResult(result, commandArgs.includes("--json"), resolvedDeps);
  return finalizeExitCode(result.exitCode, ownsProcessExit);
}

export async function runCliMain(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  await runCli(argv);
}

function writeCommandResult(result: CommandResult, jsonMode: boolean, deps: CliDependencies): void {
  if (result.stdout) {
    if (jsonMode) {
      deps.output.writeStdout(`${serializeJsonEnvelope(result.stdout)}\n`);
    } else {
      for (const line of renderHumanEnvelope(result.stdout)) {
        deps.output.writeStdout(`${line}\n`);
      }
    }
  }

  for (const line of result.stderrLines) {
    deps.output.writeStderr(`${sanitizeTerminalText(line)}\n`);
  }
}

function finalizeExitCode(exitCode: number, ownsProcessExit: boolean): number {
  if (ownsProcessExit) {
    process.exitCode = exitCode;
  }

  return exitCode;
}
