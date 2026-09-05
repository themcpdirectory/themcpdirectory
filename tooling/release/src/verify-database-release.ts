import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres, { type Sql } from "postgres";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";

export const DATABASE_RELEASE_STEPS = [
  "create-empty-db",
  "run-empty-migrations",
  "load-previous-release-fixture",
  "run-upgrade-migrations",
  "run-seed-once",
  "run-seed-twice",
  "compare-fixture-owned-checksum",
] as const;

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS_DIRECTORY = path.join(REPOSITORY_ROOT, "packages/db/drizzle");
const PREVIOUS_RELEASE_FIXTURE = fileURLToPath(
  new URL("../fixtures/previous-release.sql", import.meta.url),
);
const PREVIOUS_RELEASE_MIGRATION = "0004_trust_signal_legacy_retention";

interface MigrationJournalEntry {
  readonly tag: string;
  readonly when: number;
}

interface MigrationJournal {
  readonly entries: readonly MigrationJournalEntry[];
}

interface TemporaryDatabase {
  readonly sql: Sql;
  readonly url: string;
  destroy(): Promise<void>;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function connectToAdminDatabase(): Promise<{ readonly sql: Sql; readonly url: string }> {
  const candidates = postgresAdminCandidates(process.env, "postgresql://localhost:5432/postgres");
  for (const url of candidates) {
    const sql = postgres(url, { max: 1 });
    try {
      await sql`select current_database()`;
      return { sql, url };
    } catch {
      await sql.end({ timeout: 0 });
    }
  }
  throw new Error(
    "Unable to establish a PostgreSQL admin connection for the database release gate.",
  );
}

async function createTemporaryDatabase(label: string): Promise<TemporaryDatabase> {
  const admin = await connectToAdminDatabase();
  const databaseName = `release_${label}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const url = databaseUrlFor(admin.url, databaseName);
  try {
    await admin.sql.unsafe(`create database ${quoteIdentifier(databaseName)}`);
  } catch (error) {
    await admin.sql.end({ timeout: 0 });
    throw error;
  }
  const sql = postgres(url, { max: 1 });
  return {
    sql,
    url,
    async destroy() {
      const errors: unknown[] = [];
      try {
        await sql.end({ timeout: 0 });
      } catch (error) {
        errors.push(error);
      }
      try {
        await admin.sql`
          select pg_terminate_backend(pid)
          from pg_stat_activity
          where datname = ${databaseName}
            and pid <> pg_backend_pid()
        `;
      } catch (error) {
        errors.push(error);
      }
      try {
        await admin.sql.unsafe(`drop database if exists ${quoteIdentifier(databaseName)}`);
      } catch (error) {
        errors.push(error);
      }
      try {
        await admin.sql.end({ timeout: 0 });
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, `Failed to clean up temporary database ${databaseName}.`);
      }
    },
  };
}

function runWorkspaceCommand(command: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", [command], {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`pnpm ${command} failed with exit code ${exitCode}.`));
    });
  });
}

async function readMigrationJournal(): Promise<MigrationJournal> {
  const raw = JSON.parse(
    await readFile(path.join(MIGRATIONS_DIRECTORY, "meta/_journal.json"), "utf8"),
  ) as unknown;
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("entries" in raw) ||
    !Array.isArray(raw.entries)
  ) {
    throw new Error("Drizzle migration journal is invalid.");
  }
  for (const entry of raw.entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("tag" in entry) ||
      typeof entry.tag !== "string" ||
      !("when" in entry) ||
      typeof entry.when !== "number"
    ) {
      throw new Error("Drizzle migration journal contains an invalid entry.");
    }
  }
  return raw as MigrationJournal;
}

async function applyPreviousReleaseMigrations(sql: Sql): Promise<void> {
  const journal = await readMigrationJournal();
  const cutoff = journal.entries.findIndex((entry) => entry.tag === PREVIOUS_RELEASE_MIGRATION);
  if (cutoff < 0 || cutoff === journal.entries.length - 1) {
    throw new Error("Previous-release migration boundary is missing or no upgrade follows it.");
  }
  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
  for (const entry of journal.entries.slice(0, cutoff + 1)) {
    const migration = await readFile(path.join(MIGRATIONS_DIRECTORY, `${entry.tag}.sql`), "utf8");
    await sql.begin(async (transaction) => {
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await transaction.unsafe(statement);
      }
      const hash = createHash("sha256").update(migration).digest("hex");
      await transaction`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entry.when})
      `;
    });
  }
}

async function assertCurrentSchema(sql: Sql): Promise<void> {
  const [schema] = await sql<{ publisherColumn: string | null; erasureTable: string | null }[]>`
    select
      to_regclass('public.account_erasure_requests')::text as "erasureTable",
      (
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'publishers'
          and column_name = 'github_org_id'
      ) as "publisherColumn"
  `;
  if (
    schema?.erasureTable !== "account_erasure_requests" ||
    schema.publisherColumn !== "github_org_id"
  ) {
    throw new Error("Current database schema is incomplete after migrations.");
  }
}

export async function runEmptyDatabaseMigrationCheck(): Promise<void> {
  const database = await createTemporaryDatabase("empty");
  try {
    await runWorkspaceCommand("db:migrate", database.url);
    await assertCurrentSchema(database.sql);
  } finally {
    await database.destroy();
  }
}

export async function runUpgradeMigrationCheck(): Promise<void> {
  const database = await createTemporaryDatabase("upgrade");
  try {
    await applyPreviousReleaseMigrations(database.sql);
    await database.sql.unsafe(await readFile(PREVIOUS_RELEASE_FIXTURE, "utf8"));
    await runWorkspaceCommand("db:migrate", database.url);
    await assertCurrentSchema(database.sql);
    const [publisher] = await database.sql<
      { githubOrgId: string | null; ownershipState: string; slug: string }[]
    >`
      select
        slug::text as slug,
        ownership_state as "ownershipState",
        github_org_id as "githubOrgId"
      from publishers
      where id = '00000000-0000-4000-8000-000000000014'
    `;
    if (
      publisher?.slug !== "previous-release-publisher" ||
      publisher.ownershipState !== "unlocked" ||
      publisher.githubOrgId !== null
    ) {
      throw new Error("Previous-release publisher data did not survive the schema upgrade.");
    }
  } finally {
    await database.destroy();
  }
}

async function fixtureOwnedChecksum(sql: Sql): Promise<string> {
  const projections = {
    categories: `select to_jsonb(c) - 'id' - 'created_at' - 'updated_at' as value from categories c`,
    publishers: `select to_jsonb(p) - 'id' - 'created_at' - 'updated_at' as value from publishers p`,
    registrySources: `select to_jsonb(rs) - 'id' - 'created_at' - 'updated_at' as value from registry_sources rs`,
    registrySnapshots: `
      select to_jsonb(s) - 'id' - 'registry_source_id' - 'created_at'
        || jsonb_build_object('registry_source_key', rs.key) as value
      from registry_snapshots s
      join registry_sources rs on rs.id = s.registry_source_id
    `,
    servers: `
      select to_jsonb(s) - 'id' - 'publisher_id' - 'current_version_id' - 'created_at' - 'updated_at'
        || jsonb_build_object(
          'publisher_slug', p.slug,
          'current_version', case when cv.id is null then null else jsonb_build_object(
            'version', cv.version,
            'registry_source_key', cvrs.key
          ) end
        ) as value
      from servers s
      left join publishers p on p.id = s.publisher_id
      left join server_versions cv on cv.id = s.current_version_id
      left join registry_sources cvrs on cvrs.id = cv.registry_source_id
    `,
    serverVersions: `
      select to_jsonb(v) - 'id' - 'server_id' - 'registry_source_id' - 'registry_snapshot_id' - 'created_at' - 'updated_at'
        || jsonb_build_object(
          'server_slug', s.slug,
          'registry_source_key', rs.key,
          'registry_snapshot_hash', snap.payload_hash
        ) as value
      from server_versions v
      join servers s on s.id = v.server_id
      left join registry_sources rs on rs.id = v.registry_source_id
      left join registry_snapshots snap on snap.id = v.registry_snapshot_id
    `,
    serverPackages: `
      select to_jsonb(p) - 'id' - 'server_version_id' - 'created_at' - 'updated_at'
        || jsonb_build_object('server_slug', s.slug, 'server_version', v.version, 'registry_source_key', rs.key) as value
      from server_packages p
      join server_versions v on v.id = p.server_version_id
      join servers s on s.id = v.server_id
      left join registry_sources rs on rs.id = v.registry_source_id
    `,
    serverRemotes: `
      select to_jsonb(r) - 'id' - 'server_version_id' - 'created_at' - 'updated_at'
        || jsonb_build_object('server_slug', s.slug, 'server_version', v.version, 'registry_source_key', rs.key) as value
      from server_remotes r
      join server_versions v on v.id = r.server_version_id
      join servers s on s.id = v.server_id
      left join registry_sources rs on rs.id = v.registry_source_id
    `,
    serverIcons: `
      select to_jsonb(i) - 'id' - 'server_version_id' - 'created_at' - 'updated_at'
        || jsonb_build_object('server_slug', s.slug, 'server_version', v.version, 'registry_source_key', rs.key) as value
      from server_icons i
      join server_versions v on v.id = i.server_version_id
      join servers s on s.id = v.server_id
      left join registry_sources rs on rs.id = v.registry_source_id
    `,
    serverAliases: `
      select to_jsonb(a) - 'id' - 'server_id' - 'created_at' - 'updated_at'
        || jsonb_build_object('server_slug', s.slug) as value
      from server_aliases a
      join servers s on s.id = a.server_id
    `,
    serverCategories: `
      select to_jsonb(sc) - 'server_id' - 'category_id' - 'created_at'
        || jsonb_build_object('server_slug', s.slug, 'category_slug', c.slug) as value
      from server_categories sc
      join servers s on s.id = sc.server_id
      join categories c on c.id = sc.category_id
    `,
  } as const;
  const contents: Record<string, unknown> = {};
  for (const [name, projection] of Object.entries(projections)) {
    const rows = await sql.unsafe(
      `select value from (${projection}) projected order by value::text`,
    );
    contents[name] = rows.map((row) => row.value);
  }
  return createHash("sha256").update(JSON.stringify(contents)).digest("hex");
}

export async function runSeedRepeatabilityCheck(): Promise<string> {
  const database = await createTemporaryDatabase("seed");
  try {
    await runWorkspaceCommand("db:migrate", database.url);
    await runWorkspaceCommand("db:seed", database.url);
    const firstChecksum = await fixtureOwnedChecksum(database.sql);
    await runWorkspaceCommand("db:seed", database.url);
    const secondChecksum = await fixtureOwnedChecksum(database.sql);
    if (firstChecksum !== secondChecksum) {
      throw new Error(
        `Seed fixtures are not repeatable: ${firstChecksum} changed to ${secondChecksum}.`,
      );
    }
    return secondChecksum;
  } finally {
    await database.destroy();
  }
}

async function verifyDatabaseRelease(): Promise<void> {
  await runEmptyDatabaseMigrationCheck();
  await runUpgradeMigrationCheck();
  const checksum = await runSeedRepeatabilityCheck();
  console.log(`Database release gate passed with fixture checksum ${checksum}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyDatabaseRelease();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
