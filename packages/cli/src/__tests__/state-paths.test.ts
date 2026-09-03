import path from "node:path";
import { describe, expect, it } from "vitest";
import { type CliStatePaths, resolveCliStatePaths } from "../config/state-paths.js";

const _signatureCheck: (options: {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly cwd: string;
}) => CliStatePaths = resolveCliStatePaths;
void _signatureCheck;

describe("resolveCliStatePaths", () => {
  it("resolves default state paths for macOS, Linux, and Windows", () => {
    const scenarios: ReadonlyArray<{
      readonly platform: NodeJS.Platform;
      readonly homeDirectory: string;
      readonly env: NodeJS.ProcessEnv;
      readonly expectedStateDir: string;
    }> = [
      {
        platform: "darwin",
        homeDirectory: "/Users/alice",
        env: {},
        expectedStateDir: path.posix.join(
          "/Users/alice",
          "Library",
          "Application Support",
          "mcpdir",
        ),
      },
      {
        platform: "linux",
        homeDirectory: "/home/alice",
        env: {},
        expectedStateDir: path.posix.join("/home/alice", ".local", "state", "mcpdir"),
      },
      {
        platform: "win32",
        homeDirectory: "C:\\Users\\Alice",
        env: {},
        expectedStateDir: path.win32.join("C:\\Users\\Alice", "AppData", "Roaming", "mcpdir"),
      },
    ];

    for (const scenario of scenarios) {
      const actual = resolveCliStatePaths({
        platform: scenario.platform,
        env: scenario.env,
        homeDirectory: scenario.homeDirectory,
        cwd: "/repo",
      });

      const joiner = scenario.platform === "win32" ? path.win32 : path.posix;
      expect(actual).toEqual({
        stateDir: scenario.expectedStateDir,
        receiptsFile: joiner.join(scenario.expectedStateDir, "receipts.v1.json"),
        lockFile: joiner.join(scenario.expectedStateDir, "receipts.v1.lock"),
        backupsDir: joiner.join(scenario.expectedStateDir, "backups"),
      });
    }
  });

  it("supports MCPDIR_STATE_DIR override and resolves relative values from cwd", () => {
    const statePaths = resolveCliStatePaths({
      platform: "linux",
      env: {
        MCPDIR_STATE_DIR: ".mcpdir-state",
      },
      homeDirectory: "/home/alice",
      cwd: "/repo/worktree",
    });

    const expectedStateDir = path.posix.resolve("/repo/worktree", ".mcpdir-state");
    expect(statePaths).toEqual({
      stateDir: expectedStateDir,
      receiptsFile: path.posix.join(expectedStateDir, "receipts.v1.json"),
      lockFile: path.posix.join(expectedStateDir, "receipts.v1.lock"),
      backupsDir: path.posix.join(expectedStateDir, "backups"),
    });
  });
});
