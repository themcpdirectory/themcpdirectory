import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type {
  InstallManifestV1,
  PublicPublisherSummary,
  PublicRepositorySummary,
  PublicServerCategory,
  PublicServerDetail,
  PublicServerTimestamps,
  PublicTrustProfile,
  SupportedClientId,
} from "@themcpdirectory/api-contract";
import { httpUrlSchema } from "@themcpdirectory/api-contract";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  serverAliases,
  serverCategories,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";

const SUPPORTED_CLIENT_IDS = new Set<SupportedClientId>(["claude-code", "codex", "cursor"]);
const COMPATIBILITY_STATUSES = new Set<
  InstallManifestCompatibility[keyof InstallManifestCompatibility]
>(["supported", "supported_with_configuration", "unsupported", "unknown"]);
const TRUST_SIGNAL_STATUSES = new Set<PublicTrustProfile["signals"][number]["status"]>([
  "positive",
  "neutral",
  "warning",
  "negative",
  "unknown",
]);
const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

type Argument = PublicServerDetail["packages"][number]["runtimeArguments"][number];
type EnvironmentVariable = PublicServerDetail["packages"][number]["environmentVariables"][number];
type RemoteHeader = PublicServerDetail["remotes"][number]["headers"][number];
type RemoteVariable = PublicServerDetail["remotes"][number]["variables"][number];

export type InstallManifestCompatibility = {
  readonly "claude-code"?: "supported" | "supported_with_configuration" | "unsupported" | "unknown";
  readonly codex?: "supported" | "supported_with_configuration" | "unsupported" | "unknown";
  readonly cursor?: "supported" | "supported_with_configuration" | "unsupported" | "unknown";
};

export interface ServerPackageRow {
  readonly id: string;
  readonly registryType: string;
  readonly identifier: string;
  readonly version: string | null;
  readonly fileSha256: string | null;
  readonly runtimeHint: string | null;
  readonly transportType: string;
  readonly runtimeArguments: readonly Record<string, unknown>[];
  readonly packageArguments: readonly Record<string, unknown>[];
  readonly environmentVariables: readonly Record<string, unknown>[];
}

export interface ServerRemoteRow {
  readonly id: string;
  readonly transportType: string;
  readonly urlTemplate: string;
  readonly headers: readonly Record<string, unknown>[];
  readonly variables: Readonly<Record<string, unknown>>;
}

export interface ServerDetailRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly longDescription: string | null;
  readonly listingStatus: PublicServerDetail["listingStatus"];
  readonly aliases: readonly string[];
  readonly publisher: PublicPublisherSummary | null;
  readonly repository: PublicRepositorySummary | null;
  readonly currentVersion: string | null;
  readonly categories: readonly PublicServerCategory[];
  readonly packages: readonly ServerPackageRow[];
  readonly remotes: readonly ServerRemoteRow[];
  readonly compatibility: InstallManifestCompatibility;
  readonly trustProfile: PublicTrustProfile;
  readonly timestamps: PublicServerTimestamps;
  readonly provenance: InstallManifestV1["provenance"] | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecordArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectArgument(input: Record<string, unknown>): Argument | null {
  if (input.type !== "positional" && input.type !== "named") return null;

  return {
    type: input.type,
    name: optionalString(input.name),
    valueHint: optionalString(input.valueHint),
    description: optionalString(input.description),
    required: input.isRequired === true,
  };
}

export function projectEnvironmentVariable(
  input: Record<string, unknown>,
): EnvironmentVariable | null {
  const name = optionalString(input.name);
  if (!name || !ENVIRONMENT_VARIABLE_NAME_PATTERN.test(name)) return null;

  return {
    name,
    description: optionalString(input.description),
    required: input.isRequired === true,
    defaultValue: input.isSecret === true ? null : optionalString(input.default),
    valueSource: "environment",
  };
}

function projectHeaders(value: readonly Record<string, unknown>[]): readonly RemoteHeader[] {
  return value.flatMap((input) => {
    if (input.isSecret === true) return [];
    const name = optionalString(input.name);
    const headerValue = optionalString(input.value);
    return name && headerValue ? [{ name, value: headerValue }] : [];
  });
}

function projectRemoteVariables(
  value: Readonly<Record<string, unknown>>,
): readonly RemoteVariable[] {
  return Object.entries(value).flatMap(([name, rawInput]) => {
    const input = asRecord(rawInput);
    if (!input || name.length === 0) return [];
    return [
      {
        name,
        description: optionalString(input.description),
        required: input.isRequired === true,
        defaultValue: input.isSecret === true ? null : optionalString(input.default),
      },
    ];
  });
}

async function loadAliases(db: Database, serverId: string): Promise<readonly string[]> {
  const rows = await db
    .select({ alias: serverAliases.alias })
    .from(serverAliases)
    .where(eq(serverAliases.serverId, serverId))
    .orderBy(asc(serverAliases.alias));
  return rows.map((row) => row.alias);
}

