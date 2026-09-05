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

interface CountWithDoneRow extends CountRow {
  readonly done: boolean;
}

interface ExpireClaimsResult {
  readonly expiredClaims: number;
  readonly done: boolean;
}

type RetentionStore = Pick<Database, "execute">;

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

async function lockLegalHoldMutations(db: RetentionStore): Promise<void> {
  // SHARE conflicts with INSERT/UPDATE/DELETE's ROW EXCLUSIVE lock, serializing hold mutations
  // against this sweep so hold checks and destructive statements observe one consistent snapshot.
  await db.execute(sql`lock table ${legalHolds} in share mode`);
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
  db: RetentionStore,
  now: Date,
  policy: PublisherRetentionPolicy,
  batchSize: number,
): Promise<CountWithDoneRow> {
  const cutoff = new Date(now.getTime() - policy.expiredSessionGraceDays * DAY_MS);
  const cutoffIso = cutoff.toISOString();
  const candidateLimit = batchSize + 1;
  const nowIso = now.toISOString();
  const [result] = await db.execute<CountWithDoneRow>(sql`
    with candidates as materialized (
      select session.id
      from ${authSessions} session
      where session.expires_at < ${cutoffIso}::timestamptz
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.released_at is null
            and hold.expires_at > ${nowIso}::timestamptz
            and (
              (hold.subject_type = 'user' and hold.subject_id = session.user_id::text)
              or (hold.subject_type = 'session' and hold.subject_id = session.id::text)
            )
        )
      order by session.expires_at asc, session.id asc
      limit ${candidateLimit}
    ), delete_batch as (
      select id
      from candidates
      order by id
      limit ${batchSize}
    ), deleted as (
      delete from ${authSessions} session
      using delete_batch
      where session.id = delete_batch.id
      returning session.id
    )
    select
      (select count(*)::integer from deleted) as count,
      (select count(*) <= ${batchSize} from candidates) as done
  `);
  return {
    count: Number(result?.count ?? 0),
    done: result?.done ?? true,
  };
}

async function expireAbandonedClaims(
  db: RetentionStore,
  now: Date,
  policy: PublisherRetentionPolicy,
  batchSize: number,
): Promise<ExpireClaimsResult> {
  const claimExpiryCutoff = new Date(now.getTime() - policy.claimExpiryDays * DAY_MS);
  const claimEvidenceCutoff = new Date(now.getTime() - policy.claimEvidenceRetentionDays * DAY_MS);
  const nowIso = now.toISOString();
  const claimExpiryCutoffIso = claimExpiryCutoff.toISOString();
  const claimEvidenceCutoffIso = claimEvidenceCutoff.toISOString();
  const candidateLimit = batchSize + 1;

  const [expiredClaims] = await db.execute<CountWithDoneRow>(sql`
    with candidates as materialized (
      select claim.id
      from ${publisherClaims} claim
      where claim.status in ('pending', 'verifying')
        and claim.created_at <= ${claimExpiryCutoffIso}::timestamptz
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.released_at is null
            and hold.expires_at > ${nowIso}::timestamptz
            and (
              (hold.subject_type = 'user' and hold.subject_id = claim.requester_user_id::text)
              or (hold.subject_type = 'publisher_claim' and hold.subject_id = claim.id::text)
            )
        )
      order by claim.created_at asc, claim.id asc
      limit ${candidateLimit}
    ), update_batch as (
      select id
      from candidates
      order by id
      limit ${batchSize}
    ), updated as (
      update ${publisherClaims} claim
      set status = 'withdrawn',
          failure_reason = 'verification_window_expired',
          evidence_summary = '{}'::jsonb,
          updated_at = ${nowIso}::timestamptz
      from update_batch
      where claim.id = update_batch.id
      returning claim.id
    )
    select
      (select count(*)::integer from updated) as count,
      (select count(*) <= ${batchSize} from candidates) as done
  `);

  const [cleanedEvidence] = await db.execute<CountWithDoneRow>(sql`
    with candidates as materialized (
      select claim.id
      from ${publisherClaims} claim
      where claim.status in ('rejected', 'withdrawn', 'revoked', 'superseded')
        and greatest(
          claim.expires_at,
          coalesce(claim.reviewed_at, to_timestamp(0)),
          coalesce(claim.verified_at, to_timestamp(0)),
          claim.created_at
        ) <= ${claimEvidenceCutoffIso}::timestamptz
        and claim.evidence_summary <> '{}'::jsonb
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.released_at is null
            and hold.expires_at > ${nowIso}::timestamptz
            and (
              (hold.subject_type = 'user' and hold.subject_id = claim.requester_user_id::text)
              or (hold.subject_type = 'publisher_claim' and hold.subject_id = claim.id::text)
            )
        )
      order by claim.updated_at asc, claim.id asc
      limit ${candidateLimit}
    ), update_batch as (
      select id
      from candidates
      order by id
      limit ${batchSize}
    ), updated as (
    update ${publisherClaims} claim
    set evidence_summary = '{}'::jsonb,
      failure_reason = null
    from update_batch
    where claim.id = update_batch.id
    returning claim.id
    )
    select
      (select count(*)::integer from updated) as count,
      (select count(*) <= ${batchSize} from candidates) as done
  `);

  return {
    expiredClaims: Number(expiredClaims?.count ?? 0),
    done: Boolean((expiredClaims?.done ?? true) && (cleanedEvidence?.done ?? true)),
  };
}

