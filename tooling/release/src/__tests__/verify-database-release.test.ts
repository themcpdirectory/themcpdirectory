import { describe, expect, it } from "vitest";
import { DATABASE_RELEASE_STEPS, workspaceCommandEnv } from "../verify-database-release.js";

describe("database release gate", () => {
  it("covers empty, upgrade, and repeatable seed checks", () => {
    expect(DATABASE_RELEASE_STEPS).toEqual([
      "create-empty-db",
      "run-empty-migrations",
      "load-previous-release-fixture",
      "run-upgrade-migrations",
      "run-seed-once",
      "run-seed-twice",
      "compare-fixture-owned-checksum",
    ]);
  });

  it("provides migration commands with complete deterministic shared configuration", () => {
    expect(
      workspaceCommandEnv(
        {
          DATABASE_URL: "postgresql://old.example/old",
          EXISTING_VALUE: "preserved",
        },
        "postgresql://localhost/release",
      ),
    ).toMatchObject({
      DATABASE_URL: "postgresql://localhost/release",
      MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
      EXISTING_VALUE: "preserved",
    });

    expect(
      workspaceCommandEnv(
        { MCP_REGISTRY_BASE_URL: "https://registry.example.test" },
        "postgresql://localhost/release",
      ).MCP_REGISTRY_BASE_URL,
    ).toBe("https://registry.example.test");
  });
});
