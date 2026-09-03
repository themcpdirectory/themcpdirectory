import { createHash } from "node:crypto";
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
  type JsonValue,
  type RemovalPlan,
  type ValidatedInstallInputMap,
} from "@themcpdirectory/install-engine";
import {
  applyVsCodeConfigMutation,
  createVsCodeConfigMutation,
  getVsCodeServerEntry,
  readVsCodeConfigDocument,
  removeVsCodeServerEntry,
  resolveVsCodeScopePaths,
  setVsCodeInputs,
  setVsCodeServerEntry,
} from "./vscode-json.js";
import type {
  AdapterRuntime,
  ClientDetection,
  DiagnosticResult,
  InstalledMcpServer,
  McpClientAdapter,
  PlanInstallOptions,
  PlanRemoveOptions,
} from "./types.js";
import { findInstalledApplication } from "./application-detection.js";

const SAFE_SERVER_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const SAFE_ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SAFE_INPUT_ID_SEGMENT_PATTERN = /[^a-z0-9-]/gu;

const VSCODE_CAPABILITIES = Object.freeze([
  "native-add-stdio",
  "native-add-remote",
  "native-remove",
  "native-list",
  "native-scope-user",
  "native-scope-project",
  "env-reference",
] satisfies readonly AdapterCapability[]);

export type VsCodeAdapterErrorCode =
  | "VSCODE_INVALID_INPUT"
  | "VSCODE_UNSUPPORTED_CAPABILITY"
  | "VSCODE_INVALID_PLAN"
  | "VSCODE_INVALID_LIST_OUTPUT";

export class VsCodeAdapterError extends Error {
  readonly code: VsCodeAdapterErrorCode;
  readonly capability?: AdapterCapability;

  constructor(
    code: VsCodeAdapterErrorCode,
    message: string,
    options?: { readonly capability?: AdapterCapability },
  ) {
    super(message);
    this.name = "VsCodeAdapterError";
    this.code = code;
    if (options?.capability !== undefined) {
      this.capability = options.capability;
    }
  }
}

interface VsCodePromptInput {
  readonly id: string;
  readonly type: "promptString";
  readonly description: string;
  readonly password: true;
}

interface BuiltVsCodeServerConfig {
  readonly server: Record<string, JsonValue>;
  readonly inputs: readonly VsCodePromptInput[];
}

function getVsCodeInstallationCandidates(
  runtime: AdapterRuntime,
): readonly { path: string | undefined; kind: "file" | "directory" }[] {
  if (runtime.platform === "win32") {
    return [
      {
        path: runtime.env.LOCALAPPDATA
          ? win32.join(runtime.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe")
          : undefined,
        kind: "file",
      },
      {
        path: runtime.env.ProgramFiles
          ? win32.join(runtime.env.ProgramFiles, "Microsoft VS Code", "Code.exe")
          : undefined,
        kind: "file",
      },
    ];
  }

  if (runtime.platform === "darwin") {
    return [
      { path: "/Applications/Visual Studio Code.app", kind: "directory" },
      {
        path: posix.join(runtime.homeDirectory, "Applications", "Visual Studio Code.app"),
        kind: "directory",
      },
    ];
  }

  return [
    { path: "/usr/share/code/bin/code", kind: "file" },
    { path: "/snap/bin/code", kind: "file" },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireScope(scope: ClientScope): void {
  if (scope === "global") {
    throw new VsCodeAdapterError(
      "VSCODE_UNSUPPORTED_CAPABILITY",
      "VS Code adapter does not support global scope",
      { capability: "native-scope-project" },
    );
  }
}

function requireVsCodeIntent(options: PlanInstallOptions): void {
  if (options.intent.client !== "vscode") {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_INPUT",
      "VS Code adapter requires an intent resolved for VS Code",
    );
  }
  requireScope(options.intent.scope);
}

function requireSafeServerSlug(slug: string): void {
  if (!SAFE_SERVER_SLUG_PATTERN.test(slug)) {
    throw new VsCodeAdapterError("VSCODE_INVALID_INPUT", "VS Code requires a valid server slug");
  }
}

function getInput(inputs: ValidatedInstallInputMap, key: string): InstallInputValue {
  const value = inputs.get(key);
  if (!value) {
    throw new VsCodeAdapterError("VSCODE_INVALID_INPUT", `Missing validated input: ${key}`);
  }
  return value;
}

function getTextInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "text") {
    throw new VsCodeAdapterError("VSCODE_INVALID_INPUT", `Input ${key} must be text`);
  }
  return value.value;
}

function getSafeEnvReferenceInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "env-reference") {
    throw new VsCodeAdapterError("VSCODE_INVALID_INPUT", `Input ${key} must be env-reference`);
  }
  if (!SAFE_ENV_NAME_PATTERN.test(value.envName)) {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_INPUT",
      `Input ${key} must use a valid environment variable name`,
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
      throw new VsCodeAdapterError(
        "VSCODE_INVALID_INPUT",
        `Missing input definition for ${source} ${index}`,
      );
    }

    const value = inputs.get(definition.key);
    if (!value && !argument.required) {
      continue;
    }

    const text = getTextInput(inputs, definition.key);
    if (argument.type === "named") {
      if (!argument.name) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_INPUT",
          `Named package argument ${definition.key} has no name`,
        );
      }
      target.push(`--${argument.name}`, text);
    } else {
      target.push(text);
    }
  }
}

function buildPackageServerConfig(
  variant: InstallManifestPackageVariantV1,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): BuiltVsCodeServerConfig {
  if (
    variant.registryType !== "npm" ||
    (variant.runtimeHint !== null && variant.runtimeHint !== "npx")
  ) {
    throw new VsCodeAdapterError(
      "VSCODE_UNSUPPORTED_CAPABILITY",
      "VS Code adapter supports exact npm package variants through npx only",
      { capability: "native-add-stdio" },
    );
  }

  const version = assertExactPinnedVersion(variant.version);
  const args: string[] = ["--yes"];
  appendPackageArguments(
    args,
    variant.runtimeArguments,
    "package-runtime-argument",
    definitions,
    inputs,
  );
  args.push(`${variant.identifier}@${version}`);
  appendPackageArguments(args, variant.packageArguments, "package-argument", definitions, inputs);

  const envObject: Record<string, string> = {};
  for (const variable of variant.environmentVariables) {
    const definition = definitions.find(
      (
        candidate,
      ): candidate is Extract<InstallInputDefinition, { source: "environment-variable" }> =>
        candidate.source === "environment-variable" && candidate.name === variable.name,
    );
    if (!definition) {
      continue;
    }

    const value = inputs.get(definition.key);
    if (!value && !definition.required && !variable.required) {
      continue;
    }
    if (!value) {
      throw new VsCodeAdapterError(
        "VSCODE_INVALID_INPUT",
        `Missing validated input: ${definition.key}`,
      );
    }
    if (value.kind === "text") {
      envObject[variable.name] = value.value;
    } else if (value.kind === "env-reference") {
      envObject[variable.name] = `\${env:${getSafeEnvReferenceInput(inputs, definition.key)}}`;
    } else {
      throw new VsCodeAdapterError(
        "VSCODE_UNSUPPORTED_CAPABILITY",
        "VS Code adapter does not persist package secret-value inputs",
        { capability: "env-reference" },
      );
    }
  }

  return {
    server: {
      type: "stdio",
      command: "npx",
      args,
      ...(Object.keys(envObject).length > 0 ? { env: envObject } : {}),
    },
    inputs: [],
  };
}

function applyRemoteTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{([A-Za-z0-9_-]+)\}/gu, (segment, token: string) => {
    const replacement = variables[token];
    return replacement === undefined ? segment : replacement;
  });
}

function sanitizeInputSegment(value: string): string {
  const normalized = value.toLowerCase().replace(SAFE_INPUT_ID_SEGMENT_PATTERN, "-");
  const collapsed = normalized.replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return collapsed.length > 0 ? collapsed : "value";
}

