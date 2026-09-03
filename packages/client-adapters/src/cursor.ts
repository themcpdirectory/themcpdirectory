import { posix, win32 } from "node:path";
import { createHash } from "node:crypto";
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
  applyCursorConfigMutation,
  createCursorConfigMutation,
  getCursorServerEntry,
  readCursorConfigDocument,
  removeCursorServerEntry,
  resolveCursorScopePaths,
  setCursorServerEntry,
} from "./cursor-json.js";
import { createCursorDeeplink } from "./cursor-deeplink.js";
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

const CURSOR_CAPABILITIES = Object.freeze([
  "native-add-stdio",
  "native-add-remote",
  "native-remove",
  "native-list",
  "native-scope-user",
  "native-scope-project",
  "env-reference",
  "cursor-deeplink",
] satisfies readonly AdapterCapability[]);

export type CursorAdapterErrorCode =
  | "CURSOR_INVALID_INPUT"
  | "CURSOR_UNSUPPORTED_CAPABILITY"
  | "CURSOR_INVALID_PLAN"
  | "CURSOR_INVALID_LIST_OUTPUT"
  | "CURSOR_WRITE_FAILED";

export class CursorAdapterError extends Error {
  readonly code: CursorAdapterErrorCode;
  readonly capability?: AdapterCapability;

  constructor(
    code: CursorAdapterErrorCode,
    message: string,
    options?: { readonly capability?: AdapterCapability },
  ) {
    super(message);
    this.name = "CursorAdapterError";
    this.code = code;
    if (options?.capability !== undefined) {
      this.capability = options.capability;
    }
  }
}

function getCursorInstallationCandidates(
  runtime: AdapterRuntime,
): readonly { path: string | undefined; kind: "file" | "directory" }[] {
  if (runtime.platform === "win32") {
    return [
      {
        path: runtime.env.LOCALAPPDATA
          ? win32.join(runtime.env.LOCALAPPDATA, "Programs", "cursor", "Cursor.exe")
          : undefined,
        kind: "file",
      },
      {
        path: runtime.env.ProgramFiles
          ? win32.join(runtime.env.ProgramFiles, "Cursor", "Cursor.exe")
          : undefined,
        kind: "file",
      },
    ];
  }

  if (runtime.platform === "darwin") {
    return [
      { path: "/Applications/Cursor.app", kind: "directory" },
      {
        path: posix.join(runtime.homeDirectory, "Applications", "Cursor.app"),
        kind: "directory",
      },
    ];
  }

  return [
    { path: "/usr/share/cursor/cursor", kind: "file" },
    { path: "/opt/cursor/cursor", kind: "file" },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireScope(scope: ClientScope): void {
  if (scope === "global") {
    throw new CursorAdapterError(
      "CURSOR_UNSUPPORTED_CAPABILITY",
      "Cursor adapter does not support global scope",
      { capability: "native-scope-project" },
    );
  }
}

function requireCursorIntent(options: PlanInstallOptions): void {
  if (options.intent.client !== "cursor") {
    throw new CursorAdapterError(
      "CURSOR_INVALID_INPUT",
      "Cursor adapter requires an intent resolved for Cursor",
    );
  }
  requireScope(options.intent.scope);
}

function requireSafeServerSlug(slug: string): void {
  if (!SAFE_SERVER_SLUG_PATTERN.test(slug)) {
    throw new CursorAdapterError("CURSOR_INVALID_INPUT", "Cursor requires a valid server slug");
  }
}

function getInput(inputs: ValidatedInstallInputMap, key: string): InstallInputValue {
  const value = inputs.get(key);
  if (!value) {
    throw new CursorAdapterError("CURSOR_INVALID_INPUT", `Missing validated input: ${key}`);
  }
  return value;
}

function getTextInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "text") {
    throw new CursorAdapterError("CURSOR_INVALID_INPUT", `Input ${key} must be text`);
  }
  return value.value;
}

