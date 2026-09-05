import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDatabase, type Database } from "@themcpdirectory/db";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";

interface TempDatabase {
  readonly databaseUrl: string;
  readonly db: Database;
  destroy(): Promise<void>;
}

async function chooseAdminConnectionString(): Promise<string> {
  const candidates = postgresAdminCandidates(process.env, "postgres://localhost:5432/postgres");

  for (const candidate of candidates) {
    const client = postgres(candidate, { max: 1 });
    try {
      await client`select current_database()`;
      await client.end();
      return candidate;
    } catch {
      await client.end({ timeout: 0 });
    }
  }

  throw new Error("Unable to establish a local PostgreSQL admin connection for auth tests.");
}

function databaseUrlFor(connectionString: string, databaseName: string): string {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function createTempDatabase(prefix: string): Promise<TempDatabase> {
  const adminConnectionString = await chooseAdminConnectionString();
  const admin = postgres(adminConnectionString, { max: 1 });
  const databaseName = `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  await admin.unsafe(`create database ${quoteIdentifier(databaseName)}`);
  const databaseUrl = databaseUrlFor(adminConnectionString, databaseName);
  const db = createDatabase(databaseUrl);
  const migrationsFolder = fileURLToPath(new URL("../../../db/drizzle", import.meta.url));

  try {
    await migrate(db, { migrationsFolder });
  } catch (error) {
    await db.$client.end({ timeout: 0 });
    await admin.unsafe(`drop database if exists ${quoteIdentifier(databaseName)}`);
    await admin.end({ timeout: 0 });
    throw error;
  }

  return {
    databaseUrl,
    db,
    async destroy() {
      await db.$client.end({ timeout: 0 });
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
