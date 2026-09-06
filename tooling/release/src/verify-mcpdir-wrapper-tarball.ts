import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MCPDIR_WRAPPER_TARBALL_ALLOWLIST = [
  "LICENSE",
  "README.md",
  "bin/mcpdir.js",
  "package.json",
] as const;

const MCPDIR_WRAPPER_DRY_RUN_ALLOWLIST = MCPDIR_WRAPPER_TARBALL_ALLOWLIST.filter(
  (file) => file !== "LICENSE",
);

export const MCPDIR_WRAPPER_TARBALL_SMOKE_STEPS = [
  "verify-package-contract",
  "npm-pack-dry-run",
  "pnpm-pack-cli",
  "pnpm-pack-wrapper",
  "inspect-wrapper-tarball-allowlist",
  "verify-packed-cli-dependency",
  "hash-wrapper-tarball-sha256",
  "install-local-tarballs",
  "wrapper-bin-help",
  "wrapper-bin-version",
] as const;

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dependencies?: Record<string, unknown>;
}

interface NpmPackDryRun {
  readonly files?: readonly { readonly path?: unknown }[];
}

interface McpdirWrapperTarballReport {
  readonly schemaVersion: 1;
  readonly packageName: "mcpdir";
  readonly packageVersion: string;
  readonly canonicalPackageName: "@themcpdirectory/cli";
  readonly canonicalPackageVersion: string;
  readonly sha256: string;
  readonly files: typeof MCPDIR_WRAPPER_TARBALL_ALLOWLIST;
  readonly steps: typeof MCPDIR_WRAPPER_TARBALL_SMOKE_STEPS;
}

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "test-results",
  "release",
  "mcpdir-wrapper-tarball.json",
);

function runCommand(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code ?? "unknown"}`}.${stdout ? `\nstdout:\n${stdout.trim()}` : ""}${stderr ? `\nstderr:\n${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

async function readPackageManifest(packageDirectory: string): Promise<PackageManifest> {
  return JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  ) as PackageManifest;
}

function requirePackageIdentity(
  manifest: PackageManifest,
  expectedName: string,
): { readonly name: string; readonly version: string } {
  if (manifest.name !== expectedName || typeof manifest.version !== "string") {
    throw new Error(`${expectedName} package identity is invalid.`);
  }
  return { name: manifest.name, version: manifest.version };
}

function parseDryRunFiles(stdout: string): readonly string[] {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack --dry-run returned an unexpected JSON payload for mcpdir.");
  }
  const files = (parsed[0] as NpmPackDryRun).files;
  if (!Array.isArray(files)) {
    throw new Error("npm pack --dry-run did not report mcpdir package files.");
  }
  return files.map((entry) => {
    if (typeof entry.path !== "string") {
      throw new Error("npm pack --dry-run reported an mcpdir file without a path.");
    }
    return entry.path;
  });
}

