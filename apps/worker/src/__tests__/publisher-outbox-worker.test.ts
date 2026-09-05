import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  publishers,
  servers,
  transactionalOutbox,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";
import { processPublisherOutboxJob } from "../publisher-outbox-worker.js";
import { createTempDatabase } from "./postgres-test-db.js";

describe("publisher outbox worker", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task9_publisher_outbox_worker");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it("delivers trust.refresh rows idempotently", async () => {
    const now = new Date("2026-09-01T15:00:00.000Z");
    const outboxCreatedAt = new Date("2026-09-01T14:59:00.000Z");

    const [publisher] = await db
      .insert(publishers)
      .values({
        slug: "publisher-outbox-verified",
        displayName: "Outbox Verified Publisher",
        verificationState: "verified",
      })
      .returning({ id: publishers.id });

    const [server] = await db
      .insert(servers)
      .values({
        slug: "publisher-outbox-server",
        title: "Publisher outbox server",
        shortDescription: "Synthetic outbox fixture",
        listingStatus: "active",
        moderationStatus: "normal",
        publisherId: publisher!.id,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: servers.id });

    await db.insert(transactionalOutbox).values({
      eventType: "trust.refresh",
      eventKey: `trust.refresh:${server!.id}:11111111-1111-4111-8111-111111111111:verified`,
      payload: {
        serverId: server!.id,
        claimId: "11111111-1111-4111-8111-111111111111",
        publisherId: publisher!.id,
        reason: "claim.verified",
      },
      availableAt: now,
      createdAt: outboxCreatedAt,
      updatedAt: outboxCreatedAt,
    });

    const first = await processPublisherOutboxJob(db, now);
    const second = await processPublisherOutboxJob(db, new Date("2026-09-01T15:01:00.000Z"));

    expect(first).toEqual({ delivered: 1, retried: 0 });
    expect(second).toEqual({ delivered: 0, retried: 0 });

    const signals = await db
      .select({
        signalKey: trustSignals.signalKey,
        status: trustSignals.status,
        checkedAt: trustSignals.checkedAt,
      })
      .from(trustSignals);
    expect(signals).toEqual([
      {
        signalKey: "publisher_verified",
        status: "positive",
        checkedAt: outboxCreatedAt,
      },
    ]);
  });
});
