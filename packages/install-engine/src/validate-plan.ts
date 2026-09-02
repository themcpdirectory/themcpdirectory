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
  CursorInstallDeeplinkDescriptor,
  DeeplinkOperation,
  InstallOperation,
  InstallPlan,
  JsonValue,
  RemovalOperation,
  RemovalPlan,
} from "./types.js";

type PathStyle = "posix" | "windows";

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:/u;
const WINDOWS_ABSOLUTE_DRIVE_PATTERN = /^[A-Za-z]:[\\/]/u;
const WINDOWS_DEVICE_PATH_PATTERN = /^(?:\\\\\?\\|\\\\\.\\)/u;

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
const REMOVE_COMMAND_CAPABILITIES = new Set<AdapterCapability>([
  "native-list",
  "native-list-json",
  "native-remove",
]);

const INSTALL_PLAN_KEYS = new Set([
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
const REMOVAL_PLAN_KEYS = new Set([
  "schemaVersion",
  "serverSlug",
  "client",
  "scope",
  "operations",
  "previewLines",
]);
const DESCRIPTOR_KEYS = new Set([
  "client",
  "executableAllowList",
  "configRoots",
  "deeplink",
  "supportedCapabilities",
]);
const CLIENT_COMMAND_KEYS = new Set(["type", "executable", "args", "capability"]);
const CONFIG_WRITE_KEYS = new Set(["type", "path", "mutationKey", "document"]);
const CONFIG_REMOVE_KEYS = new Set(["type", "path", "mutationKey"]);
const DEEPLINK_KEYS = new Set(["type", "url"]);
const CURSOR_DEEPLINK_DESCRIPTOR_KEYS = new Set(["kind"]);

const MAX_STRING_LENGTH = 4096;
const MAX_ARGUMENTS = 128;
const MAX_OPERATIONS = 64;
const MAX_PREVIEW_LINES = 100;
const INVALID_EXECUTABLE_PATTERN = /[\0\r\n;&|<>`$]/u;

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
  | "INVALID_REMOVE_CAPABILITY"
  | "INVALID_REMOVE_OPERATION"
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
  readonly deeplink: CursorInstallDeeplinkDescriptor | undefined;
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
  return /[\0\r\n]/u.test(value);
}

function hasMixedPathSeparators(value: string): boolean {
  return value.includes("/") && value.includes("\\");
}

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function isUncPath(value: string): boolean {
  return value.startsWith("\\\\") || value.startsWith("//");
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

function normalizeAbsolutePath(
  rawPath: string,
  code: "INVALID_DESCRIPTOR" | "INVALID_EXECUTABLE" | "INVALID_PATH",
  field: string,
): NormalizedRoot {
  if (hasMixedPathSeparators(rawPath)) {
    fail(code, `${field} must use a single path style`, field);
  }

  if (WINDOWS_DEVICE_PATH_PATTERN.test(rawPath)) {
    fail(code, `${field} must not use a Windows device path`, field);
  }

  if (isUncPath(rawPath)) {
    fail(code, `${field} must not use a UNC path`, field);
  }

  if (rawPath.startsWith("/")) {
    const normalized = stripTrailingSeparators(posix.normalize(rawPath), "posix");
    return {
      style: "posix",
      original: rawPath,
      normalized,
      comparable: normalized,
    };
  }

  if (WINDOWS_DRIVE_PATTERN.test(rawPath)) {
    if (!WINDOWS_ABSOLUTE_DRIVE_PATTERN.test(rawPath)) {
      fail(code, `${field} must be an absolute drive-letter path`, field);
    }

    const normalized = stripTrailingSeparators(win32.normalize(rawPath), "windows");
    return {
      style: "windows",
      original: rawPath,
      normalized,
      comparable: normalized.toLowerCase(),
    };
  }

  fail(code, `${field} must be an absolute path`, field);
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

function hasTraversalSegments(rawPath: string, style: PathStyle): boolean {
  const withoutDrive = style === "windows" ? rawPath.replace(/^[A-Za-z]:/u, "") : rawPath;
  const pieces = withoutDrive.split(style === "windows" ? /[\\/]+/u : /\/+/u);
  return pieces.some((piece) => piece === "..");
}

function assertDescriptorClient(value: unknown): ClientId {
  if (!CLIENT_IDS.has(value as ClientId)) {
    fail("INVALID_DESCRIPTOR", "Descriptor client is unsupported", "client");
  }

  return value as ClientId;
}

function isAbsoluteExecutablePath(value: string): boolean {
  try {
    normalizeAbsolutePath(value, "INVALID_EXECUTABLE", "executable");
    return true;
  } catch (error) {
    if (error instanceof PlanValidationError && error.code === "INVALID_EXECUTABLE") {
      return false;
    }

    throw error;
  }
}

function assertExecutableShape(
  command: string,
  code: "INVALID_DESCRIPTOR" | "INVALID_EXECUTABLE",
  field: "executableAllowList" | "executable",
  metacharactersMessage: string,
  inlineArgumentsMessage: string,
  relativePathMessage: string,
): void {
  if (INVALID_EXECUTABLE_PATTERN.test(command)) {
    fail(code, metacharactersMessage, field);
  }

  if (hasPathSeparator(command)) {
    if (!isAbsoluteExecutablePath(command)) {
      fail(code, relativePathMessage, field);
    }

    return;
  }

  if (/\s/u.test(command)) {
    fail(code, inlineArgumentsMessage, field);
  }
}

function validateDescriptorExecutable(executable: unknown): string {
  const command = assertNonEmptySafeString(executable, "INVALID_DESCRIPTOR", "executableAllowList");

  assertExecutableShape(
    command,
    "INVALID_DESCRIPTOR",
    "executableAllowList",
    "Descriptor executableAllowList entries must not include shell metacharacters",
    "Descriptor executableAllowList entries must not include inline arguments",
    "Descriptor executableAllowList entries must be bare executable names or absolute paths",
  );

  return command;
}

function normalizeCursorDeeplinkDescriptor(
  value: unknown,
  client: ClientId,
  supportedCapabilities: ReadonlySet<AdapterCapability>,
): CursorInstallDeeplinkDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    fail("INVALID_DESCRIPTOR", "Descriptor deeplink must be an object", "deeplink");
  }

  assertAllowedKeys(value, CURSOR_DEEPLINK_DESCRIPTOR_KEYS, "INVALID_DESCRIPTOR");

  if (value.kind !== "cursor-install") {
    fail("INVALID_DESCRIPTOR", "Descriptor deeplink kind is unsupported", "deeplink");
  }

  if (client !== "cursor") {
    fail("INVALID_DESCRIPTOR", "Descriptor deeplink requires the cursor client", "deeplink");
  }

  if (!supportedCapabilities.has("cursor-deeplink")) {
    fail(
      "INVALID_DESCRIPTOR",
      "Descriptor deeplink requires the cursor-deeplink capability",
      "supportedCapabilities",
    );
  }

  return { kind: "cursor-install" };
}

function normalizeDescriptor(descriptor: AdapterSafetyDescriptor): NormalizedDescriptor {
  if (!isRecord(descriptor)) {
    fail("INVALID_DESCRIPTOR", "Adapter safety descriptor must be an object");
  }

  assertAllowedKeys(descriptor, DESCRIPTOR_KEYS, "INVALID_DESCRIPTOR");

  const client = assertDescriptorClient(descriptor.client);

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
  if (!Array.isArray(descriptor.supportedCapabilities)) {
    fail(
      "INVALID_DESCRIPTOR",
      "Descriptor supportedCapabilities must be an array",
      "supportedCapabilities",
    );
  }

  const executableAllowList = new Set<string>();
  for (const executable of descriptor.executableAllowList) {
    executableAllowList.add(validateDescriptorExecutable(executable));
  }

  const configRoots = descriptor.configRoots.map((root) => {
    const normalized = normalizeAbsolutePath(
      assertNonEmptySafeString(root, "INVALID_DESCRIPTOR", "configRoots"),
      "INVALID_DESCRIPTOR",
      "configRoots",
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

  const supportedCapabilities = new Set<AdapterCapability>();
  for (const capability of descriptor.supportedCapabilities) {
    if (!KNOWN_CAPABILITIES.has(capability as AdapterCapability)) {
      fail(
        "INVALID_DESCRIPTOR",
        `Unknown adapter capability ${String(capability)}`,
        "supportedCapabilities",
      );
    }

    supportedCapabilities.add(capability as AdapterCapability);
  }

  const deeplink = normalizeCursorDeeplinkDescriptor(
    descriptor.deeplink,
    client,
    supportedCapabilities,
  );

  if (supportedCapabilities.has("cursor-deeplink")) {
    if (client !== "cursor") {
      fail(
        "INVALID_DESCRIPTOR",
        "The cursor-deeplink capability requires the cursor client",
        "supportedCapabilities",
      );
    }

    if (deeplink?.kind !== "cursor-install") {
      fail(
        "INVALID_DESCRIPTOR",
        'The cursor-deeplink capability requires deeplink { kind: "cursor-install" }',
        "deeplink",
      );
    }
  }

  return {
    client,
    executableAllowList,
    configRoots,
    deeplink,
    supportedCapabilities,
  };
}

function validatePathWithinRoots(rawPath: unknown, roots: readonly NormalizedRoot[]): string {
  const path = assertNonEmptySafeString(rawPath, "INVALID_PATH", "path");
  const normalizedPath = normalizeAbsolutePath(path, "INVALID_PATH", "path");

  if (hasTraversalSegments(normalizedPath.original, normalizedPath.style)) {
    fail("PATH_TRAVERSAL", `Path ${path} contains traversal segments`, "path");
  }

  const matchingRoots = roots.filter((root) => root.style === normalizedPath.style);
  if (matchingRoots.length === 0) {
    fail("PATH_OUTSIDE_ROOT", `Path ${path} is outside approved roots`, "path");
  }

  const pathModule = normalizedPath.style === "windows" ? win32 : posix;
  const withinApprovedRoot = matchingRoots.some((root) => {
    const relative = pathModule.relative(root.comparable, normalizedPath.comparable);
    return relative === "" || (!relative.startsWith("..") && !pathModule.isAbsolute(relative));
  });

  if (!withinApprovedRoot) {
    fail("PATH_OUTSIDE_ROOT", `Path ${path} is outside approved roots`, "path");
  }

  return normalizedPath.normalized;
}

function validateExecutable(executable: unknown, descriptor: NormalizedDescriptor): string {
  const command = assertNonEmptySafeString(executable, "INVALID_EXECUTABLE", "executable");

  assertExecutableShape(
    command,
    "INVALID_EXECUTABLE",
    "executable",
    `Executable ${command} must not include shell metacharacters`,
    `Executable ${command} must not include inline arguments`,
    `Executable ${command} must be a bare executable name or absolute path`,
  );

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

  return args.map((arg, index) =>
    assertNonEmptySafeString(arg, "INVALID_ARGUMENT", `args[${index}]`),
  );
}

function assertSupportedCapability(
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

  return typedCapability;
}

function validateInstallCapability(
  capability: unknown,
  descriptor: NormalizedDescriptor,
): AdapterCapability {
  const typedCapability = assertSupportedCapability(capability, descriptor);
  if (!INSTALL_COMMAND_CAPABILITIES.has(typedCapability)) {
    fail(
      "INVALID_INSTALL_CAPABILITY",
      `Capability ${typedCapability} cannot be used for install commands`,
      "capability",
    );
  }

  return typedCapability;
}

function validateRemovalCapability(
  capability: unknown,
  descriptor: NormalizedDescriptor,
): AdapterCapability {
  const typedCapability = assertSupportedCapability(capability, descriptor);
  if (!REMOVE_COMMAND_CAPABILITIES.has(typedCapability)) {
    fail(
      "INVALID_REMOVE_CAPABILITY",
      `Capability ${typedCapability} cannot be used for removal commands`,
      "capability",
    );
  }

  return typedCapability;
}

function validateInstallClientCommandOperation(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): ClientCommandOperation {
  assertAllowedKeys(value, CLIENT_COMMAND_KEYS, "UNKNOWN_OPERATION_FIELD");

  return {
    type: "client-command",
    executable: validateExecutable(value.executable, descriptor),
    args: validateArgs(value.args),
    capability: validateInstallCapability(value.capability, descriptor),
  };
}

function validateRemovalClientCommandOperation(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
): ClientCommandOperation {
  assertAllowedKeys(value, CLIENT_COMMAND_KEYS, "UNKNOWN_OPERATION_FIELD");

  return {
    type: "client-command",
    executable: validateExecutable(value.executable, descriptor),
    args: validateArgs(value.args),
    capability: validateRemovalCapability(value.capability, descriptor),
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

function validateDeeplink(rawUrl: unknown, descriptor: NormalizedDescriptor): string {
  const url = assertNonEmptySafeString(rawUrl, "INVALID_DEEPLINK", "url");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("INVALID_DEEPLINK", `Deeplink ${url} is not a valid URL`, "url");
  }

  if (
    !descriptor.supportedCapabilities.has("cursor-deeplink") ||
    descriptor.deeplink?.kind !== "cursor-install"
  ) {
    fail("UNSUPPORTED_CAPABILITY", "Descriptor does not support cursor deeplinks", "url");
  }

  if (parsed.protocol !== "cursor:") {
    fail("INVALID_DEEPLINK", `Deeplink ${url} must use the cursor protocol`, "url");
  }

  if (parsed.username.length > 0 || parsed.password.length > 0 || parsed.hash.length > 0) {
    fail("INVALID_DEEPLINK", `Deeplink ${url} must not include credentials or fragments`, "url");
  }

  if (parsed.port.length > 0) {
    fail("INVALID_DEEPLINK", `Deeplink ${url} must not include an explicit port`, "url");
  }

  if (parsed.host !== "anysphere.cursor-deeplink") {
    fail("INVALID_DEEPLINK", `Deeplink ${url} must target anysphere.cursor-deeplink`, "url");
  }

  if (parsed.pathname !== "/mcp/install") {
    fail("INVALID_DEEPLINK", `Deeplink ${url} must target /mcp/install`, "url");
  }

  const queryEntries = Array.from(parsed.searchParams.entries());
  const payloadValues = parsed.searchParams.getAll("payload");
  if (queryEntries.length !== 1 || payloadValues.length !== 1) {
    fail(
      "INVALID_DEEPLINK",
      `Deeplink ${url} must contain only the payload query parameter`,
      "url",
    );
  }

  const [firstQueryEntry] = queryEntries;
  const [payloadValue] = payloadValues;
  if (
    firstQueryEntry?.[0] !== "payload" ||
    payloadValue === undefined ||
    payloadValue.length === 0
  ) {
    fail(
      "INVALID_DEEPLINK",
      `Deeplink ${url} must contain only the payload query parameter`,
      "url",
    );
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
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

function validateInstallOperation(
  value: unknown,
  descriptor: NormalizedDescriptor,
): InstallOperation {
  if (!isRecord(value)) {
    fail("INVALID_OPERATIONS", "Each operation must be an object", "operations");
  }

  switch (value.type) {
    case "client-command":
      return validateInstallClientCommandOperation(value, descriptor);
    case "config-write":
      return validateConfigWriteOperation(value, descriptor);
    case "config-remove":
      return validateConfigRemoveOperation(value, descriptor);
    case "deeplink":
      return validateDeeplinkOperation(value, descriptor);
    default:
      fail("UNKNOWN_OPERATION_TYPE", `Unknown operation type ${String(value.type)}`, "type");
  }
}

function validateRemovalOperation(
  value: unknown,
  descriptor: NormalizedDescriptor,
): RemovalOperation {
  if (!isRecord(value)) {
    fail("INVALID_OPERATIONS", "Each operation must be an object", "operations");
  }

  switch (value.type) {
    case "client-command":
      return validateRemovalClientCommandOperation(value, descriptor);
    case "config-remove":
      return validateConfigRemoveOperation(value, descriptor);
    case "config-write":
    case "deeplink": {
      return fail(
        "INVALID_REMOVE_OPERATION",
        `Operation type ${value.type} cannot be used in removal plans`,
        "type",
      );
    }
    default: {
      return fail("UNKNOWN_OPERATION_TYPE", `Unknown operation type ${String(value.type)}`, "type");
    }
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

function validateOperationsArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OPERATIONS) {
    fail("INVALID_OPERATIONS", "operations must be a non-empty bounded array", "operations");
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

  assertAllowedKeys(plan, INSTALL_PLAN_KEYS, "UNKNOWN_PLAN_FIELD");

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

  const validatedPlan: InstallPlan = {
    schemaVersion: 1,
    serverSlug: assertNonEmptySafeString(plan.serverSlug, "INVALID_SERVER_SLUG", "serverSlug"),
    client,
    scope: validateScope(plan.scope),
    variantId: assertNonEmptySafeString(plan.variantId, "INVALID_VARIANT_ID", "variantId"),
    manifestHash: assertHash(plan.manifestHash, "manifestHash"),
    intentHash: assertHash(plan.intentHash, "intentHash"),
    operations: validateOperationsArray(plan.operations).map((operation) =>
      validateInstallOperation(operation, normalizedDescriptor),
    ),
    previewLines: validatePreviewLines(plan.previewLines),
  };

  return deepFreeze(validatedPlan);
}

export function validateRemovalPlan(
  plan: RemovalPlan,
  descriptor: AdapterSafetyDescriptor,
): RemovalPlan {
  if (!isRecord(plan)) {
    fail("INVALID_SCHEMA_VERSION", "Removal plan must be an object");
  }

  assertAllowedKeys(plan, REMOVAL_PLAN_KEYS, "UNKNOWN_PLAN_FIELD");

  const normalizedDescriptor = normalizeDescriptor(descriptor);

  if (plan.schemaVersion !== 1) {
    fail("INVALID_SCHEMA_VERSION", "Removal plan schemaVersion must equal 1", "schemaVersion");
  }

  const client = validateClient(plan.client);
  if (client !== normalizedDescriptor.client) {
    fail(
      "CLIENT_MISMATCH",
      `Removal plan client ${client} does not match descriptor client ${normalizedDescriptor.client}`,
      "client",
    );
  }

  const validatedPlan: RemovalPlan = {
    schemaVersion: 1,
    serverSlug: assertNonEmptySafeString(plan.serverSlug, "INVALID_SERVER_SLUG", "serverSlug"),
    client,
    scope: validateScope(plan.scope),
    operations: validateOperationsArray(plan.operations).map((operation) =>
      validateRemovalOperation(operation, normalizedDescriptor),
    ),
    previewLines: validatePreviewLines(plan.previewLines),
  };

  return deepFreeze(validatedPlan);
}
