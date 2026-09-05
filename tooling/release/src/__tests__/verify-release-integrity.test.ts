import { describe, expect, it, vi } from "vitest";
import { LOCKFILE_INTEGRITY_STEPS, verifyLockfileIntegrity } from "../verify-lockfile-integrity.js";
import { SECRET_SCAN_TARGETS } from "../verify-secret-scanning.js";

describe("release integrity gates", () => {
  it("scans the tracked repository surfaces for secrets", () => {
    expect(SECRET_SCAN_TARGETS).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "apps",
      "packages",
      "tooling",
      "docs",
    ]);
  });

  it("uses a frozen, non-mutating lockfile verification path", async () => {
    expect(LOCKFILE_INTEGRITY_STEPS).toEqual([
      "pnpm install --frozen-lockfile --ignore-scripts",
      "pnpm dedupe --check",
    ]);

    const run = vi.fn().mockResolvedValue(undefined);
    await verifyLockfileIntegrity({ rootDirectory: "/repo", run });
    expect(run.mock.calls).toEqual([
      ["pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], "/repo"],
      ["pnpm", ["dedupe", "--check"], "/repo"],
    ]);
  });
});
