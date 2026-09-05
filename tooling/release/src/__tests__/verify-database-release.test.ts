import { describe, expect, it } from "vitest";
import { DATABASE_RELEASE_STEPS } from "../verify-database-release.js";

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
});
