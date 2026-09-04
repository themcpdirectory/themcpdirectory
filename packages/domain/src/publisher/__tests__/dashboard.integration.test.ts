import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authUsers,
  publisherClaims,
  publisherMemberships,
  publishers,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { getPublisherDashboard } from "../../index.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const PRIMARY_PUBLISHER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PUBLISHER_ID = "99999999-9999-4999-8999-999999999999";
const OWNER_USER_ID = "33333333-3333-4333-8333-333333333333";
const VIEWER_USER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_OWNER_USER_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_MEMBERSHIP_ID = "77777777-7777-4777-8777-777777777777";
const VIEWER_MEMBERSHIP_ID = "88888888-8888-4888-8888-888888888888";
const SERVER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLAIM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIXTURE_TIME = new Date("2026-09-01T12:00:00.000Z");

async function seedDashboardFixture(db: Database): Promise<void> {
  await db.insert(authUsers).values([
    {
      id: OWNER_USER_ID,
      name: "Owner Example",
      email: "owner@example.com",
      emailVerified: true,
      image: null,
    },
    {
      id: VIEWER_USER_ID,
      name: "Viewer Example",
      email: "viewer@example.com",
      emailVerified: true,
      image: null,
    },
    {
      id: OTHER_OWNER_USER_ID,
      name: "Other Owner",
      email: "other-owner@example.com",
      emailVerified: true,
      image: null,
    },
  ]);

  await db.insert(publishers).values([
    {
      id: PRIMARY_PUBLISHER_ID,
      slug: "allowed-publisher",
      displayName: "Allowed Publisher",
      verificationState: "verified",
      ownershipState: "unlocked",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
    {
      id: OTHER_PUBLISHER_ID,
      slug: "blocked-publisher",
      displayName: "Blocked Publisher",
      verificationState: "unverified",
      ownershipState: "unlocked",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
  ]);

  await db.insert(publisherMemberships).values([
    {
      id: OWNER_MEMBERSHIP_ID,
      publisherId: PRIMARY_PUBLISHER_ID,
      userId: OWNER_USER_ID,
      role: "owner",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
    {
      id: VIEWER_MEMBERSHIP_ID,
      publisherId: PRIMARY_PUBLISHER_ID,
      userId: VIEWER_USER_ID,
      role: "viewer",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
    {
      id: "12121212-1212-4212-8212-121212121212",
      publisherId: OTHER_PUBLISHER_ID,
      userId: OTHER_OWNER_USER_ID,
      role: "owner",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
  ]);

  await db.insert(servers).values({
    id: SERVER_ID,
    slug: "claimed-server",
    title: "Claimed Server",
    shortDescription: "Claimed by the allowed publisher",
    publisherId: PRIMARY_PUBLISHER_ID,
    listingStatus: "active",
    moderationStatus: "normal",
    firstSeenAt: FIXTURE_TIME,
    lastSeenAt: FIXTURE_TIME,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  });

  await db.insert(publisherClaims).values({
    id: CLAIM_ID,
    serverId: SERVER_ID,
    publisherId: PRIMARY_PUBLISHER_ID,
    requesterUserId: OWNER_USER_ID,
    verificationMethod: "github_repository",
    githubSubjectType: "repository",
    githubSubjectId: "12345678",
    status: "verified",
    evidenceSummary: { repositoryId: 12345678 },
    verifiedAt: FIXTURE_TIME,
    expiresAt: new Date("2026-10-01T12:00:00.000Z"),
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  });
}

describe("getPublisherDashboard integration", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task4_publisher_dashboard");
    db = temp.db;
    destroy = temp.destroy;
    await seedDashboardFixture(db);
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("falls back to an allowed publisher when the browser asks for one the user does not own", async () => {
    const dashboard = await getPublisherDashboard(db, {
      userId: OWNER_USER_ID,
      preferredPublisherId: OTHER_PUBLISHER_ID,
    });

    expect(dashboard.viewer).toEqual({
      userId: OWNER_USER_ID,
      name: "Owner Example",
      email: "owner@example.com",
      image: null,
    });
    expect(dashboard.memberships).toEqual([
      {
        membershipId: OWNER_MEMBERSHIP_ID,
        publisherId: PRIMARY_PUBLISHER_ID,
        publisherSlug: "allowed-publisher",
        publisherDisplayName: "Allowed Publisher",
        role: "owner",
        capabilities: [
          "publisher.read",
          "publisher.edit",
          "claims.manage",
          "members.manage",
          "ownership.transfer",
          "publisher.destroy",
        ],
      },
    ]);
    expect(dashboard.activePublisher).toEqual({
      id: PRIMARY_PUBLISHER_ID,
      slug: "allowed-publisher",
      displayName: "Allowed Publisher",
      role: "owner",
      capabilities: [
        "publisher.read",
        "publisher.edit",
        "claims.manage",
        "members.manage",
        "ownership.transfer",
        "publisher.destroy",
      ],
      claims: [{ claimId: CLAIM_ID, status: "verified", serverTitle: "Claimed Server" }],
      members: [
        {
          membershipId: OWNER_MEMBERSHIP_ID,
          userId: OWNER_USER_ID,
          role: "owner",
          displayName: "Owner Example",
          email: "owner@example.com",
        },
        {
          membershipId: VIEWER_MEMBERSHIP_ID,
          userId: VIEWER_USER_ID,
          role: "viewer",
          displayName: "Viewer Example",
          email: "viewer@example.com",
        },
      ],
    });
  });
});
