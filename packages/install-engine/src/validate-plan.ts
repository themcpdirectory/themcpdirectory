import { posix, win32 } from "node:path";
import { canonicalizeJsonValue } from "./hash.js";
import type {
  AdapterCapability,
  AdapterSafetyDescriptor,
  ClientCommandOperation,
  ClientId,
  ClientScope,
  ConfigRemoveOperation,
  ConfigWriteOperation,
  DeeplinkOperation,
  InstallOperation,
  InstallPlan,
  JsonValue,
} from "./types.js";

type PathStyle = "posix" | "windows";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const CLIENT_IDS = new Set<ClientId>(["claude-code", "codex", "cursor"]);
const CLIENT_SCOPES = new Set<ClientScope>(["user", "project", "global"]);
const KNOWN_CAPABILITIES = new Set<AdapterCapability>([
  "native-add-stdio",
  "native-add-remote",
  "native-remove",
  "native-list",
  "native-list-json",
  "native-scope-user",
  "native-scope-project",
  "native-scope-global",
  "env-reference",
  "persisted-secret",
  "cursor-deeplink",
]);
const INSTALL_COMMAND_CAPABILITIES = new Set<AdapterCapability>([
  "native-add-stdio",
  "native-add-remote",
]);
const TOP_LEVEL_PLAN_KEYS = new Set([
  "schemaVersion",
  "serverSlug",
  "client",
  "scope",
  "variantId",
  "manifestHash",
  "intentHash",
  "operations",
  "previewLines",
]);
const CLIENT_COMMAND_KEYS = new Set(["type", "executable", "args", "capability"]);
const CONFIG_WRITE_KEYS = new Set(["type", "path", "mutationKey", "document"]);
const CONFIG_REMOVE_KEYS = new Set(["type", "path", "mutationKey"]);
const DEEPLINK_KEYS = new Set(["type", "url"]);
const MAX_STRING_LENGTH = 4096;
const MAX_ARGUMENTS = 128;
const MAX_OPERATIONS = 64;
const MAX_PREVIEW_LINES = 100;
const INVALID_EXECUTABLE_PATTERN = /[\0\r\n;&|<>`$]/;

export type PlanValidationErrorCode =
  | "INVALID_DESCRIPTOR"
  | "INVALID_SCHEMA_VERSION"
  | "UNKNOWN_PLAN_FIELD"
  | "CLIENT_MISMATCH"
  | "INVALID_CLIENT"
  | "INVALID_SCOPE"
  | "INVALID_SERVER_SLUG"
  | "INVALID_VARIANT_ID"
  | "INVALID_MANIFEST_HASH"
  | "INVALID_INTENT_HASH"
  | "INVALID_OPERATIONS"
  | "UNKNOWN_OPERATION_TYPE"
  | "UNKNOWN_OPERATION_FIELD"
  | "INVALID_EXECUTABLE"
  | "UNAPPROVED_EXECUTABLE"
  | "INVALID_ARGUMENT"
  | "UNSUPPORTED_CAPABILITY"
  | "INVALID_INSTALL_CAPABILITY"
  | "INVALID_PATH"
  | "PATH_TRAVERSAL"
  | "PATH_OUTSIDE_ROOT"
  | "INVALID_MUTATION_KEY"
  | "INVALID_CONFIG_DOCUMENT"
  | "INVALID_DEEPLINK"
  | "INVALID_PREVIEW_LINES"
  | "INVALID_PREVIEW_LINE";

export type PlanValidationErrorReason = PlanValidationErrorCode;

export class PlanValidationError extends Error {
  readonly code: PlanValidationErrorCode;
  readonly reason: PlanValidationErrorReason;
  readonly field?: string;

  constructor(
    code: PlanValidationErrorCode,
    message: string,
    options?: { readonly field?: string },
  ) {
    super(message);
    this.name = "PlanValidationError";
    this.code = code;
    this.reason = code;
    if (options?.field !== undefined) {
      this.field = options.field;
    }
  }
}

interface NormalizedDescriptor {
  readonly client: ClientId;
  readonly executableAllowList: ReadonlySet<string>;
  readonly configRoots: readonly NormalizedRoot[];
  readonly deeplinkPrefixes: readonly string[];
  readonly supportedCapabilities: ReadonlySet<AdapterCapability>;
}

interface NormalizedRoot {
  readonly style: PathStyle;
  readonly original: string;
  readonly normalized: string;
  readonly comparable: string;
}

function fail(code: PlanValidationErrorCode, message: string, field?: string): never {
  throw new PlanValidationError(code, message, field === undefined ? undefined : { field });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  return /[\0\r\n]/.test(value);
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  code: PlanValidationErrorCode,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(code, `Unexpected field ${key}`, key);
    }
  }
}

function assertNonEmptySafeString(
  value: unknown,
  code: PlanValidationErrorCode,
  field: string,
): string {
  if (typeof value !== "string") {
    fail(code, `${field} must be a string`, field);
  }

  if (value.length === 0 || value.length > MAX_STRING_LENGTH || value.trim().length === 0) {
    fail(code, `${field} must be a non-empty bounded string`, field);
  }

  if (hasControlCharacters(value)) {
    fail(code, `${field} cannot contain NUL or newline characters`, field);
  }

  return value;
}

function assertHash(value: unknown, field: "manifestHash" | "intentHash"): string {
  const validated = assertNonEmptySafeString(
    value,
    field === "manifestHash" ? "INVALID_MANIFEST_HASH" : "INVALID_INTENT_HASH",
    field,
  );

  if (!HASH_PATTERN.test(validated)) {
    fail(
      field === "manifestHash" ? "INVALID_MANIFEST_HASH" : "INVALID_INTENT_HASH",
      `${field} must be a lowercase SHA-256 hex digest`,
      field,
    );
  }

  return validated;
}

function detectPathStyle(value: string): PathStyle {
  return /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\") ? "windows" : "posix";
}

function stripTrailingSeparators(value: string, style: PathStyle): string {
  if (style === "windows") {
    const trimmed = value.replace(/[\\/]+$/u, "");
    if (/^[A-Za-z]:$/u.test(trimmed)) {
      return `${trimmed}\\`;
    }

    return trimmed.length === 0 ? value : trimmed;
  }

  const trimmed = value.replace(/\/+$/u, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

function normalizePath(rawPath: string): NormalizedRoot {
  const style = detectPathStyle(rawPath);
  const module = style === "windows" ? win32 : posix;
  const normalized = stripTrailingSeparators(module.normalize(rawPath), style);
  const comparable = style === "windows" ? normalized.toLowerCase() : normalized;

  return {
    style,
    original: rawPath,
    normalized,
    comparable,
  };
}

function hasTraversalSegments(rawPath: string, style: PathStyle): boolean {
  const withoutDrive = style === "windows" ? rawPath.replace(/^[A-Za-z]:/u, "") : rawPath;
  const pieces = withoutDrive.split(style === "windows" ? /[\\/]+/u : /\/+/u);
  return pieces.some((piece) => piece === "..");
}

function normalizeDescriptor(descriptor: AdapterSafetyDescriptor): NormalizedDescriptor {
  if (!isRecord(descriptor)) {
    fail("INVALID_DESCRIPTOR", "Adapter safety descriptor must be an object");
  }

  const client = descriptor.client;
  if (!CLIENT_IDS.has(client)) {
    fail("INVALID_DESCRIPTOR", "Descriptor client is unsupported", "client");
  }

  if (!Array.isArray(descriptor.executableAllowList)) {
    fail(
      "INVALID_DESCRIPTOR",
      "Descriptor executableAllowList must be an array",
      "executableAllowList",
    );
  }
  if (!Array.isArray(descriptor.configRoots)) {
    fail("INVALID_DESCRIPTOR", "Descriptor configRoots must be an array", "configRoots");
  }
  if (!Array.isArray(descriptor.deeplinkPrefixes)) {
    fail("INVALID_DESCRIPTOR", "Descriptor deeplinkPrefixes must be an array", "deeplinkPrefixes");
  }
  if (!Array.isArray(descriptor.supportedCapabilities)) {
    fail(
      "INVALID_DESCRIPTOR",
      "Descriptor supportedCapabilities must be an array",
      "supportedCapabilities",
    );
  }

  const executableAllowList = new Set<string>();
  for (const executable of descriptor.executableAllowList) {
    executableAllowList.add(
      assertNonEmptySafeString(executable, "INVALID_DESCRIPTOR", "executableAllowList"),
    );
  }

  const configRoots = descriptor.configRoots.map((root) => {
    const normalized = normalizePath(
      assertNonEmptySafeString(root, "INVALID_DESCRIPTOR", "configRoots"),
    );
    if (hasTraversalSegments(normalized.original, normalized.style)) {
      fail(
        "INVALID_DESCRIPTOR",
        "Descriptor config root cannot contain traversal segments",
        "configRoots",
      );
    }

    return normalized;
  });

  const deeplinkPrefixes = descriptor.deeplinkPrefixes.map((prefix) =>
    normalizeDeeplinkPrefix(
      assertNonEmptySafeString(prefix, "INVALID_DESCRIPTOR", "deeplinkPrefixes"),
    ),
  );

  const supportedCapabilities = new Set<AdapterCapability>();
  for (const capability of descriptor.supportedCapabilities) {
    if (!KNOWN_CAPABILITIES.has(capability)) {
      fail(
        "INVALID_DESCRIPTOR",
        `Unknown adapter capability ${String(capability)}`,
        "supportedCapabilities",
      );
    }

    supportedCapabilities.add(capability);
  }

  return {
    client,
    executableAllowList,
    configRoots,
    deeplinkPrefixes,
    supportedCapabilities,
  };
}

function validatePathWithinRoots(rawPath: unknown, roots: readonly NormalizedRoot[]): string {
  const path = assertNonEmptySafeString(rawPath, "INVALID_PATH", "path");
  const style = detectPathStyle(path);

  if (hasTraversalSegments(path, style)) {
    fail("PATH_TRAVERSAL", `Path ${path} contains traversal segments`, "path");
  }

  const normalizedPath = normalizePath(path);
  const matchingRoots = roots.filter((root) => root.style === normalizedPath.style);
  if (matchingRoots.length === 0) {
    fail("PATH_OUTSIDE_ROOT", `Path ${path} is outside approved roots`, "path");
  }

  const module = normalizedPath.style === "windows" ? win32 : posix;
  const comparableTarget = normalizedPath.comparable;
  const withinApprovedRoot = matchingRoots.some((root) => {
    const relative = module.relative(root.comparable, comparableTarget);
    return relative === "" || (!relative.startsWith("..") && !module.isAbsolute(relative));
  });

  if (!withinApprovedRoot) {
    fail("PATH_OUTSIDE_ROOT", `Path ${path} is outside approved roots`, "path");
  }

  return normalizedPath.normalized;
}

function normalizeDeeplinkPrefix(prefix: string): string {
  let parsed: URL;
  try {
    parsed = new URL(prefix);
  } catch {
    fail(
      "INVALID_DESCRIPTOR",
      `Descriptor deeplink prefix ${prefix} is not a valid URL`,
      "deeplinkPrefixes",
    );
  }

  if (parsed.username.length > 0 || parsed.password.length > 0 || parsed.hash.length > 0) {
    fail(
      "INVALID_DESCRIPTOR",
      `Descriptor deeplink prefix ${prefix} must not include credentials or fragments`,
      "deeplinkPrefixes",
    );
  }

  const suffix = prefix.endsWith("?") && parsed.search.length === 0 ? "?" : parsed.search;
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${suffix}`;
}

