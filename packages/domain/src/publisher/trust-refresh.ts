import { and, eq, isNull, sql } from "drizzle-orm";
import { publishers, servers, transactionalOutbox, trustSignals, type Database } from "@themcpdirectory/db";

const TRUST_REFRESH_EVENT_TYPE = "trust.refresh";
const TRUST_SIGNAL_KEY = "publisher_verified";
const OUTBOX_CLAIM_BATCH_SIZE = 100;
const OUTBOX_LEASE_MS = 5 * 60_000;
const MAX_RETRY_ATTEMPTS = 10;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60_000;

interface ClaimedOutboxRow extends Record<string, unknown> {
  readonly id: string;
  readonly eventType: string;
  readonly eventKey: string;
  readonly payload: unknown;
  readonly attemptCount: number | string;
  readonly createdAt: Date | string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseAggregateServerId(eventKey: string): string | null {
  const parts = eventKey.split(":");
  if (parts.length < 3) return null;
  if (parts[0] !== "trust.refresh") return null;
  return isUuid(parts[1] ?? "") ? (parts[1] as string) : null;
}

function parsePayloadServerId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidate = payload as { serverId?: unknown };
  return typeof candidate.serverId === "string" && isUuid(candidate.serverId)
    ? candidate.serverId
    : null;
}

function safeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : "TRUST_REFRESH_DELIVERY_FAILED";
  return /^[A-Z0-9_]{3,100}$/.test(message) ? message : "TRUST_REFRESH_DELIVERY_FAILED";
}

function nextRetryDelayMs(attemptCount: number): number {
  const backoffMs = 2 ** Math.max(attemptCount, 0) * 60_000;
  return Math.min(backoffMs, MAX_RETRY_DELAY_MS);
}

async function claimOutboxRows(db: Database, now: Date): Promise<ClaimedOutboxRow[]> {
  const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS);
  const nowIso = now.toISOString();
  const leaseUntilIso = leaseUntil.toISOString();
  const claimed = await db.execute<ClaimedOutboxRow>(sql`
    with candidates as materialized (
      select outbox.id
      from ${transactionalOutbox} outbox
      where outbox.event_type = ${TRUST_REFRESH_EVENT_TYPE}
        and outbox.delivered_at is null
        and outbox.available_at <= ${nowIso}::timestamptz
      order by outbox.available_at asc, outbox.id asc
      for update skip locked
      limit ${OUTBOX_CLAIM_BATCH_SIZE}
    ), claimed as (
      update ${transactionalOutbox} outbox
        set available_at = ${leaseUntilIso}::timestamptz,
          updated_at = ${nowIso}::timestamptz
      from candidates
      where outbox.id = candidates.id
      returning
        outbox.id as "id",
        outbox.event_type as "eventType",
        outbox.event_key as "eventKey",
        outbox.payload as "payload",
        outbox.attempt_count as "attemptCount",
        outbox.created_at as "createdAt"
    )
    select *
    from claimed
  `);

  return claimed;
}

async function markOutboxDelivered(db: Database, outboxId: string, now: Date): Promise<void> {
  await db
    .update(transactionalOutbox)
    .set({ deliveredAt: now, lastError: null, updatedAt: now })
    .where(and(eq(transactionalOutbox.id, outboxId), isNull(transactionalOutbox.deliveredAt)));
}

async function markOutboxRetry(
  db: Database,
  row: ClaimedOutboxRow,
  now: Date,
  error: unknown,
): Promise<void> {
  const currentAttemptCount = Number(row.attemptCount);
  const nextAttemptCount = Math.min(
    Number.isFinite(currentAttemptCount) ? currentAttemptCount + 1 : 1,
    MAX_RETRY_ATTEMPTS,
  );
  const availableAt = new Date(now.getTime() + nextRetryDelayMs(nextAttemptCount - 1));
  await db
    .update(transactionalOutbox)
    .set({
      attemptCount: nextAttemptCount,
      availableAt,
      lastError: safeDeliveryError(error),
      updatedAt: now,
    })
    .where(and(eq(transactionalOutbox.id, row.id), isNull(transactionalOutbox.deliveredAt)));
}

export async function refreshPublisherVerificationTrustSignal(
  db: Database,
  serverId: string,
  checkedAt = new Date(),
): Promise<void> {
  const [server] = await db
    .select({
      id: servers.id,
      verificationState: publishers.verificationState,
    })
    .from(servers)
    .leftJoin(publishers, eq(publishers.id, servers.publisherId))
    .where(eq(servers.id, serverId))
    .limit(1);

  if (!server) {
    throw new Error("TRUST_REFRESH_SERVER_NOT_FOUND");
  }

  const isVerified = server.verificationState === "verified";
  await db
    .insert(trustSignals)
    .values({
      serverId,
      signalKey: TRUST_SIGNAL_KEY,
      status: isVerified ? "positive" : "unknown",
      source: "publisher_claim",
      summary: isVerified ? "Publisher verified" : "Publisher verification unavailable",
      checkedAt,
      updatedAt: checkedAt,
    })
    .onConflictDoUpdate({
      target: [trustSignals.serverId, trustSignals.signalKey, trustSignals.checkedAt],
      set: {
        status: isVerified ? "positive" : "unknown",
        source: "publisher_claim",
        summary: isVerified ? "Publisher verified" : "Publisher verification unavailable",
        updatedAt: checkedAt,
      },
    });
}

export async function deliverTrustRefreshOutbox(
  db: Database,
  now: Date,
): Promise<{ delivered: number; retried: number }> {
  const claimedRows = await claimOutboxRows(db, now);
  let delivered = 0;
  let retried = 0;

  for (const row of claimedRows) {
    try {
      const aggregateServerId = parseAggregateServerId(row.eventKey);
      const payloadServerId = parsePayloadServerId(row.payload);
      if (
        row.eventType !== TRUST_REFRESH_EVENT_TYPE ||
        aggregateServerId === null ||
        payloadServerId === null ||
        aggregateServerId !== payloadServerId
      ) {
        throw new Error("TRUST_REFRESH_EVENT_INVALID");
      }
      const checkedAt =
        row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
      if (Number.isNaN(checkedAt.getTime())) throw new Error("TRUST_REFRESH_EVENT_INVALID");

      await refreshPublisherVerificationTrustSignal(db, payloadServerId, checkedAt);
      await markOutboxDelivered(db, row.id, now);
      delivered += 1;
    } catch (error) {
      await markOutboxRetry(db, row, now, error);
      retried += 1;
    }
  }

  return { delivered, retried };
}
