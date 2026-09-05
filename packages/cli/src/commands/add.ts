import { isSupportedClientId } from "@themcpdirectory/client-adapters";
import type { ClientId, ClientScope } from "@themcpdirectory/install-engine";
import type { CliDependencies } from "../dependencies.js";
import { getCliCommandMetadata } from "../command-metadata.js";
import { sanitizeTerminalText } from "../output/render.js";
import { executeAddCommand, type AddExecutionResult } from "./add-execute.js";
import { planAddCommand, type AddCommandOptions, type TargetInstallPreview } from "./add-plan.js";
import type { CommandResult } from "./result.js";

export const ADD_USAGE = getCliCommandMetadata("add")!.usage;

export async function runAddCliCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult<AddExecutionResult>> {
  const parsed = parseAddArgs(argv);
  if (!parsed.ok) {
    return failure("USAGE_ERROR", parsed.message, 2, undefined, [ADD_USAGE]);
  }

  const planning = await planAddCommand(parsed.options, deps);
  if (planning.exitCode !== 0 || !planning.stdout?.data) {
    return failure(
      planning.stdout?.error?.code ?? "COMMAND_FAILED",
      planning.stdout?.error?.message ?? "Installation planning failed.",
      planning.exitCode || 1,
      undefined,
      planning.stderrLines,
      planning.warnings,
    );
  }

  const { previews, confirmationMessage } = planning.stdout.data;
  const warnings = [
    ...new Set([...planning.warnings, ...previews.flatMap((preview) => preview.warnings)]),
  ];
  if (parsed.options.dryRun) {
    return success(
      previews.map((preview) => skippedTarget(preview, preview.plan.previewLines.join(" "))),
      warnings,
    );
  }

  if (!parsed.options.yes) {
    if (!deps.promptIO.isInteractive) {
      const targets = previews.map((preview) =>
        skippedTarget(preview, "Installation requires confirmation."),
      );
      return failure(
        "REQUIRED_INPUT",
        "Installation requires --yes in noninteractive mode.",
        1,
        targets,
        undefined,
        warnings,
      );
    }

    if (!(await deps.promptIO.confirm(sanitizeTerminalText(confirmationMessage)))) {
      const targets = previews.map((preview) =>
        skippedTarget(preview, "Installation was cancelled."),
      );
      return failure(
        "USER_CANCELLED",
        "Installation was cancelled.",
        1,
        targets,
        undefined,
        warnings,
      );
    }
  }

  return withWarnings(await executeAddCommand(previews, deps), warnings);
}

export function parseAddArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly options: AddCommandOptions }
  | { readonly ok: false; readonly message: string } {
  let identifier: string | undefined;
  let targetClients: readonly ClientId[] | "all" | undefined;
  let requestedScope: ClientScope | undefined;
  let requestedVariantId: string | undefined;
  let dryRun = false;
  let yes = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    if (token === "--dry-run") dryRun = true;
    else if (token === "--yes" || token === "-y") yes = true;
    else if (token === "--json") json = true;
    else if (token === "--to") {
      const value = argv[++index];
      const parsedTargets = parseTargets(value);
      if (!parsedTargets) {
        return { ok: false, message: "add requires supported comma-separated --to values or all" };
      }
      targetClients = parsedTargets;
    } else if (token === "--scope") {
      const value = argv[++index];
      if (!isClientScope(value)) {
        return { ok: false, message: "add requires --scope to be user, project, or global" };
      }
      requestedScope = value;
    } else if (token === "--variant") {
      const value = argv[++index]?.trim();
      if (!value) return { ok: false, message: "add requires a non-empty --variant value" };
      requestedVariantId = value;
    } else if (token.startsWith("--")) {
      return { ok: false, message: `add does not support option ${token}` };
    } else if (!identifier) identifier = token.trim();
    else return { ok: false, message: "add accepts exactly one server identifier" };
  }

  if (!identifier) return { ok: false, message: "add requires a server slug or alias" };

  return {
    ok: true,
    options: {
      identifier,
      ...(targetClients ? { targetClients } : {}),
      ...(requestedScope ? { requestedScope } : {}),
      ...(requestedVariantId ? { requestedVariantId } : {}),
      dryRun,
      yes,
      json,
    },
  };
}

function parseTargets(value: string | undefined): readonly ClientId[] | "all" | null {
  if (value === "all") return "all";
  const targets = value?.split(",").map((target) => target.trim());
  if (!targets?.length || targets.some((target) => !isClientId(target))) return null;
  return [...new Set(targets)] as readonly ClientId[];
}

function isClientId(value: string): value is ClientId {
  return isSupportedClientId(value);
}

function isClientScope(value: string | undefined): value is ClientScope {
  return value === "user" || value === "project" || value === "global";
}

function skippedTarget(preview: TargetInstallPreview, message: string) {
  return {
    client: preview.client,
    scope: preview.scope,
    status: "skipped" as const,
    verificationMessage: message || "Dry run completed without installation.",
    receiptWritten: false,
    recoveryHint: `Install with: mcpdir add ${preview.intent.server.slug} --to ${preview.client} --scope ${preview.scope}`,
  };
}

function success(
  targets: AddExecutionResult["targets"],
  warnings: readonly string[] = [],
): CommandResult<AddExecutionResult> {
  return {
    exitCode: 0,
    stdout: {
      schemaVersion: 1,
      command: "add",
      ok: true,
      data: { exitCode: 0, targets },
      warnings,
    },
    stderrLines: [],
    warnings,
  };
}

function failure(
  code: string,
  message: string,
  exitCode: number,
  targets?: AddExecutionResult["targets"],
  stderrLines: readonly string[] = [message],
  warnings: readonly string[] = [],
): CommandResult<AddExecutionResult> {
  return {
    exitCode,
    stdout: {
      schemaVersion: 1,
      command: "add",
      ok: false,
      ...(targets ? { data: { exitCode, targets } } : {}),
      error: { code, message },
      warnings,
    },
    stderrLines,
    warnings,
  };
}

function withWarnings(
  result: CommandResult<AddExecutionResult>,
  warnings: readonly string[],
): CommandResult<AddExecutionResult> {
  if (warnings.length === 0) return result;
  const combinedWarnings = [...new Set([...result.warnings, ...warnings])];
  return {
    ...result,
    ...(result.stdout ? { stdout: { ...result.stdout, warnings: combinedWarnings } } : {}),
    warnings: combinedWarnings,
  };
}
