import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { createInstallInputDefinitions, validateInputDefinitions } from "./input-resolution.js";
import {
  isSafeSensitiveRemoteHeaderValue,
  isSensitiveRemoteHeaderName,
  parseRemoteHeaderTemplate,
} from "./remote-header.js";
import { selectInstallVariant } from "./select-variant.js";
import type {
  ClientScope,
  InstallInputDefinition,
  InstallInputValue,
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  InstallManifestVariantV1,
  RemoteAuthBinding,
  RemoteAuthResolution,
  ResolveIntentOptions,
  ResolvedInstallIntent,
} from "./types.js";

const CLIENT_SCOPES = new Set<ClientScope>(["user", "project", "global"]);
const SENSITIVE_INPUT_NAME_PATTERN = /(secret|token|password|auth|key)/i;

export type ResolveIntentErrorReason =
  | "INVALID_SCOPE"
  | "NONINTERACTIVE_PERSISTED_SECRET"
  | "UNSAFE_PACKAGE_ARGUMENT"
  | "UNSUPPORTED_REMOTE_AUTH"
  | "UNSAFE_REMOTE_HEADER"
  | "UNSAFE_INPUT_DEFAULT";

export class ResolveIntentError extends Error {
  readonly reason: ResolveIntentErrorReason;
  readonly inputKey?: string;
  readonly inputName?: string;
  readonly headerName?: string;
  readonly scope?: string;

  constructor(
    reason: ResolveIntentErrorReason,
    message: string,
    options?: {
      readonly inputKey?: string;
      readonly inputName?: string;
      readonly headerName?: string;
      readonly scope?: string;
    },
  ) {
    super(message);
    this.name = "ResolveIntentError";
    this.reason = reason;
    if (options?.inputKey !== undefined) {
      this.inputKey = options.inputKey;
    }
    if (options?.inputName !== undefined) {
      this.inputName = options.inputName;
    }
    if (options?.headerName !== undefined) {
      this.headerName = options.headerName;
    }
    if (options?.scope !== undefined) {
      this.scope = options.scope;
    }
  }
}

function assertClientScope(scope: string): asserts scope is ClientScope {
  if (!CLIENT_SCOPES.has(scope as ClientScope)) {
    throw new ResolveIntentError("INVALID_SCOPE", `Unsupported client scope: ${scope}`, {
      scope,
    });
  }
}

function getRemoteHeaderInputs(
  inputs: readonly InstallInputDefinition[],
): readonly Extract<InstallInputDefinition, { source: "remote-header" }>[] {
  return inputs.filter(
    (input): input is Extract<InstallInputDefinition, { source: "remote-header" }> =>
      input.source === "remote-header",
  );
}

function assertSafeRemoteHeaders(headers: InstallManifestRemoteVariantV1["headers"]): void {
  for (const header of headers) {
    if (parseRemoteHeaderTemplate(header.value).hasMalformedPlaceholder) {
      throw new ResolveIntentError(
        "UNSAFE_REMOTE_HEADER",
        `Remote header ${header.name} contains an invalid placeholder template`,
        { headerName: header.name },
      );
    }

    if (
      isSensitiveRemoteHeaderName(header.name) &&
      !isSafeSensitiveRemoteHeaderValue(header.name, header.value)
    ) {
      throw new ResolveIntentError(
        "UNSAFE_REMOTE_HEADER",
        `Remote header ${header.name} must use placeholder-based secret references only`,
        { headerName: header.name },
      );
    }
  }
}

function assertSafeVariableDefaults(
  variables:
    | InstallManifestPackageVariantV1["environmentVariables"]
    | InstallManifestRemoteVariantV1["variables"],
): void {
  for (const variable of variables) {
    if (variable.defaultValue === null || !SENSITIVE_INPUT_NAME_PATTERN.test(variable.name)) {
      continue;
    }

    throw new ResolveIntentError(
      "UNSAFE_INPUT_DEFAULT",
      `Input default for ${variable.name} cannot be serialized into an install intent`,
      { inputName: variable.name },
    );
  }
}

function isSensitivePackageArgumentHint(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  const sensitiveTerms = new Set([
    "auth",
    "authentication",
    "authorization",
    "credential",
    "credentials",
    "key",
    "passwd",
    "password",
    "secret",
    "token",
  ]);
  return normalized.some((term) => sensitiveTerms.has(term));
}

function assertSafePackageArguments(variant: InstallManifestPackageVariantV1): void {
  for (const argument of [...variant.runtimeArguments, ...variant.packageArguments]) {
    if (
      !isSensitivePackageArgumentHint(argument.name) &&
      !isSensitivePackageArgumentHint(argument.valueHint)
    ) {
      continue;
    }

    const inputName = argument.name ?? argument.valueHint ?? "package argument";
    throw new ResolveIntentError(
      "UNSAFE_PACKAGE_ARGUMENT",
      `Package argument ${inputName} may contain credential data; declare it as an environment variable instead`,
      { inputName },
    );
  }
}

export function assertSafeInstallVariant(variant: InstallManifestVariantV1): void {
  if (variant.kind === "package") {
    assertSafePackageArguments(variant);
    assertSafeVariableDefaults(variant.environmentVariables);
    return;
  }

  assertSafeVariableDefaults(variant.variables);
  assertSafeRemoteHeaders(variant.headers);
}

