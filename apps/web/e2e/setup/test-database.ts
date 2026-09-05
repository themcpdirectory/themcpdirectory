import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(process.cwd(), "../..");
const DEFAULT_ADMIN_URL = "postgresql://localhost:5432/postgres";

interface TestDatabaseConfig {
  readonly adminUrl: string;
  readonly databaseName: string;
  readonly databaseUrl: string;
}

export function resolveTestDatabaseConfig(
  env: Readonly<Record<string, string | undefined>>,
): TestDatabaseConfig {
  const databaseName = env.TEST_DATABASE_NAME ?? `task8_web_e2e_${env.TEST_PORT ?? "3099"}`;
  if (!/^task8_web_e2e(?:_[a-zA-Z0-9]+)*$/.test(databaseName)) {
    throw new Error("Test database name must use the reserved 'task8_web_e2e' prefix.");
  }

  const adminUrl = new URL(env.THEMCP_TEST_ADMIN_DATABASE_URL ?? DEFAULT_ADMIN_URL);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  databaseUrl.search = "";
  databaseUrl.hash = "";

  adminUrl.search = "";
  adminUrl.hash = "";

  return {
    adminUrl: adminUrl.toString(),
    databaseName,
    databaseUrl: databaseUrl.toString(),
  };
}

const testDatabaseConfig = resolveTestDatabaseConfig(process.env);

function databaseUrlFor(name: string): string {
  const url = new URL(testDatabaseConfig.adminUrl);
  url.pathname = `/${name}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export const TEST_DATABASE_NAME = testDatabaseConfig.databaseName;
export const TEST_DATABASE_URL = databaseUrlFor(TEST_DATABASE_NAME);
export const TEST_PORT = process.env.TEST_PORT ?? "3099";

/**
 * Fixture-only Better Auth/GitHub App configuration for `next dev` in e2e.
 * `TEST_BETTER_AUTH_SECRET` must match the value fixtures use to sign the
 * Better Auth session cookie (see `publisher-session-fixtures.ts`); the
 * GitHub values are never exchanged with GitHub in these tests.
 */
export const TEST_BETTER_AUTH_SECRET = "e2e-fixture-secret-0123456789abcdef0123456789ab"; // gitleaks:allow
export const TEST_GITHUB_APP_ENV = {
  GITHUB_CLIENT_ID: "e2e-fixture-github-client-id",
  GITHUB_CLIENT_SECRET: "e2e-fixture-github-client-secret",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY:
    "-----BEGIN RSA PRIVATE KEY-----\ne2e-fixture-not-a-real-key\n-----END RSA PRIVATE KEY-----",
  GITHUB_APP_SLUG: "themcpdirectory-e2e-fixture",
} as const;

async function withAdminClient<T>(callback: (client: postgres.Sql) => Promise<T>): Promise<T> {
  const client = postgres(testDatabaseConfig.adminUrl, { max: 1 });
  try {
    return await callback(client);
  } finally {
    await client.end({ timeout: 0 });
  }
}

export async function dropTestDatabase(): Promise<void> {
  await withAdminClient(async (client) => {
    await client`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${TEST_DATABASE_NAME}
        and pid <> pg_backend_pid()
    `;
    await client.unsafe(`drop database if exists ${quoteIdentifier(TEST_DATABASE_NAME)}`);
  });
}

export async function prepareTestDatabase(): Promise<void> {
  await dropTestDatabase();
  await withAdminClient(async (client) => {
    await client.unsafe(`create database ${quoteIdentifier(TEST_DATABASE_NAME)}`);
  });

  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
    WEB_PORT: TEST_PORT,
    API_PORT: "3001",
  };

  await execFileAsync("pnpm", ["--filter", "@themcpdirectory/db", "db:migrate"], {
    cwd: REPOSITORY_ROOT,
    env,
  });
  await execFileAsync("pnpm", ["--filter", "@themcpdirectory/db-seed", "db:seed"], {
    cwd: REPOSITORY_ROOT,
    env,
  });
}
