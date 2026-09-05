import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SECRET_SCAN_TARGETS = [
  "package.json",
  "pnpm-lock.yaml",
  "apps",
  "packages",
  "tooling",
  "docs",
] as const;

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GITLEAKS_IMAGE = "zricethezav/gitleaks:v8.24.2";
const GITLEAKS_GO_MODULE = "github.com/zricethezav/gitleaks/v8@v8.24.2";

interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

function runCommand(
  command: string,
  args: readonly string[],
  workingDirectory: string,
  inheritOutput = false,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workingDirectory,
      stdio: inheritOutput ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout)
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    if (child.stderr)
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ exitCode: code ?? 1, stderr, stdout }));
  });
}

async function trackedFiles(rootDirectory: string): Promise<readonly string[]> {
  const result = await runCommand(
    "git",
    ["ls-files", "-z", "--", ...SECRET_SCAN_TARGETS],
    rootDirectory,
  );
  if (result.exitCode !== 0) throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  return result.stdout.split("\0").filter(Boolean);
}

async function stageTrackedFiles(rootDirectory: string, stagingDirectory: string): Promise<number> {
  const files = await trackedFiles(rootDirectory);
  for (const relativeFile of files) {
    const source = path.resolve(rootDirectory, relativeFile);
    if (!source.startsWith(`${path.resolve(rootDirectory)}${path.sep}`)) {
      throw new Error(`Refusing to scan a path outside the repository: ${relativeFile}`);
    }
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile())
      throw new Error(`Secret scan target is not a regular file: ${relativeFile}`);
    const destination = path.join(stagingDirectory, relativeFile);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(source));
  }
  return files.length;
}

export async function verifySecretScanning(rootDirectory = REPOSITORY_ROOT): Promise<number> {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "themcpdirectory-secret-scan-"));
  try {
    const fileCount = await stageTrackedFiles(rootDirectory, stagingDirectory);
    if (fileCount === 0)
      throw new Error("Secret scan found no tracked files in the configured targets.");
    const docker = await runCommand("docker", ["info"], rootDirectory).catch(() => ({
      exitCode: 1,
      stderr: "",
      stdout: "",
    }));
    const result =
      docker.exitCode === 0
        ? await runCommand(
            "docker",
            [
              "run",
              "--rm",
              "--volume",
              `${stagingDirectory}:/repo:ro`,
              GITLEAKS_IMAGE,
              "detect",
              "--no-git",
              "--source=/repo",
              "--redact",
              "--verbose",
            ],
            rootDirectory,
            true,
          )
        : await runCommand(
            "go",
            [
              "run",
              GITLEAKS_GO_MODULE,
              "detect",
              "--no-git",
              `--source=${stagingDirectory}`,
              "--redact",
              "--verbose",
            ],
            rootDirectory,
            true,
          );
    if (result.exitCode !== 0) {
      throw new Error(`Gitleaks failed or found a secret (exit code ${result.exitCode}).`);
    }
    return fileCount;
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const fileCount = await verifySecretScanning();
    console.log(`Secret scan passed for ${fileCount} tracked files.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
