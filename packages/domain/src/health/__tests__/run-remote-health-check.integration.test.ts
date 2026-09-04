import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  serverHealthChecks,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import type { PinnedDispatcherOptions, ProbeFetch } from "@themcpdirectory/security";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";
import { getLatestRemoteHealthObservation } from "../get-latest-remote-health.js";
import { runRemoteHealthCheck } from "../run-remote-health-check.js";

describe("runRemoteHealthCheck integration", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;
  let serverId: string;
  let remoteId: string;
  let stdioRemoteId: string;

  beforeEach(async () => {
    const temp = await createTempDatabase("task5_remote_health");
    db = temp.db;
    destroy = temp.destroy;

    const observedAt = new Date("2026-09-01T17:00:00.000Z");
    const [server] = await db
      .insert(servers)
      .values({
        slug: "health-check-target",
        title: "Health Check Target",
        shortDescription: "Remote health fixture",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
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
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        normalizedPayload: {},
      })
      .returning({ id: serverVersions.id });
    if (!version) throw new Error("expected version fixture");
    await db.update(servers).set({ currentVersionId: version.id }).where(eq(servers.id, serverId));

    const remotes = await db
      .insert(serverRemotes)
      .values([
        {
          serverVersionId: version.id,
          transportType: "streamable-http",
          urlTemplate: "https://origin.example.com/health",
        },
        {
          serverVersionId: version.id,
          transportType: "stdio",
          urlTemplate: "npx @example/server",
        },
      ])
      .returning({ id: serverRemotes.id, transportType: serverRemotes.transportType });
    remoteId = remotes.find((remote) => remote.transportType === "streamable-http")!.id;
    stdioRemoteId = remotes.find((remote) => remote.transportType === "stdio")!.id;
  });

  afterEach(async () => {
    if (destroy) await destroy();
    destroy = undefined;
  });

  it("forwards probe limits through HEAD-to-GET fallback and persists idempotently", async () => {
    const checkedAt = new Date("2026-09-01T18:00:00.000Z");
    const requests: string[] = [];
    const dispatcherOptions: PinnedDispatcherOptions[] = [];
    const fetchImpl = vi.fn<ProbeFetch>(async (_input, init) => {
      requests.push(init?.method ?? "missing");
      return init?.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response(null, { status: 204 });
    });
    const input = {
      serverId,
      remoteId,
      checkedAt,
      resolve: async () => ["93.184.216.34"],
      fetchImpl,
      probeOptions: {
        connectTimeoutMs: 17,
        totalTimeoutMs: 113,
        maxRedirects: 1,
        maxHeaderBytes: 257,
        maxResponseBytes: 509,
        maxDecompressedBytes: 1_021,
        dispatcherFactory: (options: PinnedDispatcherOptions) => {
          dispatcherOptions.push(options);
          return undefined;
        },
      },
    } as const;

    const first = await runRemoteHealthCheck(db, input);
    const second = await runRemoteHealthCheck(db, input);

    expect(first).toMatchObject({ outcome: "healthy", methodUsed: "GET", httpStatus: 204 });
    expect(second).toMatchObject({ outcome: "healthy", methodUsed: "GET", httpStatus: 204 });
    expect(requests).toEqual(["HEAD", "GET", "HEAD", "GET"]);
    expect(dispatcherOptions).toHaveLength(4);
    expect(dispatcherOptions).toEqual(
      dispatcherOptions.map((options) => ({
        ...options,
        connectTimeoutMs: 17,
        maxHeaderBytes: 257,
        maxResponseBytes: 509,
      })),
    );

    const rows = await db
      .select()
      .from(serverHealthChecks)
      .where(eq(serverHealthChecks.remoteId, remoteId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.checkType).toBe("remote_probe");
    await expect(getLatestRemoteHealthObservation(db, serverId)).resolves.toMatchObject({
      schemaVersion: 1,
      outcome: "healthy",
      checkedAt: "2026-09-01T18:00:00.000Z",
      httpStatus: 204,
      finalOrigin: "https://origin.example.com",
      redirectCount: 0,
    });

    const deadlineStartedAt = Date.now();
    let getAbortedAt = Number.POSITIVE_INFINITY;
    const deadlineFetch = vi.fn<ProbeFetch>(async (_input, init) => {
      if (init?.method === "HEAD") {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return new Response(null, { status: 405 });
      }
      await new Promise<void>((_resolve, reject) => {
        init?.signal.addEventListener(
          "abort",
          () => {
            getAbortedAt = Date.now();
            reject(init.signal.reason);
          },
          { once: true },
        );
      });
      throw new Error("unreachable");
    });
    await expect(
      runRemoteHealthCheck(db, {
        ...input,
        checkedAt: new Date("2026-09-01T18:01:00.000Z"),
        fetchImpl: deadlineFetch,
        probeOptions: { ...input.probeOptions, totalTimeoutMs: 100 },
      }),
    ).resolves.toMatchObject({ outcome: "timed_out", methodUsed: "GET" });
    expect(getAbortedAt - deadlineStartedAt).toBeLessThan(145);

    const realNow = Date.now();
    let logicalNow = realNow;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => logicalNow);
    const expiredRequests: string[] = [];
    const expiredAfterHeadFetch = vi.fn<ProbeFetch>(async (_input, init) => {
      expiredRequests.push(init?.method ?? "missing");
      logicalNow = realNow + 101;
      return new Response(null, { status: init?.method === "HEAD" ? 405 : 204 });
    });
    try {
      await expect(
        runRemoteHealthCheck(db, {
          ...input,
          checkedAt: new Date("2026-09-01T18:01:30.000Z"),
          fetchImpl: expiredAfterHeadFetch,
          probeOptions: { ...input.probeOptions, totalTimeoutMs: 100 },
        }),
      ).resolves.toMatchObject({ outcome: "timed_out", methodUsed: "HEAD" });
    } finally {
      dateNow.mockRestore();
    }
    expect(expiredRequests).toEqual(["HEAD"]);

    await expect(
      Promise.race([
        runRemoteHealthCheck(db, {
          ...input,
          checkedAt: new Date("2026-09-01T18:02:00.000Z"),
          resolve: () => new Promise<string[]>(() => {}),
          probeOptions: { ...input.probeOptions, totalTimeoutMs: 25 },
        }),
        new Promise((resolve) =>
          setTimeout(() => resolve({ outcome: "eligibility_timeout_stalled" }), 150),
        ),
      ]),
    ).resolves.toMatchObject({ outcome: "timed_out", methodUsed: null });

    await db
      .update(serverRemotes)
      .set({ urlTemplate: "https://changed.example.com/health" })
      .where(eq(serverRemotes.id, remoteId));
    const changedResolve = vi.fn(async () => ["93.184.216.34"]);
    const changedFetch = vi.fn<ProbeFetch>();
    await expect(
      runRemoteHealthCheck(db, {
        ...input,
        expectedUrl: "https://origin.example.com/health",
        checkedAt: new Date("2026-09-01T18:02:30.000Z"),
        resolve: changedResolve,
        fetchImpl: changedFetch,
      }),
    ).rejects.toThrow("Remote health-check target changed before execution.");
    expect(changedResolve).not.toHaveBeenCalled();
    expect(changedFetch).not.toHaveBeenCalled();

    await db
      .update(serverRemotes)
      .set({ urlTemplate: "https://origin.example.com/health" })
      .where(eq(serverRemotes.id, remoteId));
    const racingResolve = vi.fn(async () => {
      await db
        .update(serverRemotes)
        .set({ urlTemplate: "https://raced.example.com/health" })
        .where(eq(serverRemotes.id, remoteId));
      return ["93.184.216.34"];
    });
    const racingFetch = vi.fn<ProbeFetch>();
    await expect(
      runRemoteHealthCheck(db, {
        ...input,
        expectedUrl: "https://origin.example.com/health",
        checkedAt: new Date("2026-09-01T18:02:45.000Z"),
        resolve: racingResolve,
        fetchImpl: racingFetch,
      }),
    ).rejects.toThrow("Remote health-check target changed before execution.");
    expect(racingFetch).not.toHaveBeenCalled();

    await db
      .update(serverRemotes)
      .set({ urlTemplate: "https://origin.example.com/health" })
      .where(eq(serverRemotes.id, remoteId));
    const inactiveResolve = vi.fn(async () => {
      await db
        .update(servers)
        .set({ listingStatus: "deleted_upstream" })
        .where(eq(servers.id, serverId));
      return ["93.184.216.34"];
    });
    const inactiveFetch = vi.fn<ProbeFetch>();
    await expect(
      runRemoteHealthCheck(db, {
        ...input,
        expectedUrl: "https://origin.example.com/health",
        checkedAt: new Date("2026-09-01T18:02:50.000Z"),
        resolve: inactiveResolve,
        fetchImpl: inactiveFetch,
      }),
    ).rejects.toThrow("Remote health-check target is no longer active.");
    expect(inactiveFetch).not.toHaveBeenCalled();

    const [nextVersion] = await db
      .insert(serverVersions)
      .values({
        serverId,
        version: "2.0.0",
        upstreamStatus: "active",
        firstSeenAt: checkedAt,
        lastSeenAt: checkedAt,
        normalizedPayload: {},
      })
      .returning({ id: serverVersions.id });
    if (!nextVersion) throw new Error("expected next version fixture");
    await db
      .update(servers)
      .set({ currentVersionId: nextVersion.id, listingStatus: "active" })
      .where(eq(servers.id, serverId));

    const staleResolve = vi.fn(async () => ["93.184.216.34"]);
    const staleFetch = vi.fn<ProbeFetch>();
    await expect(
      runRemoteHealthCheck(db, {
        ...input,
        checkedAt: new Date("2026-09-01T18:03:00.000Z"),
        resolve: staleResolve,
        fetchImpl: staleFetch,
      }),
    ).rejects.toThrow("Remote health-check target was not found.");
    expect(staleResolve).not.toHaveBeenCalled();
    expect(staleFetch).not.toHaveBeenCalled();
  });

  it("persists stdio as unsupported before network, package, or process side effects", async () => {
    const resolve = vi.fn(async () => ["93.184.216.34"]);
    const fetchImpl = vi.fn<ProbeFetch>();
    const forbiddenStdioSideEffects = {
      resolvePackage: vi.fn(),
      importPackage: vi.fn(),
      inspectPackage: vi.fn(),
      installPackage: vi.fn(),
      executeProcess: vi.fn(),
    };

    await expect(
      runRemoteHealthCheck(db, {
        serverId,
        remoteId: stdioRemoteId,
        checkedAt: new Date("2026-09-01T18:10:00.000Z"),
        resolve,
        fetchImpl,
        probeOptions: {
          connectTimeoutMs: 17,
          totalTimeoutMs: 113,
          maxRedirects: 1,
          maxHeaderBytes: 257,
          maxResponseBytes: 509,
          maxDecompressedBytes: 1_021,
        },
        forbiddenStdioSideEffects,
      }),
    ).resolves.toMatchObject({ outcome: "unsupported", methodUsed: null });

    expect(resolve).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const sideEffect of Object.values(forbiddenStdioSideEffects)) {
      expect(sideEffect).not.toHaveBeenCalled();
    }
  });
});
