import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  accountErasureRequests,
  authAccounts,
  authSessions,
  authUsers,
  publisherClaimEvents,
  publisherClaims,
  publisherMemberships,
  publishers,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { advanceAccountErasure, requestAccountErasure } from "../account-erasure.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const USER_ID = "33333333-3333-4333-8333-333333333333";
const PUBLISHER_ID = "22222222-2222-4222-8222-222222222222";
const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "44444444-4444-4444-8444-444444444444";

describe("account erasure", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task13_account_erasure");
    db = temp.db;
    destroy = temp.destroy;

    await db.insert(authUsers).values({
      id: USER_ID,
      name: "Casey Publisher",
      email: "casey.publisher@example.com",
      emailVerified: true,
      image: "https://avatars.example.com/casey.png",
    });
    await db.insert(authAccounts).values({
      accountId: "github-123",
      providerId: "github",
      userId: USER_ID,
      issuer: "https://github.com",
    });
    await db.insert(authSessions).values({
      token: "session-token",
      userId: USER_ID,
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await db.insert(publishers).values({
      id: PUBLISHER_ID,
      slug: "casey-tools",
      displayName: "Casey Tools",
    });
    await db.insert(publisherMemberships).values({
      publisherId: PUBLISHER_ID,
      userId: USER_ID,
      role: "owner",
    });
    await db.insert(servers).values({
      id: SERVER_ID,
      slug: "casey-erasure-server",
      title: "Casey Erasure Server",
      shortDescription: "Synthetic erasure fixture",
      listingStatus: "active",
      moderationStatus: "normal",
      firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    await db.insert(publisherClaims).values({
      id: CLAIM_ID,
      serverId: SERVER_ID,
      publisherId: PUBLISHER_ID,
      requesterUserId: USER_ID,
      verificationMethod: "github_repository",
      githubSubjectType: "repository",
      githubSubjectId: "12345678",
      status: "pending",
      evidenceSummary: { githubUserId: "987654" },
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("locks an ownerless publisher for manual review before scrubbing the account", async () => {
    const requestedAt = new Date("2026-09-01T14:00:00.000Z");
    const requested = await requestAccountErasure(db, {
      userId: USER_ID,
      successorAssignments: [],
      requestedAt,
    });

    const result = await advanceAccountErasure(
      db,
      { requestId: requested.requestId, now: requestedAt },
      {
        githubApp: {
          disconnectOwnedInstallations: async () => ({ disconnectedInstallationIds: [] }),
        },
      },
    );

    const [publisher] = await db.select().from(publishers).where(eq(publishers.id, PUBLISHER_ID));
    const memberships = await db
      .select()
      .from(publisherMemberships)
      .where(eq(publisherMemberships.userId, USER_ID));
    const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, USER_ID));
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, USER_ID));
    const [claim] = await db.select().from(publisherClaims).where(eq(publisherClaims.id, CLAIM_ID));
    const claimEvents = await db
      .select()
      .from(publisherClaimEvents)
      .where(eq(publisherClaimEvents.claimId, CLAIM_ID));

    expect(result).toEqual({
      requestId: requested.requestId,
      status: "completed",
      currentStep: "done",
    });
    expect(publisher?.ownershipState).toBe("manual_review");
    expect(publisher?.ownershipLockReason).toBe("owner_erased_without_successor");
    expect(memberships).toHaveLength(0);
    expect(accounts).toHaveLength(0);
    expect(user).toBeUndefined();
    expect(claim).toMatchObject({ status: "revoked", evidenceSummary: {} });
    expect(claim?.requesterUserId).not.toBe(USER_ID);
    expect(claimEvents.every((event) => event.actorUserId === null)).toBe(true);
    expect(JSON.stringify({ claim, claimEvents })).not.toContain(USER_ID);
  });

  it("persists an external failure and resumes from the failed step", async () => {
    const operationIds: string[] = [];
    const requested = await requestAccountErasure(db, {
      userId: USER_ID,
      successorAssignments: [],
      requestedAt: new Date("2026-09-01T15:00:00.000Z"),
    });

    const first = await advanceAccountErasure(
      db,
      { requestId: requested.requestId, now: new Date("2026-09-01T15:01:00.000Z") },
      {
        githubApp: {
          disconnectOwnedInstallations: async ({ operationId }) => {
            operationIds.push(operationId);
            throw new Error("GITHUB_APP_DISCONNECT_FAILED");
          },
        },
      },
    );
    const [retry] = await db
      .select()
      .from(accountErasureRequests)
      .where(eq(accountErasureRequests.id, requested.requestId));
    const sessions = await db.select().from(authSessions).where(eq(authSessions.userId, USER_ID));

    expect(first.status).toBe("retry_scheduled");
    expect(first.currentStep).toBe("disconnect_github_app_installations");
    expect(retry).toMatchObject({ retryCount: 1, lastError: "GITHUB_APP_DISCONNECT_FAILED" });
    expect(sessions).toHaveLength(0);

    const second = await advanceAccountErasure(
      db,
      { requestId: requested.requestId, now: new Date("2026-09-01T15:10:00.000Z") },
      {
        githubApp: {
          disconnectOwnedInstallations: async ({ operationId }) => {
            operationIds.push(operationId);
            return { disconnectedInstallationIds: [91] };
          },
        },
      },
    );

    expect(second.status).toBe("completed");
    expect(new Set(operationIds)).toEqual(new Set([requested.requestId]));
  });
});