function validateDeeplink(rawUrl: unknown, descriptor: NormalizedDescriptor): string {
  const url = assertNonEmptySafeString(rawUrl, "INVALID_DEEPLINK", "url");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("INVALID_DEEPLINK", `Deeplink ${url} is not a valid URL`, "url");
  }

  if (parsed.username.length > 0 || parsed.password.length > 0 || parsed.hash.length > 0) {
    fail("INVALID_DEEPLINK", `Deeplink ${url} must not include credentials or fragments`, "url");
  }

  const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  if (!descriptor.supportedCapabilities.has("cursor-deeplink")) {
    fail("UNSUPPORTED_CAPABILITY", "Descriptor does not support cursor deeplinks", "url");
  }

  const isApproved = descriptor.deeplinkPrefixes.some((prefix) => normalized.startsWith(prefix));
  if (!isApproved) {
    fail("INVALID_DEEPLINK", `Deeplink ${url} is not approved`, "url");
  }

  return normalized;
}

function validateExecutable(executable: unknown, descriptor: NormalizedDescriptor): string {
  const command = assertNonEmptySafeString(executable, "INVALID_EXECUTABLE", "executable");

  if (INVALID_EXECUTABLE_PATTERN.test(command) || /\s/u.test(command)) {
    if (!descriptor.executableAllowList.has(command)) {
      fail(
        "INVALID_EXECUTABLE",
        `Executable ${command} must not include shell syntax or inline arguments`,
        "executable",
      );
    }
  }

  if (!descriptor.executableAllowList.has(command)) {
    fail(
      "UNAPPROVED_EXECUTABLE",
      `Executable ${command} is not in the adapter allowlist`,
      "executable",
    );
  }

  return command;
}

