import { describe, expect, it, vi } from "vitest";
import { PHASE_PREREQUISITE_MATRIX, verifyPhasePrerequisites } from "../phase-prerequisites.js";
import type { PhasePrerequisiteFailure } from "../phase-prerequisites.js";

describe("phase H prerequisite gate", () => {
  it("tracks D-G in order and fails closed before running gates when an artefact is missing", async () => {
    expect(PHASE_PREREQUISITE_MATRIX.map((entry) => `${entry.phase}:${entry.capability}`)).toEqual([
      "D:Contract schemas and deterministic OpenAPI",
      "D:Search pagination and ranking",
      "D:Public detail, resolve, install, and discovery projections",
      "D:API middleware, routes, and empty-database behaviour",
      "E:Directory transport layer",
      "E:Install intent resolution and plan validation",
      "E:Client adapters",
      "E:CLI command surface, receipts, and built binary smoke",
      "F:Remote probe transport hardening",
      "F:Trust, health, public projection, and worker retention",
      "G:Better Auth runtime and GitHub App verification",
      "G:Publisher claims, memberships, export, erasure, and workers",
      "G:Publisher web routes and deterministic authenticated fixtures",
    ]);

    expect(PHASE_PREREQUISITE_MATRIX[6]?.artefacts).toContain(
      "packages/client-adapters/src/vscode.ts",
    );
    expect(PHASE_PREREQUISITE_MATRIX[6]?.probes).toContain(
      "mcpdir add github-server --to vscode --dry-run --json",
    );

    const run = vi.fn();
    await expect(
      verifyPhasePrerequisites({
        rootDirectory: "/repo",
        pathExists: async (path) => !path.endsWith("openapi.ts"),
        run,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PhasePrerequisiteFailure>>({
        name: "PhasePrerequisiteFailure",
        missingArtefacts: ["packages/api-contract/src/public-api/openapi.ts"],
      }),
    );
    expect(run).not.toHaveBeenCalled();
  });
});
