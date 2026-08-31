import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  registrySnapshots,
  serverAliases,
  serverIcons,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import type { RegistryPage } from "@themcpdirectory/registry-client";
import {
  normalizeRegistryServer,
  selectCurrentVersion,
  type NormalizedRegistryServer,
} from "@themcpdirectory/registry-normalizer";

export interface RegistrySyncSource {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

export interface RegistrySyncContext {
  readonly observedAt: Date;
  readonly syncRunId?: string;
  readonly cursorStart?: string;
  readonly cursorEnd?: string;
}

export interface SyncPageResult {
  readonly recordsSeen: number;
  readonly recordsCreated: number;
  readonly recordsUpdated: number;
  readonly recordsFailed: number;
  readonly recordFailures: readonly SyncRecordFailure[];
  readonly nextCursor?: string;
}

export type SyncRecordFailureCode = "ambiguous_identity" | "ingestion_error";

export interface SyncRecordFailure {
  readonly recordIndex: number;
  readonly serverName: string;
  readonly code: SyncRecordFailureCode;
  readonly message: string;
}

export class AmbiguousIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousIdentityError";
  }
}

interface RecordWriteStats {
  created: number;
  updated: number;
}

type SyncDatabase = Pick<Database, "select" | "insert" | "update" | "delete">;

type SyncTransactionDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "execute"
>;

type PostgresError = Error & {
  readonly code?: string;
  readonly constraint_name?: string;
};

const PG_UNIQUE_VIOLATION = "23505";

function parseOptionalTimestamp(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

function slugify(input: string): string {
  const candidate = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return candidate.length > 0 ? candidate : "server";
}

function deriveBaseSlug(normalized: NormalizedRegistryServer): string {
  const fromName = normalized.canonicalRegistryName.split("/").pop();
  if (fromName && fromName.length > 0) {
    return slugify(fromName);
  }
  return slugify(normalized.title ?? normalized.canonicalRegistryName);
}

async function allocateServerSlug(
  db: SyncTransactionDatabase,
  normalized: NormalizedRegistryServer,
): Promise<string> {
  const base = deriveBaseSlug(normalized);
  for (let index = 0; index < 5000; index++) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const [existing] = await db.select({ id: servers.id }).from(servers).where(eq(servers.slug, candidate));
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Unable to allocate a unique server slug.");
}

function snapshotIdentityKey(sourceId: string, normalized: NormalizedRegistryServer): string {
  return [
    "snapshot",
    sourceId,
    normalized.canonicalRegistryName,
    normalized.version,
    normalized.payloadHash,
  ].join(":");
}

function upstreamIdentityKey(sourceId: string, normalized: NormalizedRegistryServer): string {
  return ["upstream", sourceId, normalized.canonicalRegistryName].join(":");
}

function repositoryIdentityKey(normalized: NormalizedRegistryServer): string | null {
  if (!normalized.repository?.source || !normalized.repository.externalId) {
    return null;
  }

  return [
    "repository",
    normalized.repository.source,
    normalized.repository.externalId,
    normalized.repository.subfolder ?? "",
  ].join(":");
}

function packageIdentityKey(packageEntry: {
  registryType: string;
  identifier: string;
  registryBaseUrl?: string;
}): string {
  return [
    "package",
    packageEntry.registryType,
    packageEntry.identifier,
    packageEntry.registryBaseUrl ?? "",
  ].join(":");
}

function aliasIdentityKey(normalized: NormalizedRegistryServer): string {
  return `alias:${normalized.canonicalRegistryName.toLowerCase()}`;
}

function slugIdentityKey(normalized: NormalizedRegistryServer): string {
  return `slug:${deriveBaseSlug(normalized)}`;
}

function buildDeterministicLockKeys(
  sourceId: string,
  normalized: NormalizedRegistryServer,
): string[] {
  const keys = new Set<string>();
  keys.add(upstreamIdentityKey(sourceId, normalized));
  keys.add(snapshotIdentityKey(sourceId, normalized));
  keys.add(aliasIdentityKey(normalized));
  keys.add(slugIdentityKey(normalized));

  const repositoryKey = repositoryIdentityKey(normalized);
  if (repositoryKey) {
    keys.add(repositoryKey);
  }

  for (const packageEntry of normalized.packages) {
    keys.add(packageIdentityKey(packageEntry));
  }

  return [...keys].sort();
}

async function acquireIdentityLocks(
  tx: SyncTransactionDatabase,
  sourceId: string,
  normalized: NormalizedRegistryServer,
): Promise<void> {
  const keys = buildDeterministicLockKeys(sourceId, normalized);

  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

function isUniqueViolation(error: unknown): error is PostgresError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PostgresError).code === PG_UNIQUE_VIOLATION
  );
}

