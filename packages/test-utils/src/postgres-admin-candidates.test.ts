import { describe, expect, it } from "vitest";
import { postgresAdminCandidates } from "./index.js";

const localFallback = "postgres://localhost:5432/postgres";

describe("postgresAdminCandidates", () => {
  it("uses only an explicitly configured test admin URL", () => {
    expect(
      postgresAdminCandidates(
        {
          THEMCP_TEST_ADMIN_DATABASE_URL: "postgresql://test-admin@example.test/postgres",
          DATABASE_URL: "postgresql://application@example.test/application",
        },
        localFallback,
      ),
    ).toEqual(["postgresql://test-admin@example.test/postgres"]);
  });

  it("fails closed when the explicit test admin URL is empty", () => {
    expect(
      postgresAdminCandidates(
        {
          THEMCP_TEST_ADMIN_DATABASE_URL: "",
          DATABASE_URL: "postgresql://application@example.test/application",
        },
        localFallback,
      ),
    ).toEqual([]);
  });

  it("derives local fallbacks only when no explicit test admin URL is configured", () => {
    expect(
      postgresAdminCandidates(
        { DATABASE_URL: "postgresql://application@localhost/application?sslmode=disable" },
        localFallback,
      ),
    ).toEqual(["postgresql://application@localhost/postgres", localFallback]);
  });
});
