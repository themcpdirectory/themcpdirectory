import {
  MCPDIR_MANIFEST_SCHEMA_URL,
  parseMcpdirManifest,
  type McpdirManifest,
} from "@themcpdirectory/registry-normalizer";
import { getCliCommandMetadata } from "../command-metadata.js";
import type { CliDependencies } from "../dependencies.js";
import { createFailureResult, createSuccessResult, type CommandResult } from "./result.js";
import { isFileSystemError, resolveMaintainerPath } from "./manifest-file.js";

const COMMAND_NAME = "init";
const REMOTE_TYPES = ["streamable-http", "sse"] as const;
type RemoteType = (typeof REMOTE_TYPES)[number];

export interface InitResult {
  readonly path: string;
  readonly kind: "package" | "remote";
  readonly overwritten: boolean;
}

export const INIT_USAGE = getCliCommandMetadata(COMMAND_NAME)!.usage;

export async function runInitCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult> {
  const parsed = parseInitArgs(argv);
  if (!parsed.ok) return usageFailure(parsed.message);

  const completed = await completeInitOptions(parsed.options, deps);
  if (!completed.ok) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 1,
      code: "REQUIRED_INPUT",
      message: completed.message,
    });
  }

  const manifest = createManifest(completed.options);
  const validation = parseMcpdirManifest(manifest);
  if (!validation.success) {
    return createFailureResult(COMMAND_NAME, {
      exitCode: 2,
      code: "MANIFEST_INVALID",
      message: validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    });
  }

  const path = resolveMaintainerPath(undefined, deps);
  const fileSystem = deps.maintainerFileSystem;
  if (!fileSystem) return writeFailure(path);
  let overwritten = false;
  if (completed.options.force) {
    try {
      await fileSystem.readFile(path);
      overwritten = true;
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) {
        return writeFailure(path);
      }
    }
  }

  try {
    await fileSystem.writeFile(path, `${JSON.stringify(validation.data, null, 2)}\n`, {
      flag: completed.options.force ? "w" : "wx",
    });
  } catch (error) {
    if (isFileSystemError(error, "EEXIST")) {
      return createFailureResult(COMMAND_NAME, {
        exitCode: 1,
        code: "MANIFEST_EXISTS",
        message: `${path} already exists. Re-run with --force to replace it.`,
      });
    }
    return writeFailure(path);
  }

  return createSuccessResult(COMMAND_NAME, {
    path,
    kind: completed.options.remote ? "remote" : "package",
    overwritten,
  });
}

interface InitOptions {
  readonly packageIdentifier?: string;
  readonly remote?: string;
  readonly remoteType?: RemoteType;
  readonly name?: string;
  readonly description?: string;
  readonly version?: string;
  readonly force: boolean;
}

interface CompletedInitOptions {
  readonly packageIdentifier?: string;
  readonly remote?: string;
  readonly remoteType?: RemoteType;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly force: boolean;
}

export function parseInitArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly options: InitOptions }
  | { readonly ok: false; readonly message: string } {
  let packageIdentifier: string | undefined;
  let remote: string | undefined;
  let remoteType: RemoteType | undefined;
  let name: string | undefined;
  let description: string | undefined;
  let version: string | undefined;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") continue;
    if (token === "--force") {
      force = true;
      continue;
    }
    if (
      token === "--package" ||
      token === "--remote" ||
      token === "--remote-type" ||
      token === "--name" ||
      token === "--description" ||
      token === "--version"
    ) {
      const value = argv[index + 1]?.trim();
      if (!value) return { ok: false, message: `init requires a value for ${token}` };
      if (token === "--package") packageIdentifier = value;
      if (token === "--remote") remote = value;
      if (token === "--remote-type") {
        if (!isRemoteType(value)) {
          return {
            ok: false,
            message: "init requires --remote-type to be streamable-http or sse",
          };
        }
        remoteType = value;
      }
      if (token === "--name") name = value;
      if (token === "--description") description = value;
      if (token === "--version") version = value;
      index += 1;
      continue;
    }
    return { ok: false, message: `init does not support argument ${token ?? ""}` };
  }

  if (packageIdentifier && remote) {
    return { ok: false, message: "init accepts either --package or --remote, not both" };
  }
  if (packageIdentifier && remoteType) {
    return { ok: false, message: "init does not accept --remote-type with --package" };
  }

  return {
    ok: true,
    options: {
      ...(packageIdentifier ? { packageIdentifier } : {}),
      ...(remote ? { remote } : {}),
      ...(remoteType ? { remoteType } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(version ? { version } : {}),
      force,
    },
  };
}

