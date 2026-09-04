import { and, desc, eq } from "drizzle-orm";
import {
  TrustProfileV1Schema,
  type RemoteHealthObservationV1,
  type TrustProfileV1,
  type TrustSignalKey,
} from "@themcpdirectory/api-contract";
import {
  publishers,
  repositorySnapshots,
  serverPackages,
  serverVersions,
  servers,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";
import { getLatestRemoteHealthObservation } from "../health/get-latest-remote-health.js";

const RECENT_ACTIVITY_MS = 365 * 24 * 60 * 60 * 1_000;
const NON_LICENSE_IDENTIFIERS = new Set(["NONE", "NOASSERTION"]);

export const TRUST_SIGNAL_ORDER: readonly TrustSignalKey[] = [
  "official_registry",
  "publisher_verified",
  "repository_available",
  "repository_archived",
  "open_source_license",
  "recent_repository_activity",
  "recent_release",
  "remote_reachable",
  "current_version_present",
  "package_present",
  "upstream_deleted",
];

type TrustSignal = TrustProfileV1["signals"][number];

export interface RefreshTrustProfileInput {
  readonly serverId: string;
  readonly observedAt: Date;
}

interface TrustFacts {
  readonly canonicalRegistryName: string | null;
  readonly currentVersionId: string | null;
  readonly listingStatus: string;
  readonly publisherVerificationState: string | null;
  readonly repositoryUrl: string | null;
  readonly license: { readonly spdx: string; readonly source: "registry" | "repository" } | null;
  readonly repository: {
    readonly isArchived: boolean | null;
    readonly licenseSpdx: string | null;
    readonly lastPushAt: Date | null;
    readonly lastReleaseAt: Date | null;
  } | null;
  readonly hasCurrentPackage: boolean;
}

function signal(
  key: TrustSignalKey,
  state: TrustSignal["state"],
  label: string,
  observedAt: Date,
  source: string,
  reason: string | null = null,
): TrustSignal {
  return { key, state, label, observedAt: observedAt.toISOString(), source, reason };
}

function recencySignal(
  key: "recent_repository_activity" | "recent_release",
  value: Date | null,
  observedAt: Date,
): TrustSignal {
  const isRelease = key === "recent_release";
  const label = isRelease ? "Recent release observed" : "Recent repository activity observed";
  if (!value) {
    return signal(
      key,
      "unknown",
      label,
      observedAt,
      "repository",
      isRelease
        ? "No release observation is available"
        : "No repository activity observation is available",
    );
  }
  const ageMs = observedAt.getTime() - value.getTime();
  if (ageMs < 0) {
    return signal(
      key,
      "unknown",
      label,
      observedAt,
      "repository",
      isRelease
        ? "Release timestamp is after the observation time"
        : "Repository activity timestamp is after the observation time",
    );
  }
  return signal(
    key,
    ageMs <= RECENT_ACTIVITY_MS ? "positive" : "warning",
    label,
    observedAt,
    "repository",
    value.toISOString(),
  );
}

function remoteReachabilitySignal(
  health: RemoteHealthObservationV1 | null,
  observedAt: Date,
): TrustSignal {
  if (!health) {
    return signal(
      "remote_reachable",
      "unknown",
      "Remote reachability observed",
      observedAt,
      "remote_probe",
      "No remote health observation is available",
    );
  }
  const state: TrustSignal["state"] =
    health.outcome === "healthy"
      ? "positive"
      : health.outcome === "degraded" ||
          health.outcome === "unreachable" ||
          health.outcome === "timed_out" ||
          health.outcome === "response_too_large"
        ? "warning"
        : "unknown";
  return signal(
    "remote_reachable",
    state,
    "Remote reachability observed",
    observedAt,
    "remote_probe",
    `${health.outcome} at ${health.checkedAt}`,
  );
}

function buildTrustSignals(
  facts: TrustFacts,
  health: RemoteHealthObservationV1 | null,
  observedAt: Date,
): TrustSignal[] {
  const publisherState: TrustSignal["state"] =
    facts.publisherVerificationState === "verified"
      ? "positive"
      : facts.publisherVerificationState === "rejected" ||
          facts.publisherVerificationState === "revoked"
        ? "warning"
        : "unknown";
  const isDeletedUpstream = facts.listingStatus === "deleted_upstream";

  return [
    signal(
      "official_registry",
      facts.canonicalRegistryName ? (isDeletedUpstream ? "neutral" : "positive") : "unknown",
      "Official MCP Registry identity observed",
      observedAt,
      "registry",
      isDeletedUpstream
        ? "Listing was deleted upstream"
        : facts.canonicalRegistryName
          ? null
          : "No official Registry identity is available",
    ),
    signal(
      "publisher_verified",
      publisherState,
      "Publisher verification observed",
      observedAt,
      "publisher",
      facts.publisherVerificationState ?? "No publisher is associated with this listing",
    ),
    signal(
      "repository_available",
      facts.repository ? "positive" : "unknown",
      "Source repository available",
      observedAt,
      "repository",
      facts.repository
        ? null
        : facts.repositoryUrl
          ? "Repository metadata has not been observed"
          : "No repository is declared",
    ),
    signal(
      "repository_archived",
      facts.repository?.isArchived === true
        ? "warning"
        : facts.repository?.isArchived === false
          ? "positive"
          : "unknown",
      "Repository archive state observed",
      observedAt,
      "repository",
      facts.repository?.isArchived === null || !facts.repository
        ? "Repository archive state is unavailable"
        : null,
    ),
    signal(
      "open_source_license",
      facts.license ? "positive" : "unknown",
      "Open-source license metadata available",
      observedAt,
      facts.license?.source ?? "repository",
      facts.license?.spdx ?? "No recognized license metadata is available",
    ),
    recencySignal("recent_repository_activity", facts.repository?.lastPushAt ?? null, observedAt),
    recencySignal("recent_release", facts.repository?.lastReleaseAt ?? null, observedAt),
    remoteReachabilitySignal(health, observedAt),
    signal(
      "current_version_present",
      facts.currentVersionId ? "positive" : "warning",
      "Current version present",
      observedAt,
      "registry",
      facts.currentVersionId ? null : "No current version is available",
    ),
    signal(
      "package_present",
      facts.hasCurrentPackage ? "positive" : facts.currentVersionId ? "warning" : "unknown",
      "Current package metadata present",
      observedAt,
      "registry",
      facts.hasCurrentPackage ? null : "No package is available for the current version",
    ),
    signal(
      "upstream_deleted",
      facts.listingStatus === "deleted_upstream" ? "negative" : "neutral",
      "Upstream listing state observed",
      observedAt,
      "registry",
      facts.listingStatus === "deleted_upstream" ? "Listing was deleted upstream" : null,
    ),
  ];
}

function recognizedLicense(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized && !NON_LICENSE_IDENTIFIERS.has(normalized.toUpperCase()) ? normalized : null;
}

type TrustReadDatabase = Pick<Database, "select">;

async function loadTrustFacts(db: TrustReadDatabase, serverId: string): Promise<TrustFacts> {
  const [server] = await db
    .select({
      canonicalRegistryName: servers.canonicalRegistryName,
      currentVersionId: serverVersions.id,
      listingStatus: servers.listingStatus,
      publisherVerificationState: publishers.verificationState,
      repositoryUrl: servers.repositoryUrl,
      repositorySource: servers.repositorySource,
      repositoryExternalId: servers.repositoryExternalId,
      serverLicenseSpdx: servers.licenseSpdx,
    })
    .from(servers)
    .leftJoin(publishers, eq(publishers.id, servers.publisherId))
    .leftJoin(
      serverVersions,
      and(eq(serverVersions.id, servers.currentVersionId), eq(serverVersions.serverId, servers.id)),
    )
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!server) throw new Error(`Server not found: ${serverId}`);

  const [repository] =
    server.repositorySource && server.repositoryExternalId
      ? await db
          .select({
            isArchived: repositorySnapshots.isArchived,
            licenseSpdx: repositorySnapshots.licenseSpdx,
            lastPushAt: repositorySnapshots.lastPushAt,
            lastReleaseAt: repositorySnapshots.lastReleaseAt,
          })
          .from(repositorySnapshots)
          .where(
            and(
              eq(repositorySnapshots.serverId, serverId),
              eq(repositorySnapshots.provider, server.repositorySource),
              eq(repositorySnapshots.externalRepositoryId, server.repositoryExternalId),
            ),
          )
          .orderBy(
            desc(repositorySnapshots.checkedAt),
            desc(repositorySnapshots.createdAt),
            desc(repositorySnapshots.id),
          )
          .limit(1)
      : [];
  const currentPackage = server.currentVersionId
    ? await db
        .select({ id: serverPackages.id })
        .from(serverPackages)
        .where(eq(serverPackages.serverVersionId, server.currentVersionId))
        .limit(1)
    : [];

  const repositoryLicense = recognizedLicense(repository?.licenseSpdx ?? null);
  const registryLicense = recognizedLicense(server.serverLicenseSpdx);
  return {
    canonicalRegistryName: server.canonicalRegistryName,
    currentVersionId: server.currentVersionId,
    listingStatus: server.listingStatus,
    publisherVerificationState: server.publisherVerificationState,
    repositoryUrl: server.repositoryUrl,
    license: repositoryLicense
      ? { spdx: repositoryLicense, source: "repository" }
      : registryLicense
        ? { spdx: registryLicense, source: "registry" }
        : null,
    repository: repository ?? null,
    hasCurrentPackage: currentPackage.length > 0,
  };
}

