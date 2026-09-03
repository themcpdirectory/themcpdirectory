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

const CODEX_EXEC_OPTIONS = Object.freeze({
  timeoutMs: 5_000,
  maxStdoutBytes: 65_536,
  maxStderrBytes: 16_384,
  shell: false,
  stdin: "ignore",
} satisfies ExecFileOptions);

const EMPTY_HELP_TEXT: CodexCapabilityProbeResult["helpText"] = Object.freeze({
  root: "",
  add: "",
  list: "",
  remove: "",
});

const SAFE_NPX_RUNTIME_OPTIONS = new Set(["registry"]);
const SENSITIVE_INPUT_PATTERN = /(?:api[_-]?key|auth|credential|password|secret|token)/iu;
const SAFE_SERVER_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export type CodexAdapterErrorCode =
  | "CODEX_NOT_INSTALLED"
  | "CODEX_UNSUPPORTED_CAPABILITY"
  | "CODEX_INVALID_INPUT"
  | "CODEX_INVALID_PLAN"
  | "CODEX_COMMAND_FAILED"
  | "CODEX_INVALID_LIST_OUTPUT";

export class CodexAdapterError extends Error {
  readonly code: CodexAdapterErrorCode;
  readonly capability?: AdapterCapability;

  constructor(
    code: CodexAdapterErrorCode,
    message: string,
    options?: { readonly capability?: AdapterCapability },
  ) {
    super(message);
    this.name = "CodexAdapterError";
    this.code = code;
    if (options?.capability !== undefined) {
      this.capability = options.capability;
    }
  }
}

export interface CodexCapabilityProbeResult {
  readonly detection: ClientDetection;
  readonly helpText: Readonly<Record<"root" | "add" | "list" | "remove", string>>;
}

interface CodexListEntry {
  readonly name: string;
  readonly enabled?: boolean;
  readonly authStatus?: string;
  readonly transport: "stdio" | "streamable-http";
  readonly bearerTokenEnvVar?: string;
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
  const executableName = runtime.platform === "win32" ? "codex.exe" : "codex";
  const pathCandidates = getPathEnvironmentValue(runtime)
    .split(delimiter)
    .filter((directory) => directory.length > 0 && directory !== ".")
    .filter((directory) => pathModule.isAbsolute(directory))
    .map((directory) => pathModule.join(directory, executableName));
  const standardCandidates =
    runtime.platform === "win32"
      ? [
          runtime.env.LOCALAPPDATA
            ? win32.join(runtime.env.LOCALAPPDATA, "Programs", "codex", "codex.exe")
            : undefined,
          ...["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"].map((target) =>
            runtime.env.APPDATA
              ? win32.join(
                  runtime.env.APPDATA,
                  "npm",
                  "node_modules",
                  "@openai",
                  "codex",
                  "vendor",
                  target,
                  "codex",
                  "codex.exe",
                )
              : undefined,
          ),
        ]
      : runtime.platform === "darwin"
        ? ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/usr/bin/codex"]
        : ["/usr/local/bin/codex", "/usr/bin/codex"];

  return [...new Set([...pathCandidates, ...standardCandidates.filter(Boolean)])] as string[];
}

async function findCodexExecutable(runtime: AdapterRuntime): Promise<string | undefined> {
  for (const candidate of getExecutableCandidates(runtime)) {
    try {
      const stat = await runtime.stat(candidate);
      if (stat.isFile() && (runtime.platform === "win32" || (stat.mode & 0o111) !== 0)) {
        return candidate;
      }
    } catch {
      // A missing or inaccessible candidate is simply unavailable.
    }
  }

  return undefined;
}

function hasCommand(helpText: string, command: "add" | "list" | "remove"): boolean {
  return new RegExp(`^\\s{0,8}${command}(?:\\s|$)`, "mu").test(helpText);
}

