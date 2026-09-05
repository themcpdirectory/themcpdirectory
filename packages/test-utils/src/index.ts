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

export { createFixtureDirectoryApiServer } from "./directory-api-server.js";
export type {
  FixtureDirectoryApiServer,
  FixtureDirectoryApiServerOptions,
} from "./directory-api-server.js";
export { createFakeProcessRuntime } from "./fake-process-runtime.js";
export type { FakeProcessRuntime, FakeProcessRuntimeOptions } from "./fake-process-runtime.js";
export { createInProcessCliHarness } from "./cli-harness.js";
export type { CliHarnessDependencies, InProcessCliHarness } from "./cli-harness.js";
export {
  AUTHENTICATED_FIXTURE_ROUTE_MATRIX,
  PUBLIC_RELEASE_ROUTE_MATRIX,
  SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
} from "./release-route-matrix.js";
