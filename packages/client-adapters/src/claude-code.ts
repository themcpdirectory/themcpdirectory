import { posix, win32 } from "node:path";
import {
  assertExactPinnedVersion,
  validateInstallPlan,
  validateRemovalPlan,
  type AdapterCapability,
  type AdapterSafetyDescriptor,
  type ClientScope,
  type InstallInputDefinition,
  type InstallInputValue,
  type InstallManifestPackageVariantV1,
  type InstallManifestRemoteVariantV1,
  type InstallPlan,
  type RemovalPlan,
  type ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import type {
  AdapterRuntime,
  ClientDetection,
  DiagnosticResult,
  ExecFileOptions,
  InstalledMcpServer,
  McpClientAdapter,
  PlanInstallOptions,
  PlanRemoveOptions,
} from "./types.js";

const CLAUDE_EXEC_OPTIONS = Object.freeze({
  timeoutMs: 5_000,
  maxStdoutBytes: 65_536,
  maxStderrBytes: 16_384,
  shell: false,
  stdin: "ignore",
} satisfies ExecFileOptions);

const EMPTY_HELP_TEXT: ClaudeCapabilityProbeResult["helpText"] = Object.freeze({
  root: "",
  add: "",
  addJson: "",
  list: "",
  remove: "",
});

const SAFE_NPX_RUNTIME_OPTIONS = new Set(["registry"]);
const SAFE_SERVER_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const SAFE_ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SENSITIVE_INPUT_PATTERN = /(?:api[_-]?key|auth|credential|password|secret|token)/iu;

export type ClaudeCodeAdapterErrorCode =
  | "CLAUDE_CODE_NOT_INSTALLED"
  | "CLAUDE_CODE_UNSUPPORTED_CAPABILITY"
  | "CLAUDE_CODE_INVALID_INPUT"
  | "CLAUDE_CODE_INVALID_PLAN"
  | "CLAUDE_CODE_COMMAND_FAILED"
  | "CLAUDE_CODE_INVALID_LIST_OUTPUT";

export class ClaudeCodeAdapterError extends Error {
  readonly code: ClaudeCodeAdapterErrorCode;
  readonly capability?: AdapterCapability;

  constructor(
    code: ClaudeCodeAdapterErrorCode,
    message: string,
    options?: { readonly capability?: AdapterCapability },
  ) {
    super(message);
    this.name = "ClaudeCodeAdapterError";
    this.code = code;
    if (options?.capability !== undefined) {
      this.capability = options.capability;
    }
  }
}

export interface ClaudeCapabilityProbeResult {
  readonly detection: ClientDetection;
  readonly helpText: Readonly<Record<"root" | "add" | "addJson" | "list" | "remove", string>>;
}

interface ClaudeListEntry {
  readonly name: string;
  readonly scope?: ClientScope;
  readonly status?: string;
}

interface ClaudeServerDetail {
  readonly name: string;
  readonly scope: ClientScope;
  readonly transport: "stdio" | "streamable-http";
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPathEnvironmentValue(runtime: AdapterRuntime): string {
  if (runtime.platform !== "win32") {
    return runtime.env.PATH ?? "";
  }

  const entry = Object.entries(runtime.env).find(([key]) => key.toLowerCase() === "path");
  return entry?.[1] ?? "";
}

function getExecutableCandidates(runtime: AdapterRuntime): readonly string[] {
  const pathModule = runtime.platform === "win32" ? win32 : posix;
  const delimiter = runtime.platform === "win32" ? ";" : ":";
  const executableName = runtime.platform === "win32" ? "claude.exe" : "claude";

  const pathCandidates = getPathEnvironmentValue(runtime)
    .split(delimiter)
    .filter((directory) => directory.length > 0 && directory !== ".")
    .filter((directory) => pathModule.isAbsolute(directory))
    .map((directory) => pathModule.join(directory, executableName));

  const standardCandidates =
    runtime.platform === "win32"
      ? [
          runtime.env.LOCALAPPDATA
            ? win32.join(runtime.env.LOCALAPPDATA, "Programs", "Claude", "claude.exe")
            : undefined,
          runtime.env.APPDATA ? win32.join(runtime.env.APPDATA, "claude.exe") : undefined,
        ]
      : runtime.platform === "darwin"
        ? ["/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude"]
        : ["/usr/local/bin/claude", "/usr/bin/claude"];

  return [...new Set([...pathCandidates, ...standardCandidates.filter(Boolean)])] as string[];
}

async function findClaudeExecutable(runtime: AdapterRuntime): Promise<string | undefined> {
  for (const candidate of getExecutableCandidates(runtime)) {
    try {
      const stat = await runtime.stat(candidate);
      if (stat.isFile() && (runtime.platform === "win32" || (stat.mode & 0o111) !== 0)) {
        return candidate;
      }
    } catch {
      // Missing or inaccessible candidates are ignored.
    }
  }

  return undefined;
}

function hasCommand(helpText: string, command: string): boolean {
  return new RegExp(`^\\s{0,8}${command}(?:\\s|$)`, "mu").test(helpText);
}

function hasFlag(helpText: string, flag: string): boolean {
  const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[\\s([|])${escapedFlag}(?:[=\\s<>|\\])]|$)`, "mu").test(helpText);
}

function deriveCapabilities(
  helpText: ClaudeCapabilityProbeResult["helpText"],
): AdapterCapability[] {
  const capabilities: AdapterCapability[] = [];
  const canAdd = hasCommand(helpText.root, "add");
  const canAddJson = hasCommand(helpText.root, "add-json");
  const canList = hasCommand(helpText.root, "list");
  const canRemove = hasCommand(helpText.root, "remove");

  if (canAdd && /--\s+<COMMAND>/u.test(helpText.add)) {
    capabilities.push("native-add-stdio");
  }
  if (canAdd && hasFlag(helpText.add, "--transport")) {
    capabilities.push("native-add-remote");
  }
  if (canRemove && /claude\s+mcp\s+remove/u.test(helpText.remove)) {
    capabilities.push("native-remove");
  }
  if (canList && /claude\s+mcp\s+list/u.test(helpText.list)) {
    capabilities.push("native-list");
    if (hasFlag(helpText.list, "--json")) {
      capabilities.push("native-list-json");
    }
  }
  if (canAdd && hasFlag(helpText.add, "--scope")) {
    if (/\blocal\b/u.test(helpText.add)) {
      capabilities.push("native-scope-global");
    }
    if (/\bproject\b/u.test(helpText.add)) {
      capabilities.push("native-scope-project");
    }
    if (/\buser\b/u.test(helpText.add)) {
      capabilities.push("native-scope-user");
    }
  }
  if (
    canAdd &&
    (hasFlag(helpText.add, "--env") ||
      (canAddJson && /claude\s+mcp\s+add-json(?:\s|$)/iu.test(helpText.addJson)))
  ) {
    capabilities.push("env-reference");
  }

  return capabilities;
}

function parseVersion(stdout: string): string | undefined {
  const version = stdout.trim();
  return version.length > 0 ? version : undefined;
}

async function runProbe(
  runtime: AdapterRuntime,
  executable: string,
  args: readonly string[],
): Promise<string> {
  const result = await runtime.execFile(executable, args, CLAUDE_EXEC_OPTIONS);
  return result.exitCode === 0 ? result.stdout : "";
}

export async function probeClaudeCodeCapabilities(
  runtime: AdapterRuntime,
): Promise<ClaudeCapabilityProbeResult> {
  const executable = await findClaudeExecutable(runtime);
  if (!executable) {
    return {
      detection: { id: "claude-code", installed: false, capabilities: [] },
      helpText: EMPTY_HELP_TEXT,
    };
  }

  const [versionText, root, add, addJson, list, remove] = await Promise.all([
    runProbe(runtime, executable, ["--version"]),
    runProbe(runtime, executable, ["mcp", "--help"]),
    runProbe(runtime, executable, ["mcp", "add", "--help"]),
    runProbe(runtime, executable, ["mcp", "add-json", "--help"]),
    runProbe(runtime, executable, ["mcp", "list", "--help"]),
    runProbe(runtime, executable, ["mcp", "remove", "--help"]),
  ]);
  const helpText = Object.freeze({ root, add, addJson, list, remove });
  const version = parseVersion(versionText);

  return {
    detection: {
      id: "claude-code",
      installed: version !== undefined,
      executable,
      ...(version === undefined ? {} : { version }),
      capabilities: version === undefined ? [] : deriveCapabilities(helpText),
    },
    helpText,
  };
}

export async function detectClaudeCode(runtime: AdapterRuntime): Promise<ClientDetection> {
  return (await probeClaudeCodeCapabilities(runtime)).detection;
}

function requireInstalled(probe: ClaudeCapabilityProbeResult): string {
  if (!probe.detection.installed || !probe.detection.executable) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_NOT_INSTALLED",
      "Claude Code CLI is not installed",
    );
  }

  return probe.detection.executable;
}

function requireCapability(
  probe: ClaudeCapabilityProbeResult,
  capability: AdapterCapability,
): void {
  if (!probe.detection.capabilities.includes(capability)) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      `Installed Claude Code CLI does not prove support for ${capability}`,
      { capability },
    );
  }
}

function mapScopeToAddArgs(
  probe: ClaudeCapabilityProbeResult,
  scope: ClientScope,
): readonly string[] {
  if (scope === "global") {
    requireCapability(probe, "native-scope-global");
    return ["--scope", "local"];
  }
  if (scope === "project") {
    requireCapability(probe, "native-scope-project");
    return ["--scope", "project"];
  }

  requireCapability(probe, "native-scope-user");
  return ["--scope", "user"];
}

function mapScopeToAddJsonArgs(
  probe: ClaudeCapabilityProbeResult,
  scope: ClientScope,
): readonly string[] {
  if (!hasFlag(probe.helpText.addJson, "--scope")) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      "Installed Claude Code CLI does not prove support for add-json --scope",
      { capability: "native-add-remote" },
    );
  }

  const scopeValue = scope === "global" ? "local" : scope;
  if (!new RegExp(`\\b${scopeValue}\\b`, "u").test(probe.helpText.addJson)) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      `Installed Claude Code CLI does not prove support for add-json --scope ${scopeValue}`,
      { capability: "native-add-remote" },
    );
  }

  return ["--scope", scopeValue];
}

function normalizeScopeLabel(value: string): ClientScope | undefined {
  const lower = value.toLowerCase();
  if (lower === "local" || lower === "global") {
    return "global";
  }
  if (lower === "project") {
    return "project";
  }
  if (lower === "user") {
    return "user";
  }

  return undefined;
}

function normalizeScopeMatch(scope: ClientScope, actual: ClientScope): boolean {
  return scope === actual;
}

function requireClaudeCodeIntent(options: PlanInstallOptions): void {
  if (options.intent.client !== "claude-code") {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_INPUT",
      "Claude Code adapter requires an intent resolved for Claude Code",
    );
  }
}

function getInput(inputs: ValidatedInstallInputMap, key: string): InstallInputValue {
  const value = inputs.get(key);
  if (!value) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_INPUT",
      `Missing validated input: ${key}`,
    );
  }

  return value;
}

function getTextInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "text") {
    throw new ClaudeCodeAdapterError("CLAUDE_CODE_INVALID_INPUT", `Input ${key} must be text`);
  }

  return value.value;
}

function getEnvReferenceInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "env-reference") {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      "Claude Code adapter requires environment references for remote secret authentication",
      { capability: "env-reference" },
    );
  }

  if (!SAFE_ENV_NAME_PATTERN.test(value.envName)) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_INPUT",
      `Input ${key} requires a valid environment variable name`,
    );
  }

  return value.envName;
}

function findArgumentDefinition(
  definitions: readonly InstallInputDefinition[],
  source: "package-runtime-argument" | "package-argument",
  index: number,
): Extract<
  InstallInputDefinition,
  { source: "package-runtime-argument" | "package-argument" }
> | null {
  return (
    definitions.find(
      (
        definition,
      ): definition is Extract<
        InstallInputDefinition,
        { source: "package-runtime-argument" | "package-argument" }
      > => definition.source === source && definition.index === index,
    ) ?? null
  );
}

function appendPackageArguments(
  target: string[],
  argumentsList:
    | InstallManifestPackageVariantV1["runtimeArguments"]
    | InstallManifestPackageVariantV1["packageArguments"],
  source: "package-runtime-argument" | "package-argument",
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): void {
  for (const [index, argument] of argumentsList.entries()) {
    const definition = findArgumentDefinition(definitions, source, index);
    if (!definition) {
      throw new ClaudeCodeAdapterError(
        "CLAUDE_CODE_INVALID_INPUT",
        `Missing input definition for ${source} ${index}`,
      );
    }

    const value = inputs.get(definition.key);
    if (!value && !argument.required) {
      continue;
    }

    if (
      source === "package-runtime-argument" &&
      (argument.type !== "named" || !argument.name || !SAFE_NPX_RUNTIME_OPTIONS.has(argument.name))
    ) {
      throw new ClaudeCodeAdapterError(
        "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
        "Claude Code adapter does not support the requested npx runtime option",
      );
    }

    const text = getTextInput(inputs, definition.key);
    if (argument.type === "named") {
      if (!argument.name) {
        throw new ClaudeCodeAdapterError(
          "CLAUDE_CODE_INVALID_INPUT",
          `Named package argument ${definition.key} has no name`,
        );
      }
      target.push(`--${argument.name}`, text);
      continue;
    }

    target.push(text);
  }
}

function buildPackageCommand(
  variant: InstallManifestPackageVariantV1,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): readonly string[] {
  if (
    variant.registryType !== "npm" ||
    (variant.runtimeHint !== null && variant.runtimeHint !== "npx")
  ) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      "Claude Code adapter supports exact npm package variants through npx only",
    );
  }

  if (variant.environmentVariables.length > 0) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      "Installed Claude Code CLI does not prove stdio environment-reference support",
      { capability: "env-reference" },
    );
  }

  const packageCommand = ["npx", "--yes"];
  appendPackageArguments(
    packageCommand,
    variant.runtimeArguments,
    "package-runtime-argument",
    definitions,
    inputs,
  );
  packageCommand.push(`${variant.identifier}@${assertExactPinnedVersion(variant.version)}`);
  appendPackageArguments(
    packageCommand,
    variant.packageArguments,
    "package-argument",
    definitions,
    inputs,
  );

  return packageCommand;
}

function expandRemoteUrl(
  variant: InstallManifestRemoteVariantV1,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): string {
  let url = variant.urlTemplate;
  for (const variable of variant.variables) {
    const definition = definitions.find(
      (candidate): candidate is Extract<InstallInputDefinition, { source: "remote-variable" }> =>
        candidate.source === "remote-variable" && candidate.name === variable.name,
    );
    if (!definition) {
      throw new ClaudeCodeAdapterError(
        "CLAUDE_CODE_INVALID_INPUT",
        `Missing input definition for remote variable ${variable.name}`,
      );
    }

    if (
      definition.accepts.some((kind) => kind !== "text") ||
      SENSITIVE_INPUT_PATTERN.test(
        [definition.key, definition.name, definition.description ?? ""].join(" "),
      )
    ) {
      throw new ClaudeCodeAdapterError(
        "CLAUDE_CODE_INVALID_INPUT",
        "Sensitive values cannot be placed in a remote URL",
      );
    }

    const value = inputs.get(definition.key);
    if (!value && variable.defaultValue !== null) {
      url = url.replaceAll(`{${variable.name}}`, encodeURIComponent(variable.defaultValue));
      continue;
    }
    if (!value && !variable.required) {
      continue;
    }

    url = url.replaceAll(
      `{${variable.name}}`,
      encodeURIComponent(getTextInput(inputs, definition.key)),
    );
  }

  if (/\{[^{}]+\}/u.test(url)) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_INPUT",
      "Remote URL contains an unresolved variable",
    );
  }

  return url;
}

function formatEnvReference(envName: string): string {
  return `$` + `{${envName}}`;
}

function expandRemoteHeaderValue(
  header: InstallManifestRemoteVariantV1["headers"][number],
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): { readonly value: string; readonly usedEnvReference: boolean } {
  let expanded = header.value;
  let usedEnvReference = false;

  for (const match of header.value.matchAll(/\{([^{}]+)\}/gu)) {
    const placeholder = match[1];
    if (!placeholder) {
      continue;
    }

    const definition = definitions.find(
      (candidate): candidate is Extract<InstallInputDefinition, { source: "remote-header" }> =>
        candidate.source === "remote-header" &&
        candidate.headerName === header.name &&
        candidate.placeholder === placeholder,
    );
    if (!definition) {
      throw new ClaudeCodeAdapterError(
        "CLAUDE_CODE_INVALID_INPUT",
        `Missing input definition for remote header placeholder ${placeholder}`,
      );
    }

    const value = getInput(inputs, definition.key);
    const replacement =
      value.kind === "env-reference"
        ? (() => {
            usedEnvReference = true;
            return formatEnvReference(getEnvReferenceInput(inputs, definition.key));
          })()
        : value.kind === "secret-value"
          ? (() => {
              throw new ClaudeCodeAdapterError(
                "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
                "Claude Code adapter does not support persisted secret remote auth combinations",
              );
            })()
          : definition.sensitive
            ? (() => {
                throw new ClaudeCodeAdapterError(
                  "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
                  "Claude Code adapter requires environment references for remote secret authentication",
                  { capability: "env-reference" },
                );
              })()
            : value.value;

    expanded = expanded.replaceAll(`{${placeholder}}`, replacement);
  }

  if (/(?<!\$)\{[^{}]+\}/u.test(expanded)) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_INPUT",
      `Remote header ${header.name} contains an unresolved variable`,
    );
  }

  return { value: expanded, usedEnvReference };
}

function buildRemoteAddOperationArgs(
  probe: ClaudeCapabilityProbeResult,
  variant: InstallManifestRemoteVariantV1,
  serverSlug: string,
  scope: ClientScope,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
  remoteAuthKind: PlanInstallOptions["intent"]["remoteAuth"]["kind"],
): { readonly args: readonly string[]; readonly usedJson: boolean; readonly url: string } {
  const url = expandRemoteUrl(variant, definitions, inputs);
  const scopeArgs = mapScopeToAddArgs(probe, scope);

  const headerPairs = variant.headers.map((header) => ({
    name: header.name,
    expanded: expandRemoteHeaderValue(header, definitions, inputs),
  }));

  const hasEnvReferenceHeader = headerPairs.some((pair) => pair.expanded.usedEnvReference);
  const shouldUseJson = remoteAuthKind === "env-reference" || hasEnvReferenceHeader;

  if (remoteAuthKind === "persisted-secret" || remoteAuthKind === "mixed") {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      "Claude Code adapter does not support persisted secret remote auth combinations",
    );
  }

  if (shouldUseJson) {
    if (
      !hasCommand(probe.helpText.root, "add-json") ||
      !/claude\s+mcp\s+add-json(?:\s|$)/iu.test(probe.helpText.addJson)
    ) {
      throw new ClaudeCodeAdapterError(
        "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
        "Installed Claude Code CLI does not prove support for add-json command syntax",
        { capability: "native-add-remote" },
      );
    }

    requireCapability(probe, "env-reference");
    const scopeArgs = mapScopeToAddJsonArgs(probe, scope);
    const headers: Record<string, string> = {};
    for (const pair of headerPairs) {
      headers[pair.name] = pair.expanded.value;
    }

    const jsonConfig = JSON.stringify({
      type: variant.transport === "streamable-http" ? "http" : "sse",
      url,
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
    });

    return {
      args: ["mcp", "add-json", serverSlug, jsonConfig, ...scopeArgs],
      usedJson: true,
      url,
    };
  }

  if (headerPairs.length > 0 && !hasFlag(probe.helpText.add, "--header")) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
      "Installed Claude Code CLI does not prove support for add --header",
      { capability: "native-add-remote" },
    );
  }

  const headerArgs = headerPairs.flatMap((pair) => [
    "--header",
    `${pair.name}: ${pair.expanded.value}`,
  ]);
  return {
    args: [
      "mcp",
      "add",
      serverSlug,
      ...scopeArgs,
      "--transport",
      variant.transport === "streamable-http" ? "http" : "sse",
      ...headerArgs,
      url,
    ],
    usedJson: false,
    url,
  };
}

function buildInstallPlan(
  probe: ClaudeCapabilityProbeResult,
  options: PlanInstallOptions,
): InstallPlan {
  const executable = requireInstalled(probe);
  const { intent } = options;

  let args: readonly string[];
  let capability: "native-add-stdio" | "native-add-remote";
  let effect: string;

  if (intent.variant.kind === "package") {
    capability = "native-add-stdio";
    requireCapability(probe, capability);
    const packageCommand = buildPackageCommand(intent.variant, intent.inputs, options.inputs);
    const scopeArgs = mapScopeToAddArgs(probe, intent.scope);
    args = ["mcp", "add", intent.server.slug, ...scopeArgs, "--", ...packageCommand];
    effect = `Run ${packageCommand.join(" ")}.`;
  } else {
    capability = "native-add-remote";
    requireCapability(probe, capability);
    const remote = buildRemoteAddOperationArgs(
      probe,
      intent.variant,
      intent.server.slug,
      intent.scope,
      intent.inputs,
      options.inputs,
      intent.remoteAuth.kind,
    );
    args = remote.args;
    effect = remote.usedJson
      ? `Configure remote MCP server ${intent.server.slug} with preserved environment references.`
      : `Configure remote URL ${remote.url}.`;
  }

  return {
    schemaVersion: 1,
    serverSlug: intent.server.slug,
    client: "claude-code",
    scope: intent.scope,
    variantId: intent.variant.id,
    manifestHash: options.manifestHash,
    intentHash: options.intentHash,
    operations: [{ type: "client-command", executable, args, capability }],
    previewLines: [`Add ${intent.server.title} to Claude Code configuration.`, effect],
  };
}

function parseClaudeListEntries(stdout: string): readonly ClaudeListEntry[] {
  const entries: ClaudeListEntry[] = [];
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (
      /^(?:MCP|Configured|Server|Name|Available|No servers|Connected|Disconnected|Pending)/iu.test(
        line,
      )
    ) {
      continue;
    }

    const match = /^(?:[-*•]\s*)?([A-Za-z0-9_-]+)(?:\s*[:|]\s*|\s+)(.*)$/u.exec(line);
    if (!match) {
      continue;
    }

    const name = match[1];
    if (!name) {
      continue;
    }
    const remainder = match[2] ?? "";
    const scopeMatch = /\b(local|project|user)\b/iu.exec(remainder);
    entries.push({
      name,
      ...(scopeMatch?.[1]
        ? (() => {
            const parsed = normalizeScopeLabel(scopeMatch[1]);
            return parsed ? { scope: parsed } : {};
          })()
        : {}),
      ...(remainder.length > 0 ? { status: remainder } : {}),
    });
  }

  return entries;
}

function parseClaudeDetail(
  stdout: string,
  fallbackName: string,
  fallbackScope: ClientScope,
): ClaudeServerDetail {
  const metadata: Record<string, string | number | boolean> = {};
  let scope: ClientScope = fallbackScope;
  let transport: "stdio" | "streamable-http" = "streamable-http";
  let name = fallbackName;

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9 -]+):\s*(.*)$/u.exec(line);
    if (!match) {
      continue;
    }

    const key = (match[1] ?? "").trim().toLowerCase();
    const value = (match[2] ?? "").trim();
    if (key === "name") {
      name = value;
      continue;
    }
    if (key === "scope" || key === "location") {
      const parsedScope = normalizeScopeLabel(value);
      if (parsedScope) {
        scope = parsedScope;
      }
      metadata.scope = scope;
      continue;
    }
    if (key === "transport" || key === "type") {
      if (/\bstdio\b/iu.test(value)) {
        transport = "stdio";
      } else if (
        /\bhttp\b/iu.test(value) ||
        /\bstreamable-http\b/iu.test(value) ||
        /\bsse\b/iu.test(value)
      ) {
        transport = "streamable-http";
      }
      metadata.transport = transport;
      continue;
    }
    if (key === "auth" || key === "authentication") {
      if (/^(?:none|disabled|false|no|not configured)$/iu.test(value)) {
        metadata.authConfigured = false;
      } else if (
        /^(?:configured|authenticated|connected|enabled|true|yes)$/iu.test(value) ||
        /^(?:bearer|basic)\s+\S+/iu.test(value)
      ) {
        metadata.authConfigured = true;
      }
      continue;
    }
    if (key === "status" || key === "issue") {
      metadata[key] = value;
    }
  }

  return { name, scope, transport, metadata };
}

async function inspectDetails(
  runtime: AdapterRuntime,
  executable: string,
  listEntry: ClaudeListEntry,
): Promise<InstalledMcpServer | null> {
  const detailResult = await runtime.execFile(
    executable,
    ["mcp", "get", listEntry.name],
    CLAUDE_EXEC_OPTIONS,
  );
  if (detailResult.exitCode !== 0) {
    if (!listEntry.scope) {
      return null;
    }

    return {
      name: listEntry.name,
      slug: listEntry.name,
      client: "claude-code",
      scope: listEntry.scope,
      transport: "streamable-http",
      managedBy: "external",
      adapterMetadata: {
        ...(listEntry.scope === undefined ? {} : { scope: listEntry.scope }),
        ...(listEntry.status === undefined ? {} : { status: listEntry.status }),
      },
    };
  }

  const detail = parseClaudeDetail(
    detailResult.stdout,
    listEntry.name,
    listEntry.scope ?? "global",
  );
  return {
    name: detail.name,
    slug: detail.name,
    client: "claude-code",
    scope: detail.scope,
    transport: detail.transport,
    managedBy: "external",
    adapterMetadata: detail.metadata,
  };
}

function createSafetyDescriptor(probe: ClaudeCapabilityProbeResult): AdapterSafetyDescriptor {
  return {
    client: "claude-code",
    executableAllowList: probe.detection.executable ? [probe.detection.executable] : ["claude"],
    configRoots: [],
    supportedCapabilities: probe.detection.capabilities,
  };
}

function isSafeRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0 &&
      !/\{[^{}]+\}/u.test(value)
    );
  } catch {
    return false;
  }
}

function assertClaudeInstallPlan(plan: InstallPlan): void {
  if (plan.client !== "claude-code" || plan.operations.length !== 1) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_PLAN",
      "Claude Code install plan must contain exactly one Claude Code operation",
    );
  }

  const operation = plan.operations[0];
  if (!operation || operation.type !== "client-command") {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_PLAN",
      "Claude Code install plan must contain one client command",
    );
  }

  const args = operation.args;
  const baseValid = args[0] === "mcp" && args[2] === plan.serverSlug;
  const stdioValid =
    operation.capability === "native-add-stdio" &&
    args[1] === "add" &&
    baseValid &&
    args.includes("--") &&
    args.length >= 5;

  const remoteAddValid =
    operation.capability === "native-add-remote" &&
    args[1] === "add" &&
    baseValid &&
    args.includes("--transport") &&
    typeof args[args.length - 1] === "string" &&
    isSafeRemoteUrl(args[args.length - 1] ?? "");

  const remoteJsonValid =
    operation.capability === "native-add-remote" &&
    args[1] === "add-json" &&
    baseValid &&
    typeof args[3] === "string" &&
    (() => {
      try {
        const parsed = JSON.parse(args[3] ?? "") as unknown;
        return (
          isRecord(parsed) && typeof parsed.type === "string" && typeof parsed.url === "string"
        );
      } catch {
        return false;
      }
    })();

  if (!stdioValid && !remoteAddValid && !remoteJsonValid) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_PLAN",
      "Claude Code install operation does not match its declared capability",
    );
  }
}

function assertClaudeRemovalPlan(plan: RemovalPlan): void {
  if (plan.client !== "claude-code" || plan.operations.length !== 1) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_PLAN",
      "Claude Code removal plan must contain exactly one Claude Code operation",
    );
  }

  const operation = plan.operations[0];
  if (
    !operation ||
    operation.type !== "client-command" ||
    operation.capability !== "native-remove" ||
    operation.args.length < 3 ||
    operation.args[0] !== "mcp" ||
    operation.args[1] !== "remove" ||
    operation.args[2] !== plan.serverSlug
  ) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_INVALID_PLAN",
      "Claude Code removal operation does not match native remove syntax",
    );
  }
}

function getInstallPlanIdentity(plan: InstallPlan): string {
  return [
    plan.manifestHash,
    plan.intentHash,
    plan.client,
    plan.scope,
    plan.serverSlug,
    plan.variantId,
  ].join(":");
}

function getRemovalPlanIdentity(plan: RemovalPlan): string {
  return [plan.client, plan.scope, plan.serverSlug].join(":");
}

function serializeOperations(plan: InstallPlan | RemovalPlan): string {
  return JSON.stringify(plan.operations);
}

async function executeCommand(
  runtime: AdapterRuntime,
  executable: string,
  args: readonly string[],
): Promise<void> {
  const result = await runtime.execFile(executable, args, CLAUDE_EXEC_OPTIONS);
  if (result.exitCode !== 0) {
    throw new ClaudeCodeAdapterError(
      "CLAUDE_CODE_COMMAND_FAILED",
      `Claude Code command failed with exit code ${result.exitCode}`,
    );
  }
}

export function createClaudeCodeAdapter(runtime: AdapterRuntime): McpClientAdapter {
  let latestProbe: ClaudeCapabilityProbeResult | undefined;
  const plannedInstallOperations = new Map<string, string>();
  const plannedRemovalOperations = new Map<string, string>();
  const probe = async (): Promise<ClaudeCapabilityProbeResult> => {
    latestProbe = await probeClaudeCodeCapabilities(runtime);
    return latestProbe;
  };

  const adapter: McpClientAdapter = {
    id: "claude-code" as const,
    async detect() {
      return (await probe()).detection;
    },
    async inspect(scope = "global") {
      const result = await probe();
      const executable = requireInstalled(result);
      requireCapability(result, "native-list");

      const commandResult = await runtime.execFile(
        executable,
        ["mcp", "list"],
        CLAUDE_EXEC_OPTIONS,
      );
      if (commandResult.exitCode !== 0) {
        throw new ClaudeCodeAdapterError(
          "CLAUDE_CODE_COMMAND_FAILED",
          `Claude Code list failed with exit code ${commandResult.exitCode}`,
        );
      }

      const listEntries = parseClaudeListEntries(commandResult.stdout);
      const inspectedEntries = await Promise.all(
        listEntries.map((entry) => inspectDetails(runtime, executable, entry)),
      );

      return inspectedEntries
        .filter((entry): entry is InstalledMcpServer => entry !== null)
        .filter((entry) => normalizeScopeMatch(scope, entry.scope));
    },
    async planInstall(options) {
      requireClaudeCodeIntent(options);
      const plan = buildInstallPlan(await probe(), options);
      plannedInstallOperations.set(getInstallPlanIdentity(plan), serializeOperations(plan));
      return plan;
    },
    async executePlan(plan) {
      const result = await probe();
      const validated = validateInstallPlan(plan, createSafetyDescriptor(result));
      assertClaudeInstallPlan(validated);
      if (
        plannedInstallOperations.get(getInstallPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new ClaudeCodeAdapterError(
          "CLAUDE_CODE_INVALID_PLAN",
          "Claude Code install operation differs from the operation produced during planning",
        );
      }

      for (const operation of validated.operations) {
        if (operation.type !== "client-command") {
          throw new ClaudeCodeAdapterError(
            "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
            "Claude Code install plans may contain client commands only",
          );
        }
        await executeCommand(runtime, operation.executable, operation.args);
      }
    },
    async verifyInstall(plan) {
      const installedEntry = (await this.inspect(plan.scope)).find(
        (entry) => entry.slug === plan.serverSlug,
      );
      return installedEntry
        ? { ok: true, installedEntry, message: `${plan.serverSlug} is installed in Claude Code` }
        : { ok: false, message: `${plan.serverSlug} was not found in Claude Code` };
    },
    async planRemove(options: PlanRemoveOptions): Promise<RemovalPlan> {
      const scope = options.scope ?? "global";
      if (!SAFE_SERVER_SLUG_PATTERN.test(options.slug)) {
        throw new ClaudeCodeAdapterError(
          "CLAUDE_CODE_INVALID_INPUT",
          "Claude Code requires a valid server slug",
        );
      }

      const result = await probe();
      const executable = requireInstalled(result);
      requireCapability(result, "native-remove");
      const scopeArgs = mapScopeToAddArgs(result, scope);
      const plan: RemovalPlan = {
        schemaVersion: 1,
        serverSlug: options.slug,
        client: "claude-code",
        scope,
        operations: [
          {
            type: "client-command",
            executable,
            args: ["mcp", "remove", options.slug, ...scopeArgs],
            capability: "native-remove",
          },
        ],
        previewLines: [`Remove ${options.slug} from Claude Code configuration.`],
      };

      plannedRemovalOperations.set(getRemovalPlanIdentity(plan), serializeOperations(plan));
      return plan;
    },
    async executeRemove(plan) {
      const result = await probe();
      const validated = validateRemovalPlan(plan, createSafetyDescriptor(result));
      assertClaudeRemovalPlan(validated);
      if (
        plannedRemovalOperations.get(getRemovalPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new ClaudeCodeAdapterError(
          "CLAUDE_CODE_INVALID_PLAN",
          "Claude Code removal operation differs from the operation produced during planning",
        );
      }

      for (const operation of validated.operations) {
        if (operation.type !== "client-command") {
          throw new ClaudeCodeAdapterError(
            "CLAUDE_CODE_UNSUPPORTED_CAPABILITY",
            "Claude Code removal plans may contain client commands only",
          );
        }
        await executeCommand(runtime, operation.executable, operation.args);
      }
    },
    async verifyRemove(plan) {
      const installed = (await this.inspect(plan.scope)).some(
        (entry) => entry.slug === plan.serverSlug,
      );
      return installed
        ? { ok: false, message: `${plan.serverSlug} is still installed in Claude Code` }
        : { ok: true, message: `${plan.serverSlug} is absent from Claude Code` };
    },
    async diagnose(): Promise<DiagnosticResult> {
      const detection = (await probe()).detection;
      return detection.installed
        ? { client: "claude-code", ok: true, issues: [] }
        : {
            client: "claude-code",
            ok: false,
            issues: [
              {
                severity: "error",
                code: "CLAUDE_CODE_NOT_INSTALLED",
                message:
                  "Claude Code CLI was not found in PATH or a standard installation location.",
                recoveryHint: "Install Claude Code and retry detection.",
              },
            ],
          };
    },
    getSafetyDescriptor() {
      return createSafetyDescriptor(
        latestProbe ?? {
          detection: { id: "claude-code", installed: false, capabilities: [] },
          helpText: EMPTY_HELP_TEXT,
        },
      );
    },
  };

  return Object.freeze(adapter);
}