async function loadPublicServerCategories(
  db: Database,
  serverId: string,
): Promise<readonly PublicServerCategory[]> {
  return db
    .select({ slug: categories.slug, name: categories.name })
    .from(serverCategories)
    .innerJoin(categories, eq(categories.id, serverCategories.categoryId))
    .where(eq(serverCategories.serverId, serverId))
    .orderBy(asc(categories.sortOrder), asc(categories.slug));
}

async function loadServerPackages(
  db: Database,
  currentVersionId: string | null,
): Promise<readonly ServerPackageRow[]> {
  if (!currentVersionId) return [];

  const rows = await db
    .select({
      id: serverPackages.id,
      registryType: serverPackages.registryType,
      identifier: serverPackages.identifier,
      version: serverPackages.version,
      fileSha256: serverPackages.fileSha256,
      runtimeHint: serverPackages.runtimeHint,
      transportType: serverPackages.transportType,
      runtimeArguments: serverPackages.runtimeArguments,
      packageArguments: serverPackages.packageArguments,
      environmentVariables: serverPackages.environmentVariables,
    })
    .from(serverPackages)
    .where(eq(serverPackages.serverVersionId, currentVersionId))
    .orderBy(asc(serverPackages.id));

  return rows.map((row) => ({
    ...row,
    runtimeArguments: asRecordArray(row.runtimeArguments),
    packageArguments: asRecordArray(row.packageArguments),
    environmentVariables: asRecordArray(row.environmentVariables),
  }));
}

async function loadServerRemotes(
  db: Database,
  currentVersionId: string | null,
): Promise<readonly ServerRemoteRow[]> {
  if (!currentVersionId) return [];

  const rows = await db
    .select({
      id: serverRemotes.id,
      transportType: serverRemotes.transportType,
      urlTemplate: serverRemotes.urlTemplate,
      headers: serverRemotes.headers,
      variables: serverRemotes.variables,
    })
    .from(serverRemotes)
    .where(eq(serverRemotes.serverVersionId, currentVersionId))
    .orderBy(asc(serverRemotes.id));

  return rows.map((row) => ({
    ...row,
    headers: asRecordArray(row.headers),
    variables: asRecord(row.variables) ?? {},
  }));
}

async function loadCompatibilityMap(
  db: Database,
  serverId: string,
): Promise<InstallManifestCompatibility> {
  const rows = await db
    .select({
      clientId: clientCompatibility.clientId,
      status: clientCompatibility.status,
    })
    .from(clientCompatibility)
    .where(eq(clientCompatibility.serverId, serverId))
    .orderBy(
      desc(clientCompatibility.updatedAt),
      desc(clientCompatibility.createdAt),
      sql`case ${clientCompatibility.status}
        when 'unsupported' then 0
        when 'supported_with_configuration' then 1
        when 'unknown' then 2
        else 3
      end`,
      asc(clientCompatibility.id),
    );

  const compatibility: Record<
    string,
    InstallManifestCompatibility[keyof InstallManifestCompatibility]
  > = {};
  for (const row of rows) {
    if (
      SUPPORTED_CLIENT_IDS.has(row.clientId as SupportedClientId) &&
      COMPATIBILITY_STATUSES.has(
        row.status as InstallManifestCompatibility[keyof InstallManifestCompatibility],
      ) &&
      compatibility[row.clientId] === undefined
    ) {
      compatibility[row.clientId] =
        row.status as InstallManifestCompatibility[keyof InstallManifestCompatibility];
    }
  }
  return compatibility;
}

async function loadTrustProfile(
  db: Database,
  serverId: string,
  currentVersionId: string | null,
  registryKind: string | null,
  publisherVerified: boolean,
  sourceAvailable: boolean | null,
  openSource: boolean | null,
): Promise<PublicTrustProfile> {
  const versionPredicate = currentVersionId
    ? or(isNull(trustSignals.serverVersionId), eq(trustSignals.serverVersionId, currentVersionId))
    : isNull(trustSignals.serverVersionId);
  const rows = await db
    .select({
      key: trustSignals.signalKey,
      status: trustSignals.status,
      summary: trustSignals.summary,
      checkedAt: trustSignals.checkedAt,
    })
    .from(trustSignals)
    .where(and(eq(trustSignals.serverId, serverId), versionPredicate))
    .orderBy(asc(trustSignals.signalKey));

  return {
    officialRegistry: registryKind === "official",
    publisherVerified,
    sourceAvailable,
    openSource,
    signals: rows.flatMap((row) => {
      if (
        !TRUST_SIGNAL_STATUSES.has(row.status as PublicTrustProfile["signals"][number]["status"])
      ) {
        return [];
      }
      return [
        {
          key: row.key,
          status: row.status as PublicTrustProfile["signals"][number]["status"],
          summary: row.summary,
          checkedAt: row.checkedAt?.toISOString() ?? null,
        },
      ];
    }),
  };
}