function buildSecretInputId(
  serverSlug: string,
  definition: Extract<InstallInputDefinition, { source: "remote-header" }>,
): string {
  const digest = createHash("sha256")
    .update(`${serverSlug}:${definition.headerName}:${definition.placeholder}`)
    .digest("hex")
    .slice(0, 10);
  const safeSlug = sanitizeInputSegment(serverSlug);
  const safeHeader = sanitizeInputSegment(definition.headerName);
  const safePlaceholder = sanitizeInputSegment(definition.placeholder);
  return `mcpdir-${safeSlug}-${safeHeader}-${safePlaceholder}-${digest}`;
}

function ensurePromptInput(
  serverSlug: string,
  definition: Extract<InstallInputDefinition, { source: "remote-header" }>,
  output: Map<string, VsCodePromptInput>,
): string {
  const id = buildSecretInputId(serverSlug, definition);
  if (!output.has(id)) {
    output.set(id, {
      id,
      type: "promptString",
      description:
        definition.description ??
        `Enter the value for ${definition.headerName} (${definition.placeholder})`,
      password: true,
    });
  }
  return id;
}

function buildRemoteServerConfig(
  serverSlug: string,
  variant: InstallManifestRemoteVariantV1,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): BuiltVsCodeServerConfig {
  const variableMap: Record<string, string> = {};
  for (const variable of variant.variables) {
    const definition = definitions.find(
      (candidate): candidate is Extract<InstallInputDefinition, { source: "remote-variable" }> =>
        candidate.source === "remote-variable" && candidate.name === variable.name,
    );
    if (!definition) {
      if (variable.required) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_INPUT",
          `Missing input definition for remote variable ${variable.name}`,
        );
      }
      continue;
    }

    variableMap[variable.name] = getTextInput(inputs, definition.key);
  }

  const promptInputs = new Map<string, VsCodePromptInput>();
  const headers: Record<string, string> = {};
  for (const header of variant.headers) {
    let value = header.value;
    const placeholders = [...value.matchAll(/\{([A-Za-z0-9_-]+)\}/gu)].map((match) => match[1]);
    for (const placeholder of placeholders) {
      if (!placeholder) {
        continue;
      }

      const definition = definitions.find(
        (candidate): candidate is Extract<InstallInputDefinition, { source: "remote-header" }> =>
          candidate.source === "remote-header" &&
          candidate.placeholder === placeholder &&
          candidate.headerName === header.name,
      );
      if (!definition) {
        continue;
      }

      const inputValue = getInput(inputs, definition.key);
      if (definition.sensitive) {
        if (inputValue.kind === "env-reference") {
          value = value.replaceAll(
            `{${placeholder}}`,
            `\${env:${getSafeEnvReferenceInput(inputs, definition.key)}}`,
          );
        } else {
          const inputId = ensurePromptInput(serverSlug, definition, promptInputs);
          value = value.replaceAll(`{${placeholder}}`, `\${input:${inputId}}`);
        }
      } else if (inputValue.kind === "text") {
        value = value.replaceAll(`{${placeholder}}`, inputValue.value);
      } else if (inputValue.kind === "env-reference") {
        value = value.replaceAll(
          `{${placeholder}}`,
          `\${env:${getSafeEnvReferenceInput(inputs, definition.key)}}`,
        );
      } else {
        throw new VsCodeAdapterError(
          "VSCODE_UNSUPPORTED_CAPABILITY",
          "VS Code adapter does not persist secret-value inputs for non-sensitive remote headers",
          { capability: "persisted-secret" },
        );
      }
    }
    headers[header.name] = value;
  }

  return {
    server: {
      type: "http",
      url: applyRemoteTemplate(variant.urlTemplate, variableMap),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    },
    inputs: [...promptInputs.values()],
  };
}

function buildVsCodeServerConfig(options: PlanInstallOptions): BuiltVsCodeServerConfig {
  const { variant } = options.intent;
  if (variant.kind === "package") {
    return buildPackageServerConfig(variant, options.intent.inputs, options.inputs);
  }

  if (variant.kind === "remote") {
    return buildRemoteServerConfig(
      options.intent.server.slug,
      variant,
      options.intent.inputs,
      options.inputs,
    );
  }

  throw new VsCodeAdapterError("VSCODE_UNSUPPORTED_CAPABILITY", "Unsupported VS Code variant type");
}