function validateArgs(args: unknown): readonly string[] {
  if (!Array.isArray(args) || args.length === 0 || args.length > MAX_ARGUMENTS) {
    fail("INVALID_ARGUMENT", "args must be a non-empty bounded string array", "args");
  }

  return args.map((arg, index) => {
    const value = assertNonEmptySafeString(arg, "INVALID_ARGUMENT", `args[${index}]`);
    return value;
  });
}

function validateCapability(
  capability: unknown,
  descriptor: NormalizedDescriptor,
): AdapterCapability {
  if (!KNOWN_CAPABILITIES.has(capability as AdapterCapability)) {
    fail("UNSUPPORTED_CAPABILITY", `Capability ${String(capability)} is unsupported`, "capability");
  }

  const typedCapability = capability as AdapterCapability;
  if (!descriptor.supportedCapabilities.has(typedCapability)) {
    fail(
      "UNSUPPORTED_CAPABILITY",
      `Capability ${typedCapability} is not supported by the adapter`,
      "capability",
    );
  }
  if (!INSTALL_COMMAND_CAPABILITIES.has(typedCapability)) {
    fail(
      "INVALID_INSTALL_CAPABILITY",
      `Capability ${typedCapability} cannot be used for install commands`,
      "capability",
    );
  }

  return typedCapability;
}

