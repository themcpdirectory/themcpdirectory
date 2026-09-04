import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  publishers,
  repositorySnapshots,
  serverHealthChecks,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";
import { getCurrentTrustProfile } from "../get-current-trust-profile.js";
import { refreshTrustProfile } from "../refresh-trust-profile.js";

describe("refreshTrustProfile integration", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;
  let serverId: string;

  beforeEach(async () => {
    const temp = await createTempDatabase("task6_trust_profile");
    db = temp.db;
    destroy = temp.destroy;

    const fixtureTime = new Date("2026-08-31T12:00:00.000Z");
    const [publisher] = await db
      .insert(publishers)
      .values({
        slug: "verified-publisher",
        displayName: "Verified Publisher",
        verificationState: "verified",
      })
      .returning({ id: publishers.id });
    if (!publisher) throw new Error("expected publisher fixture");

    const [server] = await db
      .insert(servers)
      .values({
        slug: "trust-profile-target",
        title: "Trust Profile Target",
        shortDescription: "Trust profile fixture",
        canonicalRegistryName: "io.example/trust-profile-target",
        publisherId: publisher.id,
        listingStatus: "active",
        moderationStatus: "normal",
        repositoryUrl: "https://github.com/example/trust-profile-target",
        repositorySource: "github",
        repositoryExternalId: "repository-1",
        licenseSpdx: "Apache-2.0",
        firstSeenAt: fixtureTime,
        lastSeenAt: fixtureTime,
      })
      .returning({ id: servers.id });
    if (!server) throw new Error("expected server fixture");
    serverId = server.id;

    const [version] = await db
      .insert(serverVersions)
      .values({
        serverId,
        version: "1.0.0",
        upstreamStatus: "active",
        firstSeenAt: fixtureTime,
        lastSeenAt: fixtureTime,
        normalizedPayload: {},
      })
      .returning({ id: serverVersions.id });
    if (!version) throw new Error("expected version fixture");

    await db.update(servers).set({ currentVersionId: version.id }).where(eq(servers.id, serverId));
    await db.insert(serverPackages).values({
      serverVersionId: version.id,
      registryType: "npm",
      identifier: "@example/trust-profile-target",
      version: "1.0.0",
      transportType: "stdio",
    });
    await db.insert(repositorySnapshots).values({
      serverId,
      provider: "github",
      externalRepositoryId: "repository-1",
      owner: "example",
      name: "trust-profile-target",
      url: "https://github.com/example/trust-profile-target",
      isArchived: false,
      licenseSpdx: "NOASSERTION",
      lastPushAt: new Date("2026-09-02T12:00:00.000Z"),
      lastReleaseAt: null,
      checkedAt: fixtureTime,
    });
    await db.insert(repositorySnapshots).values({
      serverId,
      provider: "github",
      externalRepositoryId: "stale-repository",
      owner: "former-owner",
      name: "stale-repository",
      url: "https://github.com/former-owner/stale-repository",
      isArchived: true,
      licenseSpdx: "MIT",
      lastPushAt: fixtureTime,
      checkedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    const [remote] = await db
      .insert(serverRemotes)
      .values({
        serverVersionId: version.id,
        transportType: "streamable-http",
        urlTemplate: "https://api.example.com/mcp",
      })
      .returning({ id: serverRemotes.id });
    if (!remote) throw new Error("expected remote fixture");
    await db.insert(serverHealthChecks).values({
      serverId,
      serverVersionId: version.id,
      remoteId: remote.id,
      checkType: "remote_probe",
      status: "healthy",
      checkedAt: fixtureTime,
    });
    const [oldVersion] = await db
      .insert(serverVersions)
      .values({
        serverId,
        version: "0.9.0",
        upstreamStatus: "active",
        firstSeenAt: fixtureTime,
        lastSeenAt: fixtureTime,
        normalizedPayload: {},
      })
      .returning({ id: serverVersions.id });
    if (!oldVersion) throw new Error("expected old version fixture");
    const [oldRemote] = await db
      .insert(serverRemotes)
      .values({
        serverVersionId: oldVersion.id,
        transportType: "streamable-http",
        urlTemplate: "https://old.example.com/mcp",
      })
      .returning({ id: serverRemotes.id });
    if (!oldRemote) throw new Error("expected old remote fixture");
    await db.insert(serverHealthChecks).values({
      serverId,
      serverVersionId: oldVersion.id,
      remoteId: oldRemote.id,
      checkType: "remote_probe",
      status: "unreachable",
      checkedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    await db.insert(trustSignals).values([
      {
        serverId,
        signalKey: "official_registry",
        status: "unknown",
        checkedAt: null,
      },
      {
        serverId,
        signalKey: "future_signal_key",
        status: "positive",
        summary: "Future signal",
        source: "future",
        checkedAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    ]);
  });

  afterEach(async () => {
    if (destroy) await destroy();
    destroy = undefined;
  });

  it("derives ordered factual signals, preserves unknown evidence, and stays idempotent", async () => {
    const observedAt = new Date("2026-09-01T18:30:00.000Z");

    const first = await refreshTrustProfile(db, { serverId, observedAt });
    const second = await refreshTrustProfile(db, { serverId, observedAt });

    expect(second).toEqual(first);
    expect(first.signals.map((signal) => signal.key)).toEqual([
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
    ]);
    expect(first).not.toHaveProperty("aggregateScore");
    expect(first.signals.find((signal) => signal.key === "recent_release")).toMatchObject({
      state: "unknown",
      reason: "No release observation is available",
    });
    expect(first.signals.find((signal) => signal.key === "remote_reachable")).toMatchObject({
      state: "positive",
      source: "remote_probe",
    });
    expect(first.signals.find((signal) => signal.key === "open_source_license")).toMatchObject({
      state: "positive",
      source: "registry",
      reason: "Apache-2.0",
    });
    expect(
      first.signals.find((signal) => signal.key === "recent_repository_activity"),
    ).toMatchObject({
      state: "unknown",
      reason: "Repository activity timestamp is after the observation time",
    });

    const [rowCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trustSignals)
      .where(eq(trustSignals.serverId, serverId));
    expect(rowCount?.count).toBe(13);
    await expect(getCurrentTrustProfile(db, serverId)).resolves.toEqual(first);

    const [otherServer] = await db
      .insert(servers)
      .values({
        slug: "other-server",
        title: "Other Server",
        shortDescription: "Foreign current version owner",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning({ id: servers.id });
    if (!otherServer) throw new Error("expected other server fixture");
    const [foreignVersion] = await db
      .insert(serverVersions)
      .values({
        serverId: otherServer.id,
        version: "2.0.0",
        upstreamStatus: "active",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        normalizedPayload: {},
      })
      .returning({ id: serverVersions.id });
    if (!foreignVersion) throw new Error("expected foreign version fixture");
    await db
      .update(servers)
      .set({ currentVersionId: foreignVersion.id, listingStatus: "deleted_upstream" })
      .where(eq(servers.id, serverId));

    const changed = await refreshTrustProfile(db, {
      serverId,
      observedAt: new Date("2026-09-01T19:00:00.000Z"),
    });
    expect(changed.signals.find((signal) => signal.key === "official_registry")?.state).not.toBe(
      "positive",
    );
    expect(changed.signals.find((signal) => signal.key === "current_version_present")?.state).toBe(
      "warning",
    );
    expect(changed.signals.find((signal) => signal.key === "package_present")?.state).toBe(
      "unknown",
    );
    expect(changed.signals.find((signal) => signal.key === "remote_reachable")?.state).toBe(
      "unknown",
    );
    expect(changed.signals.find((signal) => signal.key === "upstream_deleted")?.state).toBe(
      "negative",
    );
  });
});
