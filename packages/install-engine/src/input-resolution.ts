import type {
  InstallInputDefinition,
  InstallInputValue,
  InstallManifestPackageVariantV1,
  InstallManifestRemoteVariantV1,
  InstallManifestVariantV1,
  ResolvedInstallIntent,
  ValidatedInstallInputMap,
} from "./types.js";

const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;

const READONLY_INPUT_MAP_ERROR_MESSAGE = "Validated install inputs are read-only";

export type InstallInputValidationErrorReason =
  | "UNKNOWN_INPUT"
  | "MISSING_REQUIRED_INPUT"
  | "INVALID_INPUT_KIND"
  | "INVALID_ENV_REFERENCE"
  | "INVALID_INPUT_VALUE";

export class InstallInputValidationError extends Error {
  readonly reason: InstallInputValidationErrorReason;
  readonly inputKey: string;

  constructor(reason: InstallInputValidationErrorReason, inputKey: string, message: string) {
    super(message);
    this.name = "InstallInputValidationError";
    this.reason = reason;
    this.inputKey = inputKey;
  }
}

class ReadonlyValidatedInstallInputMap implements ValidatedInstallInputMap {
  readonly #map: ReadonlyMap<string, InstallInputValue>;

  constructor(entries: ReadonlyMap<string, InstallInputValue>) {
    this.#map = new Map(entries);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: string): InstallInputValue | undefined {
    return this.#map.get(key);
  }

  has(key: string): boolean {
    return this.#map.has(key);
  }

  forEach(
    callbackfn: (
      value: InstallInputValue,
      key: string,
      map: ReadonlyMap<string, InstallInputValue>,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.#map.forEach((value, key) => callbackfn.call(thisArg, value, key, this), thisArg);
  }

  entries(): MapIterator<[string, InstallInputValue]> {
    return this.#map.entries();
  }

  keys(): MapIterator<string> {
    return this.#map.keys();
  }

  values(): MapIterator<InstallInputValue> {
    return this.#map.values();
  }

  [Symbol.iterator](): MapIterator<[string, InstallInputValue]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return "ReadonlyMap";
  }

  set(): never {
    throw new TypeError(READONLY_INPUT_MAP_ERROR_MESSAGE);
  }

  delete(): never {
    throw new TypeError(READONLY_INPUT_MAP_ERROR_MESSAGE);
  }

  clear(): never {
    throw new TypeError(READONLY_INPUT_MAP_ERROR_MESSAGE);
  }
}

function createReadonlyValidatedInstallInputMap(
  entries: ReadonlyMap<string, InstallInputValue>,
): ValidatedInstallInputMap {
  return new ReadonlyValidatedInstallInputMap(entries);
}

function createUniqueKey(
  preferredKey: string,
  source: InstallInputDefinition["source"],
  usedKeys: Set<string>,
): string {
  if (!usedKeys.has(preferredKey)) {
    usedKeys.add(preferredKey);
    return preferredKey;
  }

  const sourcedKey = `${source}:${preferredKey}`;
  if (!usedKeys.has(sourcedKey)) {
    usedKeys.add(sourcedKey);
    return sourcedKey;
  }

  let suffix = 2;
  while (usedKeys.has(`${sourcedKey}:${suffix}`)) {
    suffix += 1;
  }

  const resolvedKey = `${sourcedKey}:${suffix}`;
  usedKeys.add(resolvedKey);
  return resolvedKey;
}

function createArgumentDefinitions(
  argumentsList:
    | InstallManifestPackageVariantV1["runtimeArguments"]
    | InstallManifestPackageVariantV1["packageArguments"],
  source: "package-runtime-argument" | "package-argument",
  usedKeys: Set<string>,
): InstallInputDefinition[] {
  return argumentsList.map((argument, index) => {
    const preferredKey = argument.name ?? argument.valueHint ?? `${argument.type}-${index + 1}`;

    return {
      key: createUniqueKey(preferredKey, source, usedKeys),
      source,
      argumentType: argument.type,
      index,
      name: argument.name ?? null,
      valueHint: argument.valueHint ?? null,
      description: argument.description ?? null,
      required: argument.required === true,
      accepts: ["text"],
    } satisfies InstallInputDefinition;
  });
}

function createEnvironmentVariableDefinitions(
  variables: InstallManifestPackageVariantV1["environmentVariables"],
  usedKeys: Set<string>,
): InstallInputDefinition[] {
  return variables.map((variable) => ({
    key: createUniqueKey(variable.name, "environment-variable", usedKeys),
    source: "environment-variable",
    name: variable.name,
    description: variable.description,
    required: variable.required,
    accepts: ["env-reference"],
  }));
}

function createRemoteVariableDefinitions(
  variables: InstallManifestRemoteVariantV1["variables"],
  usedKeys: Set<string>,
): InstallInputDefinition[] {
  return variables.map((variable) => ({
    key: createUniqueKey(variable.name, "remote-variable", usedKeys),
    source: "remote-variable",
    name: variable.name,
    description: variable.description,
    required: variable.required,
    accepts: ["text"],
  }));
}

