import { sql } from "drizzle-orm";
import { cliTelemetryDailyCounts, cliTelemetryEvents, type Database } from "@themcpdirectory/db";

const MAX_BATCH_SIZE = 1_000;

export interface TelemetryRetentionResult {
  readonly aggregatedCount: number;
  readonly prunedRawCount: number;
  readonly prunedAggregateCount: number;
  readonly done: boolean;
}

interface TelemetryRetentionRow extends Record<string, unknown> {
  readonly processedCount: number;
  readonly hasMore: boolean;
}

function boundedBatchSize(batchSize: number): number {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer");
  }
  return Math.min(batchSize, MAX_BATCH_SIZE);
}

export async function processTelemetryRetention(
  db: Database,
  input: { readonly now: Date; readonly batchSize: number },
): Promise<TelemetryRetentionResult> {
  const batchSize = boundedBatchSize(input.batchSize);
  const candidateLimit = batchSize + 1;
  const completedDayStart = new Date(
    Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()),
  ).toISOString();
  const rawRetentionCutoff = new Date(input.now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();

  const aggregation = await db.transaction(async (transaction) => {
    const [row] = await transaction.execute<TelemetryRetentionRow>(sql`
      with candidate_scope as materialized (
        select *
        from ${cliTelemetryEvents}
        where ${cliTelemetryEvents.aggregatedAt} is null
          and ${cliTelemetryEvents.receivedAt} < ${completedDayStart}::timestamptz
        order by ${cliTelemetryEvents.receivedAt}, ${cliTelemetryEvents.id}
        limit ${candidateLimit}
        for update skip locked
      ), candidates as materialized (
        select * from candidate_scope
        order by received_at, id
        limit ${batchSize}
      ), aggregated as (
        insert into ${cliTelemetryDailyCounts} (
          day, event, server_id, cli_major_minor, client, success, install_variant, count
        )
        select
          (received_at at time zone 'UTC')::date,
          event,
          server_id,
          cli_major_minor,
          client,
          success,
          install_variant,
          count(*)::bigint
        from candidates
        group by 1, 2, 3, 4, 5, 6, 7
        on conflict (
          day,
          event,
          (coalesce(server_id, '00000000-0000-0000-0000-000000000000'::uuid)),
          cli_major_minor,
          (coalesce(client, '')),
          success,
          (coalesce(install_variant, ''))
        ) do update set count = ${cliTelemetryDailyCounts.count} + excluded.count
        returning 1
      ), marked as (
        update ${cliTelemetryEvents} raw
        set aggregated_at = ${input.now.toISOString()}::timestamptz
        from candidates
        where raw.id = candidates.id
          and (select count(*) from aggregated) >= 0
        returning raw.id
      )
      select
        (select count(*)::integer from marked) as "processedCount",
        (select count(*) > ${batchSize} from candidate_scope) as "hasMore"
    `);
    return {
      processedCount: Number(row?.processedCount ?? 0),
      hasMore: row?.hasMore ?? false,
    };
  });

  const [rawPruned] = await db.execute<{
    readonly prunedCount: number;
    readonly hasMore: boolean;
  }>(sql`
    with candidate_scope as materialized (
      select id
      from ${cliTelemetryEvents}
      where ${cliTelemetryEvents.aggregatedAt} is not null
        and ${cliTelemetryEvents.receivedAt} < ${rawRetentionCutoff}::timestamptz
      order by ${cliTelemetryEvents.receivedAt}, ${cliTelemetryEvents.id}
      limit ${candidateLimit}
    ), candidates as materialized (
      select id from candidate_scope limit ${batchSize}
    ), deleted as (
      delete from ${cliTelemetryEvents} raw
      using candidates
      where raw.id = candidates.id
      returning raw.id
    )
    select
      (select count(*)::integer from deleted) as "prunedCount",
      (select count(*) > ${batchSize} from candidate_scope) as "hasMore"
  `);

  const [pruned] = await db.execute<{
    readonly prunedCount: number;
    readonly hasMore: boolean;
  }>(sql`
    with candidate_scope as materialized (
      select day, event, server_id, cli_major_minor, client, success, install_variant
      from ${cliTelemetryDailyCounts}
      where day < (${completedDayStart}::date - interval '13 months')::date
      order by day, event, server_id, cli_major_minor, client, success, install_variant
      limit ${candidateLimit}
    ), candidates as materialized (
      select * from candidate_scope limit ${batchSize}
    ), deleted as (
      delete from ${cliTelemetryDailyCounts} aggregate
      using candidates
      where aggregate.day = candidates.day
        and aggregate.event = candidates.event
        and aggregate.server_id is not distinct from candidates.server_id
        and aggregate.cli_major_minor = candidates.cli_major_minor
        and aggregate.client is not distinct from candidates.client
        and aggregate.success = candidates.success
        and aggregate.install_variant is not distinct from candidates.install_variant
      returning aggregate.day
    )
    select
      (select count(*)::integer from deleted) as "prunedCount",
      (select count(*) > ${batchSize} from candidate_scope) as "hasMore"
  `);

  return {
    aggregatedCount: aggregation.processedCount,
    prunedRawCount: Number(rawPruned?.prunedCount ?? 0),
    prunedAggregateCount: Number(pruned?.prunedCount ?? 0),
    done: !aggregation.hasMore && !(rawPruned?.hasMore ?? false) && !(pruned?.hasMore ?? false),
  };
}
