import type {
  ClientDetection,
  DiagnosticIssue,
  InstalledMcpServer,
  McpClientAdapter,
} from "@themcpdirectory/client-adapters";
import type { InstallManifestV1, PublicServerDetail } from "@themcpdirectory/api-contract";
import {
  hashInstallManifest,
  parseSemVer,
  type ClientScope,
  type ParsedSemVer,
} from "@themcpdirectory/install-engine";
import type { InstallationReceipt } from "../config/receipt-store.js";
import { getCliCommandMetadata } from "../command-metadata.js";
import type { CliDependencies } from "../dependencies.js";
import { createSuccessResult, type CommandResult } from "./result.js";

const COMMAND_NAME = "doctor";

export interface DoctorCheckResult {
  readonly name: string;
  readonly status: "ok" | "warning" | "error";
  readonly message: string;
  readonly recoveryHint?: string;
}

export interface DoctorReport {
  readonly exitCode: number;
  readonly checks: readonly DoctorCheckResult[];
}

export const DOCTOR_USAGE = getCliCommandMetadata("doctor")!.usage;

export async function runDoctorCommand(
  argv: readonly string[],
  deps: CliDependencies,
): Promise<CommandResult<DoctorReport>> {
  const invalidOption = argv.find((token) => token !== "--json");
  if (invalidOption) return usageFailure(invalidOption);

  const checks: DoctorCheckResult[] = [];
  await checkDirectoryConnectivity(deps, checks);

  let receipts: readonly InstallationReceipt[] = [];
  try {
    receipts = await deps.receiptStore.list();
  } catch {
    checks.push({
      name: "Receipt state",
      status: "error",
      message: "Installation receipts could not be read.",
      recoveryHint: "Repair or restore the mcpdir receipt state, then run doctor again.",
    });
  }

  const inspectionCache = new Map<string, Promise<readonly InstalledMcpServer[]>>();
  const detections = new Map<InstallationReceipt["client"], ClientDetection | null>();
  for (const adapter of deps.adapterRegistry.list()) {
    detections.set(
      adapter.id,
      await checkAdapter(adapter, receiptScopes(adapter.id, receipts), inspectionCache, checks),
    );
  }

  const serverCache = new Map<string, Promise<PublicServerDetail>>();
  const manifestCache = new Map<string, Promise<InstallManifestV1>>();
  for (const receipt of [...receipts].sort(compareReceiptKey)) {
    const installedEntry = await checkReceiptEntry(
      receipt,
      deps,
      detections.get(receipt.client) ?? null,
      inspectionCache,
      checks,
    );
    await checkDirectoryMetadata(receipt, installedEntry, deps, serverCache, manifestCache, checks);
  }

  return reportResult(checks);
}

async function checkDirectoryConnectivity(
  deps: CliDependencies,
  checks: DoctorCheckResult[],
): Promise<void> {
  try {
    await deps.directoryClient.listClients();
    checks.push({
      name: "Directory API",
      status: "ok",
      message: "Directory API responded successfully.",
    });
  } catch {
    checks.push({
      name: "Directory API",
      status: "error",
      message: "Directory API is unavailable or returned an invalid response.",
      recoveryHint: "Check network connectivity and the configured Directory API URL.",
    });
  }
}

async function checkAdapter(
  adapter: McpClientAdapter,
  scopesFromReceipts: readonly ClientScope[],
  cache: Map<string, Promise<readonly InstalledMcpServer[]>>,
  checks: DoctorCheckResult[],
): Promise<ClientDetection | null> {
  let detection: ClientDetection;
  try {
    detection = await adapter.detect();
    checks.push({
      name: `Client: ${adapter.id}`,
      status: detection.installed ? "ok" : "warning",
      message: detection.installed
        ? `${adapter.id} was detected.`
        : `${adapter.id} was not detected.`,
      ...(detection.installed
        ? {}
        : { recoveryHint: `Install ${adapter.id} if this client should be managed.` }),
    });
  } catch {
    checks.push({
      name: `Client: ${adapter.id}`,
      status: "error",
      message: `${adapter.id} detection failed.`,
      recoveryHint: "Check the client installation and permissions.",
    });
    return null;
  }

  if (!detection.installed) return detection;

  let hasConfigIssue = false;
  try {
    const diagnostic = await adapter.diagnose();
    if (diagnostic.issues.length > 0) {
      hasConfigIssue = true;
      checks.push(...diagnostic.issues.map((issue) => diagnosticCheck(adapter.id, issue)));
    }
  } catch {
    hasConfigIssue = true;
    checks.push({
      name: `Config: ${adapter.id}`,
      status: "error",
      message: `${adapter.id} diagnostics failed.`,
      recoveryHint: "Inspect the client configuration and run doctor again.",
    });
  }

  if (adapter.inspectionSafety === "may-connect") {
    checks.push({
      name: `Config: ${adapter.id}`,
      status: "warning",
      message: `${adapter.id} configuration inspection was skipped because its inventory command may connect to configured MCP servers.`,
      recoveryHint: `Use ${adapter.id}'s own configuration command to inspect entries safely.`,
    });
    return detection;
  }

  try {
    await Promise.all(
      inspectionScopes(detection, scopesFromReceipts).map((scope) =>
        inspectCached(adapter, scope, cache),
      ),
    );
  } catch {
    hasConfigIssue = true;
    checks.push({
      name: `Config: ${adapter.id}`,
      status: "error",
      message: `${adapter.id} configuration could not be parsed or inspected.`,
      recoveryHint: `Repair the ${adapter.id} configuration and run doctor again.`,
    });
  }

  if (!hasConfigIssue) {
    checks.push({
      name: `Config: ${adapter.id}`,
      status: "ok",
      message: `${adapter.id} configuration checks passed.`,
    });
  }
  return detection;
}

