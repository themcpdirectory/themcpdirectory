import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { repositorySnapshots, servers, type Database } from "@themcpdirectory/db";
import {
  GitHubRepositoryIdentityConflictError,
  enrichGitHubRepository,
} from "../enrich-github-repository.js";
import { GitHubRepositoryUnavailableError } from "../github-client.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const REPOSITORY_RESPONSE = {
  id: 12_345_678,
  name: "renamed-server",
  full_name: "new-owner/renamed-server",
  html_url: "https://github.com/new-owner/renamed-server",
  default_branch: "main",
  archived: false,
  fork: false,
  stargazers_count: 42,
  forks_count: 7,
  open_issues_count: 3,
  license: { spdx_id: "MIT" },
  pushed_at: "2026-08-31T10:00:00Z",
  owner: { login: "new-owner" },
};

const RELEASE_RESPONSE = {
  id: 99,
  published_at: "2026-08-30T12:00:00Z",
};

function makeGitHubFetch(repositoryStatus = 200): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/releases/latest")) {
      return Response.json(RELEASE_RESPONSE);
    }
    return Response.json(
      repositoryStatus === 200 ? REPOSITORY_RESPONSE : { message: "Not Found" },
      { status: repositoryStatus },
    );
  };
}

async function createServer(
  db: Database,
  values: Partial<typeof servers.$inferInsert> = {},
): Promise<string> {
  const observedAt = new Date("2026-08-31T09:00:00Z");
  const [server] = await db
    .insert(servers)
    .values({
      slug: "github-enrichment-test",
      title: "GitHub enrichment test",
      shortDescription: "Registry-backed server",
      listingStatus: "active",
      moderationStatus: "normal",
      repositoryUrl: "https://github.com/old-owner/old-name",
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      ...values,
    })
    .returning({ id: servers.id });
  if (!server) throw new Error("Expected server fixture");
  return server.id;
}