function extractHeaderPlaceholders(template: string): readonly string[] {
  const placeholders: string[] = [];

  for (const match of template.matchAll(HEADER_PLACEHOLDER_PATTERN)) {
    const placeholder = match[1]?.trim();
    if (!placeholder || placeholders.includes(placeholder)) {
      continue;
    }

    placeholders.push(placeholder);
  }

  return placeholders;
}

function createRemoteHeaderDefinitions(
  headers: InstallManifestRemoteVariantV1["headers"],
  usedKeys: Set<string>,
): InstallInputDefinition[] {
  const definitions: InstallInputDefinition[] = [];
  const seenPlaceholders = new Set<string>();

  for (const header of headers) {
    for (const placeholder of extractHeaderPlaceholders(header.value)) {
      if (seenPlaceholders.has(placeholder)) {
        continue;
      }

      seenPlaceholders.add(placeholder);
      definitions.push({
        key: createUniqueKey(placeholder, "remote-header", usedKeys),
        source: "remote-header",
        headerName: header.name,
        placeholder,
        description: null,
        required: true,
        accepts: ["env-reference", "secret-value"],
      });
    }
  }

  return definitions;
}

export function createInstallInputDefinitions(
  variant: InstallManifestVariantV1,
): readonly InstallInputDefinition[] {
  const usedKeys = new Set<string>();

  if (variant.kind === "package") {
    return [
      ...createArgumentDefinitions(variant.runtimeArguments, "package-runtime-argument", usedKeys),
      ...createArgumentDefinitions(variant.packageArguments, "package-argument", usedKeys),
      ...createEnvironmentVariableDefinitions(variant.environmentVariables, usedKeys),
    ];
  }

  return [
    ...createRemoteVariableDefinitions(variant.variables, usedKeys),
    ...createRemoteHeaderDefinitions(variant.headers, usedKeys),
  ];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function freezeInstallInputValue(value: InstallInputValue): InstallInputValue {
  return Object.freeze({ ...value }) as InstallInputValue;
}

function validateValue(
  definition: InstallInputDefinition,
  rawValue: InstallInputValue,
): InstallInputValue {
  if (!definition.accepts.includes(rawValue.kind)) {
    throw new InstallInputValidationError(
      "INVALID_INPUT_KIND",
      definition.key,
      `Install input ${definition.key} does not accept values of kind ${rawValue.kind}`,
    );
  }

  if (rawValue.kind === "env-reference") {
    if (!ENVIRONMENT_VARIABLE_NAME_PATTERN.test(rawValue.envName)) {
      throw new InstallInputValidationError(
        "INVALID_ENV_REFERENCE",
        definition.key,
        `Install input ${definition.key} requires a valid environment variable name`,
      );
    }

    return freezeInstallInputValue({ kind: "env-reference", envName: rawValue.envName });
  }

  if (rawValue.kind === "text") {
    if (!isNonEmptyString(rawValue.value)) {
      throw new InstallInputValidationError(
        "INVALID_INPUT_VALUE",
        definition.key,
        `Install input ${definition.key} requires a non-empty text value`,
      );
    }

    return freezeInstallInputValue({ kind: "text", value: rawValue.value });
  }

  if (!isNonEmptyString(rawValue.value) || rawValue.allowPersistence !== true) {
    throw new InstallInputValidationError(
      "INVALID_INPUT_VALUE",
      definition.key,
      `Install input ${definition.key} requires an explicit persisted secret value`,
    );
  }

  return freezeInstallInputValue({
    kind: "secret-value",
    value: rawValue.value,
    allowPersistence: true,
  });
}

export function validateInputDefinitions(
  definitions: readonly InstallInputDefinition[],
  values: Record<string, InstallInputValue>,
  options?: { readonly skipRequiredKeys?: readonly string[] },
): ValidatedInstallInputMap {
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const validatedValues = new Map<string, InstallInputValue>();
  const skippedRequiredKeys = new Set(options?.skipRequiredKeys ?? []);

  for (const [inputKey, rawValue] of Object.entries(values)) {
    const definition = definitionsByKey.get(inputKey);
    if (!definition) {
      throw new InstallInputValidationError(
        "UNKNOWN_INPUT",
        inputKey,
        `Unknown install input: ${inputKey}`,
      );
    }

    validatedValues.set(inputKey, validateValue(definition, rawValue));
  }

  for (const definition of definitions) {
    if (
      definition.required &&
      !skippedRequiredKeys.has(definition.key) &&
      !validatedValues.has(definition.key)
    ) {
      throw new InstallInputValidationError(
        "MISSING_REQUIRED_INPUT",
        definition.key,
        `Missing required install input: ${definition.key}`,
      );
    }
  }

  return createReadonlyValidatedInstallInputMap(validatedValues);
}

export function validateInputValues(
  intent: Pick<ResolvedInstallIntent, "inputs">,
  values: Record<string, InstallInputValue>,
): ValidatedInstallInputMap {
  return validateInputDefinitions(intent.inputs, values);
}
