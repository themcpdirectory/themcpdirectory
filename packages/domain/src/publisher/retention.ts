import { sql } from "drizzle-orm";
import {
  accountErasureRequests,
  auditEvents,
  authSessions,
  authUsers,
  legalHolds,
  publisherClaims,
  publisherMemberships,
  transactionalOutbox,
  type Database,
} from "@themcpdirectory/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETENTION_BATCH_SIZE = 1_000;
const RETENTION_BATCH_SIZE = 500;

export interface PublisherRetentionPolicy {
  readonly expiredSessionGraceDays: number;
  readonly claimExpiryDays: number;
  readonly claimEvidenceRetentionDays: number;
  readonly outboxRetentionDays: number;
  readonly dormantAccountRetentionDays: number;
  readonly auditRetentionDays: number;
}

interface CountRow extends Record<string, unknown> {
  readonly count: number;
}

const DEFAULT_PUBLISHER_RETENTION_POLICY: PublisherRetentionPolicy = {
  expiredSessionGraceDays: 7,
  claimExpiryDays: 30,
  claimEvidenceRetentionDays: 90,
  outboxRetentionDays: 30,
  dormantAccountRetentionDays: 365,
  auditRetentionDays: 730,
};

function boundedPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

function clampBatchSize(batchSize: number): number {
  return Math.min(boundedPositiveInteger(batchSize, "batchSize"), MAX_RETENTION_BATCH_SIZE);
}

function resolvePolicy(overrides?: Partial<PublisherRetentionPolicy>): PublisherRetentionPolicy {
  const merged = {
    ...DEFAULT_PUBLISHER_RETENTION_POLICY,
    ...overrides,
  };

  return {
    expiredSessionGraceDays: boundedPositiveInteger(
      merged.expiredSessionGraceDays,
      "expiredSessionGraceDays",
    ),
    claimExpiryDays: boundedPositiveInteger(merged.claimExpiryDays, "claimExpiryDays"),
    claimEvidenceRetentionDays: boundedPositiveInteger(
      merged.claimEvidenceRetentionDays,
      "claimEvidenceRetentionDays",
    ),
    outboxRetentionDays: boundedPositiveInteger(merged.outboxRetentionDays, "outboxRetentionDays"),
    dormantAccountRetentionDays: boundedPositiveInteger(
      merged.dormantAccountRetentionDays,
      "dormantAccountRetentionDays",
    ),
    auditRetentionDays: boundedPositiveInteger(merged.auditRetentionDays, "auditRetentionDays"),
  };
}

async function deleteExpiredSessions(
  db: Database,
  now: Date,
  policy: PublisherRetentionPolicy,
): Promise<number> {
  const cutoff = new Date(now.getTime() - policy.expiredSessionGraceDays * DAY_MS);
  const cutoffIso = cutoff.toISOString();
  const batchSize = clampBatchSize(RETENTION_BATCH_SIZE);
  const [result] = await db.execute<CountRow>(sql`
    with candidates as materialized (
      select session.id
      from ${authSessions} session
      where session.expires_at < ${cutoffIso}::timestamptz
      order by session.expires_at asc, session.id asc
      limit ${batchSize}
    ), deleted as (
      delete from ${authSessions} session
      using candidates
      where session.id = candidates.id
      returning session.id
    )
    select count(*)::integer as count from deleted
  `);
  return Number(result?.count ?? 0);
}

async function expireAbandonedClaims(
  db: Database,
  now: Date,
  policy: PublisherRetentionPolicy,
): Promise<number> {
  const claimExpiryCutoff = new Date(now.getTime() - policy.claimExpiryDays * DAY_MS);
  const claimEvidenceCutoff = new Date(now.getTime() - policy.claimEvidenceRetentionDays * DAY_MS);
  const nowIso = now.toISOString();
  const claimExpiryCutoffIso = claimExpiryCutoff.toISOString();
  const claimEvidenceCutoffIso = claimEvidenceCutoff.toISOString();
  const batchSize = clampBatchSize(RETENTION_BATCH_SIZE);

  const [expiredClaims] = await db.execute<CountRow>(sql`
    with candidates as materialized (
      select claim.id
      from ${publisherClaims} claim
      where claim.status in ('pending', 'verifying')
        and claim.created_at <= ${claimExpiryCutoffIso}::timestamptz
      order by claim.created_at asc, claim.id asc
      limit ${batchSize}
    ), updated as (
      update ${publisherClaims} claim
      set status = 'withdrawn',
          failure_reason = 'verification_window_expired',
          evidence_summary = '{}'::jsonb,
          updated_at = ${nowIso}::timestamptz
      from candidates
      where claim.id = candidates.id
      returning claim.id
    )
    select count(*)::integer as count from updated
  `);

  await db.execute(sql`
    with candidates as materialized (
      select claim.id
      from ${publisherClaims} claim
      where claim.status in ('rejected', 'withdrawn')
        and claim.updated_at <= ${claimEvidenceCutoffIso}::timestamptz
        and claim.evidence_summary <> '{}'::jsonb
      order by claim.updated_at asc, claim.id asc
      limit ${batchSize}
    )
    update ${publisherClaims} claim
    set evidence_summary = '{}'::jsonb,
      updated_at = ${nowIso}::timestamptz
    from candidates
    where claim.id = candidates.id
  `);

  return Number(expiredClaims?.count ?? 0);
}

