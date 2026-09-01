import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@themcpdirectory/db";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";

interface TempDatabase {
  readonly databaseUrl: string;
  readonly databaseName: string;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  destroy(): Promise<void>;
}

async function chooseAdminConnectionString(): Promise<string> {
  const candidates = postgresAdminCandidates(process.env, "postgres://localhost:5432/postgres");

  for (const candidate of candidates) {
    const sql = postgres(candidate, { max: 1 });
    try {
      await sql`select current_database()`;
      await sql.end();
      return candidate;
    } catch {
      await sql.end({ timeout: 0 });
    }
  }

  throw new Error(
    "Unable to establish a local PostgreSQL admin connection for DB integration tests.",
  );
}

function buildDatabaseName(prefix: string): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${suffix}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function createDatabaseClient(databaseUrl: string): ReturnType<typeof drizzle<typeof schema>> {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });
  const migrationsFolder = fileURLToPath(
    new URL("../../../../packages/db/drizzle", import.meta.url),
  );
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}

export async function createTempDatabase(prefix = "task7_seed"): Promise<TempDatabase> {
  const adminConnectionString = await chooseAdminConnectionString();
  const admin = postgres(adminConnectionString, { max: 1 });
  const databaseName = buildDatabaseName(prefix);

  try {
    await admin.unsafe(`create database ${quoteIdentifier(databaseName)}`);
  } catch (err) {
    await admin.end({ timeout: 0 });
    throw err;
  }

  const databaseUrl = withDatabaseName(adminConnectionString, databaseName);
  await runMigrations(databaseUrl);

  const db = createDatabaseClient(databaseUrl);

  return {
    databaseUrl,
    databaseName,
    db,
    async destroy() {
      const testClient = postgres(databaseUrl, { max: 1 });
      await testClient.end({ timeout: 0 });

      await admin`
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = ${databaseName}
          and pid <> pg_backend_pid()
      `;

      await admin.unsafe(`drop database if exists ${quoteIdentifier(databaseName)}`);
      await admin.end({ timeout: 0 });
    },
  };
}
