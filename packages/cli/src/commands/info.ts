import { DirectoryClientError } from "@themcpdirectory/directory-client";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";
import type { CliDependencies } from "../dependencies.js";

const INFO_USAGE = "Usage: mcpdir info <slug>";

export async function runInfoCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult> {
  const parsed = parseInfoArgs(argv);
  if (!parsed.ok) {
    return createFailureResult("info", {
      exitCode: 2,
      code: "USAGE_ERROR",
      message: parsed.message,
      stderrLines: [INFO_USAGE],
    });
  }

  try {
    const response = await deps.directoryClient.getServer(parsed.slug);
    return createSuccessResult("info", response);
  } catch (error) {
    return toDirectoryFailure("info", error);
  }
}

function parseInfoArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly slug: string }
  | { readonly ok: false; readonly message: string } {
  const positional: string[] = [];

  for (const token of argv) {
    if (!token) {
      continue;
    }

    if (token === "--json") {
      continue;
    }

    if (token.startsWith("--")) {
      return { ok: false, message: `info does not support option ${token}` };
    }

    positional.push(token);
  }

  if (positional.length !== 1 || positional[0]!.trim().length === 0) {
    return { ok: false, message: "info requires exactly one server slug" };
  }

  return { ok: true, slug: positional[0]!.trim() };
}

function toDirectoryFailure(command: string, error: unknown): CommandResult {
  if (error instanceof DirectoryClientError) {
    return createFailureResult(command, {
      exitCode: 1,
      code: error.code,
      message: error.message,
    });
  }

  return createFailureResult(command, {
    exitCode: 1,
    code: "COMMAND_FAILED",
    message: error instanceof Error ? error.message : "Command failed",
  });
}