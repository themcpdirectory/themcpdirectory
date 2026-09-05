import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOCKFILE_INTEGRITY_STEPS = [
  "pnpm install --frozen-lockfile --ignore-scripts",
  "pnpm dedupe --check",
] as const;

type CommandRunner = (
  command: string,
  args: readonly string[],
  workingDirectory: string,
) => Promise<void>;

interface VerifyLockfileIntegrityOptions {
  readonly rootDirectory: string;
  readonly run?: CommandRunner;
}

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function runCommand(
  command: string,
  args: readonly string[],
  workingDirectory: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workingDirectory,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${command} failed with ${signal ?? `exit code ${code ?? "unknown"}`}.`));
    });
  });
}

export async function verifyLockfileIntegrity(
  options: VerifyLockfileIntegrityOptions,
): Promise<void> {
  const run = options.run ?? runCommand;
  await run("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], options.rootDirectory);
  await run("pnpm", ["dedupe", "--check"], options.rootDirectory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyLockfileIntegrity({ rootDirectory: REPOSITORY_ROOT });
    console.log("Lockfile is frozen and passes pnpm deduplication checks.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