function getSafeEnvReferenceInput(inputs: ValidatedInstallInputMap, key: string): string {
  const value = getInput(inputs, key);
  if (value.kind !== "env-reference") {
    throw new CursorAdapterError(
      "CURSOR_UNSUPPORTED_CAPABILITY",
      "Cursor adapter requires environment references for secret remote authentication",
      { capability: "env-reference" },
    );
  }
  if (!SAFE_ENV_NAME_PATTERN.test(value.envName)) {
    throw new CursorAdapterError(
      "CURSOR_INVALID_INPUT",
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
      throw new CursorAdapterError(
        "CURSOR_INVALID_INPUT",
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
        throw new CursorAdapterError(
          "CURSOR_INVALID_INPUT",
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
): Record<string, JsonValue> {
  if (
    variant.registryType !== "npm" ||
    (variant.runtimeHint !== null && variant.runtimeHint !== "npx")
  ) {
    throw new CursorAdapterError(
      "CURSOR_UNSUPPORTED_CAPABILITY",
      "Cursor adapter supports exact npm package variants through npx only",
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
      throw new CursorAdapterError(
        "CURSOR_INVALID_INPUT",
        `Missing validated input: ${definition.key}`,
      );
    }
    if (value.kind === "text") {
      envObject[variable.name] = value.value;
    } else if (value.kind === "env-reference") {
      envObject[variable.name] = `\${${value.envName}}`;
    } else {
      throw new CursorAdapterError(
        "CURSOR_UNSUPPORTED_CAPABILITY",
        "Cursor adapter does not persist secret values from package environment inputs",
      );
    }
  }

  return {
    command: "npx",
    args,
    ...(Object.keys(envObject).length > 0 ? { env: envObject } : {}),
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

function buildRemoteServerConfig(
  variant: InstallManifestRemoteVariantV1,
  definitions: readonly InstallInputDefinition[],
  inputs: ValidatedInstallInputMap,
): Record<string, JsonValue> {
  const variableMap: Record<string, string> = {};
  for (const variable of variant.variables) {
    const definition = definitions.find(
      (candidate): candidate is Extract<InstallInputDefinition, { source: "remote-variable" }> =>
        candidate.source === "remote-variable" && candidate.name === variable.name,
    );
    if (!definition) {
      if (variable.required) {
        throw new CursorAdapterError(
          "CURSOR_INVALID_INPUT",
          `Missing input definition for remote variable ${variable.name}`,
        );
      }
      continue;
    }

    variableMap[variable.name] = getTextInput(inputs, definition.key);
  }

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
          candidate.source === "remote-header" && candidate.placeholder === placeholder,
      );
      if (!definition) {
        continue;
      }

      const inputValue = getInput(inputs, definition.key);
      const replacement =
        inputValue.kind === "text"
          ? inputValue.value
          : inputValue.kind === "env-reference"
            ? `\${${inputValue.envName}}`
            : null;
      if (replacement === null) {
        throw new CursorAdapterError(
          "CURSOR_UNSUPPORTED_CAPABILITY",
          "Cursor adapter does not persist secret header values",
          { capability: "env-reference" },
        );
      }

      value = value.replaceAll(`{${placeholder}}`, replacement);
    }
    headers[header.name] = value;
  }

  return {
    url: applyRemoteTemplate(variant.urlTemplate, variableMap),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

function buildCursorServerConfig(options: PlanInstallOptions): Record<string, JsonValue> {
  const { variant } = options.intent;
  if (variant.kind === "package") {
    return buildPackageServerConfig(variant, options.intent.inputs, options.inputs);
  }

  if (variant.kind === "remote") {
    for (const definition of options.intent.inputs) {
      if (definition.source !== "remote-header" || !definition.sensitive) {
        continue;
      }

      const value = getInput(options.inputs, definition.key);
      if (value.kind !== "env-reference") {
        throw new CursorAdapterError(
          "CURSOR_UNSUPPORTED_CAPABILITY",
          "Cursor adapter requires env-reference inputs for sensitive remote headers",
          { capability: "env-reference" },
        );
      }
      getSafeEnvReferenceInput(options.inputs, definition.key);
    }
    return buildRemoteServerConfig(variant, options.intent.inputs, options.inputs);
  }

  throw new CursorAdapterError("CURSOR_UNSUPPORTED_CAPABILITY", "Unsupported Cursor variant type");
}

function canUseUserMediatedDeeplink(options: PlanInstallOptions): boolean {
  if (options.intent.scope !== "user") {
    return false;
  }

  if (
    options.intent.remoteAuth.kind === "persisted-secret" ||
    options.intent.remoteAuth.kind === "mixed"
  ) {
    return false;
  }

  for (const value of options.inputs.values()) {
    if (value.kind === "secret-value") {
      return false;
    }
  }

  return true;
}

function createSafetyDescriptor(runtime: AdapterRuntime): AdapterSafetyDescriptor {
  const userRoot = resolveCursorScopePaths(runtime, "user").rootPath;
  const projectRoot = resolveCursorScopePaths(runtime, "project").rootPath;
  return {
    client: "cursor",
    executableAllowList: [],
    configRoots: [userRoot, projectRoot],
    deeplink: { kind: "cursor-install" },
    supportedCapabilities: CURSOR_CAPABILITIES,
  };
}

function assertCursorInstallPlan(plan: InstallPlan): void {
  requireScope(plan.scope);
  if (plan.client !== "cursor" || plan.operations.length !== 1) {
    throw new CursorAdapterError(
      "CURSOR_INVALID_PLAN",
      "Cursor install plan must contain exactly one Cursor operation",
    );
  }

  const operation = plan.operations[0];
  if (!operation) {
    throw new CursorAdapterError("CURSOR_INVALID_PLAN", "Cursor install plan has no operation");
  }

  if (operation.type === "deeplink") {
    return;
  }

  if (operation.type !== "config-write") {
    throw new CursorAdapterError(
      "CURSOR_INVALID_PLAN",
      "Cursor install plan operation must be deeplink or config-write",
    );
  }

  if (!isRecord(operation.document)) {
    throw new CursorAdapterError(
      "CURSOR_INVALID_PLAN",
      "Cursor config-write operation document must be a JSON object",
    );
  }
}

function assertCursorRemovalPlan(plan: RemovalPlan): void {
  requireScope(plan.scope);
  if (plan.client !== "cursor" || plan.operations.length !== 1) {
    throw new CursorAdapterError(
      "CURSOR_INVALID_PLAN",
      "Cursor removal plan must contain exactly one Cursor operation",
    );
  }

  const operation = plan.operations[0];
  if (!operation || operation.type !== "config-remove") {
    throw new CursorAdapterError(
      "CURSOR_INVALID_PLAN",
      "Cursor removal operation must be config-remove",
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

function toInstalledEntry(
  scope: ClientScope,
  name: string,
  value: unknown,
  configPath: string,
): InstalledMcpServer | null {
  if (!isRecord(value)) {
    return null;
  }

  const transport = typeof value.url === "string" ? "streamable-http" : "stdio";
  const slug = SAFE_SERVER_SLUG_PATTERN.test(name) ? name : undefined;
  const environmentReferences = collectEnvironmentReferences(value);
  return {
    name,
    ...(slug === undefined ? {} : { slug }),
    client: "cursor",
    scope,
    transport,
    managedBy: "external",
    ...(environmentReferences.length > 0 ? { environmentReferences } : {}),
    adapterMetadata: {
      configPath,
      source: "cursor-json",
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
    for (const match of value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)) {
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

export function createCursorAdapter(runtime: AdapterRuntime): McpClientAdapter {
  const safetyDescriptor = createSafetyDescriptor(runtime);
  const plannedInstallOperations = new Map<string, string>();
  const plannedRemovalOperations = new Map<string, string>();

  const adapter: McpClientAdapter = {
    id: "cursor" as const,
    inspectionSafety: "configuration-only",
    async detect(): Promise<ClientDetection> {
      const executable = await findInstalledApplication(
        runtime,
        "cursor",
        getCursorInstallationCandidates(runtime),
      );
      return {
        id: "cursor",
        installed: executable !== undefined,
        ...(executable === undefined ? {} : { executable }),
        capabilities: executable === undefined ? [] : CURSOR_CAPABILITIES,
      };
    },
    async inspect(scope = "user") {
      requireScope(scope);
      const mutation = createCursorConfigMutation(runtime, {
        scope,
        serverKey: "_unused",
        intentHash: "0".repeat(64),
      });
      const document = await readCursorConfigDocument(runtime, mutation);
      if (!document?.mcpServers || !isRecord(document.mcpServers)) {
        return [];
      }

      const entries: InstalledMcpServer[] = [];
      for (const [name, value] of Object.entries(document.mcpServers)) {
        const installed = toInstalledEntry(scope, name, value, mutation.path);
        if (installed) {
          entries.push(installed);
        }
      }
      return entries;
    },
    async planInstall(options) {
      requireCursorIntent(options);
      requireSafeServerSlug(options.intent.server.slug);
      const mutation = createCursorConfigMutation(runtime, {
        scope: options.intent.scope,
        serverKey: options.intent.server.slug,
        intentHash: options.intentHash,
      });
      const serverConfig = buildCursorServerConfig(options);

      const configWritePlan: InstallPlan = {
        schemaVersion: 1,
        serverSlug: options.intent.server.slug,
        client: "cursor",
        scope: options.intent.scope,
        variantId: options.intent.variant.id,
        manifestHash: options.manifestHash,
        intentHash: options.intentHash,
        operations: [
          {
            type: "config-write",
            path: mutation.path,
            mutationKey: options.intent.server.slug,
            document: serverConfig,
          },
        ],
        previewLines: [
          `Configure ${options.intent.server.slug} in Cursor ${options.intent.scope} mcp.json.`,
        ],
      };

      const plan = canUseUserMediatedDeeplink(options)
        ? {
            ...configWritePlan,
            operations: [
              {
                type: "deeplink" as const,
                url: createCursorDeeplink(configWritePlan),
              },
            ],
            previewLines: [
              `Open a Cursor deeplink to install ${options.intent.server.slug} in user scope.`,
            ],
          }
        : configWritePlan;

      const validated = validateInstallPlan(plan, safetyDescriptor);
      plannedInstallOperations.set(
        getInstallPlanIdentity(validated),
        serializeOperations(validated),
      );
      return validated;
    },
    async executePlan(plan) {
      const validated = validateInstallPlan(plan, safetyDescriptor);
      assertCursorInstallPlan(validated);

      if (
        plannedInstallOperations.get(getInstallPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new CursorAdapterError(
          "CURSOR_INVALID_PLAN",
          "Cursor install operation differs from the operation produced during planning",
        );
      }

      const [operation] = validated.operations;
      if (!operation) {
        throw new CursorAdapterError("CURSOR_INVALID_PLAN", "Cursor plan has no operation");
      }

      if (operation.type === "deeplink") {
        await runtime.openUrl(operation.url);
        return;
      }

      if (operation.type !== "config-write") {
        throw new CursorAdapterError(
          "CURSOR_UNSUPPORTED_CAPABILITY",
          "Cursor install plans may contain deeplink or config-write only",
        );
      }

      const mutation = createCursorConfigMutation(runtime, {
        scope: validated.scope,
        serverKey: operation.mutationKey,
        intentHash: validated.intentHash,
      });
      if (operation.path !== mutation.path) {
        throw new CursorAdapterError(
          "CURSOR_INVALID_PLAN",
          "Cursor plan path does not match the scope-approved configuration path",
        );
      }

      await applyCursorConfigMutation(runtime, {
        mutation,
        apply: (document) =>
          setCursorServerEntry(document, operation.mutationKey, operation.document),
        verify: (document) => {
          const entry = getCursorServerEntry(document, operation.mutationKey);
          return JSON.stringify(entry) === JSON.stringify(operation.document);
        },
      });
    },
    async verifyInstall(plan) {
      const operation = plan.operations[0];
      if (operation?.type === "deeplink") {
        return {
          ok: true,
          message:
            "Cursor deeplink opened. Complete the in-app confirmation flow to finish installation.",
        };
      }

      const installedEntry = (await this.inspect(plan.scope)).find(
        (entry) => entry.slug === plan.serverSlug,
      );
      return installedEntry
        ? { ok: true, installedEntry, message: `${plan.serverSlug} is installed in Cursor` }
        : { ok: false, message: `${plan.serverSlug} was not found in Cursor` };
    },
    async planRemove(options: PlanRemoveOptions): Promise<RemovalPlan> {
      const scope = options.scope ?? "user";
      requireScope(scope);
      requireSafeServerSlug(options.slug);

      const mutation = createCursorConfigMutation(runtime, {
        scope,
        serverKey: options.slug,
        intentHash: "0".repeat(64),
      });

      const plan: RemovalPlan = {
        schemaVersion: 1,
        serverSlug: options.slug,
        client: "cursor",
        scope,
        operations: [
          {
            type: "config-remove",
            path: mutation.path,
            mutationKey: options.slug,
          },
        ],
        previewLines: [`Remove ${options.slug} from Cursor ${scope} mcp.json.`],
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
      assertCursorRemovalPlan(validated);

      if (
        plannedRemovalOperations.get(getRemovalPlanIdentity(validated)) !==
        serializeOperations(validated)
      ) {
        throw new CursorAdapterError(
          "CURSOR_INVALID_PLAN",
          "Cursor removal operation differs from the operation produced during planning",
        );
      }

      const [operation] = validated.operations;
      if (!operation || operation.type !== "config-remove") {
        throw new CursorAdapterError(
          "CURSOR_UNSUPPORTED_CAPABILITY",
          "Cursor removal plans may contain config-remove only",
        );
      }

      const mutation = createCursorConfigMutation(runtime, {
        scope: validated.scope,
        serverKey: operation.mutationKey,
        intentHash: deriveRemovalMutationIntentHash(validated, operation.mutationKey),
      });
      if (operation.path !== mutation.path) {
        throw new CursorAdapterError(
          "CURSOR_INVALID_PLAN",
          "Cursor removal path does not match the scope-approved configuration path",
        );
      }

      const currentDocument = await readCursorConfigDocument(runtime, mutation);
      if (currentDocument === null) {
        return;
      }
      if (getCursorServerEntry(currentDocument, operation.mutationKey) === undefined) {
        return;
      }

      await applyCursorConfigMutation(runtime, {
        mutation,
        apply: (document) => removeCursorServerEntry(document, operation.mutationKey),
        verify: (document) => getCursorServerEntry(document, operation.mutationKey) === undefined,
      });
    },
    async verifyRemove(plan) {
      const installed = (await this.inspect(plan.scope)).some(
        (entry) => entry.slug === plan.serverSlug,
      );
      return installed
        ? { ok: false, message: `${plan.serverSlug} is still installed in Cursor` }
        : { ok: true, message: `${plan.serverSlug} is absent from Cursor` };
    },
    async diagnose(): Promise<DiagnosticResult> {
      return { client: "cursor", ok: true, issues: [] };
    },
    getSafetyDescriptor() {
      return safetyDescriptor;
    },
  };

  return Object.freeze(adapter);
}
