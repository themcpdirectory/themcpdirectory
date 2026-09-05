import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  accountErasureRequests,
  authUsers,
  publisherClaims,
  publishers,
  servers,
  type Database,
} from "@themcpdirectory/db";
import type { AccountErasureDeps } from "@themcpdirectory/domain";
import {
  createAccountErasureDeps,
  processPublisherErasureJob,
} from "../publisher-erasure-worker.js";
import { createTempDatabase } from "./postgres-test-db.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

describe("publisher erasure worker", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task9_publisher_erasure_worker");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("persists retry state when external disconnect fails", async () => {
    const now = new Date("2026-09-01T16:00:00.000Z");
    const userId = "33333333-3333-4333-8333-333333333333";
    const requestId = "44444444-4444-4444-8444-444444444444";

    await db.insert(authUsers).values({
      id: userId,
      name: "Erasure User",
      email: "erasure-user@example.com",
      emailVerified: true,
      createdAt: new Date("2025-09-01T00:00:00.000Z"),
      updatedAt: new Date("2025-09-01T00:00:00.000Z"),
    });

    await db.insert(accountErasureRequests).values({
      id: requestId,
      userId,
      status: "retry_scheduled",
      currentStep: "disconnect_github_app_installations",
      retryCount: 0,
      nextAttemptAt: new Date("2026-09-01T15:00:00.000Z"),
      lastError: null,
      metadata: {
        successorAssignments: [],
        auditTombstone: "audit-tombstone-1",
        deletedAccountAlias: "deleted-alias-1",
        claimHistoryUserId: "55555555-5555-4555-8555-555555555555",
        githubDisconnect: {
          operationId: "66666666-6666-4666-8666-666666666666",
          state: "attempting",
        },
      },
      requestedAt: new Date("2026-09-01T14:00:00.000Z"),
      createdAt: new Date("2026-09-01T14:00:00.000Z"),
      updatedAt: new Date("2026-09-01T14:00:00.000Z"),
    });

    const deps: AccountErasureDeps = {
      githubApp: {
        disconnectOwnedInstallations: async () => {
          throw new Error("GITHUB_APP_TEMPORARY_FAILURE");
        },
      },
    };

    const summary = await processPublisherErasureJob(db, now, deps);
    expect(summary).toEqual({ resumed: 1, completed: 0, retryScheduled: 1 });

    const [persisted] = await db
      .select({
        status: accountErasureRequests.status,
        retryCount: accountErasureRequests.retryCount,
        lastError: accountErasureRequests.lastError,
      })
      .from(accountErasureRequests)
      .where(eq(accountErasureRequests.id, requestId));

    expect(persisted).toEqual({
      status: "retry_scheduled",
      retryCount: 1,
      lastError: "GITHUB_APP_TEMPORARY_FAILURE",
    });
  });

  it("completes using production deps and treats repeated 404 delete as idempotent success", async () => {
    const now = new Date("2026-09-01T16:00:00.000Z");
    const userId = "33333333-3333-4333-8333-333333333333";
    const otherUserId = "11111111-1111-4111-8111-111111111111";
    const requestId = "44444444-4444-4444-8444-444444444444";

    await db.insert(authUsers).values([
      {
        id: userId,
        name: "Erasure User",
        email: "erasure-user@example.com",
        emailVerified: true,
        createdAt: new Date("2025-09-01T00:00:00.000Z"),
        updatedAt: new Date("2025-09-01T00:00:00.000Z"),
      },
      {
        id: otherUserId,
        name: "Other User",
        email: "other-user@example.com",
        emailVerified: true,
        createdAt: new Date("2025-09-01T00:00:00.000Z"),
        updatedAt: new Date("2025-09-01T00:00:00.000Z"),
      },
    ]);

    const [publisher] = await db
      .insert(publishers)
      .values({
        slug: "publisher-erasure-worker-test",
        displayName: "Publisher Erasure Worker Test",
        verificationState: "verified",
      })
      .returning({ id: publishers.id });

    const [ownedServer, sharedServer, organisationServer] = await db
      .insert(servers)
      .values([
        {
          slug: "publisher-erasure-owned-server",
          title: "Owned server",
          shortDescription: "Owned installation claim",
          listingStatus: "active",
          moderationStatus: "normal",
          publisherId: publisher!.id,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        {
          slug: "publisher-erasure-shared-server",
          title: "Shared server",
          shortDescription: "Shared installation claim",
          listingStatus: "active",
          moderationStatus: "normal",
          publisherId: publisher!.id,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        {
          slug: "publisher-erasure-org-server",
          title: "Organisation server",
          shortDescription: "Organisation installation claim",
          listingStatus: "active",
          moderationStatus: "normal",
          publisherId: publisher!.id,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      ])
      .returning({ id: servers.id });

    await db.insert(publisherClaims).values([
      {
        serverId: ownedServer!.id,
        publisherId: publisher!.id,
        requesterUserId: userId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "owned/repo",
        status: "verified",
        evidenceSummary: {
          installationId: 91,
          githubUserId: "123",
          installationTargetType: "user",
          installationTargetId: "123",
        },
        reviewedByUserId: otherUserId,
        reviewedAt: now,
        verifiedAt: now,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        serverId: sharedServer!.id,
        publisherId: publisher!.id,
        requesterUserId: userId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "shared/repo",
        status: "verified",
        evidenceSummary: {
          installationId: 92,
          githubUserId: "123",
          installationTargetType: "user",
          installationTargetId: "123",
        },
        reviewedByUserId: otherUserId,
        reviewedAt: now,
        verifiedAt: now,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
        updatedAt: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        serverId: sharedServer!.id,
        publisherId: publisher!.id,
        requesterUserId: otherUserId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "shared/repo-other-user",
        status: "verified",
        evidenceSummary: {
          installationId: 92,
          githubUserId: "456",
          installationTargetType: "user",
          installationTargetId: "456",
        },
        reviewedByUserId: userId,
        reviewedAt: now,
        verifiedAt: now,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-02T12:00:00.000Z"),
        updatedAt: new Date("2026-08-02T12:00:00.000Z"),
      },
      {
        serverId: organisationServer!.id,
        publisherId: publisher!.id,
        requesterUserId: userId,
        verificationMethod: "github_organization",
        githubSubjectType: "organization",
        githubSubjectId: "example-org",
        status: "verified",
        evidenceSummary: {
          installationId: 93,
          githubUserId: "123",
          installationTargetType: "organization",
          installationTargetId: "789",
        },
        reviewedByUserId: otherUserId,
        reviewedAt: now,
        verifiedAt: now,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-03T00:00:00.000Z"),
        updatedAt: new Date("2026-08-03T00:00:00.000Z"),
      },
    ]);

    await db.insert(accountErasureRequests).values({
      id: requestId,
      userId,
      status: "retry_scheduled",
      currentStep: "disconnect_github_app_installations",
      retryCount: 0,
      nextAttemptAt: new Date("2026-09-01T15:00:00.000Z"),
      lastError: null,
      metadata: {
        successorAssignments: [],
        auditTombstone: "audit-tombstone-1",
        deletedAccountAlias: "deleted-alias-1",
        claimHistoryUserId: "55555555-5555-4555-8555-555555555555",
        githubDisconnect: {
          operationId: "66666666-6666-4666-8666-666666666666",
          state: "attempting",
        },
      },
      requestedAt: new Date("2026-09-01T14:00:00.000Z"),
      createdAt: new Date("2026-09-01T14:00:00.000Z"),
      updatedAt: new Date("2026-09-01T14:00:00.000Z"),
    });

    const deleteCalls: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/app/installations/")) {
        deleteCalls.push(url);
        return new Response(null, { status: 404 });
      }
      throw new Error(`UNEXPECTED_URL_${url}`);
    }) as unknown as typeof fetch;

    const deps = createAccountErasureDeps({
      db,
      env: {
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY: privateKey,
      },
      fetchImpl,
    });

    const summary = await processPublisherErasureJob(db, now, deps);
    expect(summary).toEqual({ resumed: 1, completed: 1, retryScheduled: 0 });
    expect(deleteCalls).toEqual(["https://api.github.com/app/installations/91"]);

    const second = await processPublisherErasureJob(db, new Date("2026-09-01T16:05:00.000Z"), deps);
    expect(second).toEqual({ resumed: 0, completed: 0, retryScheduled: 0 });

    const [persisted] = await db
      .select({
        status: accountErasureRequests.status,
        currentStep: accountErasureRequests.currentStep,
      })
      .from(accountErasureRequests)
      .where(eq(accountErasureRequests.id, requestId));
    expect(persisted).toBeUndefined();

    const [deletedUser] = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, userId));
    expect(deletedUser).toBeUndefined();
  });
});
