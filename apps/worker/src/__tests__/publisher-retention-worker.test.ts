import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import {
  authSessions,
  authUsers,
  legalHolds,
  publisherClaims,
  publishers,
  servers,
  type Database,
} from "@themcpdirectory/db";
import {
  parsePublisherRetentionJobData,
  processPublisherRetentionJob,
} from "../publisher-retention-worker.js";
import { createTempDatabase } from "./postgres-test-db.js";

describe("publisher retention worker", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task9_publisher_retention_worker");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("keeps dormant users when any active legal hold exists on the user", async () => {
    const now = new Date("2027-09-02T00:00:00.000Z");

    const [heldUser, deletableUser] = await db
      .insert(authUsers)
      .values([
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: "Held User",
          email: "held-user@example.com",
          emailVerified: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Dormant User",
          email: "dormant-user@example.com",
          emailVerified: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ])
      .returning({ id: authUsers.id });

    const [publisher] = await db
      .insert(publishers)
      .values({ slug: "held-claim-publisher", displayName: "Held claim publisher" })
      .returning({ id: publishers.id });
    const [server] = await db
      .insert(servers)
      .values({
        slug: "held-claim-server",
        title: "Held claim server",
        shortDescription: "Synthetic held claim fixture",
        listingStatus: "active",
        moderationStatus: "normal",
        publisherId: publisher!.id,
        firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning({ id: servers.id });
    const [heldClaim] = await db
      .insert(publisherClaims)
      .values({
        serverId: server!.id,
        publisherId: publisher!.id,
        requesterUserId: heldUser!.id,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "12345678",
        status: "pending",
        evidenceSummary: { installationId: 91 },
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning({ id: publisherClaims.id });

    await db.insert(legalHolds).values({
      scope: "publisher_dispute",
      subjectType: "user",
      subjectId: heldUser!.id,
      reason: "open dispute",
      expiresAt: new Date("2027-12-31T00:00:00.000Z"),
      createdBy: "worker-test",
    });

    const summary = await processPublisherRetentionJob(
      db,
      now,
      undefined,
      { mode: "monthly_with_dormant" },
    );

    expect(summary.deletedDormantUsers).toBe(1);
    expect(summary.done).toBe(true);

    const remainingUsers = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, heldUser!.id))
      .orderBy(asc(authUsers.id));

    expect(remainingUsers).toEqual([{ id: heldUser!.id }]);

    const deletedUser = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, deletableUser!.id));
    expect(deletedUser).toEqual([]);

    const [preservedClaim] = await db
      .select({ status: publisherClaims.status, evidenceSummary: publisherClaims.evidenceSummary })
      .from(publisherClaims)
      .where(eq(publisherClaims.id, heldClaim!.id));
    expect(preservedClaim).toEqual({
      status: "pending",
      evidenceSummary: { installationId: 91 },
    });
  });

  it("runs publisher retention daily but only deletes dormant users in monthly mode", async () => {
    const now = new Date("2027-09-15T00:00:00.000Z");
    const userId = "99999999-9999-4999-8999-999999999999";

    expect(parsePublisherRetentionJobData({}, new Date("2027-09-01T05:19:00.000Z"))).toEqual({
      mode: "monthly_with_dormant",
    });

    await db.insert(authUsers).values({
      id: userId,
      name: "Dormant User",
      email: "daily-retention-user@example.com",
      emailVerified: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const daily = await processPublisherRetentionJob(db, now, undefined, { mode: "daily" });
    expect(daily.deletedDormantUsers).toBe(0);
    expect(daily.done).toBe(true);

    const stillPresent = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, userId));
    expect(stillPresent).toEqual([{ id: userId }]);

    const monthly = await processPublisherRetentionJob(db, now, undefined, {
      mode: "monthly_with_dormant",
    });
    expect(monthly.deletedDormantUsers).toBe(1);
    expect(monthly.done).toBe(true);
  });

  it("returns done=false when more than one retention batch remains and then completes", async () => {
    const now = new Date("2027-09-15T00:00:00.000Z");

    const users = Array.from({ length: 501 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Retention User ${index + 1}`,
      email: `retention-user-${index + 1}@example.com`,
      emailVerified: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    await db.insert(authUsers).values(users);

    const sessions = users.map((user, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      token: `expired-session-${index + 1}`,
      userId: user.id,
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    await db.insert(authSessions).values(sessions);

    const first = await processPublisherRetentionJob(db, now, undefined, { mode: "daily" });
    expect(first.expiredSessions).toBe(500);
    expect(first.done).toBe(false);

    const second = await processPublisherRetentionJob(db, now, undefined, { mode: "daily" });
    expect(second.expiredSessions).toBe(1);
    expect(second.done).toBe(true);
  });
});
