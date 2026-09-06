import { runAddCliCommand } from "./commands/add.js";
import { runInfoCommand } from "./commands/info.js";
import { runListCommand } from "./commands/list.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runRemoveCliCommand } from "./commands/remove.js";
import type { CommandResult } from "./commands/result.js";
import { runSearchCommand } from "./commands/search.js";
import { runUpdateCliCommand } from "./commands/update.js";
import { runInitCommand } from "./commands/init.js";
import { runPublishCommand } from "./commands/publish.js";
import { runValidateCommand } from "./commands/validate.js";
import { getCliCommandMetadata } from "./command-metadata.js";
import type { CliDependencies } from "./dependencies.js";
import { serializeJsonEnvelope } from "./output/json.js";
import { renderHumanEnvelope, sanitizeTerminalText } from "./output/render.js";
import packageMetadata from "../package.json" with { type: "json" };

type CliCommandHandler = (argv: readonly string[], deps: CliDependencies) => Promise<CommandResult>;

const COMMAND_HANDLERS: Readonly<Record<string, CliCommandHandler>> = Object.freeze({
  add: runAddCliCommand,
  doctor: runDoctorCommand,
  search: runSearchCommand,
  info: runInfoCommand,
  list: runListCommand,
  remove: runRemoveCliCommand,
  update: runUpdateCliCommand,
  init: runInitCommand,
  validate: runValidateCommand,
  publish: runPublishCommand,
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
  await reportTelemetry(result, deps);
  return result.exitCode;
}

export async function reportTelemetry(result: CommandResult, deps: CliDependencies): Promise<void> {
  if (
    deps.environment?.DO_NOT_TRACK === "1" ||
    deps.environment?.MCPDIR_DISABLE_TELEMETRY === "1" ||
    !deps.telemetryReporter
  ) {
    return;
  }

  try {
    await Promise.all(
      (result.telemetry?.() ?? []).map((context) =>
        deps.telemetryReporter!.report({
          schemaVersion: 1,
          ...context,
          cliVersion: packageMetadata.version,
        }),
      ),
    );
  } catch {
    // Telemetry is best-effort and must not affect command behavior.
  }
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
