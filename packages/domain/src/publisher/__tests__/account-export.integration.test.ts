import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditEvents,
  authAccounts,
  authUsers,
  publisherClaims,
  publisherMemberships,
  publishers,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { buildAccountExport } from "../account-export.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const USER_ID = "33333333-3333-4333-8333-333333333333";
const PUBLISHER_ID = "22222222-2222-4222-8222-222222222222";
const SERVER_ID = "11111111-1111-4111-8111-111111111111";

describe("account export", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task13_account_export");
    db = temp.db;
    destroy = temp.destroy;

    await db.insert(authUsers).values({
      id: USER_ID,
      name: "Casey Publisher",
      email: "casey.publisher@example.com",
      emailVerified: true,
    });
    await db.insert(authAccounts).values({
      accountId: "github-123",
      providerId: "github",
      userId: USER_ID,
      accessToken: "must-not-be-exported",
      issuer: "https://github.com",
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
      slug: "casey-server",
      title: "Casey Server",
      shortDescription: "Synthetic fixture server",
      listingStatus: "active",
      moderationStatus: "normal",
      repositoryUrl: "https://github.com/casey-tools/server",
      repositorySource: "github",
      repositoryExternalId: "12345678",
      firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    await db.insert(publisherClaims).values({
      serverId: SERVER_ID,
      publisherId: PUBLISHER_ID,
      requesterUserId: USER_ID,
      verificationMethod: "github_repository",
      githubSubjectType: "repository",
      githubSubjectId: "12345678",
      status: "verified",
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await db.insert(auditEvents).values({
      actorUserId: USER_ID,
      resourceType: "publisher",
      resourceId: PUBLISHER_ID,
      action: "publisher.fixture_created",
      outcome: "success",
    });
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("exports account data without provider credentials", async () => {
    const payload = await buildAccountExport(db, USER_ID);

    expect(payload.user).toEqual({
      id: USER_ID,
      email: "casey.publisher@example.com",
      name: "Casey Publisher",
      image: null,
    });
    expect(payload.memberships).toEqual([
      { publisherId: PUBLISHER_ID, publisherSlug: "casey-tools", role: "owner" },
    ]);
    expect(payload.claims).toHaveLength(1);
    expect(payload.auditEvents).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain("must-not-be-exported");
  });
});