function collectRequiredEnvReferences(
  inputs: readonly InstallInputDefinition[],
  validatedInputs: ReadonlyMap<string, InstallInputValue>,
): readonly string[] {
  const seenEnvNames = new Set<string>();
  const requiredEnvReferences: string[] = [];

  for (const input of inputs) {
    const value = validatedInputs.get(input.key);
    if (value?.kind === "env-reference") {
      if (seenEnvNames.has(value.envName)) {
        continue;
      }

      seenEnvNames.add(value.envName);
      requiredEnvReferences.push(value.envName);
    }
  }

  return requiredEnvReferences;
}

function resolveRemoteAuth(
  remoteInputs: readonly Extract<InstallInputDefinition, { source: "remote-header" }>[],
  validatedInputs: ReadonlyMap<string, InstallInputValue>,
  options: ResolveIntentOptions,
): { readonly remoteAuth: RemoteAuthResolution; readonly warnings: readonly string[] } {
  if (remoteInputs.length === 0) {
    return { remoteAuth: { kind: "none" }, warnings: [] };
  }

  if (options.remoteAuthPreference === "client-oauth") {
    throw new ResolveIntentError(
      "UNSUPPORTED_REMOTE_AUTH",
      "Phase D install manifests do not declare explicit remote OAuth support",
    );
  }

  const bindings: RemoteAuthBinding[] = [];
  const envBindings: Extract<RemoteAuthBinding, { readonly kind: "env-reference" }>[] = [];
  const persistedSecretBindings: Extract<
    RemoteAuthBinding,
    { readonly kind: "persisted-secret" }
  >[] = [];

  for (const input of remoteInputs) {
    if (!input.sensitive) {
      continue;
    }

    const value = validatedInputs.get(input.key);
    if (!value) {
      continue;
    }

    if (value.kind === "env-reference") {
      const binding = {
        kind: "env-reference",
        inputKey: input.key,
        envName: value.envName,
      } as const;
      envBindings.push(binding);
      bindings.push(binding);
      continue;
    }

    if (value.kind === "secret-value") {
      const binding = { kind: "persisted-secret", inputKey: input.key } as const;
      persistedSecretBindings.push(binding);
      bindings.push(binding);
    }
  }

  if (persistedSecretBindings.length > 0) {
    const inputKey = persistedSecretBindings[0]?.inputKey;
    if (options.noninteractive === true) {
      throw new ResolveIntentError(
        "NONINTERACTIVE_PERSISTED_SECRET",
        `Noninteractive mode cannot approve persisted secret input ${inputKey}`,
        inputKey === undefined ? undefined : { inputKey },
      );
    }

    const warningInputKeys = persistedSecretBindings.map((binding) => binding.inputKey);

    if (envBindings.length === 0) {
      return {
        remoteAuth: {
          kind: "persisted-secret",
          bindings: persistedSecretBindings,
          requiresInteractiveConsent: true,
        },
        warnings: [
          `Remote auth requires persisted secret input for ${warningInputKeys.join(", ")}.`,
        ],
      };
    }

    return {
      remoteAuth: {
        kind: "mixed",
        bindings,
        requiresInteractiveConsent: true,
      },
      warnings: [`Remote auth requires persisted secret input for ${warningInputKeys.join(", ")}.`],
    };
  }

  if (envBindings.length > 0) {
    return {
      remoteAuth: {
        kind: "env-reference",
        bindings: envBindings,
      },
      warnings: [],
    };
  }

  return { remoteAuth: { kind: "none" }, warnings: [] };
}

function getValidationInputValues(
  inputValues: Record<string, InstallInputValue>,
): Record<string, InstallInputValue> {
  return inputValues;
}

export function createResolvedInstallIntent(
  manifest: InstallManifestV1,
  options: ResolveIntentOptions,
): ResolvedInstallIntent {
  assertClientScope(options.scope);

  const variant = selectInstallVariant(manifest, options.client, options.requestedVariantId);
  if (variant.kind === "remote" && options.remoteAuthPreference === "client-oauth") {
    throw new ResolveIntentError(
      "UNSUPPORTED_REMOTE_AUTH",
      "Phase D install manifests do not declare explicit remote OAuth support",
    );
  }

  assertSafeInstallVariant(variant);

  const inputs = createInstallInputDefinitions(variant);
  const remoteHeaderInputs = variant.kind === "remote" ? getRemoteHeaderInputs(inputs) : [];
  const validatedInputs = validateInputDefinitions(
    inputs,
    getValidationInputValues(options.inputValues),
  );
  const { remoteAuth, warnings } =
    variant.kind === "remote"
      ? resolveRemoteAuth(remoteHeaderInputs, validatedInputs, options)
      : { remoteAuth: { kind: "none" } as const, warnings: [] as const };

  return {
    schemaVersion: 1,
    server: {
      slug: manifest.server.slug,
      title: manifest.server.title,
      version: manifest.server.version,
    },
    client: options.client,
    scope: options.scope,
    variant,
    warnings,
    inputs,
    remoteAuth,
    requiredEnvReferences: collectRequiredEnvReferences(inputs, validatedInputs),
  };
}