function hasFlag(helpText: string, flag: string): boolean {
  const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[\\s([|])${escapedFlag}(?:[=\\s<>|\\])]|$)`, "mu").test(helpText);
}

function deriveCapabilities(helpText: CodexCapabilityProbeResult["helpText"]): AdapterCapability[] {
  const capabilities: AdapterCapability[] = [];
  const canAdd = hasCommand(helpText.root, "add");
  const canList = hasCommand(helpText.root, "list");
  const canRemove = hasCommand(helpText.root, "remove");

  if (canAdd && /--\s+<COMMAND>/u.test(helpText.add)) {
    capabilities.push("native-add-stdio");
  }
  if (canAdd && hasFlag(helpText.add, "--url")) {
    capabilities.push("native-add-remote");
  }
  if (canRemove && /codex\s+mcp\s+remove/u.test(helpText.remove)) {
    capabilities.push("native-remove");
  }
  if (canList && /codex\s+mcp\s+list/u.test(helpText.list)) {
    capabilities.push("native-list");
    if (hasFlag(helpText.list, "--json")) {
      capabilities.push("native-list-json");
    }
  }
  if (capabilities.length > 0) {
    capabilities.push("native-scope-user");
  }
  if (hasFlag(helpText.add, "--bearer-token-env-var")) {
    capabilities.push("env-reference");
  }

  return capabilities;
}

function parseVersion(stdout: string): string | undefined {
  return /^codex-cli\s+(\S+)\s*$/mu.exec(stdout)?.[1];
}

async function runProbe(
  runtime: AdapterRuntime,
  executable: string,
  args: readonly string[],
): Promise<string> {
  const result = await runtime.execFile(executable, args, CODEX_EXEC_OPTIONS);
  return result.exitCode === 0 ? result.stdout : "";
}

export async function probeCodexCapabilities(
  runtime: AdapterRuntime,
): Promise<CodexCapabilityProbeResult> {
  const executable = await findCodexExecutable(runtime);
  if (!executable) {
    return {
      detection: { id: "codex", installed: false, capabilities: [] },
      helpText: EMPTY_HELP_TEXT,
    };
  }

  const [versionText, root, add, list, remove] = await Promise.all([
    runProbe(runtime, executable, ["--version"]),
    runProbe(runtime, executable, ["mcp", "--help"]),
    runProbe(runtime, executable, ["mcp", "add", "--help"]),
    runProbe(runtime, executable, ["mcp", "list", "--help"]),
    runProbe(runtime, executable, ["mcp", "remove", "--help"]),
  ]);
  const helpText = Object.freeze({ root, add, list, remove });
  const version = parseVersion(versionText);

  return {
    detection: {
      id: "codex",
      installed: version !== undefined,
      executable,
      ...(version === undefined ? {} : { version }),
      capabilities: version === undefined ? [] : deriveCapabilities(helpText),
    },
    helpText,
  };
}

export async function detectCodex(runtime: AdapterRuntime): Promise<ClientDetection> {
  return (await probeCodexCapabilities(runtime)).detection;
}

function requireInstalled(probe: CodexCapabilityProbeResult): string {
  if (!probe.detection.installed || !probe.detection.executable) {
    throw new CodexAdapterError("CODEX_NOT_INSTALLED", "Codex CLI is not installed");
  }

  return probe.detection.executable;
}

function requireCapability(probe: CodexCapabilityProbeResult, capability: AdapterCapability): void {
  if (!probe.detection.capabilities.includes(capability)) {
    throw new CodexAdapterError(
      "CODEX_UNSUPPORTED_CAPABILITY",
      `Installed Codex CLI does not prove support for ${capability}`,
      { capability },
    );
  }
}

function requireUserScope(scope: ClientScope): void {
  if (scope !== "user") {
    throw new CodexAdapterError(
      "CODEX_UNSUPPORTED_CAPABILITY",
      `Codex CLI does not prove support for ${scope} scope`,
    );
  }
}

function requireServerSlug(slug: string): void {
  if (!SAFE_SERVER_SLUG_PATTERN.test(slug)) {
    throw new CodexAdapterError("CODEX_INVALID_INPUT", "Codex requires a valid server slug");
  }
}

function requireCodexIntent(options: PlanInstallOptions): void {
  if (options.intent.client !== "codex") {
    throw new CodexAdapterError(
      "CODEX_INVALID_INPUT",
      "Codex adapter requires an intent resolved for Codex",
    );
  }
}

function getInput(inputs: ValidatedInstallInputMap, key: string): InstallInputValue {
  const value = inputs.get(key);
  if (!value) {
    throw new CodexAdapterError("CODEX_INVALID_INPUT", `Missing validated input: ${key}`);
  }

  return value;
}

function getTextInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "text") {
    throw new CodexAdapterError("CODEX_INVALID_INPUT", `Input ${key} must be text`);
  }

  return value.value;
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
      throw new CodexAdapterError(
        "CODEX_INVALID_INPUT",
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
      throw new CodexAdapterError(
        "CODEX_UNSUPPORTED_CAPABILITY",
        "Codex adapter does not support the requested npx runtime option",
      );
    }
    const text = getTextInput(inputs, definition.key);
    if (argument.type === "named") {
      if (!argument.name) {
        throw new CodexAdapterError(
          "CODEX_INVALID_INPUT",
          `Named package argument ${definition.key} has no name`,
        );
      }
      target.push(`--${argument.name}`, text);
    } else {
      target.push(text);
    }
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
    throw new CodexAdapterError(
      "CODEX_UNSUPPORTED_CAPABILITY",
      "Codex adapter supports exact npm package variants through npx only",
    );
  }
  if (variant.environmentVariables.length > 0) {
    throw new CodexAdapterError(
      "CODEX_UNSUPPORTED_CAPABILITY",
      "Installed Codex CLI does not prove stdio environment-reference support",
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
      throw new CodexAdapterError(
        "CODEX_INVALID_INPUT",
        `Missing input definition for remote variable ${variable.name}`,
      );
    }
    if (
      definition.accepts.some((kind) => kind !== "text") ||
      SENSITIVE_INPUT_PATTERN.test(
        [definition.key, definition.name, definition.description ?? ""].join(" "),
      )
    ) {
      throw new CodexAdapterError(
        "CODEX_INVALID_INPUT",
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
    throw new CodexAdapterError(
      "CODEX_INVALID_INPUT",
      "Remote URL contains an unresolved variable",
    );
  }
  return url;
}

function getBearerTokenEnvName(
  variant: InstallManifestRemoteVariantV1,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): string | undefined {
  if (variant.headers.length === 0) {
    return undefined;
  }
  if (
    variant.headers.length !== 1 ||
    variant.headers[0]?.name.toLowerCase() !== "authorization" ||
    !/^Bearer\s+\{[^{}]+\}$/u.test(variant.headers[0].value)
  ) {
    throw new CodexAdapterError(
      "CODEX_UNSUPPORTED_CAPABILITY",
      "Installed Codex CLI does not prove support for the requested remote headers",
    );
  }

  const definition = definitions.find(
    (candidate) =>
      candidate.source === "remote-header" &&
      candidate.headerName.toLowerCase() === "authorization",
  );
  if (!definition) {
    throw new CodexAdapterError(
      "CODEX_INVALID_INPUT",
      "Missing input definition for Authorization header",
    );
  }
  const value = getInput(inputs, definition.key);
  if (value.kind !== "env-reference") {
    throw new CodexAdapterError(
      "CODEX_UNSUPPORTED_CAPABILITY",
      "Codex remote bearer authentication requires an environment reference",
      { capability: "env-reference" },
    );
  }
  return value.envName;
}

function buildInstallPlan(
  probe: CodexCapabilityProbeResult,
  options: PlanInstallOptions,
): InstallPlan {
  const executable = requireInstalled(probe);
  requireUserScope(options.intent.scope);
  const { intent } = options;
  let commandArgs: readonly string[];
  let capability: "native-add-stdio" | "native-add-remote";
  let effect: string;

  if (intent.variant.kind === "package") {
    capability = "native-add-stdio";
    requireCapability(probe, capability);
    const packageCommand = buildPackageCommand(intent.variant, intent.inputs, options.inputs);
    commandArgs = ["mcp", "add", intent.server.slug, "--", ...packageCommand];
    effect = `Run ${packageCommand.join(" ")}.`;
  } else {
    capability = "native-add-remote";
    requireCapability(probe, capability);
    const url = expandRemoteUrl(intent.variant, intent.inputs, options.inputs);
    const bearerTokenEnvName = getBearerTokenEnvName(intent.variant, intent.inputs, options.inputs);
    if (bearerTokenEnvName) {
      requireCapability(probe, "env-reference");
    }
    commandArgs = [
      "mcp",
      "add",
      intent.server.slug,
      "--url",
      url,
      ...(bearerTokenEnvName ? ["--bearer-token-env-var", bearerTokenEnvName] : []),
    ];
    effect = `Configure remote URL ${url}.`;
  }

  return {
    schemaVersion: 1,
    serverSlug: intent.server.slug,
    client: "codex",
    scope: intent.scope,
    variantId: intent.variant.id,
    manifestHash: options.manifestHash,
    intentHash: options.intentHash,
    operations: [{ type: "client-command", executable, args: commandArgs, capability }],
    previewLines: [`Add ${intent.server.title} to Codex user configuration.`, effect],
  };
}

function parseCodexList(stdout: string, scope: ClientScope): readonly InstalledMcpServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new CodexAdapterError(
      "CODEX_INVALID_LIST_OUTPUT",
      `Codex returned invalid JSON: ${error instanceof Error ? error.name : "parse failure"}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new CodexAdapterError("CODEX_INVALID_LIST_OUTPUT", "Codex list output must be an array");
  }

  return parsed.map((value): InstalledMcpServer => {
    const entry = parseCodexListEntry(value);
    return {
      name: entry.name,
      slug: entry.name,
      client: "codex",
      scope,
      transport: entry.transport,
      managedBy: "external",
      adapterMetadata: {
        ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
        ...(entry.authStatus === undefined ? {} : { authStatus: entry.authStatus }),
        ...(entry.bearerTokenEnvVar === undefined
          ? {}
          : { bearerTokenEnvVar: entry.bearerTokenEnvVar }),
      },
    };
  });
}

