import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import PgBoss from "pg-boss";
import { repositorySnapshots, servers, type Database } from "@themcpdirectory/db";
import { GitHubRepositoryUnavailableError } from "@themcpdirectory/domain";
import {
  GITHUB_ENRICH_QUEUE,
  GITHUB_ENRICH_QUEUE_OPTIONS,
  GitHubEnrichJobDataError,
  GitHubEnrichmentDeferralError,
  deferGitHubEnrichment,
  enqueueGitHubEnrichment,
  handleGitHubEnrichJob,
  parseGitHubEnrichJobData,
  processGitHubEnrichJob,
  type GitHubEnrichJobData,
} from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";

const REPOSITORY_RESPONSE = {
  id: 12_345_678,
  name: "worker-server",
  full_name: "example/worker-server",
  html_url: "https://github.com/example/worker-server",
  default_branch: "main",
  archived: false,
  fork: false,
  stargazers_count: 42,
  forks_count: 7,
  open_issues_count: 3,
  license: { spdx_id: "MIT" },
  pushed_at: "2026-08-31T10:00:00Z",
  owner: { login: "example" },
};

function makeGitHubFetch(repositoryStatus = 200): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/releases/latest")) {
      return new Response(null, { status: 404 });
    }
    return Response.json(
      repositoryStatus === 200 ? REPOSITORY_RESPONSE : { message: "Not Found" },
      { status: repositoryStatus },
    );
  };
}

