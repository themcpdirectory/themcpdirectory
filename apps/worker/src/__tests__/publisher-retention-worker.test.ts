import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { authUsers, legalHolds, type Database } from "@themcpdirectory/db";
import { processPublisherRetentionJob } from "../publisher-retention-worker.js";
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

    await db.insert(legalHolds).values({
      scope: "publisher_dispute",
      subjectType: "user",
      subjectId: heldUser!.id,
      reason: "open dispute",
      expiresAt: new Date("2027-12-31T00:00:00.000Z"),
      createdBy: "worker-test",
    });

    const summary = await processPublisherRetentionJob(db, now);

    expect(summary.deletedDormantUsers).toBe(1);

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
  });
});
