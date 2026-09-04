import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";
import type { Database } from "../client.js";
import * as schema from "../schema/index.js";

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

function formatDatabaseName(prefix: string): string {
  const normalizedPrefix = prefix.replaceAll(/[^a-zA-Z0-9_]+/g, "_").slice(0, 40);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return `${normalizedPrefix}_${suffix}`.toLowerCase();
}

export async function listMigrationFilenames(): Promise<string[]> {
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  return (await readdir(migrationsFolder)).filter((filename) => filename.endsWith(".sql")).sort();
}

export async function applyMigrations(sql: Sql, filenames: readonly string[]): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

  for (const filename of filenames) {
    const migration = await readFile(`${migrationsFolder}/${filename}`, "utf8");
    await sql.begin(async (transaction) => {
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) {
          await transaction.unsafe(statement);
        }
      }
    });
  }
}

export async function createTempDatabase(
  prefix: string,
  options?: { migrations?: readonly string[] },
): Promise<{
  db: Database;
  sql: Sql;
  destroy: () => Promise<void>;
  url: string;
  databaseName: string;
}> {
  const adminConnection = await connectToAdminDatabase();
  const databaseName = formatDatabaseName(prefix);
  const databaseUrl = new URL(adminConnection.url);
  databaseUrl.pathname = `/${databaseName}`;
  databaseUrl.search = "";
  databaseUrl.hash = "";

  await adminConnection.sql.unsafe(`create database "${databaseName}"`);
  const sql = postgres(databaseUrl.toString(), { max: 1 });

  try {
    const migrations = options?.migrations ?? (await listMigrationFilenames());
    await applyMigrations(sql, migrations);
  } catch (error) {
    await sql.end({ timeout: 0 });
    await adminConnection.sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${databaseName}
        and pid <> pg_backend_pid()
    `;
    await adminConnection.sql.unsafe(`drop database if exists "${databaseName}"`);
    await adminConnection.sql.end({ timeout: 0 });
    throw error;
  }

  const db = drizzle(sql, { schema }) as Database;

  const destroy = async () => {
    await sql.end({ timeout: 0 });
    await adminConnection.sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${databaseName}
        and pid <> pg_backend_pid()
    `;
    await adminConnection.sql.unsafe(`drop database if exists "${databaseName}"`);
    await adminConnection.sql.end({ timeout: 0 });
  };

  return {
    db,
    sql,
    destroy,
    url: databaseUrl.toString(),
    databaseName,
  };
}
