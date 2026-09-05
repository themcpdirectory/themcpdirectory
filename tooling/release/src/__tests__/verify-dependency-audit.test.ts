import { describe, expect, it } from "vitest";
import {
  findUntriagedDependencyFindings,
  type DependencyAuditBaselineEntry,
  type DependencyAuditFinding,
} from "../verify-dependency-audit.js";

describe("dependency audit release gate", () => {
  const finding: DependencyAuditFinding = {
    id: "GHSA-test-test-test",
    package: "example-package",
    severity: "high",
  };

  it("fails closed for findings without a current owned baseline entry", () => {
    expect(findUntriagedDependencyFindings([finding], [], new Date("2026-09-01"))).toEqual([
      finding,
    ]);

    const expired: DependencyAuditBaselineEntry = {
      ...finding,
      owner: "release-manager",
      expiresAt: "2026-08-31",
      justification: "No reachable exploit path in shipped release artefacts.",
    };
    expect(findUntriagedDependencyFindings([finding], [expired], new Date("2026-09-01"))).toEqual([
      finding,
    ]);

    const impossibleDate: DependencyAuditBaselineEntry = {
      ...expired,
      expiresAt: "2026-02-31",
    };
    expect(
      findUntriagedDependencyFindings([finding], [impossibleDate], new Date("2026-02-28")),
    ).toEqual([finding]);
  });

  it("accepts an exact, owned, unexpired baseline entry", () => {
    const baseline: DependencyAuditBaselineEntry = {
      ...finding,
      owner: "release-manager",
      expiresAt: "2026-10-01",
      justification: "No reachable exploit path in shipped release artefacts.",
    };
    expect(findUntriagedDependencyFindings([finding], [baseline], new Date("2026-09-01"))).toEqual(
      [],
    );
  });
});