describe("GitHub enrichment worker", () => {
  let db: Database;
  let databaseUrl: string;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task9_github_worker");
    db = temp.db;
    databaseUrl = temp.databaseUrl;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("defines the queue retry policy", () => {
    expect(GITHUB_ENRICH_QUEUE).toBe("github.enrich");
    expect(GITHUB_ENRICH_QUEUE_OPTIONS).toEqual({
      policy: "short",
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
    });
  });

  it("deduplicates pending jobs by server ID", async () => {
    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    try {
      await boss.createQueue(GITHUB_ENRICH_QUEUE, {
        name: GITHUB_ENRICH_QUEUE,
        ...GITHUB_ENRICH_QUEUE_OPTIONS,
      });

      const serverId = "b8169fc2-8d87-4589-8d09-ddb2b37aad34";
      const firstId = await enqueueGitHubEnrichment(boss, serverId);
      const duplicateId = await enqueueGitHubEnrichment(boss, serverId);

      expect(firstId).toEqual(expect.any(String));
      expect(duplicateId).toBeNull();
    } finally {
      await boss.stop({ graceful: true });
    }
  });

  it("persists the original check time on deferred jobs", async () => {
    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    try {
      await boss.createQueue(GITHUB_ENRICH_QUEUE, {
        name: GITHUB_ENRICH_QUEUE,
        ...GITHUB_ENRICH_QUEUE_OPTIONS,
      });

      const serverId = "b8169fc2-8d87-4589-8d09-ddb2b37aad34";
      const checkedAt = new Date("2026-08-31T11:00:00.000Z");
      const startAfter = new Date("2099-08-31T12:00:00.000Z");
      const jobId = await enqueueGitHubEnrichment(boss, serverId, { checkedAt, startAfter });
      const job = await boss.getJobById<GitHubEnrichJobData>(GITHUB_ENRICH_QUEUE, jobId!);

      expect(job?.data).toEqual({ serverId, checkedAt: checkedAt.toISOString() });
      expect(job?.startAfter).toEqual(startAfter);
    } finally {
      await boss.stop({ graceful: true });
    }
  });

  it.each([undefined, null, {}, { serverId: "not-a-uuid" }])(
    "rejects malformed job data: %j",
    (data) => {
      expect(() => parseGitHubEnrichJobData(data)).toThrow(GitHubEnrichJobDataError);
    },
  );

  it("accepts only canonical checkedAt metadata", () => {
    const serverId = "b8169fc2-8d87-4589-8d09-ddb2b37aad34";
    const checkedAt = "2026-08-31T11:00:00.000Z";

    expect(parseGitHubEnrichJobData({ serverId, checkedAt })).toEqual({ serverId, checkedAt });
    expect(() => parseGitHubEnrichJobData({ serverId, checkedAt: "not-a-date" })).toThrow(
      GitHubEnrichJobDataError,
    );
    expect(parseGitHubEnrichJobData({ serverId, retriesConsumed: 3 })).toEqual({
      serverId,
      retriesConsumed: 3,
    });
    expect(() => parseGitHubEnrichJobData({ serverId, retriesConsumed: 6 })).toThrow(
      GitHubEnrichJobDataError,
    );
  });

  it("persists a repository snapshot", async () => {
    const [server] = await db
      .insert(servers)
      .values({
        slug: "github-worker-success",
        title: "GitHub worker success",
        shortDescription: "Registry-backed server",
        listingStatus: "active",
        moderationStatus: "normal",
        repositoryUrl: "https://github.com/example/worker-server",
        firstSeenAt: new Date("2026-08-31T09:00:00Z"),
        lastSeenAt: new Date("2026-08-31T09:00:00Z"),
      })
      .returning({ id: servers.id });

    const result = await processGitHubEnrichJob({
      db,
      jobData: { serverId: server!.id },
      checkedAt: new Date("2026-08-31T11:00:00Z"),
      fetchImpl: makeGitHubFetch(),
    });

    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, server!.id));
    expect(result).toMatchObject({
      serverId: server!.id,
      provider: "github",
      externalRepositoryId: String(REPOSITORY_RESPONSE.id),
      checkedAt: new Date("2026-08-31T11:00:00Z"),
    });
    expect(snapshots).toHaveLength(1);
  });

  it("defers rate-limited jobs until the provider reset time", async () => {
    const [server] = await db
      .insert(servers)
      .values({
        slug: "github-worker-rate-limit",
        title: "GitHub worker rate limit",
        shortDescription: "Registry-backed server",
        listingStatus: "active",
        moderationStatus: "normal",
        repositoryUrl: "https://github.com/example/worker-server",
        firstSeenAt: new Date("2026-08-31T09:00:00Z"),
        lastSeenAt: new Date("2026-08-31T09:00:00Z"),
      })
      .returning({ id: servers.id });
    const retryAt = new Date("2099-08-31T12:00:00Z");
    const checkedAt = new Date("2026-08-31T11:00:00Z");
    let deferredUntil: Date | undefined;
    let deferredCheckedAt: Date | undefined;
    let deferredRetriesConsumed: number | undefined;
    const fetchImpl: typeof fetch = async () =>
      Response.json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.floor(retryAt.getTime() / 1000)),
          },
        },
      );

    const result = await handleGitHubEnrichJob({
      db,
      jobData: { serverId: server!.id },
      checkedAt,
      retryCount: 2,
      fetchImpl,
      async deferRateLimitRetry(value, originalCheckedAt, retriesConsumed) {
        deferredUntil = value;
        deferredCheckedAt = originalCheckedAt;
        deferredRetriesConsumed = retriesConsumed;
      },
    });

    expect(result).toEqual({ status: "deferred", retryAt });
    expect(deferredUntil).toEqual(retryAt);
    expect(deferredCheckedAt).toEqual(checkedAt);
    expect(deferredRetriesConsumed).toBe(3);
  });

  it("stops deferring after five retries have been consumed", async () => {
    const [server] = await db
      .insert(servers)
      .values({
        slug: "github-worker-rate-limit-exhausted",
        title: "GitHub worker exhausted rate limit",
        shortDescription: "Registry-backed server",
        listingStatus: "active",
        moderationStatus: "normal",
        repositoryUrl: "https://github.com/example/worker-server",
        firstSeenAt: new Date("2026-08-31T09:00:00Z"),
        lastSeenAt: new Date("2026-08-31T09:00:00Z"),
      })
      .returning({ id: servers.id });
    let deferred = false;
    const fetchImpl: typeof fetch = async () =>
      Response.json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(
              Math.floor(new Date("2099-08-31T12:00:00Z").getTime() / 1000),
            ),
          },
        },
      );

    await expect(
      handleGitHubEnrichJob({
        db,
        jobData: { serverId: server!.id, retriesConsumed: 4 },
        checkedAt: new Date("2026-08-31T11:00:00Z"),
        retryCount: 1,
        fetchImpl,
        async deferRateLimitRetry() {
          deferred = true;
        },
      }),
    ).rejects.toMatchObject({ name: "GitHubRateLimitError" });
    expect(deferred).toBe(false);
  });

  it("fails deferral when a pending singleton prevents the replacement job", async () => {
    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    try {
      await boss.createQueue(GITHUB_ENRICH_QUEUE, {
        name: GITHUB_ENRICH_QUEUE,
        ...GITHUB_ENRICH_QUEUE_OPTIONS,
      });
      const serverId = "b8169fc2-8d87-4589-8d09-ddb2b37aad34";
      await enqueueGitHubEnrichment(boss, serverId);

      await expect(
        deferGitHubEnrichment(boss, serverId, {
          checkedAt: new Date("2026-08-31T11:00:00.000Z"),
          startAfter: new Date("2099-08-31T12:00:00.000Z"),
          retriesConsumed: 1,
        }),
      ).rejects.toBeInstanceOf(GitHubEnrichmentDeferralError);
    } finally {
      await boss.stop({ graceful: true });
    }
  });

  it("rejects for retry while leaving the Registry server queryable", async () => {
    const [server] = await db
      .insert(servers)
      .values({
        slug: "github-worker-failure",
        title: "GitHub worker failure",
        shortDescription: "Registry-backed server",
        listingStatus: "active",
        moderationStatus: "normal",
        repositoryUrl: "https://github.com/example/worker-server",
        firstSeenAt: new Date("2026-08-31T09:00:00Z"),
        lastSeenAt: new Date("2026-08-31T09:00:00Z"),
      })
      .returning({ id: servers.id });

    await expect(
      processGitHubEnrichJob({
        db,
        jobData: { serverId: server!.id },
        checkedAt: new Date("2026-08-31T11:00:00Z"),
        fetchImpl: makeGitHubFetch(404),
      }),
    ).rejects.toBeInstanceOf(GitHubRepositoryUnavailableError);

    const [persisted] = await db.select().from(servers).where(eq(servers.id, server!.id));
    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, server!.id));
    expect(persisted).toMatchObject({ id: server!.id, listingStatus: "active" });
    expect(snapshots).toHaveLength(0);
  });
});