function validateClientCommandOperation(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): ClientCommandOperation {
  assertAllowedKeys(value, CLIENT_COMMAND_KEYS, "UNKNOWN_OPERATION_FIELD");

  return {
    type: "client-command",
    executable: validateExecutable(value.executable, descriptor),
    args: validateArgs(value.args),
    capability: validateCapability(value.capability, descriptor),
  };
}

function validateConfigWriteOperation(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): ConfigWriteOperation {
  assertAllowedKeys(value, CONFIG_WRITE_KEYS, "UNKNOWN_OPERATION_FIELD");

  let document: JsonValue;
  try {
    document = canonicalizeJsonValue(value.document);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Config document must be canonical JSON";
    fail("INVALID_CONFIG_DOCUMENT", message, "document");
  }

  return {
    type: "config-write",
    path: validatePathWithinRoots(value.path, descriptor.configRoots),
    mutationKey: assertNonEmptySafeString(value.mutationKey, "INVALID_MUTATION_KEY", "mutationKey"),
    document,
  };
}

function validateConfigRemoveOperation(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): ConfigRemoveOperation {
  assertAllowedKeys(value, CONFIG_REMOVE_KEYS, "UNKNOWN_OPERATION_FIELD");

  return {
    type: "config-remove",
    path: validatePathWithinRoots(value.path, descriptor.configRoots),
    mutationKey: assertNonEmptySafeString(value.mutationKey, "INVALID_MUTATION_KEY", "mutationKey"),
  };
}