function createSafetyDescriptor(runtime: AdapterRuntime): AdapterSafetyDescriptor {
  const userRoot = resolveVsCodeScopePaths(runtime, "user").rootPath;
  const projectRoot = resolveVsCodeScopePaths(runtime, "project").rootPath;
  return {
    client: "vscode",
    executableAllowList: [],
    configRoots: [userRoot, projectRoot],
    supportedCapabilities: VSCODE_CAPABILITIES,
  };
}

function assertVsCodeInstallPlan(plan: InstallPlan): void {
  requireScope(plan.scope);
  if (plan.client !== "vscode" || plan.operations.length !== 1) {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_PLAN",
      "VS Code install plan must contain exactly one VS Code operation",
    );
  }

  const operation = plan.operations[0];
  if (!operation || operation.type !== "config-write") {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_PLAN",
      "VS Code install operation must be config-write",
    );
  }

  if (!isRecord(operation.document)) {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_PLAN",
      "VS Code config-write operation document must be a JSON object",
    );
  }
}

function assertVsCodeRemovalPlan(plan: RemovalPlan): void {
  requireScope(plan.scope);
  if (plan.client !== "vscode" || plan.operations.length !== 1) {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_PLAN",
      "VS Code removal plan must contain exactly one VS Code operation",
    );
  }

  const operation = plan.operations[0];
  if (!operation || operation.type !== "config-remove") {
    throw new VsCodeAdapterError(
      "VSCODE_INVALID_PLAN",
      "VS Code removal operation must be config-remove",
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

function deriveRemovalMutationIntentHash(plan: RemovalPlan, mutationKey: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        client: plan.client,
        scope: plan.scope,
        serverSlug: plan.serverSlug,
        mutationKey,
        operations: plan.operations,
      }),
    )
    .digest("hex");
}

function splitPlannedDocument(document: Record<string, unknown>): {
  readonly serverEntry: Record<string, JsonValue>;
  readonly promptInputs: readonly VsCodePromptInput[];
} {
  const promptInputsRaw = document.inputs;
  const promptInputs =
    Array.isArray(promptInputsRaw) && promptInputsRaw.every((item) => isRecord(item))
      ? (promptInputsRaw
          .filter(
            (item): item is Record<string, unknown> =>
              isRecord(item) &&
              item.type === "promptString" &&
              item.password === true &&
              typeof item.id === "string" &&
              typeof item.description === "string",
          )
          .map(
            (item) =>
              ({
                id: item.id as string,
                type: "promptString",
                description: item.description as string,
                password: true,
              }) satisfies VsCodePromptInput,
          ) as readonly VsCodePromptInput[])
      : [];

  const serverEntry = { ...document };
  delete serverEntry.inputs;
  return { serverEntry: serverEntry as Record<string, JsonValue>, promptInputs };
}

function mergePromptInputs(
  existingInputs: readonly unknown[] | undefined,
  additions: readonly VsCodePromptInput[],
): readonly JsonValue[] {
  const byId = new Map<string, JsonValue>();

  for (const input of existingInputs ?? []) {
    if (!isRecord(input) || typeof input.id !== "string") {
      continue;
    }
    byId.set(input.id, JSON.parse(JSON.stringify(input)) as JsonValue);
  }

  for (const input of additions) {
    byId.set(input.id, {
      id: input.id,
      type: input.type,
      description: input.description,
      password: true,
    });
  }

  return [...byId.values()];
}

function extractInputIdsFromServerEntry(entry: unknown): readonly string[] {
  if (!isRecord(entry)) {
    return [];
  }

  const headers = entry.headers;
  if (!isRecord(headers)) {
    return [];
  }

  const inputIds = new Set<string>();
  for (const headerValue of Object.values(headers)) {
    if (typeof headerValue !== "string") {
      continue;
    }

    for (const match of headerValue.matchAll(/\$\{input:([^}]+)\}/gu)) {
      const id = match[1];
      if (id && id.length > 0) {
        inputIds.add(id);
      }
    }
  }

  return [...inputIds.values()];
}