function uniqueServerIdOrNull(step: string, serverIds: string[]): string | null {
  const unique = [...new Set(serverIds)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0] ?? null;
  throw new AmbiguousIdentityError(`Ambiguous identity at step '${step}'.`);
}

async function resolveByUpstreamName(
  db: SyncDatabase,
  normalized: NormalizedRegistryServer,
): Promise<string | null> {
  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(eq(servers.canonicalRegistryName, normalized.canonicalRegistryName));

  return uniqueServerIdOrNull(
    "upstream_mapping",
    rows.map((row) => row.id),
  );
}

async function resolveByRepositoryIdentity(
  db: SyncDatabase,
  normalized: NormalizedRegistryServer,
): Promise<string | null> {
  if (!normalized.repository?.source || !normalized.repository.externalId) {
    return null;
  }

  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(
      and(
        eq(servers.repositorySource, normalized.repository.source),
        eq(servers.repositoryExternalId, normalized.repository.externalId),
      ),
    );

  return uniqueServerIdOrNull(
    "stable_repository_id",
    rows.map((row) => row.id),
  );
}

async function resolveByPackageIdentity(
  db: SyncDatabase,
  normalized: NormalizedRegistryServer,
): Promise<string | null> {
  const packageMatches = new Set<string>();
  for (const pkg of normalized.packages) {
    const rows = await db
      .select({ serverId: serverVersions.serverId })
      .from(serverPackages)
      .innerJoin(serverVersions, eq(serverVersions.id, serverPackages.serverVersionId))
      .where(
        and(
          eq(serverPackages.registryType, pkg.registryType),
          eq(serverPackages.identifier, pkg.identifier),
          pkg.registryBaseUrl === undefined
            ? isNull(serverPackages.registryBaseUrl)
            : or(
                eq(serverPackages.registryBaseUrl, pkg.registryBaseUrl),
                isNull(serverPackages.registryBaseUrl),
              ),
        ),
      );

    for (const row of rows) {
      packageMatches.add(row.serverId);
    }
  }

  return uniqueServerIdOrNull("exact_package_identity", [...packageMatches]);
}

async function resolveByApprovedAlias(
  db: SyncDatabase,
  normalized: NormalizedRegistryServer,
): Promise<string | null> {
  const rows = await db
    .select({ serverId: serverAliases.serverId })
    .from(serverAliases)
    .where(
      and(
        eq(sql`lower(${serverAliases.alias})`, normalized.canonicalRegistryName.toLowerCase()),
        eq(serverAliases.kind, "manual"),
      ),
    );

  return uniqueServerIdOrNull(
    "approved_alias",
    rows.map((row) => row.serverId),
  );
}

async function resolveCanonicalServerId(
  db: SyncDatabase,
  normalized: NormalizedRegistryServer,
): Promise<string | null> {
  const existingByUpstreamName = await resolveByUpstreamName(db, normalized);
  if (existingByUpstreamName) return existingByUpstreamName;

  const existingByRepositoryId = await resolveByRepositoryIdentity(db, normalized);
  if (existingByRepositoryId) return existingByRepositoryId;

  const existingByPackageIdentity = await resolveByPackageIdentity(db, normalized);
  if (existingByPackageIdentity) return existingByPackageIdentity;

  const existingByAlias = await resolveByApprovedAlias(db, normalized);
  if (existingByAlias) return existingByAlias;

  return null;
}

