import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import { createInstallInputDefinitions, validateInputDefinitions } from "./input-resolution.js";
import { selectInstallVariant } from "./select-variant.js";
import type {
  ClientScope,
  InstallInputDefinition,
  InstallInputValue,
  RemoteAuthResolution,
  ResolveIntentOptions,
  ResolvedInstallIntent,
} from "./types.js";

const CLIENT_SCOPES = new Set<ClientScope>(["user", "project", "global"]);

export type ResolveIntentErrorReason =
  "INVALID_SCOPE" | "NONINTERACTIVE_PERSISTED_SECRET" | "UNSUPPORTED_REMOTE_AUTH";

export class ResolveIntentError extends Error {
  readonly reason: ResolveIntentErrorReason;
  readonly inputKey?: string;
  readonly scope?: string;

  constructor(
    reason: ResolveIntentErrorReason,
    message: string,
    options?: { readonly inputKey?: string; readonly scope?: string },
  ) {
    super(message);
    this.name = "ResolveIntentError";
    this.reason = reason;
    if (options?.inputKey !== undefined) {
      this.inputKey = options.inputKey;
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

function collectRequiredEnvReferences(values: Iterable<InstallInputValue>): readonly string[] {
  const requiredEnvReferences = new Set<string>();

  for (const value of values) {
    if (value.kind === "env-reference") {
      requiredEnvReferences.add(value.envName);
    }
  }

  return [...requiredEnvReferences];
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

  const envReferenceInputKeys: string[] = [];
  const envNames: string[] = [];
  const persistedSecretInputKeys: string[] = [];

  for (const input of remoteInputs) {
    const value = validatedInputs.get(input.key);
    if (!value) {
      continue;
    }

    if (value.kind === "env-reference") {
      envReferenceInputKeys.push(input.key);
      envNames.push(value.envName);
      continue;
    }

    if (value.kind === "secret-value") {
      persistedSecretInputKeys.push(input.key);
    }
  }

  if (persistedSecretInputKeys.length > 0) {
    const inputKey = persistedSecretInputKeys[0];
    if (options.noninteractive === true) {
      throw new ResolveIntentError(
        "NONINTERACTIVE_PERSISTED_SECRET",
        `Noninteractive mode cannot approve persisted secret input ${inputKey}`,
        inputKey === undefined ? undefined : { inputKey },
      );
    }

    return {
      remoteAuth: {
        kind: "persisted-secret",
        inputKeys: persistedSecretInputKeys,
        requiresInteractiveConsent: true,
      },
      warnings: [
        `Remote auth requires persisted secret input for ${persistedSecretInputKeys.join(", ")}.`,
      ],
    };
  }

  if (envReferenceInputKeys.length > 0) {
    return {
      remoteAuth: {
        kind: "env-reference",
        inputKeys: envReferenceInputKeys,
        envNames,
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
  const inputs = createInstallInputDefinitions(variant);
  const remoteHeaderInputs = variant.kind === "remote" ? getRemoteHeaderInputs(inputs) : [];
  const skipRequiredKeys =
    remoteHeaderInputs.length > 0 && options.remoteAuthPreference === "client-oauth"
      ? remoteHeaderInputs.map((input) => input.key)
      : [];
  const validatedInputs = validateInputDefinitions(
    inputs,
    getValidationInputValues(options.inputValues),
    skipRequiredKeys.length === 0 ? undefined : { skipRequiredKeys },
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
    requiredEnvReferences: collectRequiredEnvReferences(validatedInputs.values()),
  };
}