export async function loadServerDetailRow(
  db: Database,
  slug: string,
): Promise<ServerDetailRow | null> {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const [server] = await db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      longDescription: servers.longDescription,
      listingStatus: servers.listingStatus,
      sourceAvailable: servers.sourceAvailable,
      openSource: servers.openSource,
      repositoryUrl: servers.repositoryUrl,
      firstSeenAt: servers.firstSeenAt,
      lastSeenAt: servers.lastSeenAt,
      updatedAt: servers.updatedAt,
      currentVersionId: serverVersions.id,
      currentVersion: serverVersions.version,
      publishedAt: serverVersions.publishedAt,
      observedAt: serverVersions.lastSeenAt,
      registryKey: registrySources.key,
      registryName: registrySources.name,
      registryKind: registrySources.kind,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherName: publishers.displayName,
      publisherVerified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
    })
    .from(servers)
    .leftJoin(publishers, eq(publishers.id, servers.publisherId))
    .leftJoin(
      serverVersions,
      and(eq(serverVersions.id, servers.currentVersionId), eq(serverVersions.serverId, servers.id)),
    )
    .leftJoin(registrySources, eq(registrySources.id, serverVersions.registrySourceId))
    .where(
      sql`lower(${servers.slug}::text) = ${normalized} and ${servers.moderationStatus} not in ('hidden', 'blocked')`,
    )
    .limit(1);

  if (!server) return null;
  const publisherVerified = Boolean(server.publisherVerified);

  return {
    id: server.id,
    slug: server.slug,
    title: server.title,
    shortDescription: server.shortDescription,
    longDescription: server.longDescription,
    listingStatus: server.listingStatus as PublicServerDetail["listingStatus"],
    aliases: await loadAliases(db, server.id),
    publisher:
      server.publisherSlug && server.publisherName
        ? { slug: server.publisherSlug, name: server.publisherName, verified: publisherVerified }
        : null,
    repository: server.repositoryUrl ? { url: server.repositoryUrl } : null,
    currentVersion: server.currentVersion,
    categories: await loadPublicServerCategories(db, server.id),
    packages: await loadServerPackages(db, server.currentVersionId),
    remotes: await loadServerRemotes(db, server.currentVersionId),
    compatibility: await loadCompatibilityMap(db, server.id),
    trustProfile: await loadTrustProfile(
      db,
      server.id,
      server.currentVersionId,
      server.registryKind,
      publisherVerified,
      server.sourceAvailable,
      server.openSource,
    ),
    timestamps: {
      firstSeenAt: server.firstSeenAt.toISOString(),
      lastSeenAt: server.lastSeenAt.toISOString(),
      publishedAt: server.publishedAt?.toISOString() ?? null,
      updatedAt: server.updatedAt?.toISOString() ?? null,
    },
    provenance:
      server.registryKey && server.registryName && server.observedAt
        ? {
            registry: server.registryKey,
            registryName: server.registryName,
            observedAt: server.observedAt.toISOString(),
          }
        : null,
  };
}

export function projectPublicPackage(
  row: ServerPackageRow,
): PublicServerDetail["packages"][number] {
  return {
    id: row.id,
    registryType: row.registryType,
    identifier: row.identifier,
    version: row.version,
    runtimeHint: row.runtimeHint,
    transport: row.transportType,
    runtimeArguments: row.runtimeArguments.flatMap((input) => {
      const argument = projectArgument(input);
      return argument ? [argument] : [];
    }),
    packageArguments: row.packageArguments.flatMap((input) => {
      const argument = projectArgument(input);
      return argument ? [argument] : [];
    }),
    environmentVariables: row.environmentVariables.flatMap((input) => {
      const variable = projectEnvironmentVariable(input);
      return variable ? [variable] : [];
    }),
  };
}

export function projectPublicRemote(row: ServerRemoteRow): PublicServerDetail["remotes"][number] {
  return {
    id: row.id,
    transport: row.transportType,
    urlTemplate: row.urlTemplate,
    headers: [...projectHeaders(row.headers)],
    variables: [...projectRemoteVariables(row.variables)],
  };
}

export async function getServerDetailBySlug(
  db: Database,
  slug: string,
): Promise<PublicServerDetail | null> {
  const server = await loadServerDetailRow(db, slug);
  if (!server) return null;

  return {
    id: server.id,
    slug: server.slug,
    title: server.title,
    shortDescription: server.shortDescription,
    longDescription: server.longDescription,
    listingStatus: server.listingStatus,
    aliases: [...server.aliases],
    publisher: server.publisher,
    repository: server.repository,
    version: server.currentVersion,
    categories: [...server.categories],
    packages: server.packages.map(projectPublicPackage),
    remotes: server.remotes
      .filter((remote) => httpUrlSchema.safeParse(remote.urlTemplate).success)
      .map(projectPublicRemote),
    compatibility: server.compatibility,
    trustProfile: {
      ...server.trustProfile,
      signals: [...server.trustProfile.signals],
    },
    timestamps: server.timestamps,
  };
}