function mapUpstreamToListingStatus(upstreamStatus: string | undefined):
  | "active"
  | "deprecated"
  | "deleted_upstream"
  | "unavailable" {
  if (upstreamStatus === "deprecated") return "deprecated";
  if (upstreamStatus === "deleted") return "deleted_upstream";
  if (upstreamStatus === "active") return "active";
  return "unavailable";
}

async function upsertRegistrySnapshot(
  db: SyncTransactionDatabase,
  sourceId: string,
  normalized: NormalizedRegistryServer,
  rawPayload: RegistryPage["servers"][number],
  observedAt: Date,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: registrySnapshots.id })
    .from(registrySnapshots)
    .where(
      and(
        eq(registrySnapshots.registrySourceId, sourceId),
        eq(registrySnapshots.externalName, normalized.canonicalRegistryName),
        eq(registrySnapshots.externalVersion, normalized.version),
        eq(registrySnapshots.payloadHash, normalized.payloadHash),
      ),
    );

  if (existing) {
    await db
      .update(registrySnapshots)
      .set({ lastSeenAt: observedAt })
      .where(eq(registrySnapshots.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [inserted] = await db
    .insert(registrySnapshots)
    .values({
      registrySourceId: sourceId,
      externalName: normalized.canonicalRegistryName,
      externalVersion: normalized.version,
      schemaUri: normalized.schemaUri,
      payloadHash: normalized.payloadHash,
      rawPayload,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
    })
    .onConflictDoUpdate({
      target: [
        registrySnapshots.registrySourceId,
        registrySnapshots.externalName,
        registrySnapshots.externalVersion,
        registrySnapshots.payloadHash,
      ],
      set: {
        lastSeenAt: observedAt,
      },
    })
    .returning({ id: registrySnapshots.id });

  if (!inserted) {
    throw new Error("Failed to insert registry snapshot.");
  }

  return { id: inserted.id, created: true };
}

async function upsertServer(
  db: SyncTransactionDatabase,
  sourceServerId: string | null,
  normalized: NormalizedRegistryServer,
  observedAt: Date,
): Promise<{ serverId: string; created: boolean }> {
  if (sourceServerId) {
    const [existing] = await db.select().from(servers).where(eq(servers.id, sourceServerId));
    if (!existing) {
      throw new Error("Resolved server no longer exists.");
    }

    const repository = normalized.repository;

    await db
      .update(servers)
      .set({
        title: normalized.title ?? existing.title,
        shortDescription: normalized.description,
        canonicalRegistryName: normalized.canonicalRegistryName,
        homepageUrl: normalized.websiteUrl ?? existing.homepageUrl,
        repositoryUrl: repository?.url ?? existing.repositoryUrl,
        repositorySource: repository?.source ?? existing.repositorySource,
        repositoryExternalId: repository?.externalId ?? existing.repositoryExternalId,
        repositorySubfolder: repository?.subfolder ?? existing.repositorySubfolder,
        licenseSpdx:
          (normalized.normalizedPayload.server as { license?: string }).license ?? existing.licenseSpdx,
        lastSeenAt: observedAt,
      })
      .where(eq(servers.id, existing.id));

    return { serverId: existing.id, created: false };
  }

  const repository = normalized.repository;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const slug = await allocateServerSlug(db, normalized);
    try {
      const [created] = await db
        .insert(servers)
        .values({
          slug,
          title: normalized.title ?? normalized.canonicalRegistryName,
          shortDescription: normalized.description,
          canonicalRegistryName: normalized.canonicalRegistryName,
          listingStatus: "active",
          moderationStatus: "normal",
          homepageUrl: normalized.websiteUrl,
          repositoryUrl: repository?.url,
          repositorySource: repository?.source,
          repositoryExternalId: repository?.externalId,
          repositorySubfolder: repository?.subfolder,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
        })
        .returning({ id: servers.id });

      if (!created) {
        throw new Error("Failed to create canonical server.");
      }

      return { serverId: created.id, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const resolved = await resolveCanonicalServerId(db, normalized);
      if (resolved) {
        return upsertServer(db, resolved, normalized, observedAt);
      }
      if (attempt === 4999) {
        throw new Error("Unable to allocate a unique server slug.");
      }
    }
  }

  throw new Error("Unable to allocate a unique server slug.");
}

async function upsertServerVersion(
  db: SyncTransactionDatabase,
  serverId: string,
  sourceId: string,
  snapshotId: string,
  normalized: NormalizedRegistryServer,
  observedAt: Date,
): Promise<{ versionId: string; created: boolean }> {
  const upstreamStatus = normalized.upstream.status;
  const publishedAt = parseOptionalTimestamp(normalized.upstream.publishedAt);

  const [existing] = await db
    .select({ id: serverVersions.id })
    .from(serverVersions)
    .where(
      and(
        eq(serverVersions.serverId, serverId),
        eq(serverVersions.registrySourceId, sourceId),
        eq(serverVersions.version, normalized.version),
      ),
    );

  if (existing) {
    await db
      .update(serverVersions)
      .set({
        registrySnapshotId: snapshotId,
        schemaUri: normalized.schemaUri,
        upstreamStatus,
        description: normalized.description,
        title: normalized.title,
        publishedAt,
        lastSeenAt: observedAt,
        normalizedPayload: normalized.normalizedPayload,
      })
      .where(eq(serverVersions.id, existing.id));

    return { versionId: existing.id, created: false };
  }

  const [created] = await db
    .insert(serverVersions)
    .values({
      serverId,
      registrySourceId: sourceId,
      registrySnapshotId: snapshotId,
      version: normalized.version,
      schemaUri: normalized.schemaUri,
      upstreamStatus,
      description: normalized.description,
      title: normalized.title,
      publishedAt,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      normalizedPayload: normalized.normalizedPayload,
    })
    .onConflictDoUpdate({
      target: [serverVersions.serverId, serverVersions.version, serverVersions.registrySourceId],
      set: {
        registrySnapshotId: snapshotId,
        schemaUri: normalized.schemaUri,
        upstreamStatus,
        description: normalized.description,
        title: normalized.title,
        publishedAt,
        lastSeenAt: observedAt,
        normalizedPayload: normalized.normalizedPayload,
      },
    })
    .returning({ id: serverVersions.id });

  if (!created) {
    throw new Error("Failed to create server version.");
  }

  return { versionId: created.id, created: true };
}

async function replaceVersionChildren(
  db: SyncTransactionDatabase,
  versionId: string,
  normalized: NormalizedRegistryServer,
): Promise<void> {
  await db.delete(serverPackages).where(eq(serverPackages.serverVersionId, versionId));
  await db.delete(serverRemotes).where(eq(serverRemotes.serverVersionId, versionId));
  await db.delete(serverIcons).where(eq(serverIcons.serverVersionId, versionId));

  if (normalized.packages.length > 0) {
    await db.insert(serverPackages).values(
      normalized.packages.map((pkg) => ({
        serverVersionId: versionId,
        registryType: pkg.registryType,
        registryBaseUrl: pkg.registryBaseUrl,
        identifier: pkg.identifier,
        version: pkg.version,
        fileSha256: pkg.fileSha256,
        runtimeHint: pkg.runtimeHint,
        transportType: pkg.transportType,
        runtimeArguments: pkg.runtimeArguments,
        packageArguments: pkg.packageArguments,
        environmentVariables: pkg.environmentVariables,
      })),
    );
  }

  if (normalized.remotes.length > 0) {
    await db.insert(serverRemotes).values(
      normalized.remotes.map((remote) => ({
        serverVersionId: versionId,
        transportType: remote.transportType,
        urlTemplate: remote.urlTemplate ?? "",
        headers: remote.headers,
        variables: remote.variables,
      })),
    );
  }

  if (normalized.icons.length > 0) {
    await db.insert(serverIcons).values(
      normalized.icons.map((icon) => ({
        serverVersionId: versionId,
        src: icon.src,
        mimeType: icon.mimeType,
        sizes: icon.sizes?.join(" "),
        theme: icon.theme,
      })),
    );
  }
}

async function refreshCurrentVersionAndListingStatus(db: SyncDatabase, serverId: string): Promise<void> {
  const versions = await db
    .select({
      id: serverVersions.id,
      version: serverVersions.version,
      upstreamStatus: serverVersions.upstreamStatus,
      publishedAt: serverVersions.publishedAt,
    })
    .from(serverVersions)
    .where(eq(serverVersions.serverId, serverId));

  const current = selectCurrentVersion(
    versions.map((version) => ({
      version: version.version,
      ...(version.upstreamStatus !== null ? { upstreamStatus: version.upstreamStatus } : {}),
      ...(version.publishedAt !== null ? { publishedAt: version.publishedAt.toISOString() } : {}),
    })),
  );

  const selectedVersion = current
    ? versions.find((version) => version.version === current.version && version.upstreamStatus === current.upstreamStatus)
    : undefined;

  const listingStatus = mapUpstreamToListingStatus(selectedVersion?.upstreamStatus ?? undefined);
  const currentVersionId = selectedVersion?.upstreamStatus === "deleted" ? null : selectedVersion?.id ?? null;

  await db
    .update(servers)
    .set({
      listingStatus,
      currentVersionId,
    })
    .where(eq(servers.id, serverId));
}

async function synchronizeServerRecord(
  db: SyncTransactionDatabase,
  source: RegistrySyncSource,
  rawServerPayload: RegistryPage["servers"][number],
  observedAt: Date,
): Promise<RecordWriteStats> {
  const normalized = normalizeRegistryServer(rawServerPayload);
  await acquireIdentityLocks(db, source.id, normalized);
  const snapshot = await upsertRegistrySnapshot(
    db,
    source.id,
    normalized,
    structuredClone(rawServerPayload),
    observedAt,
  );

  const resolvedServerId = await resolveCanonicalServerId(db, normalized);
  const serverWrite = await upsertServer(db, resolvedServerId, normalized, observedAt);
  const versionWrite = await upsertServerVersion(
    db,
    serverWrite.serverId,
    source.id,
    snapshot.id,
    normalized,
    observedAt,
  );

  await replaceVersionChildren(db, versionWrite.versionId, normalized);
  await refreshCurrentVersionAndListingStatus(db, serverWrite.serverId);

  const created = Number(snapshot.created) + Number(serverWrite.created) + Number(versionWrite.created);
  const updated = Number(!snapshot.created) + Number(!serverWrite.created) + Number(!versionWrite.created);

  return { created, updated };
}

export async function synchronizeRegistryPage(
  db: Database,
  source: RegistrySyncSource,
  page: RegistryPage,
  context: RegistrySyncContext,
): Promise<SyncPageResult> {
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsFailed = 0;
  const recordFailures: SyncRecordFailure[] = [];

  for (const [recordIndex, rawServer] of page.servers.entries()) {
    try {
      const stats = await db.transaction(async (tx) => {
        return synchronizeServerRecord(tx, source, rawServer, context.observedAt);
      });
      recordsCreated += stats.created;
      recordsUpdated += stats.updated;
    } catch (error) {
      recordsFailed += 1;
      const serverName = rawServer.server.name;
      if (error instanceof AmbiguousIdentityError) {
        recordFailures.push({
          recordIndex,
          serverName,
          code: "ambiguous_identity",
          message: error.message,
        });
        continue;
      }

      const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown ingestion error";
      recordFailures.push({
        recordIndex,
        serverName,
        code: "ingestion_error",
        message: message.slice(0, 400),
      });
    }
  }

  const result: SyncPageResult = {
    recordsSeen: page.servers.length,
    recordsCreated,
    recordsUpdated,
    recordsFailed,
    recordFailures,
    ...(page.metadata.nextCursor !== undefined ? { nextCursor: page.metadata.nextCursor } : {}),
  };

  return result;
}
