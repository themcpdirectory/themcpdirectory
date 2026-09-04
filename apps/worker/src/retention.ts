import { sql } from "drizzle-orm";
import { legalHolds, serverHealthChecks, trustSignals, type Database } from "@themcpdirectory/db";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HEALTH_RETENTION_DAYS = 90;
const TRUST_RETENTION_MONTHS = 24;
const MAX_RETENTION_BATCH_SIZE = 1_000;

interface RetentionInput {
  readonly now: Date;
  readonly batchSize: number;
}

export interface RetentionResult {
  readonly deletedCount: number;
  readonly skippedHeldCount: number;
  readonly done: boolean;
}

interface RetentionQueryResult extends Record<string, unknown> {
  readonly deletedCount: number;
  readonly skippedHeldCount: number;
  readonly done: boolean;
}

function boundedBatchSize(batchSize: number): number {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer.");
  }
  return Math.min(batchSize, MAX_RETENTION_BATCH_SIZE);
}

function subtractUtcMonths(value: Date, months: number): Date {
  const targetMonth = value.getUTCMonth() - months;
  const targetMonthStart = new Date(
    Date.UTC(
      value.getUTCFullYear(),
      targetMonth,
      1,
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(value.getUTCDate(), lastDay));
  return targetMonthStart;
}

function asRetentionResult(row: RetentionQueryResult | undefined): RetentionResult {
  return {
    deletedCount: Number(row?.deletedCount ?? 0),
    skippedHeldCount: Number(row?.skippedHeldCount ?? 0),
    done: row?.done ?? true,
  };
}

export async function cleanupHealthHistory(
  db: Database,
  input: RetentionInput,
): Promise<RetentionResult> {
  const batchSize = boundedBatchSize(input.batchSize);
  const candidateLimit = batchSize + 1;
  const cutoff = new Date(input.now.getTime() - HEALTH_RETENTION_DAYS * DAY_MS).toISOString();
  const now = input.now.toISOString();
  const [result] = await db.execute<RetentionQueryResult>(sql`
    with candidates as materialized (
      select health.id, health.checked_at
      from ${serverHealthChecks} health
      where health.checked_at < ${cutoff}::timestamptz
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.scope = 'health_history'
            and hold.subject_type = 'server'
            and hold.subject_id = health.server_id::text
            and hold.released_at is null
            and hold.expires_at > ${now}::timestamptz
        )
      order by health.checked_at, health.id
      limit ${candidateLimit}
    ), held_candidates as materialized (
      select held.id
      from ${serverHealthChecks} held
      where held.checked_at < ${cutoff}::timestamptz
        and exists (
          select 1
          from ${legalHolds} hold
          where hold.scope = 'health_history'
            and hold.subject_type = 'server'
            and hold.subject_id = held.server_id::text
            and hold.released_at is null
            and hold.expires_at > ${now}::timestamptz
        )
      order by held.checked_at, held.id
      limit ${candidateLimit}
    ), delete_batch as (
      select id
      from candidates
      order by checked_at, id
      limit ${batchSize}
    ), deleted as (
      delete from ${serverHealthChecks} health
      using delete_batch
      where health.id = delete_batch.id
      returning health.id
    )
    select
      (select count(*)::integer from deleted) as "deletedCount",
      (select count(*)::integer from held_candidates) as "skippedHeldCount",
      (select count(*) <= ${batchSize} from candidates) as done
  `);
  return asRetentionResult(result);
}

export async function cleanupTrustHistory(
  db: Database,
  input: RetentionInput,
): Promise<RetentionResult> {
  const batchSize = boundedBatchSize(input.batchSize);
  const candidateLimit = batchSize + 1;
  const cutoff = subtractUtcMonths(input.now, TRUST_RETENTION_MONTHS).toISOString();
  const now = input.now.toISOString();
  const [result] = await db.execute<RetentionQueryResult>(sql`
    with candidates as materialized (
      select history.id, coalesce(history.checked_at, history.created_at) as observed_at
      from ${trustSignals} history
      where (
          history.checked_at < ${cutoff}::timestamptz
          or (
            history.checked_at is null
            and history.created_at < ${cutoff}::timestamptz
          )
        )
        and exists (
          select 1
          from ${trustSignals} newer
          where newer.server_id = history.server_id
            and newer.signal_key = history.signal_key
            and newer.checked_at is not null
            and newer.source is not null
            and newer.summary is not null
            and (
              history.checked_at is null
              or history.source is null
              or history.summary is null
              or (newer.checked_at, newer.updated_at, newer.id) >
                (history.checked_at, history.updated_at, history.id)
            )
        )
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.scope = 'trust_history'
            and hold.subject_type = 'server'
            and hold.subject_id = history.server_id::text
            and hold.released_at is null
            and hold.expires_at > ${now}::timestamptz
        )
      order by observed_at, history.id
      limit ${candidateLimit}
    ), held_candidates as materialized (
      select held.id
      from ${trustSignals} held
      where (
          held.checked_at < ${cutoff}::timestamptz
          or (
            held.checked_at is null
            and held.created_at < ${cutoff}::timestamptz
          )
        )
        and exists (
          select 1
          from ${trustSignals} newer
          where newer.server_id = held.server_id
            and newer.signal_key = held.signal_key
            and newer.checked_at is not null
            and newer.source is not null
            and newer.summary is not null
            and (
              held.checked_at is null
              or held.source is null
              or held.summary is null
              or (newer.checked_at, newer.updated_at, newer.id) >
                (held.checked_at, held.updated_at, held.id)
            )
        )
        and exists (
          select 1
          from ${legalHolds} hold
          where hold.scope = 'trust_history'
            and hold.subject_type = 'server'
            and hold.subject_id = held.server_id::text
            and hold.released_at is null
            and hold.expires_at > ${now}::timestamptz
        )
      order by coalesce(held.checked_at, held.created_at), held.id
      limit ${candidateLimit}
    ), delete_batch as (
      select id
      from candidates
      order by observed_at, id
      limit ${batchSize}
    ), deleted as (
      delete from ${trustSignals} history
      using delete_batch
      where history.id = delete_batch.id
      returning history.id
    )
    select
      (select count(*)::integer from deleted) as "deletedCount",
      (select count(*)::integer from held_candidates) as "skippedHeldCount",
      (select count(*) <= ${batchSize} from candidates) as done
  `);
  return asRetentionResult(result);
}