function removePromptInputsById(
  existingInputs: readonly unknown[] | undefined,
  inputIdsToRemove: readonly string[],
): readonly JsonValue[] {
  if (
    !Array.isArray(existingInputs) ||
    existingInputs.length === 0 ||
    inputIdsToRemove.length === 0
  ) {
    return (existingInputs as readonly JsonValue[] | undefined) ?? [];
  }

  const removeSet = new Set(inputIdsToRemove);
  const next: JsonValue[] = [];
  for (const input of existingInputs) {
    if (isRecord(input) && typeof input.id === "string" && removeSet.has(input.id)) {
      continue;
    }
    next.push(JSON.parse(JSON.stringify(input)) as JsonValue);
  }
  return next;
}

function collectInputIdsFromValue(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\$\{input:([^}]+)\}/gu)) {
      const id = match[1];
      if (id && id.length > 0) {
        output.add(id);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectInputIdsFromValue(item, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const nested of Object.values(value)) {
    collectInputIdsFromValue(nested, output);
  }
}

function collectReferencedInputIdsFromServers(servers: unknown): ReadonlySet<string> {
  if (!isRecord(servers)) {
    return new Set<string>();
  }

  const referenced = new Set<string>();
  for (const entry of Object.values(servers)) {
    collectInputIdsFromValue(entry, referenced);
  }
  return referenced;
}

function toInstalledEntry(
  scope: ClientScope,
  name: string,
  value: unknown,
  configPath: string,
): InstalledMcpServer | null {
  if (!isRecord(value)) {
    return null;
  }

  const declaredType = typeof value.type === "string" ? value.type : null;
  const transport = declaredType === "http" ? "streamable-http" : "stdio";
  const slug = SAFE_SERVER_SLUG_PATTERN.test(name) ? name : undefined;
  const environmentReferences = collectEnvironmentReferences(value);
  return {
    name,
    ...(slug === undefined ? {} : { slug }),
    client: "vscode",
    scope,
    transport,
    managedBy: "external",
    ...(environmentReferences.length > 0 ? { environmentReferences } : {}),
    adapterMetadata: {
      configPath,
      source: "vscode-json",
    },
  };
}

function collectEnvironmentReferences(value: unknown): readonly string[] {
  const references = new Set<string>();
  collectStringMatches(value, references);
  return [...references].sort();
}

function collectStringMatches(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/gu)) {
      if (match[1]) output.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringMatches(item, output);
    return;
  }
  if (isRecord(value)) {
    for (const nested of Object.values(value)) collectStringMatches(nested, output);
  }
}

