import {
  httpUrlSchema,
  isExactPackageVersionForRegistry,
  type InstallManifestV1,
  type SupportedClientId,
} from "@themcpdirectory/api-contract";
import type { Database } from "@themcpdirectory/db";
import {
  loadServerDetailRow,
  projectEnvironmentVariable,
  projectPublicPackage,
  projectPublicRemote,
  type InstallManifestCompatibility,
  type ServerPackageRow,
  type ServerRemoteRow,
} from "./server-detail.js";
import { resolveServerIdentifier } from "./resolve-server-identifier.js";

export type InstallManifestVariant = InstallManifestV1["variants"][number];
export type InstallManifestPackageVariant = Extract<InstallManifestVariant, { kind: "package" }>;
export type InstallManifestRemoteVariant = Extract<InstallManifestVariant, { kind: "remote" }>;

export class ServerNotFoundError extends Error {
  readonly identifier: string;

  constructor(identifier: string) {
    super(`Server not found: ${identifier}`);
    this.name = "ServerNotFoundError";
    this.identifier = identifier;
  }
}

export class InstallManifestUnavailableError extends Error {
  readonly identifier: string;

  constructor(identifier: string) {
    super(`No safe install manifest is available for: ${identifier}`);
    this.name = "InstallManifestUnavailableError";
    this.identifier = identifier;
  }
}

export class UpstreamDeletedError extends Error {
  readonly code = "UPSTREAM_DELETED" as const;
  readonly identifier: string;

  constructor(identifier: string) {
    super(`The upstream server was deleted: ${identifier}`);
    this.name = "UpstreamDeletedError";
    this.identifier = identifier;
  }
}

function isPackageRegistryType(
  value: string,
): value is InstallManifestPackageVariant["registryType"] {
  return value === "npm" || value === "pypi";
}

function isSafePackageVariant(row: ServerPackageRow): boolean {
  return (
    isPackageRegistryType(row.registryType) &&
    row.version !== null &&
    isExactPackageVersionForRegistry(row.registryType, row.version) &&
    row.transportType === "stdio" &&
    (row.runtimeHint === null || row.runtimeHint === "npx") &&
    (row.fileSha256 === null || /^[a-f0-9]{64}$/i.test(row.fileSha256))
  );
}

export function projectPackageVariant(row: ServerPackageRow): InstallManifestPackageVariant {
  if (!isSafePackageVariant(row) || !isPackageRegistryType(row.registryType) || !row.version) {
    throw new InstallManifestUnavailableError(row.identifier);
  }

  const projected = projectPublicPackage(row);
  return {
    id: row.id,
    kind: "package",
    registryType: row.registryType,
    identifier: row.identifier,
    version: row.version,
    runtimeHint: row.runtimeHint as "npx" | null,
    transport: "stdio",
    runtimeArguments: projected.runtimeArguments,
    packageArguments: projected.packageArguments,
    environmentVariables: row.environmentVariables.flatMap((input) => {
      const variable = projectEnvironmentVariable(input);
      return variable ? [variable] : [];
    }),
    integrity: row.fileSha256
      ? { algorithm: "sha256", digest: row.fileSha256.toLowerCase() }
      : null,
  } as InstallManifestPackageVariant;
}

function isSafeRemoteVariant(row: ServerRemoteRow): boolean {
  return (
    (row.transportType === "streamable-http" || row.transportType === "sse") &&
    httpUrlSchema.safeParse(row.urlTemplate).success
  );
}

export function projectRemoteVariant(row: ServerRemoteRow): InstallManifestRemoteVariant {
  if (!isSafeRemoteVariant(row)) {
    throw new InstallManifestUnavailableError(row.urlTemplate);
  }

  const projected = projectPublicRemote(row);
  return {
    id: row.id,
    kind: "remote",
    transport: row.transportType as InstallManifestRemoteVariant["transport"],
    urlTemplate: row.urlTemplate,
    headers: projected.headers,
    variables: projected.variables,
  };
}

export function filterVariantsForClient(
  variants: readonly InstallManifestVariant[],
  clientId: SupportedClientId,
  compatibility: InstallManifestCompatibility,
): readonly InstallManifestVariant[] {
  return compatibility[clientId] === "unsupported" ? [] : variants;
}

export async function buildInstallManifest(
  db: Database,
  input: { readonly identifier: string; readonly clientId?: SupportedClientId },
): Promise<InstallManifestV1> {
  const resolved = await resolveServerIdentifier(db, input.identifier);
  if (!resolved) throw new ServerNotFoundError(input.identifier);

  const detail = await loadServerDetailRow(db, resolved.slug);
  if (!detail) throw new ServerNotFoundError(resolved.slug);
  if (detail.listingStatus === "deleted_upstream") {
    throw new UpstreamDeletedError(resolved.slug);
  }
  if (detail.listingStatus === "unavailable" || !detail.provenance) {
    throw new InstallManifestUnavailableError(resolved.slug);
  }

  const variants: InstallManifestVariant[] = [
    ...detail.packages.filter(isSafePackageVariant).map(projectPackageVariant),
    ...detail.remotes.filter(isSafeRemoteVariant).map(projectRemoteVariant),
  ];
  const filteredVariants = input.clientId
    ? filterVariantsForClient(variants, input.clientId, detail.compatibility)
    : variants;
  if (filteredVariants.length === 0) {
    throw new InstallManifestUnavailableError(resolved.slug);
  }

  return {
    schemaVersion: 1,
    server: {
      id: detail.id,
      slug: detail.slug,
      title: detail.title,
      version: detail.currentVersion,
    },
    provenance: detail.provenance,
    variants: [...filteredVariants],
    compatibility: detail.compatibility,
  };
}
