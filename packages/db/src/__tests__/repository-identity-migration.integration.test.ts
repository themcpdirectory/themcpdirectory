import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { expect, it } from "vitest";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";

async function connectToAdminDatabase(): Promise<{ url: string; sql: Sql }> {
  const candidates = postgresAdminCandidates(process.env, "postgres://localhost:5432/postgres");

  for (const url of candidates) {
    const sql = postgres(url, { max: 1 });
    try {
      await sql`select current_database()`;
      return { url, sql };
    } catch {
      await sql.end({ timeout: 0 });
    }
  }

  throw new Error("Unable to establish a local PostgreSQL admin connection.");
}

interface SqlExecutor {
  unsafe(query: string): Promise<unknown>;
}

async function executeMigration(sql: SqlExecutor, filename: string): Promise<void> {
  const path = fileURLToPath(new URL(`../../drizzle/${filename}`, import.meta.url));
  const migration = await readFile(path, "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await sql.unsafe(statement);
  }
}

async function executeMigrationTransaction(sql: Sql, filename: string): Promise<void> {
  await sql.begin(async (transaction) => executeMigration(transaction, filename));
}

async function waitForBlockedTableLock(sql: Sql, processId: number, tableName: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [lock] = await sql<Array<{ waiting: boolean }>>`
      select exists (
        select 1
        from pg_locks
        inner join pg_class on pg_class.oid = pg_locks.relation
        where pg_locks.pid = ${processId}
          and pg_class.relname = ${tableName}
          and not pg_locks.granted
      ) as waiting
    `;
    if (lock?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Process ${processId} did not wait for a lock on ${tableName}.`);
}

it("quarantines duplicate repository identities before creating the unique index", async () => {
  const adminConnection = await connectToAdminDatabase();
  const databaseName = `task9_repository_identity_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const databaseUrl = new URL(adminConnection.url);
  databaseUrl.pathname = `/${databaseName}`;
  databaseUrl.search = "";
  databaseUrl.hash = "";

  await adminConnection.sql.unsafe(`create database "${databaseName}"`);
  const sql = postgres(databaseUrl.toString(), { max: 1 });
  const migrationSql = postgres(databaseUrl.toString(), { max: 1 });
  const writerSql = postgres(databaseUrl.toString(), { max: 1 });

  try {
    await executeMigrationTransaction(sql, "0000_tranquil_peter_quill.sql");

    const snapshotServerId = randomUUID();
    await sql`
      insert into servers (
        id, slug, title, short_description, listing_status, moderation_status,
        first_seen_at, last_seen_at
      ) values (
        ${snapshotServerId}, 'snapshot-owner', 'Snapshot owner', 'Snapshot collision owner',
        'active', 'normal', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
      )
    `;
    const duplicateCheckedAt = "2026-08-03T00:00:00.000Z";
    await sql`
      insert into repository_snapshots (
        server_id, provider, external_repository_id, owner, name, url, payload, checked_at
      ) values
        (
          ${snapshotServerId}, 'github', 'snapshot-123', 'example', 'project',
          'https://github.com/example/project', ${sql.json({ sequence: 1 })}, ${duplicateCheckedAt}
        ),
        (
          ${snapshotServerId}, 'github', 'snapshot-123', 'example', 'project',
          'https://github.com/example/project', ${sql.json({ sequence: 2 })}, ${duplicateCheckedAt}
        )
    `;

    const winnerId = randomUUID();
    const duplicateId = randomUUID();
    await sql`
      insert into servers (
        id, slug, title, short_description, listing_status, moderation_status,
        repository_url, repository_source, repository_external_id, repository_subfolder,
        first_seen_at, last_seen_at
      ) values
        (
          ${winnerId}, 'first-owner', 'First owner', 'First seen owner', 'active', 'normal',
          'https://github.com/example/project', 'github', '12345', 'packages/first',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
        ),
        (
          ${duplicateId}, 'duplicate-owner', 'Duplicate owner', 'Duplicate identity', 'active', 'normal',
          'https://github.com/example/project/tree/main/packages/second', 'github', '12345', 'packages/second',
          '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'
        )
    `;

    let signalWriterHasServerLock!: () => void;
    const writerHasServerLock = new Promise<void>((resolve) => {
      signalWriterHasServerLock = resolve;
    });
    let releaseWriter!: () => void;
    const writerMayContinue = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writer = writerSql.begin(async (transaction) => {
      await transaction`
        update servers
        set updated_at = now()
        where id = ${winnerId}
      `;
      signalWriterHasServerLock();
      await writerMayContinue;
      await transaction`
        insert into repository_snapshots (
          server_id, provider, external_repository_id, owner, name, url, checked_at
        ) values (
          ${winnerId}, 'github', 'writer-123', 'example', 'writer',
          'https://github.com/example/writer', '2026-08-04T00:00:00.000Z'
        )
      `;
    });
    await writerHasServerLock;

    const [migrationBackend] = await migrationSql<Array<{ pid: number }>>`
      select pg_backend_pid() as pid
    `;
    const migrationBatch = migrationSql.begin(async (transaction) => {
      await executeMigration(transaction, "0001_complex_scalphunter.sql");
      await executeMigration(transaction, "0002_wide_green_goblin.sql");
    });
    await waitForBlockedTableLock(sql, migrationBackend!.pid, "servers");
    releaseWriter();
    await Promise.all([writer, migrationBatch]);

    const snapshotRows = await sql<
      Array<{ id: string; checked_at: string; payload: { sequence: number } }>
    >`
      select id, checked_at::text, payload
      from repository_snapshots
      where server_id = ${snapshotServerId}
      order by checked_at, id
    `;
    expect(snapshotRows).toHaveLength(2);
    expect(new Set(snapshotRows.map((row) => row.checked_at)).size).toBe(2);
    expect(snapshotRows.map((row) => row.payload.sequence).sort()).toEqual([1, 2]);

    const [snapshotRepairEvent] = await sql<
      Array<{ action: string; metadata: { originalSnapshot: { checked_at: string } } }>
    >`
      select action, metadata
      from moderation_events
      where server_id = ${snapshotServerId}
        and action = 'repository_snapshot_check_conflict_repaired'
    `;
    expect(snapshotRepairEvent?.action).toBe("repository_snapshot_check_conflict_repaired");
    expect(new Date(snapshotRepairEvent!.metadata.originalSnapshot.checked_at).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z",
    );

    const rows = await sql<
      Array<{
        id: string;
        moderation_status: string;
        repository_url: string | null;
        repository_source: string | null;
        repository_external_id: string | null;
        repository_subfolder: string | null;
      }>
    >`
      select id, moderation_status, repository_url, repository_source,
        repository_external_id, repository_subfolder
      from servers
      where id in (${winnerId}, ${duplicateId})
      order by first_seen_at, id
    `;
    expect(rows).toEqual([
      {
        id: winnerId,
        moderation_status: "normal",
        repository_url: "https://github.com/example/project",
        repository_source: "github",
        repository_external_id: "12345",
        repository_subfolder: "packages/first",
      },
      {
        id: duplicateId,
        moderation_status: "under_review",
        repository_url: null,
        repository_source: null,
        repository_external_id: null,
        repository_subfolder: null,
      },
    ]);

    const [event] = await sql<
      Array<{
        server_id: string;
        action: string;
        metadata: Record<string, unknown>;
      }>
    >`
      select server_id, action, metadata
      from moderation_events
      where server_id = ${duplicateId}
    `;
    expect(event).toMatchObject({
      server_id: duplicateId,
      action: "repository_identity_conflict_quarantined",
      metadata: {
        repositoryUrl: "https://github.com/example/project/tree/main/packages/second",
        repositorySource: "github",
        repositoryExternalId: "12345",
        repositorySubfolder: "packages/second",
        retainedByServerId: winnerId,
      },
    });

    const [index] = await sql<Array<{ index_name: string | null }>>`
      select to_regclass('servers_repository_identity_uidx')::text as index_name
    `;
    expect(index?.index_name).toBe("servers_repository_identity_uidx");
  } finally {
    await migrationSql.end({ timeout: 0 });
    await writerSql.end({ timeout: 0 });
    await sql.end({ timeout: 0 });
    await adminConnection.sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${databaseName}
        and pid <> pg_backend_pid()
    `;
    await adminConnection.sql.unsafe(`drop database if exists "${databaseName}"`);
    await adminConnection.sql.end({ timeout: 0 });
  }
});