function diagnosticCheck(client: string, issue: DiagnosticIssue): DoctorCheckResult {
  return {
    name: `Config: ${client}`,
    status: issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "ok",
    message: `${issue.code}: ${issue.message}`,
    ...(issue.recoveryHint ? { recoveryHint: issue.recoveryHint } : {}),
  };
}

async function checkReceiptEntry(
  receipt: InstallationReceipt,
  deps: CliDependencies,
  detection: ClientDetection | null,
  cache: Map<string, Promise<readonly InstalledMcpServer[]>>,
  checks: DoctorCheckResult[],
): Promise<InstalledMcpServer | null> {
  const name = `Entry: ${targetLabel(receipt)}`;
  if (!detection?.installed) {
    checks.push({
      name,
      status: "warning",
      message: "Receipt exists, but the client is not installed; the entry was not inspected.",
      recoveryHint: `Install ${receipt.client} or remove the stale receipt-backed entry.`,
    });
    return null;
  }

  const adapter = deps.adapterRegistry.get(receipt.client);
  if (adapter.inspectionSafety === "may-connect") {
    checks.push({
      name,
      status: "warning",
      message:
        "Entry inspection was skipped to avoid connecting to or starting configured MCP servers.",
      recoveryHint: `Inspect ${receipt.client} configuration with its own safe configuration tooling.`,
    });
    return null;
  }

  try {
    const key = `${receipt.client}:${receipt.scope}`;
    const inspection = cache.get(key) ?? inspectCached(adapter, receipt.scope, cache);
    const installedEntry = (await inspection).find(
      (entry) => entry.slug === receipt.slug || entry.name === receipt.slug,
    );
    checks.push({
      name,
      status: installedEntry ? "ok" : "error",
      message: installedEntry
        ? "Receipt-backed configuration entry is present."
        : "Receipt exists, but the client configuration entry is missing.",
      ...(installedEntry
        ? {}
        : {
            recoveryHint: `Reinstall with: mcpdir add ${receipt.slug} --to ${receipt.client} --scope ${receipt.scope}`,
          }),
    });
    return installedEntry ?? null;
  } catch {
    checks.push({
      name,
      status: "error",
      message: "Client configuration could not be inspected.",
      recoveryHint: "Repair the client configuration and run doctor again.",
    });
    return null;
  }
}

async function checkDirectoryMetadata(
  receipt: InstallationReceipt,
  installedEntry: InstalledMcpServer | null,
  deps: CliDependencies,
  serverCache: Map<string, Promise<PublicServerDetail>>,
  manifestCache: Map<string, Promise<InstallManifestV1>>,
  checks: DoctorCheckResult[],
): Promise<void> {
  await checkServerDetail(receipt, deps, serverCache, checks);

  try {
    let manifestRequest = manifestCache.get(receipt.slug);
    if (!manifestRequest) {
      manifestRequest = deps.directoryClient
        .resolveInstall(receipt.slug)
        .then((response) => response.data);
      manifestCache.set(receipt.slug, manifestRequest);
    }
    const manifest = await manifestRequest;
    checkVersionAndManifest(receipt, manifest, checks);
    const variant = manifest.variants.find((candidate) => candidate.id === receipt.variantId);
    if (!variant) {
      checks.push({
        name: `Package: ${receipt.slug}`,
        status: "error",
        message: "The installed variant is no longer available from the Directory.",
        recoveryHint: `Review available variants with: mcpdir info ${receipt.slug}`,
      });
      return;
    }

    checks.push({
      name: `Package: ${receipt.slug}`,
      status: "ok",
      message:
        variant.kind === "package"
          ? `${variant.identifier}@${variant.version} is available.`
          : "The remote variant is available.",
    });
    checkEnvironment(receipt, variant, installedEntry, deps.environment, checks);
  } catch (error) {
    checks.push({
      name: `Package: ${receipt.slug}`,
      status: "error",
      message: isInstallUnavailable(error)
        ? "The install manifest is no longer available upstream."
        : "The install manifest could not be resolved.",
      recoveryHint: `Review the listing with: mcpdir info ${receipt.slug}`,
    });
  }
}

