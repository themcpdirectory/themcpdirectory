import { expect, test } from "@playwright/test";
import { resolveTestDatabaseConfig } from "./setup/test-database";

test.describe("E2E database isolation", () => {
  test("rejects non-test databases and derives the target URL", () => {
    expect(() =>
      resolveTestDatabaseConfig({
        TEST_DATABASE_NAME: "postgres",
        THEMCP_TEST_ADMIN_DATABASE_URL: "postgresql://localhost:5432/postgres",
      }),
    ).toThrow(/test database name/i);

    expect(
      resolveTestDatabaseConfig({
        TEST_DATABASE_NAME: "task8_web_e2e_review",
        THEMCP_TEST_ADMIN_DATABASE_URL: "postgresql://tester:secret@localhost:5432/postgres",
      }),
    ).toEqual({
      adminUrl: "postgresql://tester:secret@localhost:5432/postgres",
      databaseName: "task8_web_e2e_review",
      databaseUrl: "postgresql://tester:secret@localhost:5432/task8_web_e2e_review",
    });
  });
});