function parseCodexListEntry(value: unknown): CodexListEntry {
  if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.transport)) {
    throw new CodexAdapterError("CODEX_INVALID_LIST_OUTPUT", "Codex list entry is malformed");
  }
  const transportType = value.transport.type;
  if (transportType !== "stdio" && transportType !== "streamable_http") {
    throw new CodexAdapterError(
      "CODEX_INVALID_LIST_OUTPUT",
      `Codex list entry uses unsupported transport ${String(transportType)}`,
    );
  }
  const enabled = value.enabled;
  const authStatus = value.auth_status;
  const bearerTokenEnvVar = value.transport.bearer_token_env_var;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new CodexAdapterError("CODEX_INVALID_LIST_OUTPUT", "Codex enabled state is malformed");
  }
  if (authStatus !== undefined && typeof authStatus !== "string") {
    throw new CodexAdapterError("CODEX_INVALID_LIST_OUTPUT", "Codex auth status is malformed");
  }
  if (
    bearerTokenEnvVar !== undefined &&
    bearerTokenEnvVar !== null &&
    typeof bearerTokenEnvVar !== "string"
  ) {
    throw new CodexAdapterError(
      "CODEX_INVALID_LIST_OUTPUT",
      "Codex bearer environment reference is malformed",
    );
  }

  return {
    name: value.name,
    ...(enabled === undefined ? {} : { enabled }),
    ...(authStatus === undefined ? {} : { authStatus }),
    transport: transportType === "stdio" ? "stdio" : "streamable-http",
    ...(typeof bearerTokenEnvVar === "string" ? { bearerTokenEnvVar } : {}),
  };
}

