import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cliTelemetryDailyCounts,
  cliTelemetryEvents,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { asc, eq, sql } from "drizzle-orm";
import { processTelemetryRetention } from "../telemetry-retention.js";
import { createTempDatabase } from "./postgres-test-db.js";

describe("telemetry aggregation and retention", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("telemetry_retention");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("rolls up completed UTC days once and retains marked raw rows", async () => {
    const [server] = await db
      .insert(servers)
      .values({
        slug: "telemetry-worker",
        title: "Telemetry worker",
        shortDescription: "Telemetry worker fixture",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
        lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      })
      .returning({ id: servers.id });

    await db.insert(cliTelemetryEvents).values([
      {
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.2",
        client: "vscode",
        success: true,
        installVariant: "package",
        receivedAt: new Date("2026-09-05T10:00:00.000Z"),
      },
      {
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.2",
        client: "vscode",
        success: true,
        installVariant: "package",
        receivedAt: new Date("2026-09-05T11:00:00.000Z"),
      },
      {
        event: "search",
        cliMajorMinor: "1.2",
        success: true,
        receivedAt: new Date("2026-09-06T01:00:00.000Z"),
      },
    ]);

    const first = await processTelemetryRetention(db, {
      now: new Date("2026-09-06T12:00:00.000Z"),
      batchSize: 100,
    });
    const second = await processTelemetryRetention(db, {
      now: new Date("2026-09-06T12:00:00.000Z"),
      batchSize: 100,
    });

    expect(first).toEqual({
      aggregatedCount: 2,
      prunedRawCount: 0,
      prunedAggregateCount: 0,
      done: true,
    });
    expect(second).toEqual({
      aggregatedCount: 0,
      prunedRawCount: 0,
      prunedAggregateCount: 0,
      done: true,
    });
    await expect(db.select().from(cliTelemetryDailyCounts)).resolves.toEqual([
      expect.objectContaining({ day: "2026-09-05", event: "add", count: 2 }),
    ]);
    const rawRows = await db
      .select()
      .from(cliTelemetryEvents)
      .orderBy(asc(cliTelemetryEvents.receivedAt));
    expect(rawRows).toHaveLength(3);
    expect(rawRows.slice(0, 2)).toEqual([
      expect.objectContaining({ event: "add", aggregatedAt: expect.any(Date) }),
      expect.objectContaining({ event: "add", aggregatedAt: expect.any(Date) }),
    ]);
    expect(rawRows[2]).toEqual(expect.objectContaining({ event: "search", aggregatedAt: null }));
  });

  it("keeps raw rows when aggregate persistence rolls back", async () => {
    await db.insert(cliTelemetryEvents).values({
      event: "search",
      cliMajorMinor: "1.2",
      success: true,
      receivedAt: new Date("2026-09-05T10:00:00.000Z"),
    });
    await db.execute(sql`
      create function reject_telemetry_aggregate() returns trigger language plpgsql as $$
      begin
        raise exception 'aggregate rejected';
      end
      $$
    `);
    await db.execute(sql`
      create trigger reject_telemetry_aggregate
      before insert on ${cliTelemetryDailyCounts}
      for each statement execute function reject_telemetry_aggregate()
    `);

    await expect(
      processTelemetryRetention(db, {
        now: new Date("2026-09-06T12:00:00.000Z"),
        batchSize: 100,
      }),
    ).rejects.toThrow();
    await expect(db.select().from(cliTelemetryEvents)).resolves.toEqual([
      expect.objectContaining({ aggregatedAt: null }),
    ]);
  });

  it("processes raw events in bounded batches", async () => {
    await db.insert(cliTelemetryEvents).values(
      Array.from({ length: 3 }, (_, index) => ({
        event: "search" as const,
        cliMajorMinor: "1.2",
        success: true,
        receivedAt: new Date(`2026-09-05T10:0${index}:00.000Z`),
      })),
    );

    const first = await processTelemetryRetention(db, {
      now: new Date("2026-09-06T12:00:00.000Z"),
      batchSize: 2,
    });
    const second = await processTelemetryRetention(db, {
      now: new Date("2026-09-06T12:00:00.000Z"),
      batchSize: 2,
    });

    expect(first).toEqual({
      aggregatedCount: 2,
      prunedRawCount: 0,
      prunedAggregateCount: 0,
      done: false,
    });
    expect(second).toEqual({
      aggregatedCount: 1,
      prunedRawCount: 0,
      prunedAggregateCount: 0,
      done: true,
    });
    await expect(db.select().from(cliTelemetryEvents)).resolves.toHaveLength(3);
    await expect(db.select().from(cliTelemetryDailyCounts)).resolves.toEqual([
      expect.objectContaining({ count: 3 }),
    ]);
  });

  it("deletes only raw rows older than seven days in a bounded batch", async () => {
    await db.insert(cliTelemetryEvents).values([
      {
        event: "search",
        cliMajorMinor: "1.2",
        success: true,
        receivedAt: new Date("2026-08-29T10:00:00.000Z"),
        aggregatedAt: new Date("2026-08-30T00:00:00.000Z"),
      },
      {
        event: "search",
        cliMajorMinor: "1.2",
        success: true,
        receivedAt: new Date("2026-08-30T13:00:00.000Z"),
        aggregatedAt: new Date("2026-08-31T00:00:00.000Z"),
      },
    ]);

    const result = await processTelemetryRetention(db, {
      now: new Date("2026-09-06T12:00:00.000Z"),
      batchSize: 1,
    });

    expect(result).toEqual({
      aggregatedCount: 0,
      prunedRawCount: 1,
      prunedAggregateCount: 0,
      done: true,
    });
    await expect(
      db
        .select()
        .from(cliTelemetryEvents)
        .where(eq(cliTelemetryEvents.receivedAt, new Date("2026-08-29T10:00:00.000Z"))),
    ).resolves.toHaveLength(0);
    await expect(db.select().from(cliTelemetryEvents)).resolves.toHaveLength(1);
  });
});
