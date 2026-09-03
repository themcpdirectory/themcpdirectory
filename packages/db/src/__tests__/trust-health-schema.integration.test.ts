import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
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

async function executeMigrations(sql: Sql): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  const filenames = (await readdir(migrationsFolder))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  await sql.begin(async (transaction) => {
    for (const filename of filenames) {
      const migration = await readFile(`${migrationsFolder}/${filename}`, "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await transaction.unsafe(statement);
      }
    }
  });
}

it("migrates Phase F storage and enforces observation idempotency", async () => {
  const adminConnection = await connectToAdminDatabase();
  const databaseName = `phase_f_storage_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const databaseUrl = new URL(adminConnection.url);
  databaseUrl.pathname = `/${databaseName}`;
  databaseUrl.search = "";
  databaseUrl.hash = "";

  await adminConnection.sql.unsafe(`create database "${databaseName}"`);
  const sql = postgres(databaseUrl.toString(), { max: 1 });

  try {
    await executeMigrations(sql);

    const [storage] = await sql<Array<{ legal_holds: string | null; health_columns: number }>>`
      select
        to_regclass('legal_holds')::text as legal_holds,
        count(*) filter (
          where table_name = 'server_health_checks'
            and column_name in ('final_origin', 'redirect_count', 'method_used')
        )::int as health_columns
      from information_schema.columns
    `;
    expect(storage).toEqual({ legal_holds: "legal_holds", health_columns: 3 });

    const serverId = randomUUID();
    const serverVersionId = randomUUID();
    const remoteId = randomUUID();
    await sql`
      insert into servers (
        id, slug, title, short_description, listing_status, moderation_status,
        first_seen_at, last_seen_at
      ) values (
        ${serverId}, 'phase-f-storage', 'Phase F storage', 'Storage integration fixture',
        'active', 'normal', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
      )
    `;
    await sql`
      insert into server_versions (
        id, server_id, version, first_seen_at, last_seen_at, normalized_payload
      ) values (
        ${serverVersionId}, ${serverId}, '1.0.0', '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z', ${sql.json({})}
      )
    `;
    await sql`
      insert into server_remotes (id, server_version_id, transport_type, url_template)
      values (${remoteId}, ${serverVersionId}, 'streamable-http', 'https://api.example.com/mcp')
    `;

    const healthCheckedAt = "2026-09-01T18:00:00.000Z";
    await sql`
      insert into server_health_checks (
        server_id, server_version_id, remote_id, check_type, status, latency_ms,
        http_status, final_origin, redirect_count, method_used, checked_at
      ) values (
        ${serverId}, ${serverVersionId}, ${remoteId}, 'remote_probe', 'healthy', 240,
        200, 'https://api.example.com', 1, 'GET', ${healthCheckedAt}
      )
    `;
    await expect(
      sql`
        insert into server_health_checks (
          server_id, remote_id, check_type, status, checked_at
        ) values (${serverId}, ${remoteId}, 'remote_probe', 'healthy', ${healthCheckedAt})
      `,
    ).rejects.toMatchObject({ code: "23505" });

    const signalCheckedAt = "2026-09-01T18:30:00.000Z";
    await sql`
      insert into trust_signals (server_id, signal_key, status, source, summary, checked_at)
      values (
        ${serverId}, 'official_registry', 'positive', 'registry',
        'Listed in the Official MCP Registry', ${signalCheckedAt}
      )
    `;
    await expect(
      sql`
        insert into trust_signals (server_id, signal_key, status, checked_at)
        values (${serverId}, 'official_registry', 'positive', ${signalCheckedAt})
      `,
    ).rejects.toMatchObject({ code: "23505" });

    const [hold] = await sql<Array<{ reason: string; expires_at: Date }>>`
      insert into legal_holds (
        scope, subject_type, subject_id, reason, expires_at, created_by
      ) values (
        'health_history', 'server', ${serverId}, 'incident review',
        '2026-12-31T00:00:00.000Z', 'phase-f-test'
      )
      returning reason, expires_at
    `;
    expect(hold).toEqual({
      reason: "incident review",
      expires_at: new Date("2026-12-31T00:00:00.000Z"),
    });
  } finally {
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