function assertAllowlisted(
  files: readonly string[],
  source: string,
  allowlist: readonly string[] = MCPDIR_WRAPPER_TARBALL_ALLOWLIST,
): void {
  const actual = [...new Set(files)].sort();
  const expected = [...allowlist].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${source} does not match the mcpdir tarball allowlist.\nExpected: ${expected.join(", ")}\nActual: ${actual.join(", ")}`,
    );
  }
}

async function findPackedTarball(
  packDirectory: string,
  existingTarballs: ReadonlySet<string>,
): Promise<string> {
  const tarballs = (await readdir(packDirectory)).filter(
    (entry) => entry.endsWith(".tgz") && !existingTarballs.has(entry),
  );
  if (tarballs.length !== 1 || !tarballs[0]) {
    throw new Error(`Expected one new packed tarball, found ${tarballs.length}.`);
  }
  return path.join(packDirectory, tarballs[0]);
}

export function resolveInstalledWrapperEntryPath(installPrefix: string): string {
  return path.join(installPrefix, "node_modules", "mcpdir", "bin", "mcpdir.js");
}

export async function verifyMcpdirWrapperTarball(
  rootDirectory = REPOSITORY_ROOT,
): Promise<McpdirWrapperTarballReport> {
  const cliPackageDirectory = path.join(rootDirectory, "packages", "cli");
  const wrapperPackageDirectory = path.join(rootDirectory, "packages", "mcpdir");
  const cliManifest = await readPackageManifest(cliPackageDirectory);
  const wrapperManifest = await readPackageManifest(wrapperPackageDirectory);
  const cliIdentity = requirePackageIdentity(cliManifest, "@themcpdirectory/cli");
  const wrapperIdentity = requirePackageIdentity(wrapperManifest, "mcpdir");
  const expectedWorkspaceDependency = `workspace:${cliIdentity.version}`;

  if (
    wrapperIdentity.version !== cliIdentity.version ||
    wrapperManifest.dependencies?.[cliIdentity.name] !== expectedWorkspaceDependency
  ) {
    throw new Error(
      `mcpdir must match ${cliIdentity.name}@${cliIdentity.version} and depend on ${expectedWorkspaceDependency}.`,
    );
  }

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mcpdir-wrapper-tarball-"));
  const packDirectory = path.join(temporaryRoot, "pack");
  const installPrefix = path.join(temporaryRoot, "install-prefix");

  try {
    await mkdir(packDirectory, { recursive: true });
    await runCommand("pnpm", ["--filter", "@themcpdirectory/cli", "build"], rootDirectory);

    const dryRun = await runCommand(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      wrapperPackageDirectory,
    );
    assertAllowlisted(
      parseDryRunFiles(dryRun.stdout),
      "npm pack --dry-run",
      MCPDIR_WRAPPER_DRY_RUN_ALLOWLIST,
    );

    const beforeCliPack = new Set(await readdir(packDirectory));
    await runCommand("pnpm", ["pack", "--pack-destination", packDirectory], cliPackageDirectory);
    const cliTarballPath = await findPackedTarball(packDirectory, beforeCliPack);

    const beforeWrapperPack = new Set(await readdir(packDirectory));
    await runCommand(
      "pnpm",
      ["pack", "--pack-destination", packDirectory],
      wrapperPackageDirectory,
    );
    const wrapperTarballPath = await findPackedTarball(packDirectory, beforeWrapperPack);

    const archive = await runCommand("tar", ["-tzf", wrapperTarballPath], rootDirectory);
    const archiveFiles = archive.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((entry) => entry.replace(/^package\//u, ""));
    assertAllowlisted(archiveFiles, "Packed mcpdir tarball");

    const packedManifestResult = await runCommand(
      "tar",
      ["-xOf", wrapperTarballPath, "package/package.json"],
      rootDirectory,
    );
    const packedManifest = JSON.parse(packedManifestResult.stdout) as PackageManifest;
    if (packedManifest.dependencies?.[cliIdentity.name] !== cliIdentity.version) {
      throw new Error(
        `Packed mcpdir dependency must resolve exactly to ${cliIdentity.name}@${cliIdentity.version}.`,
      );
    }

    const sha256 = createHash("sha256")
      .update(await readFile(wrapperTarballPath))
      .digest("hex");
    await runCommand(
      "npm",
      [
        "install",
        "--prefix",
        installPrefix,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--omit=dev",
        cliTarballPath,
        wrapperTarballPath,
      ],
      temporaryRoot,
    );

    const wrapperEntryPath = resolveInstalledWrapperEntryPath(installPrefix);
    const help = await runCommand(process.execPath, [wrapperEntryPath, "--help"], temporaryRoot);
    if (!help.stdout.startsWith("Usage: mcpdir")) {
      throw new Error("Packed mcpdir wrapper help is invalid.");
    }
    const version = await runCommand(
      process.execPath,
      [wrapperEntryPath, "--version"],
      temporaryRoot,
    );
    if (version.stdout.trim() !== wrapperIdentity.version) {
      throw new Error(
        `Packed mcpdir wrapper version ${version.stdout.trim()} does not match ${wrapperIdentity.version}.`,
      );
    }

    const report: McpdirWrapperTarballReport = {
      schemaVersion: 1,
      packageName: "mcpdir",
      packageVersion: wrapperIdentity.version,
      canonicalPackageName: "@themcpdirectory/cli",
      canonicalPackageVersion: cliIdentity.version,
      sha256,
      files: MCPDIR_WRAPPER_TARBALL_ALLOWLIST,
      steps: MCPDIR_WRAPPER_TARBALL_SMOKE_STEPS,
    };
    const reportPath = path.join(rootDirectory, path.relative(REPOSITORY_ROOT, REPORT_PATH));
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await verifyMcpdirWrapperTarball();
    console.log(
      `mcpdir wrapper tarball ${report.sha256} passed ${report.steps.length} smoke checks.`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
