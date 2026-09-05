import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accountErasureRequests, authUsers, type Database } from "@themcpdirectory/db";
import type { AccountErasureDeps } from "@themcpdirectory/domain";
import { processPublisherErasureJob } from "../publisher-erasure-worker.js";
import { createTempDatabase } from "./postgres-test-db.js";

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
});
