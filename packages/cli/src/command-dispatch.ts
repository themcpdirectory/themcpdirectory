import { runAddCliCommand } from "./commands/add.js";
import { runInfoCommand } from "./commands/info.js";
import { runListCommand } from "./commands/list.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runRemoveCliCommand } from "./commands/remove.js";
import type { CommandResult } from "./commands/result.js";
import { runSearchCommand } from "./commands/search.js";
import { runUpdateCliCommand } from "./commands/update.js";
import { getCliCommandMetadata } from "./command-metadata.js";
import type { CliDependencies } from "./dependencies.js";
import { serializeJsonEnvelope } from "./output/json.js";
import { renderHumanEnvelope, sanitizeTerminalText } from "./output/render.js";

type CliCommandHandler = (argv: readonly string[], deps: CliDependencies) => Promise<CommandResult>;

const COMMAND_HANDLERS: Readonly<Record<string, CliCommandHandler>> = Object.freeze({
  add: runAddCliCommand,
  doctor: runDoctorCommand,
  search: runSearchCommand,
  info: runInfoCommand,
  list: runListCommand,
  remove: runRemoveCliCommand,
  update: runUpdateCliCommand,
});

// Neutral internal seam: both `cli.ts` and `interactive/session.ts` depend on this module
// so neither has to import the other, avoiding a cli.ts <-> interactive/session.ts cycle.
export async function dispatchCommand(
  command: string,
  commandArgs: readonly string[],
  deps: CliDependencies,
): Promise<number> {
  const commandMetadata = getCliCommandMetadata(command);
  if (commandMetadata && (commandArgs.includes("--help") || commandArgs.includes("-h"))) {
    deps.output.writeStdout(`${commandMetadata.usage}\n`);
    return 0;
  }

  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    deps.output.writeStderr(`Unknown command: ${sanitizeTerminalText(command)}\n`);
    deps.output.writeStderr("Run mcpdir --help for available commands.\n");
    return 1;
  }

  const result = await handler(commandArgs, deps);
  writeCommandResult(result, commandArgs.includes("--json"), deps);
  return result.exitCode;
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