describe("enrichGitHubRepository", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task9_github_enrichment");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("appends snapshots and updates canonical identity by stable repository ID", async () => {
    const serverId = await createServer(db, {
      repositorySource: "github",
      repositoryExternalId: String(REPOSITORY_RESPONSE.id),
    });

    await enrichGitHubRepository(db, serverId, {
      fetchImpl: makeGitHubFetch(),
      checkedAt: new Date("2026-08-31T11:00:00Z"),
    });
    await enrichGitHubRepository(db, serverId, {
      fetchImpl: makeGitHubFetch(),
      checkedAt: new Date("2026-08-31T12:00:00Z"),
    });

    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, serverId))
      .orderBy(asc(repositorySnapshots.checkedAt));
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      provider: "github",
      externalRepositoryId: String(REPOSITORY_RESPONSE.id),
      owner: "new-owner",
      name: "renamed-server",
      url: REPOSITORY_RESPONSE.html_url,
      defaultBranch: "main",
      isArchived: false,
      isFork: false,
      stars: 42,
      forks: 7,
      openIssues: 3,
      licenseSpdx: "MIT",
      lastPushAt: new Date("2026-08-31T10:00:00Z"),
      lastReleaseAt: new Date("2026-08-30T12:00:00Z"),
      checkedAt: new Date("2026-08-31T11:00:00Z"),
    });
    expect(snapshots[0]?.payload).toEqual({
      repository: REPOSITORY_RESPONSE,
      latestRelease: RELEASE_RESPONSE,
    });
    expect(server).toMatchObject({
      repositorySource: "github",
      repositoryExternalId: String(REPOSITORY_RESPONSE.id),
      repositoryUrl: REPOSITORY_RESPONSE.html_url,
      licenseSpdx: "MIT",
    });
  });

  it("reuses the snapshot when the same check is retried", async () => {
    const serverId = await createServer(db);
    const checkedAt = new Date("2026-08-31T11:00:00Z");

    const first = await enrichGitHubRepository(db, serverId, {
      fetchImpl: makeGitHubFetch(),
      checkedAt,
    });
    const retry = await enrichGitHubRepository(db, serverId, {
      fetchImpl: makeGitHubFetch(),
      checkedAt,
    });

    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, serverId));
    expect(retry.id).toBe(first.id);
    expect(snapshots).toHaveLength(1);
  });

  it("atomically rejects a conflicting stable repository ID", async () => {
    const serverId = await createServer(db, {
      repositorySource: "github",
      repositoryExternalId: "different-stable-id",
    });

    await expect(
      enrichGitHubRepository(db, serverId, { fetchImpl: makeGitHubFetch() }),
    ).rejects.toBeInstanceOf(GitHubRepositoryIdentityConflictError);

    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, serverId));
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    expect(snapshots).toHaveLength(0);
    expect(server?.repositoryExternalId).toBe("different-stable-id");
    expect(server?.repositoryUrl).toBe("https://github.com/old-owner/old-name");
  });

  it("allows only one concurrent server to claim a stable repository ID", async () => {
    const firstServerId = await createServer(db, { slug: "github-claim-one" });
    const secondServerId = await createServer(db, { slug: "github-claim-two" });
    let releaseRequests = 0;
    let releaseBothRequests: (() => void) | undefined;
    const bothReleaseRequests = new Promise<void>((resolve) => {
      releaseBothRequests = resolve;
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (!url.pathname.endsWith("/releases/latest")) return Response.json(REPOSITORY_RESPONSE);
      releaseRequests += 1;
      if (releaseRequests === 2) releaseBothRequests?.();
      await bothReleaseRequests;
      return Response.json(RELEASE_RESPONSE);
    };

    const results = await Promise.allSettled([
      enrichGitHubRepository(db, firstServerId, { fetchImpl }),
      enrichGitHubRepository(db, secondServerId, { fetchImpl }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: { name: "GitHubRepositoryIdentityConflictError" },
    });
    const snapshots = await db.select().from(repositorySnapshots);
    expect(snapshots).toHaveLength(1);
  });

  it("shares the Registry advisory lock for stable repository ownership", async () => {
    const serverId = await createServer(db);
    let markLockAcquired: (() => void) | undefined;
    let releaseLock: (() => void) | undefined;
    const lockAcquired = new Promise<void>((resolve) => {
      markLockAcquired = resolve;
    });
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const registryIdentityLock = db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${"repository:github:12345678"}))`,
      );
      markLockAcquired?.();
      await holdLock;
    });

    await lockAcquired;
    let enrichmentSettled = false;
    const enrichment = enrichGitHubRepository(db, serverId, {
      fetchImpl: makeGitHubFetch(),
    }).finally(() => {
      enrichmentSettled = true;
    });
    let settledWhileLocked: boolean;
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      settledWhileLocked = enrichmentSettled;
    } finally {
      releaseLock?.();
      await Promise.all([registryIdentityLock, enrichment]);
    }

    expect(settledWhileLocked).toBe(false);
  });

  it("rejects a stale response when the Registry repository URL changes", async () => {
    const serverId = await createServer(db);
    let releaseRepositoryRequest: (() => void) | undefined;
    let markRepositoryRequested: (() => void) | undefined;
    const repositoryRequested = new Promise<void>((resolve) => {
      markRepositoryRequested = resolve;
    });
    const waitForRegistryUpdate = new Promise<void>((resolve) => {
      releaseRepositoryRequest = resolve;
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname.endsWith("/releases/latest")) return Response.json(RELEASE_RESPONSE);
      markRepositoryRequested?.();
      await waitForRegistryUpdate;
      return Response.json(REPOSITORY_RESPONSE);
    };

    const enrichment = enrichGitHubRepository(db, serverId, { fetchImpl });
    await repositoryRequested;
    await db
      .update(servers)
      .set({ repositoryUrl: "https://github.com/new-registry-owner/new-registry-name" })
      .where(eq(servers.id, serverId));
    releaseRepositoryRequest?.();

    await expect(enrichment).rejects.toMatchObject({ name: "GitHubRepositoryChangedError" });
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, serverId));
    expect(server?.repositoryUrl).toBe("https://github.com/new-registry-owner/new-registry-name");
    expect(snapshots).toHaveLength(0);
  });

  it("leaves Registry records queryable when GitHub is unavailable", async () => {
    const serverId = await createServer(db);

    await expect(
      enrichGitHubRepository(db, serverId, { fetchImpl: makeGitHubFetch(404) }),
    ).rejects.toBeInstanceOf(GitHubRepositoryUnavailableError);

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    const snapshots = await db
      .select()
      .from(repositorySnapshots)
      .where(eq(repositorySnapshots.serverId, serverId));
    expect(server).toMatchObject({ id: serverId, listingStatus: "active" });
    expect(snapshots).toHaveLength(0);
  });
});
