import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import {
  auditEvents,
  authUsers,
  publisherMemberships,
  publishers,
  type Database,
} from "@themcpdirectory/db";
import {
  appendAuditEvent,
  removePublisherMembership,
  requirePublisherAccess,
  updatePublisherMembershipRole,
} from "../../index.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const PUBLISHER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_USER_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_USER_ID = "44444444-4444-4444-8444-444444444444";
const VIEWER_USER_ID = "55555555-5555-4555-8555-555555555555";
const OWNER_MEMBERSHIP_ID = "77777777-7777-4777-8777-777777777777";
const ADMIN_MEMBERSHIP_ID = "88888888-8888-4888-8888-888888888888";
const VIEWER_MEMBERSHIP_ID = "12121212-1212-4212-8212-121212121212";
const FIXTURE_TIME = new Date("2026-09-01T12:00:00.000Z");

async function seedMembershipFixture(db: Database): Promise<void> {
  await db.insert(authUsers).values([
    {
      id: OWNER_USER_ID,
      name: "Owner Example",
      email: "owner@example.com",
      emailVerified: true,
      image: null,
    },
    {
      id: ADMIN_USER_ID,
      name: "Admin Example",
      email: "admin@example.com",
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
  ]);

  await db.insert(publishers).values({
    id: PUBLISHER_ID,
    slug: "task-4-publisher",
    displayName: "Task 4 Publisher",
    verificationState: "verified",
    ownershipState: "unlocked",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  });

  await db.insert(publisherMemberships).values([
    {
      id: OWNER_MEMBERSHIP_ID,
      publisherId: PUBLISHER_ID,
      userId: OWNER_USER_ID,
      role: "owner",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
    {
      id: ADMIN_MEMBERSHIP_ID,
      publisherId: PUBLISHER_ID,
      userId: ADMIN_USER_ID,
      role: "admin",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
    {
      id: VIEWER_MEMBERSHIP_ID,
      publisherId: PUBLISHER_ID,
      userId: VIEWER_USER_ID,
      role: "viewer",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    },
  ]);
}

async function listAuditEvents(db: Database) {
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt));
}

describe("publisher memberships integration", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task4_publisher_memberships");
    db = temp.db;
    destroy = temp.destroy;
    await seedMembershipFixture(db);
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("uses the stored membership role to decide publisher access", async () => {
    await expect(
      requirePublisherAccess(db, {
        userId: VIEWER_USER_ID,
        publisherId: PUBLISHER_ID,
        capability: "members.manage",
      }),
    ).rejects.toThrow(/PUBLISHER_FORBIDDEN/);

    await expect(
      requirePublisherAccess(db, {
        userId: ADMIN_USER_ID,
        publisherId: PUBLISHER_ID,
        capability: "members.manage",
      }),
    ).resolves.toEqual({
      membershipId: ADMIN_MEMBERSHIP_ID,
      publisherId: PUBLISHER_ID,
      role: "admin",
    });
  });

  it("prevents the last owner from demoting themselves and records a blocked audit event", async () => {
    await expect(
      updatePublisherMembershipRole(db, {
        actorUserId: OWNER_USER_ID,
        membershipId: OWNER_MEMBERSHIP_ID,
        nextRole: "admin",
      }),
    ).rejects.toThrow(/LAST_OWNER/);

    const [membership] = await db
      .select()
      .from(publisherMemberships)
      .where(eq(publisherMemberships.id, OWNER_MEMBERSHIP_ID));
    const [event] = await listAuditEvents(db);

    expect(membership?.role).toBe("owner");
    expect(event).toMatchObject({
      actorUserId: OWNER_USER_ID,
      resourceType: "publisher_membership",
      resourceId: OWNER_MEMBERSHIP_ID,
      action: "publisher_membership.role_updated",
      outcome: "blocked",
      metadata: {
        publisherId: PUBLISHER_ID,
        previousRole: "owner",
        nextRole: "admin",
        targetUserId: OWNER_USER_ID,
        reason: "LAST_OWNER",
      },
    });
  });

  it("blocks admins from changing ownership and records a blocked audit event", async () => {
    await expect(
      updatePublisherMembershipRole(db, {
        actorUserId: ADMIN_USER_ID,
        membershipId: OWNER_MEMBERSHIP_ID,
        nextRole: "admin",
      }),
    ).rejects.toThrow(/PUBLISHER_FORBIDDEN/);

    const [event] = await listAuditEvents(db);
    expect(event).toMatchObject({
      actorUserId: ADMIN_USER_ID,
      resourceType: "publisher_membership",
      resourceId: OWNER_MEMBERSHIP_ID,
      action: "publisher_membership.role_updated",
      outcome: "blocked",
      metadata: {
        publisherId: PUBLISHER_ID,
        previousRole: "owner",
        nextRole: "admin",
        targetUserId: OWNER_USER_ID,
        reason: "PUBLISHER_FORBIDDEN",
      },
    });
  });

  it("updates a non-owner membership role and records a success audit event", async () => {
    await expect(
      updatePublisherMembershipRole(db, {
        actorUserId: OWNER_USER_ID,
        membershipId: VIEWER_MEMBERSHIP_ID,
        nextRole: "editor",
      }),
    ).resolves.toEqual({
      membershipId: VIEWER_MEMBERSHIP_ID,
      userId: VIEWER_USER_ID,
      role: "editor",
      displayName: "Viewer Example",
      email: "viewer@example.com",
    });

    const [membership] = await db
      .select()
      .from(publisherMemberships)
      .where(eq(publisherMemberships.id, VIEWER_MEMBERSHIP_ID));
    const [event] = await listAuditEvents(db);

    expect(membership?.role).toBe("editor");
    expect(event).toMatchObject({
      actorUserId: OWNER_USER_ID,
      resourceType: "publisher_membership",
      resourceId: VIEWER_MEMBERSHIP_ID,
      action: "publisher_membership.role_updated",
      outcome: "success",
      metadata: {
        publisherId: PUBLISHER_ID,
        previousRole: "viewer",
        nextRole: "editor",
        targetUserId: VIEWER_USER_ID,
      },
    });
  });

  it("prevents removing the last owner and records a blocked audit event", async () => {
    await expect(
      removePublisherMembership(db, {
        actorUserId: OWNER_USER_ID,
        membershipId: OWNER_MEMBERSHIP_ID,
      }),
    ).rejects.toThrow(/LAST_OWNER/);

    const [membership] = await db
      .select()
      .from(publisherMemberships)
      .where(eq(publisherMemberships.id, OWNER_MEMBERSHIP_ID));
    const [event] = await listAuditEvents(db);

    expect(membership?.id).toBe(OWNER_MEMBERSHIP_ID);
    expect(event).toMatchObject({
      actorUserId: OWNER_USER_ID,
      resourceType: "publisher_membership",
      resourceId: OWNER_MEMBERSHIP_ID,
      action: "publisher_membership.removed",
      outcome: "blocked",
      metadata: {
        publisherId: PUBLISHER_ID,
        previousRole: "owner",
        targetUserId: OWNER_USER_ID,
        reason: "LAST_OWNER",
      },
    });
  });

  it("removes a non-owner membership and records a success audit event", async () => {
    await expect(
      removePublisherMembership(db, {
        actorUserId: ADMIN_USER_ID,
        membershipId: VIEWER_MEMBERSHIP_ID,
      }),
    ).resolves.toEqual({ removedMembershipId: VIEWER_MEMBERSHIP_ID });

    const [membership] = await db
      .select()
      .from(publisherMemberships)
      .where(eq(publisherMemberships.id, VIEWER_MEMBERSHIP_ID));
    const [event] = await listAuditEvents(db);

    expect(membership).toBeUndefined();
    expect(event).toMatchObject({
      actorUserId: ADMIN_USER_ID,
      resourceType: "publisher_membership",
      resourceId: VIEWER_MEMBERSHIP_ID,
      action: "publisher_membership.removed",
      outcome: "success",
      metadata: {
        publisherId: PUBLISHER_ID,
        previousRole: "viewer",
        targetUserId: VIEWER_USER_ID,
      },
    });
  });

  it("bounds audit metadata before persistence", async () => {
    await appendAuditEvent(db, {
      actorUserId: OWNER_USER_ID,
      resourceType: "publisher",
      resourceId: PUBLISHER_ID,
      action: "publisher.audit_tested",
      outcome: "success",
      metadata: {
        summary: "x".repeat(600),
        attempts: Array.from({ length: 25 }, (_, index) => `attempt-${index}`),
        occurredAt: new Date("2026-09-01T00:00:00.000Z"),
        nested: { status: "ok" },
      },
    });

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "publisher.audit_tested"));

    expect(event).toMatchObject({
      actorUserId: OWNER_USER_ID,
      resourceType: "publisher",
      resourceId: PUBLISHER_ID,
      action: "publisher.audit_tested",
      outcome: "success",
      metadata: {
        summary: "x".repeat(512),
        attempts: [
          "attempt-0",
          "attempt-1",
          "attempt-2",
          "attempt-3",
          "attempt-4",
          "attempt-5",
          "attempt-6",
          "attempt-7",
          "attempt-8",
          "attempt-9",
          "attempt-10",
          "attempt-11",
          "attempt-12",
          "attempt-13",
          "attempt-14",
          "attempt-15",
          "attempt-16",
          "attempt-17",
          "attempt-18",
          "attempt-19",
        ],
        occurredAt: "2026-09-01T00:00:00.000Z",
        nested: { status: "ok" },
      },
    });
  });
});