async function pruneAuditEvents(
  db: RetentionStore,
  now: Date,
  policy: PublisherRetentionPolicy,
  batchSize: number,
): Promise<CountWithDoneRow> {
  const cutoff = new Date(now.getTime() - policy.auditRetentionDays * DAY_MS);
  const cutoffIso = cutoff.toISOString();
  const candidateLimit = batchSize + 1;
  const nowIso = now.toISOString();
  const [result] = await db.execute<CountWithDoneRow>(sql`
    with candidates as materialized (
      select audit.id
      from ${auditEvents} audit
      where audit.created_at <= ${cutoffIso}::timestamptz
        and not exists (
          select 1
          from ${legalHolds} hold
          where hold.released_at is null
            and hold.expires_at > ${nowIso}::timestamptz
            and (
              (hold.subject_type = 'user' and hold.subject_id = audit.actor_user_id::text)
              or (
                hold.subject_type = 'user'
                and audit.resource_type = 'user'
                and hold.subject_id = audit.resource_id
              )
              or (
                hold.subject_type = audit.resource_type
                and hold.subject_id = audit.resource_id
              )
            )
        )
      order by audit.created_at asc, audit.id asc
      limit ${candidateLimit}
    ), delete_batch as (
      select id
      from candidates
      order by id
      limit ${batchSize}
    ), deleted as (
      delete from ${auditEvents} audit
      using delete_batch
      where audit.id = delete_batch.id
      returning audit.id
    )
    select
      (select count(*)::integer from deleted) as count,
      (select count(*) <= ${batchSize} from candidates) as done
  `);
  return {
    count: Number(result?.count ?? 0),
    done: result?.done ?? true,
  };
}

async function pruneDeliveredOutboxRows(
  db: RetentionStore,
  now: Date,
  policy: PublisherRetentionPolicy,
  batchSize: number,
): Promise<CountWithDoneRow> {
  const cutoff = new Date(now.getTime() - policy.outboxRetentionDays * DAY_MS);
  const cutoffIso = cutoff.toISOString();
  const candidateLimit = batchSize + 1;
  const [result] = await db.execute<CountWithDoneRow>(sql`
    with candidates as materialized (
      select outbox.id
      from ${transactionalOutbox} outbox
      where outbox.delivered_at is not null
        and outbox.delivered_at <= ${cutoffIso}::timestamptz
      order by outbox.delivered_at asc, outbox.id asc
      limit ${candidateLimit}
    ), delete_batch as (
      select id
      from candidates
      order by id
      limit ${batchSize}
    ), deleted as (
      delete from ${transactionalOutbox} outbox
      using delete_batch
      where outbox.id = delete_batch.id
      returning outbox.id
    )
    select
      (select count(*)::integer from deleted) as count,
      (select count(*) <= ${batchSize} from candidates) as done
  `);
  return {
    count: Number(result?.count ?? 0),
    done: result?.done ?? true,
  };
}

async function deleteDormantUsersWithoutResponsibilities(
  db: RetentionStore,
  now: Date,
  policy: PublisherRetentionPolicy,
  batchSize: number,
): Promise<CountWithDoneRow> {
  const cutoff = new Date(now.getTime() - policy.dormantAccountRetentionDays * DAY_MS);
  const nowIso = now.toISOString();
  const cutoffIso = cutoff.toISOString();
  const candidateLimit = batchSize + 1;
  const [result] = await db.execute<CountWithDoneRow>(sql`
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
      limit ${candidateLimit}
    ), delete_batch as (
      select id
      from candidates
      order by id
      limit ${batchSize}
    ), deleted as (
      delete from ${authUsers} user_row
      using delete_batch
      where user_row.id = delete_batch.id
      returning user_row.id
    )
    select
      (select count(*)::integer from deleted) as count,
      (select count(*) <= ${batchSize} from candidates) as done
  `);

  return {
    count: Number(result?.count ?? 0),
    done: result?.done ?? true,
  };
}

export interface PublisherRetentionRunOptions {
  readonly includeDormantUsers?: boolean;
  readonly batchSize?: number;
}

export async function runPublisherRetentionSweep(
  db: Database,
  now: Date,
  policyOverrides?: Partial<PublisherRetentionPolicy>,
  options?: PublisherRetentionRunOptions,
): Promise<{
  expiredSessions: number;
  expiredClaims: number;
  cleanedAudits: number;
  cleanedOutboxRows: number;
  deletedDormantUsers: number;
  done: boolean;
}> {
  const policy = resolvePolicy(policyOverrides);
  const includeDormantUsers = options?.includeDormantUsers ?? true;
  const batchSize = clampBatchSize(options?.batchSize ?? RETENTION_BATCH_SIZE);

  return db.transaction(async (tx) => {
    await lockLegalHoldMutations(tx);

    const expiredSessions = await deleteExpiredSessions(tx, now, policy, batchSize);
    const expiredClaims = await expireAbandonedClaims(tx, now, policy, batchSize);
    const cleanedAudits = await pruneAuditEvents(tx, now, policy, batchSize);
    const cleanedOutboxRows = await pruneDeliveredOutboxRows(tx, now, policy, batchSize);
    const dormantCleanup = includeDormantUsers
      ? await deleteDormantUsersWithoutResponsibilities(tx, now, policy, batchSize)
      : { count: 0, done: true };

    return {
      expiredSessions: expiredSessions.count,
      expiredClaims: expiredClaims.expiredClaims,
      cleanedAudits: cleanedAudits.count,
      cleanedOutboxRows: cleanedOutboxRows.count,
      deletedDormantUsers: dormantCleanup.count,
      done:
        expiredSessions.done &&
        expiredClaims.done &&
        cleanedAudits.done &&
        cleanedOutboxRows.done &&
        dormantCleanup.done,
    };
  });
}
