import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDatabase, type Database } from "@themcpdirectory/db";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";

export interface TempDatabase {
  readonly databaseUrl: string;
  readonly databaseName: string;
  readonly db: Database;
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

  throw new Error("Unable to establish a local PostgreSQL admin connection for API tests.");
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

async function runMigrations(databaseUrl: string): Promise<void> {
  const db = createDatabase(databaseUrl);
  const migrationsFolder = fileURLToPath(
    new URL("../../../../packages/db/drizzle", import.meta.url),
  );
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end({ timeout: 0 });
  }
}

async function dropDatabase(
  admin: ReturnType<typeof postgres>,
  databaseName: string,
): Promise<void> {
  await admin`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${databaseName}
      and pid <> pg_backend_pid()
  `;
  await admin.unsafe(`drop database if exists ${quoteIdentifier(databaseName)}`);
}

export async function createTempDatabase(prefix = "api_integration"): Promise<TempDatabase> {
  const adminConnectionString = await chooseAdminConnectionString();
  const admin = postgres(adminConnectionString, { max: 1 });
  const databaseName = buildDatabaseName(prefix);
  let databaseCreated = false;

  try {
    await admin.unsafe(`create database ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
    const databaseUrl = withDatabaseName(adminConnectionString, databaseName);
    await runMigrations(databaseUrl);
    const db = createDatabase(databaseUrl);

    return {
      databaseUrl,
      databaseName,
      db,
      async destroy() {
        try {
          try {
            await db.$client.end({ timeout: 0 });
          } finally {
            await dropDatabase(admin, databaseName);
          }
        } finally {
          await admin.end({ timeout: 0 });
        }
      },
    };
  } catch (error) {
    try {
      if (databaseCreated) await dropDatabase(admin, databaseName);
    } finally {
      await admin.end({ timeout: 0 });
    }
    throw error;
  }
}