async function completeInitOptions(
  options: InitOptions,
  deps: CliDependencies,
): Promise<
  | { readonly ok: true; readonly options: CompletedInitOptions }
  | { readonly ok: false; readonly message: string }
> {
  if (!deps.promptIO.isInteractive) {
    const missing = [
      !options.name && "--name",
      !options.description && "--description",
      !options.version && "--version",
      !options.packageIdentifier && !options.remote && "--package or --remote",
      Boolean(options.remote) && !options.remoteType && "--remote-type",
    ].filter((value): value is string => typeof value === "string");
    if (missing.length > 0) {
      return {
        ok: false,
        message: `init requires explicit ${missing.join(", ")} in noninteractive mode.`,
      };
    }
  }

  const name = options.name ?? (await promptRequired(deps, "Official Registry name"));
  const description = options.description ?? (await promptRequired(deps, "Server description"));
  const version = options.version ?? (await promptRequired(deps, "Exact semantic version"));
  const distribution =
    options.packageIdentifier || (!options.remote && !options.remoteType)
      ? options.packageIdentifier
        ? "package"
        : await deps.promptIO.select("How is the server distributed?", ["package", "remote"])
      : "remote";

  if (distribution === "package") {
    const packageIdentifier =
      options.packageIdentifier ?? (await promptRequired(deps, "npm package identifier"));
    return {
      ok: true,
      options: { packageIdentifier, name, description, version, force: options.force },
    };
  }

  const remote = options.remote ?? (await promptRequired(deps, "Remote server URL"));
  const remoteType =
    options.remoteType ??
    (await deps.promptIO.select("Which remote transport type?", REMOTE_TYPES));
  return {
    ok: true,
    options: { remote, remoteType, name, description, version, force: options.force },
  };
}

async function promptRequired(deps: CliDependencies, message: string): Promise<string> {
  while (true) {
    const value = (await deps.promptIO.input(message)).trim();
    if (value) return value;
  }
}

function isRemoteType(value: string): value is RemoteType {
  return REMOTE_TYPES.some((type) => type === value);
}

function createManifest(options: CompletedInitOptions): McpdirManifest {
  const server = {
    $schema: MCPDIR_MANIFEST_SCHEMA_URL as typeof MCPDIR_MANIFEST_SCHEMA_URL,
    name: options.name,
    description: options.description,
    version: options.version,
    ...(options.remote
      ? { remotes: [{ type: options.remoteType!, url: options.remote }] }
      : {
          packages: [
            {
              registryType: "npm",
              identifier: options.packageIdentifier!,
              version: options.version,
              transport: { type: "stdio" as const },
            },
          ],
        }),
  };
  return { schemaVersion: 1, server };
}

function usageFailure(message: string): CommandResult {
  return createFailureResult(COMMAND_NAME, {
    exitCode: 2,
    code: "USAGE_ERROR",
    message,
    stderrLines: [INIT_USAGE],
  });
}

function writeFailure(path: string): CommandResult {
  return createFailureResult(COMMAND_NAME, {
    exitCode: 1,
    code: "MANIFEST_WRITE_FAILED",
    message: `${path} could not be written. Check the directory permissions.`,
  });
}