function validateDeeplinkOperation(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): DeeplinkOperation {
  assertAllowedKeys(value, DEEPLINK_KEYS, "UNKNOWN_OPERATION_FIELD");

  return {
    type: "deeplink",
    url: validateDeeplink(value.url, descriptor),
  };
}

function validateOperation(value: unknown, descriptor: NormalizedDescriptor): InstallOperation {
  if (!isRecord(value)) {
    fail("INVALID_OPERATIONS", "Each operation must be an object", "operations");
  }

  const type = value.type;
  switch (type) {
    case "client-command":
      return validateClientCommandOperation(value, descriptor);
    case "config-write":
      return validateConfigWriteOperation(value, descriptor);
    case "config-remove":
      return validateConfigRemoveOperation(value, descriptor);
    case "deeplink":
      return validateDeeplinkOperation(value, descriptor);
    default:
      fail("UNKNOWN_OPERATION_TYPE", `Unknown operation type ${String(type)}`, "type");
  }
}

function validatePreviewLines(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PREVIEW_LINES) {
    fail(
      "INVALID_PREVIEW_LINES",
      "previewLines must be a non-empty bounded string array",
      "previewLines",
    );
  }

  return value.map((line, index) =>
    assertNonEmptySafeString(line, "INVALID_PREVIEW_LINE", `previewLines[${index}]`),
  );
}

function validateClient(value: unknown): ClientId {
  if (!CLIENT_IDS.has(value as ClientId)) {
    fail("INVALID_CLIENT", `Client ${String(value)} is unsupported`, "client");
  }

  return value as ClientId;
}

function validateScope(value: unknown): ClientScope {
  if (!CLIENT_SCOPES.has(value as ClientScope)) {
    fail("INVALID_SCOPE", `Scope ${String(value)} is unsupported`, "scope");
  }

  return value as ClientScope;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }

    return value;
  }

  for (const propertyValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(propertyValue);
  }

  return value;
}

export function validateInstallPlan(
  plan: InstallPlan,
  descriptor: AdapterSafetyDescriptor,
): InstallPlan {
  if (!isRecord(plan)) {
    fail("INVALID_SCHEMA_VERSION", "Install plan must be an object");
  }

  assertAllowedKeys(plan, TOP_LEVEL_PLAN_KEYS, "UNKNOWN_PLAN_FIELD");

  const normalizedDescriptor = normalizeDescriptor(descriptor);

  if (plan.schemaVersion !== 1) {
    fail("INVALID_SCHEMA_VERSION", "Install plan schemaVersion must equal 1", "schemaVersion");
  }

  const client = validateClient(plan.client);
  if (client !== normalizedDescriptor.client) {
    fail(
      "CLIENT_MISMATCH",
      `Install plan client ${client} does not match descriptor client ${normalizedDescriptor.client}`,
      "client",
    );
  }

  const operationsValue = plan.operations;
  if (
    !Array.isArray(operationsValue) ||
    operationsValue.length === 0 ||
    operationsValue.length > MAX_OPERATIONS
  ) {
    fail("INVALID_OPERATIONS", "operations must be a non-empty bounded array", "operations");
  }

  const validatedPlan: InstallPlan = {
    schemaVersion: 1,
    serverSlug: assertNonEmptySafeString(plan.serverSlug, "INVALID_SERVER_SLUG", "serverSlug"),
    client,
    scope: validateScope(plan.scope),
    variantId: assertNonEmptySafeString(plan.variantId, "INVALID_VARIANT_ID", "variantId"),
    manifestHash: assertHash(plan.manifestHash, "manifestHash"),
    intentHash: assertHash(plan.intentHash, "intentHash"),
    operations: operationsValue.map((operation) =>
      validateOperation(operation, normalizedDescriptor),
    ),
    previewLines: validatePreviewLines(plan.previewLines),
  };

  return deepFreeze(validatedPlan);
}