function receiptScopes(
  client: InstallationReceipt["client"],
  receipts: readonly InstallationReceipt[],
): readonly ClientScope[] {
  return [
    ...new Set(
      receipts.filter((receipt) => receipt.client === client).map((receipt) => receipt.scope),
    ),
  ];
}

function inspectionScopes(
  detection: ClientDetection,
  scopesFromReceipts: readonly ClientScope[],
): readonly (ClientScope | undefined)[] {
  const supportedScopes: ClientScope[] = [];
  if (detection.capabilities.includes("native-scope-user")) supportedScopes.push("user");
  if (detection.capabilities.includes("native-scope-project")) supportedScopes.push("project");
  if (detection.capabilities.includes("native-scope-global")) supportedScopes.push("global");
  const scopes = [...new Set([...supportedScopes, ...scopesFromReceipts])];
  return scopes.length > 0 ? scopes : [undefined];
}

function inspectCached(
  adapter: McpClientAdapter,
  scope: ClientScope | undefined,
  cache: Map<string, Promise<readonly InstalledMcpServer[]>>,
): Promise<readonly InstalledMcpServer[]> {
  const key = `${adapter.id}:${scope ?? "default"}`;
  let inspection = cache.get(key);
  if (!inspection) {
    inspection = adapter.inspect(scope);
    cache.set(key, inspection);
  }
  return inspection;
}

async function checkServerDetail(
  receipt: InstallationReceipt,
  deps: CliDependencies,
  cache: Map<string, Promise<PublicServerDetail>>,
  checks: DoctorCheckResult[],
): Promise<void> {
  try {
    let detailRequest = cache.get(receipt.slug);
    if (!detailRequest) {
      detailRequest = deps.directoryClient
        .getServer(receipt.slug)
        .then((response) => response.data);
      cache.set(receipt.slug, detailRequest);
    }
    const detail = await detailRequest;
    checks.push(upstreamCheck(receipt.slug, detail.listingStatus));

    for (const signal of detail.trustProfile.signals) {
      if (signal.status !== "warning" && signal.status !== "negative") continue;
      checks.push({
        name: `Directory warning: ${receipt.slug}/${signal.key}`,
        status: signal.status === "negative" ? "error" : "warning",
        message: signal.summary ?? `Directory signal ${signal.key} is ${signal.status}.`,
        recoveryHint: `Review current listing details with: mcpdir info ${receipt.slug}`,
      });
    }

    if (detail.latestHealth) {
      const health = detail.latestHealth;
      checks.push({
        name: `Remote health: ${receipt.slug}`,
        status: health.outcome === "healthy" ? "ok" : "warning",
        message: `Latest remote health: ${health.outcome} (checked ${health.checkedAt}${health.httpStatus === null ? "" : `, HTTP ${health.httpStatus}`}).`,
        ...(health.outcome === "healthy"
          ? {}
          : { recoveryHint: `Review current listing details with: mcpdir info ${receipt.slug}` }),
      });
    }
  } catch (error) {
    checks.push({
      name: `Upstream: ${receipt.slug}`,
      status: "error",
      message:
        errorStatus(error) === 410
          ? "The Directory listing was deleted upstream."
          : "The Directory listing could not be checked.",
      recoveryHint: `Review the listing with: mcpdir info ${receipt.slug}`,
    });
  }
}

function upstreamCheck(
  slug: string,
  status: PublicServerDetail["listingStatus"],
): DoctorCheckResult {
  if (status === "active") {
    return { name: `Upstream: ${slug}`, status: "ok", message: "Listing is active." };
  }
  if (status === "deprecated") {
    return {
      name: `Upstream: ${slug}`,
      status: "warning",
      message: "Listing is deprecated.",
      recoveryHint: `Review the listing with: mcpdir info ${slug}`,
    };
  }
  return {
    name: `Upstream: ${slug}`,
    status: "error",
    message:
      status === "deleted_upstream" ? "Listing was deleted upstream." : "Listing is unavailable.",
    recoveryHint: `Review removal with: mcpdir remove ${slug}`,
  };
}