export function createVsCodeAdapter(runtime: AdapterRuntime): McpClientAdapter {
  const safetyDescriptor = createSafetyDescriptor(runtime);
  const plannedInstallOperations = new Map<string, string>();
  const plannedRemovalOperations = new Map<string, string>();

  const adapter: McpClientAdapter = {
    id: "vscode" as const,
    inspectionSafety: "configuration-only",
    async detect(): Promise<ClientDetection> {
      const executable = await findInstalledApplication(
        runtime,
        "code",
        getVsCodeInstallationCandidates(runtime),
      );
      return {
        id: "vscode",
        installed: executable !== undefined,
        ...(executable === undefined ? {} : { executable }),
        capabilities: executable === undefined ? [] : VSCODE_CAPABILITIES,
      };
    },
    async inspect(scope = "user") {
      requireScope(scope);
      const mutation = createVsCodeConfigMutation(runtime, {
        scope,
        serverKey: "_unused",
        intentHash: "0".repeat(64),
      });
      const document = await readVsCodeConfigDocument(runtime, mutation);
      if (!document?.servers || !isRecord(document.servers)) {
        return [];
      }

      const entries: InstalledMcpServer[] = [];
      for (const [name, value] of Object.entries(document.servers)) {
        const installed = toInstalledEntry(scope, name, value, mutation.path);
        if (installed) {
          entries.push(installed);
        }
      }
      return entries;
    },
    async planInstall(options) {
      requireVsCodeIntent(options);
      requireSafeServerSlug(options.intent.server.slug);
      const mutation = createVsCodeConfigMutation(runtime, {
        scope: options.intent.scope,
        serverKey: options.intent.server.slug,
        intentHash: options.intentHash,
      });
      const builtConfig = buildVsCodeServerConfig(options);
      const operationDocument: Record<string, JsonValue> = {
        ...builtConfig.server,
      };
      if (builtConfig.inputs.length > 0) {
        operationDocument.inputs = builtConfig.inputs.map(
          (input) =>
            ({
              id: input.id,
              type: input.type,
              description: input.description,
              password: true,
            }) satisfies JsonValue,
        );
      }

      const plan: InstallPlan = {
        schemaVersion: 1,
        serverSlug: options.intent.server.slug,
        client: "vscode",
        scope: options.intent.scope,
        variantId: options.intent.variant.id,
        manifestHash: options.manifestHash,
        intentHash: options.intentHash,
        operations: [
          {
            type: "config-write",
            path: mutation.path,
            mutationKey: options.intent.server.slug,
            document: operationDocument,
          },
        ],
        previewLines: [
          `Configure ${options.intent.server.slug} in VS Code ${options.intent.scope} MCP config.`,
        ],
      };

      const validated = validateInstallPlan(plan, safetyDescriptor);
      plannedInstallOperations.set(
        getInstallPlanIdentity(validated),
        serializeOperations(validated),
      );
      return validated;
    },
    async executePlan(plan) {
      const validated = validateInstallPlan(plan, safetyDescriptor);
      assertVsCodeInstallPlan(validated);

      if (
        plannedInstallOperations.get(getInstallPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_PLAN",
          "VS Code install operation differs from the operation produced during planning",
        );
      }

      const [operation] = validated.operations;
      if (!operation || operation.type !== "config-write") {
        throw new VsCodeAdapterError(
          "VSCODE_UNSUPPORTED_CAPABILITY",
          "VS Code install plans may contain config-write only",
        );
      }

      if (!isRecord(operation.document)) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_PLAN",
          "VS Code config-write operation document must be a JSON object",
        );
      }

      const mutation = createVsCodeConfigMutation(runtime, {
        scope: validated.scope,
        serverKey: operation.mutationKey,
        intentHash: validated.intentHash,
      });
      if (operation.path !== mutation.path) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_PLAN",
          "VS Code plan path does not match the scope-approved configuration path",
        );
      }

      const { serverEntry, promptInputs } = splitPlannedDocument(operation.document);

      await applyVsCodeConfigMutation(runtime, {
        mutation,
        apply: (document) => {
          const withServer = setVsCodeServerEntry(document, operation.mutationKey, serverEntry);
          if (promptInputs.length === 0) {
            return withServer;
          }

          const mergedInputs = mergePromptInputs(withServer.inputs, promptInputs);
          return setVsCodeInputs(withServer, mergedInputs);
        },
        verify: (document) => {
          const entry = getVsCodeServerEntry(document, operation.mutationKey);
          if (JSON.stringify(entry) !== JSON.stringify(serverEntry)) {
            return false;
          }

          if (promptInputs.length === 0) {
            return true;
          }

          if (!Array.isArray(document.inputs)) {
            return false;
          }
          const seenIds = new Set(
            document.inputs
              .filter(
                (item): item is { id: string } => isRecord(item) && typeof item.id === "string",
              )
              .map((item) => item.id),
          );
          return promptInputs.every((item) => seenIds.has(item.id));
        },
      });
    },
    async verifyInstall(plan) {
      const installedEntry = (await this.inspect(plan.scope)).find(
        (entry) => entry.slug === plan.serverSlug,
      );
      return installedEntry
        ? { ok: true, installedEntry, message: `${plan.serverSlug} is installed in VS Code` }
        : { ok: false, message: `${plan.serverSlug} was not found in VS Code` };
    },
    async planRemove(options: PlanRemoveOptions): Promise<RemovalPlan> {
      const scope = options.scope ?? "user";
      requireScope(scope);
      requireSafeServerSlug(options.slug);

      const mutation = createVsCodeConfigMutation(runtime, {
        scope,
        serverKey: options.slug,
        intentHash: "0".repeat(64),
      });

      const plan: RemovalPlan = {
        schemaVersion: 1,
        serverSlug: options.slug,
        client: "vscode",
        scope,
        operations: [
          {
            type: "config-remove",
            path: mutation.path,
            mutationKey: options.slug,
          },
        ],
        previewLines: [`Remove ${options.slug} from VS Code ${scope} MCP config.`],
      };

      const validated = validateRemovalPlan(plan, safetyDescriptor);
      plannedRemovalOperations.set(
        getRemovalPlanIdentity(validated),
        serializeOperations(validated),
      );
      return validated;
    },
    async executeRemove(plan) {
      const validated = validateRemovalPlan(plan, safetyDescriptor);
      assertVsCodeRemovalPlan(validated);

      if (
        plannedRemovalOperations.get(getRemovalPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_PLAN",
          "VS Code removal operation differs from the operation produced during planning",
        );
      }

      const [operation] = validated.operations;
      if (!operation || operation.type !== "config-remove") {
        throw new VsCodeAdapterError(
          "VSCODE_UNSUPPORTED_CAPABILITY",
          "VS Code removal plans may contain config-remove only",
        );
      }

      const mutation = createVsCodeConfigMutation(runtime, {
        scope: validated.scope,
        serverKey: operation.mutationKey,
        intentHash: deriveRemovalMutationIntentHash(validated, operation.mutationKey),
      });
      if (operation.path !== mutation.path) {
        throw new VsCodeAdapterError(
          "VSCODE_INVALID_PLAN",
          "VS Code removal path does not match the scope-approved configuration path",
        );
      }

      const currentDocument = await readVsCodeConfigDocument(runtime, mutation);
      if (currentDocument === null) {
        return;
      }

      const existingServerEntry = getVsCodeServerEntry(currentDocument, operation.mutationKey);
      if (existingServerEntry === undefined) {
        return;
      }

      const inputIdsToRemove = extractInputIdsFromServerEntry(existingServerEntry);

      await applyVsCodeConfigMutation(runtime, {
        mutation,
        apply: (document) => {
          const withoutServer = removeVsCodeServerEntry(document, operation.mutationKey);
          if (inputIdsToRemove.length === 0) {
            return withoutServer;
          }

          const stillReferenced = collectReferencedInputIdsFromServers(withoutServer.servers);
          const orphanedIds = inputIdsToRemove.filter((inputId) => !stillReferenced.has(inputId));
          if (orphanedIds.length === 0) {
            return withoutServer;
          }

          return setVsCodeInputs(
            withoutServer,
            removePromptInputsById(withoutServer.inputs, orphanedIds),
          );
        },
        verify: (document) => {
          if (getVsCodeServerEntry(document, operation.mutationKey) !== undefined) {
            return false;
          }
          if (inputIdsToRemove.length === 0) {
            return true;
          }
          if (!Array.isArray(document.inputs)) {
            return true;
          }

          const remainingInputIds = new Set(
            document.inputs
              .filter(
                (item): item is { id: string } => isRecord(item) && typeof item.id === "string",
              )
              .map((item) => item.id),
          );

          const stillReferenced = collectReferencedInputIdsFromServers(document.servers);
          const orphanedIds = inputIdsToRemove.filter((inputId) => !stillReferenced.has(inputId));
          return orphanedIds.every((inputId) => !remainingInputIds.has(inputId));
        },
      });
    },
    async verifyRemove(plan) {
      const installed = (await this.inspect(plan.scope)).some(
        (entry) => entry.slug === plan.serverSlug,
      );
      return installed
        ? { ok: false, message: `${plan.serverSlug} is still installed in VS Code` }
        : { ok: true, message: `${plan.serverSlug} is absent from VS Code` };
    },
    async diagnose(): Promise<DiagnosticResult> {
      return { client: "vscode", ok: true, issues: [] };
    },
    getSafetyDescriptor() {
      return safetyDescriptor;
    },
  };

  return Object.freeze(adapter);
}

export { resolveVsCodeScopePaths };