export async function refreshTrustProfile(
  db: Database,
  input: RefreshTrustProfileInput,
): Promise<TrustProfileV1> {
  if (Number.isNaN(input.observedAt.getTime())) {
    throw new TypeError("observedAt must be a valid date");
  }

  return db.transaction(
    async (transaction) => {
      const facts = await loadTrustFacts(transaction, input.serverId);
      const latestHealth = facts.currentVersionId
        ? await getLatestRemoteHealthObservation(
            transaction,
            input.serverId,
            facts.currentVersionId,
          )
        : null;
      const profile = TrustProfileV1Schema.parse({
        schemaVersion: 1,
        signals: buildTrustSignals(facts, latestHealth, input.observedAt),
      });

      for (const item of profile.signals) {
        await transaction
          .insert(trustSignals)
          .values({
            serverId: input.serverId,
            serverVersionId: facts.currentVersionId,
            signalKey: item.key,
            status: item.state,
            source: item.source,
            summary: item.label,
            details: item.reason,
            checkedAt: input.observedAt,
          })
          .onConflictDoUpdate({
            target: [trustSignals.serverId, trustSignals.signalKey, trustSignals.checkedAt],
            set: {
              serverVersionId: facts.currentVersionId,
              status: item.state,
              source: item.source,
              summary: item.label,
              details: item.reason,
              updatedAt: new Date(),
            },
          });
      }
      return profile;
    },
    { isolationLevel: "repeatable read" },
  );
}