function checkEnvironment(
  receipt: InstallationReceipt,
  variant: InstallManifestV1["variants"][number],
  installedEntry: InstalledMcpServer | null,
  environment: Readonly<NodeJS.ProcessEnv>,
  checks: DoctorCheckResult[],
): void {
  const references = installedEntry?.environmentReferences;
  if (!references) {
    if (variantRequiresEnvironment(variant)) {
      checks.push({
        name: `Environment: ${receipt.slug}`,
        status: "warning",
        message: "Configured environment reference names could not be verified safely.",
        recoveryHint: `Inspect ${receipt.client} configuration and confirm required environment references are set.`,
      });
    }
    return;
  }

  for (const name of references) {
    if (hasEnvironmentValue(environment, name)) continue;
    checks.push({
      name: `Environment: ${receipt.slug}/${name}`,
      status: "warning",
      message: `Configured environment reference ${name} is not currently set.`,
      recoveryHint: `Set ${name} in the environment used to launch ${receipt.client}.`,
    });
  }
}

function variantRequiresEnvironment(variant: InstallManifestV1["variants"][number]): boolean {
  if (variant.kind === "package") {
    return variant.environmentVariables.some(
      (variable) => variable.required && variable.defaultValue === null,
    );
  }
  return variant.variables.some((variable) => variable.required && variable.defaultValue === null);
}

function checkVersionAndManifest(
  receipt: InstallationReceipt,
  manifest: InstallManifestV1,
  checks: DoctorCheckResult[],
): void {
  const latestVersion = manifest.server.version ?? "unversioned";
  const versionCurrent = sameExactVersion(receipt.serverVersion, latestVersion);
  checks.push({
    name: `Version: ${receipt.slug}`,
    status: versionCurrent ? "ok" : "warning",
    message: versionCurrent
      ? `Server version ${receipt.serverVersion} is current.`
      : `Server version drift: ${receipt.serverVersion} -> ${latestVersion}.`,
    ...(versionCurrent
      ? {}
      : { recoveryHint: `Update with: mcpdir update ${receipt.slug} --to ${receipt.client}` }),
  });

  const latestHash = hashInstallManifest(manifest);
  const manifestCurrent = receipt.manifestHash === latestHash;
  checks.push({
    name: `Manifest: ${receipt.slug}`,
    status: manifestCurrent ? "ok" : "warning",
    message: manifestCurrent
      ? "Install manifest matches the receipt."
      : `Install manifest changed: ${receipt.manifestHash} -> ${latestHash}.`,
    ...(manifestCurrent
      ? {}
      : {
          recoveryHint: `Review with: mcpdir update ${receipt.slug} --to ${receipt.client} --dry-run`,
        }),
  });
}

function sameExactVersion(previous: string, latest: string): boolean {
  if (previous === "unversioned" || latest === "unversioned") return previous === latest;
  const previousParsed = parseSemVer(previous);
  const latestParsed = parseSemVer(latest);
  if (!previousParsed || !latestParsed) return previous === latest;
  return serializeSemVer(previousParsed) === serializeSemVer(latestParsed);
}

function serializeSemVer(version: ParsedSemVer): string {
  return JSON.stringify([
    version.major,
    version.minor,
    version.patch,
    version.prerelease,
    version.build,
  ]);
}

function hasEnvironmentValue(environment: Readonly<NodeJS.ProcessEnv>, name: string): boolean {
  const value = environment[name];
  return typeof value === "string" && value.length > 0;
}

function isInstallUnavailable(error: unknown): boolean {
  return (
    errorCode(error) === "DIRECTORY_INSTALL_UNAVAILABLE" ||
    errorCode(error) === "DIRECTORY_UPSTREAM_DELETED" ||
    errorStatus(error) === 410
  );
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function errorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : undefined;
}

function targetLabel(receipt: InstallationReceipt): string {
  return `${receipt.slug} (${receipt.client}, ${receipt.scope})`;
}

function compareReceiptKey(left: InstallationReceipt, right: InstallationReceipt): number {
  return (
    left.slug.localeCompare(right.slug) ||
    left.client.localeCompare(right.client) ||
    left.scope.localeCompare(right.scope)
  );
}

function reportResult(checks: readonly DoctorCheckResult[]): CommandResult<DoctorReport> {
  const exitCode = checks.some((check) => check.status === "error") ? 1 : 0;
  const report: DoctorReport = { exitCode, checks };
  if (exitCode === 0) return createSuccessResult(COMMAND_NAME, report);
  return {
    exitCode,
    stdout: {
      schemaVersion: 1,
      command: COMMAND_NAME,
      ok: false,
      data: report,
      error: { code: "DOCTOR_ERRORS_FOUND", message: "Doctor found one or more errors." },
      warnings: [],
    },
    stderrLines: ["Doctor found one or more errors."],
    warnings: [],
  };
}

function usageFailure(option: string): CommandResult<DoctorReport> {
  return {
    exitCode: 2,
    stdout: {
      schemaVersion: 1,
      command: COMMAND_NAME,
      ok: false,
      error: { code: "USAGE_ERROR", message: `doctor does not support option ${option}` },
      warnings: [],
    },
    stderrLines: [DOCTOR_USAGE],
    warnings: [],
  };
}
