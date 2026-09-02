import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";
import { createTempDatabase } from "./postgres-test-db.js";

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate: vi.fn().mockRejectedValue(new Error("injected migration failure")),
}));

describe("createTempDatabase", () => {
  it("drops the database and closes its admin connection when migration fails", async () => {
    const prefix = `task9_failed_migration_${Date.now()}`;

    await expect(createTempDatabase(prefix)).rejects.toThrow("injected migration failure");

    const adminUrl = postgresAdminCandidates(process.env, "postgres://localhost:5432/postgres")[0];
    if (!adminUrl) throw new Error("Expected PostgreSQL admin candidate");
    const admin = postgres(adminUrl, { max: 1 });
    try {
      const rows = await admin<{ count: number }[]>`
        select count(*)::int as count
        from pg_database
        where datname like ${`${prefix}_%`}
      `;
      expect(rows[0]?.count).toBe(0);
    } finally {
      await admin.end({ timeout: 0 });
    }
  });
});
