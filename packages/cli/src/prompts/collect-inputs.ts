import type { InstallManifestV1 } from "@themcpdirectory/api-contract";
import {
  createInstallInputDefinitions,
  type AdapterCapability,
  type InstallInputDefinition,
  type InstallInputValue,
} from "@themcpdirectory/install-engine";
import type { PromptIO } from "../dependencies.js";
import {
  AddPlanningPromptError,
  type CollectedInputsResult,
  type CollectInputsOptions,
} from "./types.js";

export async function collectInstallInputs(
  options: CollectInputsOptions,
  promptIO: PromptIO,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<CollectedInputsResult> {
  const definitions = createInstallInputDefinitions(options.variant);
  const values: Record<string, InstallInputValue> = {};
  const inputSummary: string[] = [];

  for (const definition of definitions) {
    const collected = await collectInputValue(
      definition,
      options.variant,
      options.capabilities,
      promptIO,
      env,
    );
    if (!collected) {
      continue;
    }

    values[definition.key] = collected.value;
    inputSummary.push(collected.summary);
  }

  return {
    values,
    inputSummary,
    warnings: [],
  };
}

async function collectInputValue(
  definition: InstallInputDefinition,
  variant: InstallManifestV1["variants"][number],
  capabilities: readonly AdapterCapability[],
  promptIO: PromptIO,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<{ readonly value: InstallInputValue; readonly summary: string } | null> {
  if (definition.source === "environment-variable") {
    return await collectEnvironmentReference(definition, promptIO, env);
  }

  if (definition.source === "remote-header" && definition.sensitive) {
    return await collectSensitiveRemoteHeader(definition, capabilities, promptIO, env);
  }

  const defaultValue = getDefaultValue(variant, definition);
  if (defaultValue !== null) {
    return {
      value: { kind: "text", value: defaultValue },
      summary: `Use the default value for ${describeInput(definition)}.`,
    };
  }

  if (!definition.required) {
    return null;
  }

  if (!promptIO.isInteractive) {
    throw new AddPlanningPromptError(
      "REQUIRED_INPUT",
      `${describeInput(definition)} is required. Re-run in interactive mode.`,
    );
  }

  const textValue = await promptForNonEmptyValue(
    promptIO,
    `Value for ${describeInput(definition)}`,
  );

  return {
    value: { kind: "text", value: textValue },
    summary: `Provide a value for ${describeInput(definition)}.`,
  };
}

async function collectEnvironmentReference(
  definition: Extract<InstallInputDefinition, { source: "environment-variable" }>,
  promptIO: PromptIO,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<{ readonly value: InstallInputValue; readonly summary: string }> {
  if (hasEnvironmentValue(env, definition.name)) {
    return {
      value: { kind: "env-reference", envName: definition.name },
      summary: `Use environment variable $${definition.name} for ${describeInput(definition)}.`,
    };
  }

  if (!promptIO.isInteractive) {
    throw new AddPlanningPromptError(
      "REQUIRED_INPUT",
      `Required environment variable ${definition.name} is missing. Set it and retry.`,
    );
  }

  return await promptForExistingEnvironmentReference(definition, promptIO, env);
}

async function promptForExistingEnvironmentReference(
  definition: InstallInputDefinition,
  promptIO: PromptIO,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<{ readonly value: InstallInputValue; readonly summary: string }> {
  const label = `Environment variable for ${describeInput(definition)}`;
  let message = label;

  while (true) {
    const envName = (await promptIO.input(message)).trim();
    if (envName.length === 0) {
      message = `An environment variable name is required. ${label}`;
      continue;
    }

    if (!hasEnvironmentValue(env, envName)) {
      message = `${envName} is not set. ${label}`;
      continue;
    }

    return {
      value: { kind: "env-reference", envName },
      summary: `Use environment variable $${envName} for ${describeInput(definition)}.`,
    };
  }
}

async function collectSensitiveRemoteHeader(
  definition: Extract<InstallInputDefinition, { source: "remote-header"; sensitive: boolean }>,
  capabilities: readonly AdapterCapability[],
  promptIO: PromptIO,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<{ readonly value: InstallInputValue; readonly summary: string }> {
  const suggestedEnvName = toSuggestedEnvName(definition.placeholder);
  const supportsEnvReference = capabilities.includes("env-reference");
  const supportsPersistedSecret = capabilities.includes("persisted-secret");

  if (supportsEnvReference && hasEnvironmentValue(env, suggestedEnvName)) {
    return {
      value: { kind: "env-reference", envName: suggestedEnvName },
      summary: `Use environment variable $${suggestedEnvName} for ${describeInput(definition)}.`,
    };
  }

  if (!supportsEnvReference && !supportsPersistedSecret) {
    throw new AddPlanningPromptError(
      "UNSUPPORTED_CLIENT",
      `The selected client cannot securely configure ${describeInput(definition)}.`,
    );
  }

  if (!promptIO.isInteractive) {
    if (supportsEnvReference) {
      throw new AddPlanningPromptError(
        "REQUIRED_INPUT",
        `Required environment variable ${suggestedEnvName} is missing. Set it and retry.`,
      );
    }

    throw new AddPlanningPromptError(
      "REQUIRED_INPUT",
      `Interactive confirmation is required to persist ${describeInput(definition)}.`,
    );
  }

  if (supportsEnvReference && !supportsPersistedSecret) {
    return await promptForSecretEnvReference(definition, promptIO, env);
  }

  if (!supportsEnvReference && supportsPersistedSecret) {
    return await promptForPersistedSecret(definition, promptIO);
  }

  const method = await promptIO.select(`How should ${describeInput(definition)} be provided?`, [
    "Environment variable reference",
    "Persisted secret value",
  ]);

  if (method === "Environment variable reference") {
    return await promptForSecretEnvReference(definition, promptIO, env);
  }

  return await promptForPersistedSecret(definition, promptIO);
}

async function promptForSecretEnvReference(
  definition: Extract<InstallInputDefinition, { source: "remote-header"; sensitive: boolean }>,
  promptIO: PromptIO,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<{ readonly value: InstallInputValue; readonly summary: string }> {
  return await promptForExistingEnvironmentReference(definition, promptIO, env);
}

async function promptForPersistedSecret(
  definition: Extract<InstallInputDefinition, { source: "remote-header"; sensitive: boolean }>,
  promptIO: PromptIO,
): Promise<{ readonly value: InstallInputValue; readonly summary: string }> {
  const approved = await promptIO.confirm(
    `Persist a secret value for ${describeInput(definition)} in the selected client configuration?`,
  );
  if (!approved) {
    throw new AddPlanningPromptError(
      "USER_CANCELLED",
      `Persisted secret consent was declined for ${describeInput(definition)}.`,
    );
  }

  const secretValue = await promptForNonEmptySecret(
    promptIO,
    `Secret value for ${describeInput(definition)}`,
  );

  return {
    value: { kind: "secret-value", value: secretValue, allowPersistence: true },
    summary: `Persist an interactive secret value for ${describeInput(definition)}.`,
  };
}

async function promptForNonEmptySecret(promptIO: PromptIO, message: string): Promise<string> {
  let prompt = message;
  while (true) {
    const value = (await promptIO.secretInput(prompt)).trim();
    if (value.length > 0) {
      return value;
    }
    prompt = `A secret value is required. ${message}`;
  }
}

async function promptForNonEmptyValue(promptIO: PromptIO, message: string): Promise<string> {
  let prompt = message;
  while (true) {
    const value = (await promptIO.input(prompt)).trim();
    if (value.length > 0) {
      return value;
    }
    prompt = `A value is required. ${message}`;
  }
}

function getDefaultValue(
  variant: InstallManifestV1["variants"][number],
  definition: InstallInputDefinition,
): string | null {
  if (variant.kind !== "remote" || definition.source !== "remote-variable") {
    return null;
  }

  const variable = variant.variables.find((candidate) => candidate.name === definition.name);
  return variable?.defaultValue ?? null;
}

function describeInput(definition: InstallInputDefinition): string {
  switch (definition.source) {
    case "environment-variable":
      return definition.name;
    case "package-argument":
    case "package-runtime-argument":
      return definition.name ?? definition.valueHint ?? definition.key;
    case "remote-variable":
      return definition.name;
    case "remote-header":
      return `${definition.headerName} (${definition.placeholder})`;
    default:
      return "input";
  }
}

function hasEnvironmentValue(env: Readonly<NodeJS.ProcessEnv>, envName: string): boolean {
  const value = env[envName];
  return typeof value === "string" && value.trim().length > 0;
}

function toSuggestedEnvName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase();
}
