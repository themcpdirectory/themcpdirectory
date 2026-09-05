import { DirectoryClientError } from "@themcpdirectory/directory-client";
import type { SearchServersParams } from "@themcpdirectory/directory-client";
import { getCliCommandMetadata } from "../command-metadata.js";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";
import type { CliDependencies } from "../dependencies.js";

const SEARCH_USAGE = getCliCommandMetadata("search")!.usage;

type MutableSearchServersParams = {
  -readonly [Key in keyof SearchServersParams]: SearchServersParams[Key];
};

export async function runSearchCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult> {
  const parsed = parseSearchArgs(argv);
  if (!parsed.ok) {
    return createFailureResult("search", {
      exitCode: 2,
      code: "USAGE_ERROR",
      message: parsed.message,
      stderrLines: [SEARCH_USAGE],
    });
  }

  try {
    const response = await deps.directoryClient.searchServers(parsed.params);
    return createSuccessResult("search", response);
  } catch (error) {
    return toDirectoryFailure("search", error);
  }
}

function parseSearchArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly params: SearchServersParams }
  | { readonly ok: false; readonly message: string } {
  const params: MutableSearchServersParams = {};
  const queryParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--json") {
      continue;
    }

    if (token === "--client") {
      const value = argv[index + 1];
      if (
        value !== "claude-code" &&
        value !== "codex" &&
        value !== "cursor" &&
        value !== "vscode"
      ) {
        return { ok: false, message: "search requires a supported --client value" };
      }

      params.client = value;
      index += 1;
      continue;
    }

    if (token === "--category") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        return { ok: false, message: "search requires a non-empty --category value" };
      }

      params.category = value;
      index += 1;
      continue;
    }

    if (token === "--cursor") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        return { ok: false, message: "search requires a non-empty --cursor value" };
      }

      params.cursor = value;
      index += 1;
      continue;
    }

    if (token === "--limit") {
      const value = argv[index + 1]?.trim();
      if (!value || !/^\d+$/.test(value)) {
        return { ok: false, message: "search requires an integer --limit value" };
      }

      const limit = Number(value);
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        return { ok: false, message: "search requires a positive integer --limit value" };
      }

      params.limit = limit;
      index += 1;
      continue;
    }

    if (token === "--sort") {
      const value = argv[index + 1];
      if (value !== "recent" && value !== "name" && value !== "relevance") {
        return { ok: false, message: "search requires --sort to be recent, name, or relevance" };
      }

      params.sort = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      return { ok: false, message: `search does not support option ${token}` };
    }

    queryParts.push(token);
  }

  const query = queryParts.join(" ").trim();
  if (query.length === 0) {
    return { ok: false, message: "search requires a query" };
  }

  params.q = query;
  return { ok: true, params };
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