function createSafetyDescriptor(probe: CodexCapabilityProbeResult): AdapterSafetyDescriptor {
  return {
    client: "codex",
    executableAllowList: probe.detection.executable ? [probe.detection.executable] : ["codex"],
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

function assertCodexInstallPlan(plan: InstallPlan): void {
  requireUserScope(plan.scope);
  if (plan.client !== "codex" || plan.operations.length !== 1) {
    throw new CodexAdapterError(
      "CODEX_INVALID_PLAN",
      "Codex install plan must contain exactly one Codex operation",
    );
  }

  const operation = plan.operations[0];
  if (!operation || operation.type !== "client-command") {
    throw new CodexAdapterError(
      "CODEX_INVALID_PLAN",
      "Codex install plan must contain one client command",
    );
  }

  const { args } = operation;
  const commonPrefixIsValid = args[0] === "mcp" && args[1] === "add" && args[2] === plan.serverSlug;
  const stdioIsValid =
    operation.capability === "native-add-stdio" &&
    commonPrefixIsValid &&
    args[3] === "--" &&
    args.length >= 5;
  const remoteIsValid =
    operation.capability === "native-add-remote" &&
    commonPrefixIsValid &&
    args[3] === "--url" &&
    typeof args[4] === "string" &&
    isSafeRemoteUrl(args[4]) &&
    (args.length === 5 ||
      (args.length === 7 &&
        args[5] === "--bearer-token-env-var" &&
        typeof args[6] === "string" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/u.test(args[6])));
  if (!stdioIsValid && !remoteIsValid) {
    throw new CodexAdapterError(
      "CODEX_INVALID_PLAN",
      "Codex install operation does not match its declared capability",
    );
  }
}

function assertCodexRemovalPlan(plan: RemovalPlan): void {
  requireUserScope(plan.scope);
  if (plan.client !== "codex" || plan.operations.length !== 1) {
    throw new CodexAdapterError(
      "CODEX_INVALID_PLAN",
      "Codex removal plan must contain exactly one Codex operation",
    );
  }

  const operation = plan.operations[0];
  if (
    !operation ||
    operation.type !== "client-command" ||
    operation.capability !== "native-remove" ||
    operation.args.length !== 3 ||
    operation.args[0] !== "mcp" ||
    operation.args[1] !== "remove" ||
    operation.args[2] !== plan.serverSlug
  ) {
    throw new CodexAdapterError(
      "CODEX_INVALID_PLAN",
      "Codex removal operation does not match native remove syntax",
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
  const result = await runtime.execFile(executable, args, CODEX_EXEC_OPTIONS);
  if (result.exitCode !== 0) {
    throw new CodexAdapterError(
      "CODEX_COMMAND_FAILED",
      `Codex command failed with exit code ${result.exitCode}`,
    );
  }
}

export function createCodexAdapter(runtime: AdapterRuntime): McpClientAdapter {
  let latestProbe: CodexCapabilityProbeResult | undefined;
  const plannedInstallOperations = new Map<string, string>();
  const plannedRemovalOperations = new Map<string, string>();
  const probe = async (): Promise<CodexCapabilityProbeResult> => {
    latestProbe = await probeCodexCapabilities(runtime);
    return latestProbe;
  };

  const adapter: McpClientAdapter = {
    id: "codex" as const,
    async detect() {
      return (await probe()).detection;
    },
    async inspect(scope = "user") {
      requireUserScope(scope);
      const result = await probe();
      const executable = requireInstalled(result);
      requireCapability(result, "native-list-json");
      const commandResult = await runtime.execFile(
        executable,
        ["mcp", "list", "--json"],
        CODEX_EXEC_OPTIONS,
      );
      if (commandResult.exitCode !== 0) {
        throw new CodexAdapterError(
          "CODEX_COMMAND_FAILED",
          `Codex list failed with exit code ${commandResult.exitCode}`,
        );
      }
      return parseCodexList(commandResult.stdout, scope);
    },
    async planInstall(options) {
      requireCodexIntent(options);
      const plan = buildInstallPlan(await probe(), options);
      plannedInstallOperations.set(getInstallPlanIdentity(plan), serializeOperations(plan));
      return plan;
    },
    async executePlan(plan) {
      const result = await probe();
      const validated = validateInstallPlan(plan, createSafetyDescriptor(result));
      assertCodexInstallPlan(validated);
      if (
        plannedInstallOperations.get(getInstallPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new CodexAdapterError(
          "CODEX_INVALID_PLAN",
          "Codex install operation differs from the operation produced during planning",
        );
      }
      for (const operation of validated.operations) {
        if (operation.type !== "client-command") {
          throw new CodexAdapterError(
            "CODEX_UNSUPPORTED_CAPABILITY",
            "Codex install plans may contain client commands only",
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
        ? { ok: true, installedEntry, message: `${plan.serverSlug} is installed in Codex` }
        : { ok: false, message: `${plan.serverSlug} was not found in Codex` };
    },
    async planRemove(options: PlanRemoveOptions): Promise<RemovalPlan> {
      const scope = options.scope ?? "user";
      requireUserScope(scope);
      requireServerSlug(options.slug);
      const result = await probe();
      const executable = requireInstalled(result);
      requireCapability(result, "native-remove");
      const plan: RemovalPlan = {
        schemaVersion: 1,
        serverSlug: options.slug,
        client: "codex",
        scope,
        operations: [
          {
            type: "client-command",
            executable,
            args: ["mcp", "remove", options.slug],
            capability: "native-remove",
          },
        ],
        previewLines: [`Remove ${options.slug} from Codex user configuration.`],
      };
      plannedRemovalOperations.set(getRemovalPlanIdentity(plan), serializeOperations(plan));
      return plan;
    },
    async executeRemove(plan) {
      const result = await probe();
      const validated = validateRemovalPlan(plan, createSafetyDescriptor(result));
      assertCodexRemovalPlan(validated);
      if (
        plannedRemovalOperations.get(getRemovalPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new CodexAdapterError(
          "CODEX_INVALID_PLAN",
          "Codex removal operation differs from the operation produced during planning",
        );
      }
      for (const operation of validated.operations) {
        if (operation.type !== "client-command") {
          throw new CodexAdapterError(
            "CODEX_UNSUPPORTED_CAPABILITY",
            "Codex removal plans may contain client commands only",
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
        ? { ok: false, message: `${plan.serverSlug} is still installed in Codex` }
        : { ok: true, message: `${plan.serverSlug} is absent from Codex` };
    },
    async diagnose(): Promise<DiagnosticResult> {
      const detection = (await probe()).detection;
      return detection.installed
        ? { client: "codex", ok: true, issues: [] }
        : {
            client: "codex",
            ok: false,
            issues: [
              {
                severity: "error",
                code: "CODEX_NOT_INSTALLED",
                message: "Codex CLI was not found in PATH or a standard installation location.",
                recoveryHint: "Install Codex CLI and retry detection.",
              },
            ],
          };
    },
    getSafetyDescriptor() {
      return createSafetyDescriptor(
        latestProbe ?? {
          detection: { id: "codex", installed: false, capabilities: [] },
          helpText: EMPTY_HELP_TEXT,
        },
      );
    },
  };

  return Object.freeze(adapter);
}
