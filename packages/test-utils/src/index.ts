interface PostgresTestEnvironment {
  readonly DATABASE_URL?: string;
  readonly THEMCP_TEST_ADMIN_DATABASE_URL?: string;
}

function adminUrlFromDatabaseUrl(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = "/postgres";
    adminUrl.search = "";
    adminUrl.hash = "";
    return adminUrl.toString();
  } catch {
    return null;
  }
}

export function postgresAdminCandidates(
  env: PostgresTestEnvironment,
  localFallback: string,
): string[] {
  if (Object.hasOwn(env, "THEMCP_TEST_ADMIN_DATABASE_URL")) {
    return env.THEMCP_TEST_ADMIN_DATABASE_URL ? [env.THEMCP_TEST_ADMIN_DATABASE_URL] : [];
  }

  return [adminUrlFromDatabaseUrl(env.DATABASE_URL), localFallback].filter(
    (value): value is string => value !== null,
  );
}