async function pruneAuditEvents(
  db: Database,
  now: Date,
  policy: PublisherRetentionPolicy,
): Promise<number> {
  const cutoff = new Date(now.getTime() - policy.auditRetentionDays * DAY_MS);
  const cutoffIso = cutoff.toISOString();
  const batchSize = clampBatchSize(RETENTION_BATCH_SIZE);
  const [result] = await db.execute<CountRow>(sql`
    with candidates as materialized (
      select audit.id
      from ${auditEvents} audit
      where audit.created_at <= ${cutoffIso}::timestamptz
      order by audit.created_at asc, audit.id asc
      limit ${batchSize}
    ), deleted as (
      delete from ${auditEvents} audit
      using candidates
      where audit.id = candidates.id
      returning audit.id
    )
    select count(*)::integer as count from deleted
  `);
  return Number(result?.count ?? 0);
}

async function pruneDeliveredOutboxRows(
  db: Database,
  now: Date,
  policy: PublisherRetentionPolicy,
): Promise<number> {
  const cutoff = new Date(now.getTime() - policy.outboxRetentionDays * DAY_MS);
  const cutoffIso = cutoff.toISOString();
  const batchSize = clampBatchSize(RETENTION_BATCH_SIZE);
  const [result] = await db.execute<CountRow>(sql`
    with candidates as materialized (
      select outbox.id
      from ${transactionalOutbox} outbox
      where outbox.delivered_at is not null
        and outbox.delivered_at <= ${cutoffIso}::timestamptz
      order by outbox.delivered_at asc, outbox.id asc
      limit ${batchSize}
    ), deleted as (
      delete from ${transactionalOutbox} outbox
      using candidates
      where outbox.id = candidates.id
      returning outbox.id
    )
    select count(*)::integer as count from deleted
  `);
  return Number(result?.count ?? 0);
}

async function deleteDormantUsersWithoutResponsibilities(
  db: Database,
  now: Date,
  policy: PublisherRetentionPolicy,
): Promise<number> {
  const cutoff = new Date(now.getTime() - policy.dormantAccountRetentionDays * DAY_MS);
  const nowIso = now.toISOString();
  const cutoffIso = cutoff.toISOString();
  const batchSize = clampBatchSize(RETENTION_BATCH_SIZE);
  const [result] = await db.execute<CountRow>(sql`
    with candidates as materialized (
      select user_row.id
      from ${authUsers} user_row
      left join lateral (
        select
          max(greatest(session.expires_at, session.updated_at, session.created_at)) as last_activity
        from ${authSessions} session
        where session.user_id = user_row.id
      ) session_activity on true
      left join lateral (
        select max(greatest(account.updated_at, account.created_at)) as last_activity
        from account
        where account.user_id = user_row.id
      ) account_activity on true
      where greatest(
          coalesce(session_activity.last_activity, to_timestamp(0)),
          coalesce(account_activity.last_activity, to_timestamp(0)),
          user_row.updated_at,
          user_row.created_at
        ) <= ${cutoffIso}::timestamptz
        and not exists (
          select 1
          from ${publisherMemberships} membership
          where membership.user_id = user_row.id
        )
        and not exists (
          select 1
          from ${publisherClaims} claim
          where claim.status in ('pending', 'verifying')
            and (claim.requester_user_id = user_row.id or claim.reviewed_by_user_id = user_row.id)
        )
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.subject_type = 'user'
            and hold.subject_id = user_row.id::text
            and hold.released_at is null
            and hold.expires_at > ${nowIso}::timestamptz
        )
        and not exists (
          select 1
          from ${accountErasureRequests} erasure
          where erasure.user_id = user_row.id
            and erasure.status in ('pending', 'in_progress', 'retry_scheduled', 'blocked')
        )
      order by user_row.updated_at asc, user_row.id asc
      limit ${batchSize}
    ), deleted as (
      delete from ${authUsers} user_row
      using candidates
      where user_row.id = candidates.id
      returning user_row.id
    )
    select count(*)::integer as count from deleted
  `);

  return Number(result?.count ?? 0);
}

export async function runPublisherRetentionSweep(
  db: Database,
  now: Date,
  policyOverrides?: Partial<PublisherRetentionPolicy>,
): Promise<{
  expiredSessions: number;
  expiredClaims: number;
  cleanedAudits: number;
  cleanedOutboxRows: number;
  deletedDormantUsers: number;
}> {
  const policy = resolvePolicy(policyOverrides);
  const expiredSessions = await deleteExpiredSessions(db, now, policy);
  const expiredClaims = await expireAbandonedClaims(db, now, policy);
  const cleanedAudits = await pruneAuditEvents(db, now, policy);
  const cleanedOutboxRows = await pruneDeliveredOutboxRows(db, now, policy);
  const deletedDormantUsers = await deleteDormantUsersWithoutResponsibilities(db, now, policy);

  return {
    expiredSessions,
    expiredClaims,
    cleanedAudits,
    cleanedOutboxRows,
    deletedDormantUsers,
  };
}
