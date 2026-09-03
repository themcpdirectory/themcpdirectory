import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

beforeAll(async () => {
  const build = await runProcess("pnpm", ["run", "build"]);
  if (build.exitCode !== 0) {
    throw new Error(`CLI build failed:\n${build.stderr || build.stdout}`);
  }
});

describe("built CLI binary", () => {
  it("serves help through the package bin contract", async () => {
    const result = await runProcess("pnpm", ["exec", "mcpdir", "--help"]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: expect.stringContaining("Usage: mcpdir <command> [options]"),
      stderr: "",
    });
  });
});

function runProcess(command: string, args: readonly string[]) {
  return new Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PACKAGE_ROOT,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({
        exitCode: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
      });
    });
  });
}
