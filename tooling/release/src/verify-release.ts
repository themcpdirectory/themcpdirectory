import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RELEASE_CHECKS = [
  "release:prerequisites",
  "format:check",
  "release:lockfile-integrity",
  "lint",
  "typecheck",
  "test",
  "test:integration",
  "test:cli",
  "release:database",
  "build",
  "test:e2e",
  "web:accessibility-release",
  "web:security-release",
  "test:lighthouse",
  "release:secret-scan",
  "release:dependency-audit",
  "release:cli-tarball",
] as const;

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function runReleaseCheck(
  check: (typeof RELEASE_CHECKS)[number],
  rootDirectory: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["run", check], {
      cwd: rootDirectory,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${check} failed with ${signal ?? `exit code ${code ?? "unknown"}`}.`));
    });
  });
}

export async function verifyRelease(rootDirectory = REPOSITORY_ROOT): Promise<void> {
  for (const check of RELEASE_CHECKS) {
    console.log(`\n[verify:release] ${check}`);
    await runReleaseCheck(check, rootDirectory);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyRelease();
    console.log(`\nRelease verification passed all ${RELEASE_CHECKS.length} checks.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
