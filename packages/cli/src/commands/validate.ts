import { getCliCommandMetadata } from "../command-metadata.js";
import type { CliDependencies } from "../dependencies.js";
import { readMaintainerManifest } from "./manifest-file.js";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";

const COMMAND_NAME = "validate";
export const VALIDATE_USAGE = getCliCommandMetadata(COMMAND_NAME)!.usage;

export async function runValidateCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult> {
  const parsed = parsePathArgs(COMMAND_NAME, argv);
  if (!parsed.ok) return usageFailure(parsed.message);

  const result = await readMaintainerManifest(parsed.path, deps);
  if (!result.ok) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: result.code,
      message: result.message,
    });
  }

  return createSuccessResult(COMMAND_NAME, {
    path: result.path,
    valid: true,
    artifact: result.artifact,
  });
}

export function parsePathArgs(
  command: "validate" | "publish",
  argv: readonly string[],
):
  { readonly ok: true; readonly path?: string } | { readonly ok: false; readonly message: string } {
  const positional = argv.filter((token) => token !== "--json");
  const unsupported = positional.find((token) => token.startsWith("--"));
  if (unsupported)
    return { ok: false, message: `${command} does not support option ${unsupported}` };
  if (positional.length > 1) return { ok: false, message: `${command} accepts at most one path` };
  return { ok: true, ...(positional[0] ? { path: positional[0] } : {}) };
}

function usageFailure(message: string): CommandResult {
  return createFailureResult(COMMAND_NAME, {
    exitCode: 2,
    code: "USAGE_ERROR",
    message,
    stderrLines: [VALIDATE_USAGE],
  });
}
