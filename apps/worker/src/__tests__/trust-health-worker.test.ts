import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import {
  legalHolds,
  serverHealthChecks,
  servers,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";
import {
  REMOTE_PROBE_POLICY,
  createPerOriginProbeLimiter,
  nextRemoteHealthRetryDelayMs,
} from "../trust-health-config.js";
import { cleanupHealthHistory, cleanupTrustHistory } from "../retention.js";
import {
  REMOTE_HEALTH_QUEUE,
  TRUST_REFRESH_QUEUE,
  parseRemoteHealthJob,
  remoteHealthRetrySingletonKey,
  runRemoteHealthJob,
} from "../trust-health-jobs.js";
import { createTempDatabase } from "./postgres-test-db.js";

describe("trust and health worker", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const temp = await createTempDatabase("task9_trust_health_worker");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterAll(async () => {
    await destroy?.();
  });

  it("owns queue policy, bounded jitter, and per-origin concurrency", async () => {
    expect(REMOTE_HEALTH_QUEUE).toBe("remote.health");
    expect(TRUST_REFRESH_QUEUE).toBe("trust.refresh");
    expect(REMOTE_PROBE_POLICY.maxConcurrentPerOrigin).toBe(2);
    expect(nextRemoteHealthRetryDelayMs(0, () => 0)).toBe(30_000);
    expect(nextRemoteHealthRetryDelayMs(2, () => 0.5)).toBe(135_000);
    const retryChainId = "5c1f11de-3a98-4432-ae60-c421123f0138";
    expect(
      parseRemoteHealthJob({
        serverId: "b8169fc2-8d87-4589-8d09-ddb2b37aad34",
        remoteId: "7a2e66bd-7588-44a5-9473-92a927f60432",
        retriesConsumed: 1,
        retryChainId,
      }),
    ).toMatchObject({ retriesConsumed: 1, retryChainId });
    expect(
      remoteHealthRetrySingletonKey("7a2e66bd-7588-44a5-9473-92a927f60432", retryChainId, 1),
    ).not.toBe(
      remoteHealthRetrySingletonKey(
        "7a2e66bd-7588-44a5-9473-92a927f60432",
        "b7ca1a37-0b13-4850-a0a5-289b1e69e006",
        1,
      ),
    );

    const limiter = createPerOriginProbeLimiter(1);
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = limiter.withKey("https://api.example.com", async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push("first:end");
    });
    const sameOrigin = limiter.withKey("https://api.example.com", async () => {
      events.push("same:start");
    });
    const otherOrigin = limiter.withKey("https://other.example.com", async () => {
      events.push("other:start");
    });

    await otherOrigin;
    expect(events).toEqual(["first:start", "other:start"]);
    releaseFirst?.();
    await Promise.all([first, sameOrigin]);
    expect(events).toEqual(["first:start", "other:start", "first:end", "same:start"]);
  });

  it("passes the worker-owned probe policy into health execution", async () => {
    const checkedAt = new Date("2026-12-31T00:00:00.000Z");
    const resolve = vi.fn(async () => ["203.0.113.10"]);
    const observation = {
      schemaVersion: 1,
      outcome: "healthy",
      checkedAt: checkedAt.toISOString(),
      durationMs: 10,
      httpStatus: 200,
      finalOrigin: "https://api.example.com",
      redirectCount: 0,
      methodUsed: "HEAD",
      errorCode: null,
      errorSummary: null,
    } as const;
    const runHealthCheck = vi.fn(async () => observation);

    await runRemoteHealthJob(
      {
        db,
        clock: () => checkedAt,
        resolve,
        originProbeLimiter: createPerOriginProbeLimiter(REMOTE_PROBE_POLICY.maxConcurrentPerOrigin),
        runRemoteHealthCheck: runHealthCheck,
      },
      {
        serverId: "b8169fc2-8d87-4589-8d09-ddb2b37aad34",
        remoteId: "7a2e66bd-7588-44a5-9473-92a927f60432",
        url: "https://api.example.com/health?internal=true",
      },
    );

    expect(runHealthCheck).toHaveBeenCalledWith(db, {
      serverId: "b8169fc2-8d87-4589-8d09-ddb2b37aad34",
      remoteId: "7a2e66bd-7588-44a5-9473-92a927f60432",
      expectedUrl: "https://api.example.com/health?internal=true",
      checkedAt,
      resolve,
      withOriginLimit: expect.any(Function),
      probeOptions: REMOTE_PROBE_POLICY,
    });
  });

  it("cleans expired health in bounded batches while preserving held history", async () => {
    const now = new Date("2026-12-31T00:00:00.000Z");
    const [deletable, held] = await db
      .insert(servers)
      .values([
        {
          slug: "retention-health-delete",
          title: "Retention health delete",
          shortDescription: "Health retention fixture",
          listingStatus: "active",
          moderationStatus: "normal",
          firstSeenAt: now,
          lastSeenAt: now,
        },
        {
          slug: "retention-health-held",
          title: "Retention health held",
          shortDescription: "Held health retention fixture",
          listingStatus: "active",
          moderationStatus: "normal",
          firstSeenAt: now,
          lastSeenAt: now,
        },
      ])
      .returning({ id: servers.id });
    if (!deletable || !held) throw new Error("expected health retention servers");

    await db.insert(serverHealthChecks).values([
      {
        serverId: deletable.id,
        checkType: "remote_probe",
        status: "healthy",
        checkedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        checkType: "remote_probe",
        status: "unreachable",
        checkedAt: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        checkType: "remote_probe",
        status: "healthy",
        checkedAt: new Date("2026-12-30T00:00:00.000Z"),
      },
      {
        serverId: held.id,
        checkType: "remote_probe",
        status: "degraded",
        checkedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);
    await db.insert(legalHolds).values({
      scope: "health_history",
      subjectType: "server",
      subjectId: held.id,
      reason: "incident review",
      expiresAt: new Date("2027-01-31T00:00:00.000Z"),
      createdBy: "worker-test",
    });

    const first = await cleanupHealthHistory(db, { now, batchSize: 1 });
    const second = await cleanupHealthHistory(db, { now, batchSize: 1 });
    const third = await cleanupHealthHistory(db, { now, batchSize: 1 });

    expect(first).toEqual({ deletedCount: 1, skippedHeldCount: 1, done: false });
    expect(second).toEqual({ deletedCount: 1, skippedHeldCount: 1, done: true });
    expect(third).toEqual({ deletedCount: 0, skippedHeldCount: 1, done: true });
    const remaining = await db
      .select({ serverId: serverHealthChecks.serverId, checkedAt: serverHealthChecks.checkedAt })
      .from(serverHealthChecks)
      .orderBy(asc(serverHealthChecks.checkedAt));
    expect(remaining).toEqual([
      { serverId: held.id, checkedAt: new Date("2026-08-01T00:00:00.000Z") },
      { serverId: deletable.id, checkedAt: new Date("2026-12-30T00:00:00.000Z") },
    ]);
  });

  it("deletes only superseded trust history and remains idempotent under legal hold", async () => {
    const now = new Date("2028-09-02T00:00:00.000Z");
    const [deletable, held] = await db
      .insert(servers)
      .values([
        {
          slug: "retention-trust-delete",
          title: "Retention trust delete",
          shortDescription: "Trust retention fixture",
          listingStatus: "active",
          moderationStatus: "normal",
          firstSeenAt: now,
          lastSeenAt: now,
        },
        {
          slug: "retention-trust-held",
          title: "Retention trust held",
          shortDescription: "Held trust retention fixture",
          listingStatus: "active",
          moderationStatus: "normal",
          firstSeenAt: now,
          lastSeenAt: now,
        },
      ])
      .returning({ id: servers.id });
    if (!deletable || !held) throw new Error("expected trust retention servers");

    await db.insert(trustSignals).values([
      {
        serverId: deletable.id,
        signalKey: "remote_reachable",
        status: "positive",
        source: "remote_probe",
        summary: "Remote reachable",
        checkedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        signalKey: "remote_reachable",
        status: "neutral",
        source: "remote_probe",
        summary: "Remote status neutral",
        checkedAt: new Date("2028-08-01T00:00:00.000Z"),
      },
      {
        serverId: held.id,
        signalKey: "remote_reachable",
        status: "warning",
        source: "remote_probe",
        summary: "Remote warning",
        checkedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        serverId: held.id,
        signalKey: "remote_reachable",
        status: "positive",
        source: "remote_probe",
        summary: "Remote reachable",
        checkedAt: new Date("2028-08-01T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        signalKey: "repository_available",
        status: "positive",
        source: "github",
        summary: "Repository available",
        checkedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        signalKey: "repository_available",
        status: "unknown",
        checkedAt: new Date("2028-08-02T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        signalKey: "official_registry",
        status: "unknown",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        serverId: deletable.id,
        signalKey: "official_registry",
        status: "positive",
        source: "registry",
        summary: "Listed in the official registry",
        checkedAt: new Date("2028-08-02T00:00:00.000Z"),
      },
    ]);
    await db.insert(legalHolds).values({
      scope: "trust_history",
      subjectType: "server",
      subjectId: held.id,
      reason: "trust investigation",
      expiresAt: new Date("2028-12-31T00:00:00.000Z"),
      createdBy: "worker-test",
    });

    const first = await cleanupTrustHistory(db, { now, batchSize: 100 });
    const second = await cleanupTrustHistory(db, { now, batchSize: 100 });

    expect(first).toEqual({ deletedCount: 2, skippedHeldCount: 1, done: true });
    expect(second).toEqual({ deletedCount: 0, skippedHeldCount: 1, done: true });
    const remaining = await db
      .select({ serverId: trustSignals.serverId, checkedAt: trustSignals.checkedAt })
      .from(trustSignals)
      .where(eq(trustSignals.signalKey, "remote_reachable"))
      .orderBy(asc(trustSignals.checkedAt), asc(trustSignals.serverId));
    expect(remaining).toHaveLength(3);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { serverId: held.id, checkedAt: new Date("2026-08-01T00:00:00.000Z") },
        { serverId: held.id, checkedAt: new Date("2028-08-01T00:00:00.000Z") },
        { serverId: deletable.id, checkedAt: new Date("2028-08-01T00:00:00.000Z") },
      ]),
    );
  });
});
