import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeDirectoryApi } from "./fake-directory-api.js";

export const CLI_TARBALL_ALLOWLIST = [
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "package.json",
] as const;

export const CLI_TARBALL_SMOKE_STEPS = [
  "npm-pack-dry-run",
  "pnpm-pack",
  "inspect-tarball-allowlist",
  "hash-tarball-sha256",
  "install-into-temporary-prefix",
  "typescript-consumer",
  "start-fake-directory-api",
  "published-bin-help",
  "published-bin-version",
  "search-json-schema",
  "info-json-schema",
  "list-json-schema",
  "doctor-json-schema",
  "add-dry-run-json-schema",
  "add-codex-dry-run-json-schema",
  "add-claude-code-dry-run-json-schema",
  "add-cursor-dry-run-json-schema",
  "codex-adapter-sandbox",
  "claude-code-adapter-sandbox",
  "cursor-adapter-sandbox",
  "receipt-migration",
] as const;

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface PackedCliModule {
  readonly parseCliJsonEnvelope: (command: CliJsonSchemaName, value: unknown) => unknown;
}

type CliJsonSchemaName = "add" | "doctor" | "info" | "list" | "search";

interface CliTarballReport {
  readonly schemaVersion: 1;
  readonly packageName: "@themcpdirectory/cli";
  readonly packageVersion: string;
  readonly sha256: string;
  readonly files: readonly string[];
  readonly steps: typeof CLI_TARBALL_SMOKE_STEPS;
}

interface NpmPackDryRun {
  readonly files?: readonly { readonly path?: unknown }[];
}

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI_PACKAGE_DIRECTORY = path.join(REPOSITORY_ROOT, "packages", "cli");
const REPORT_PATH = path.join(REPOSITORY_ROOT, "test-results", "release", "cli-tarball.json");
const TYPESCRIPT_CLI_PATH = fileURLToPath(import.meta.resolve("typescript/bin/tsc"));
const LEGACY_RECEIPT_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/legacy-receipt-v1.json",
);

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly acceptedExitCodes?: readonly number[];
  },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const acceptedExitCodes = options.acceptedExitCodes ?? [0];
      if (code !== null && acceptedExitCodes.includes(code)) {
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

function parseDryRunFiles(stdout: string): readonly string[] {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack --dry-run returned an unexpected JSON payload.");
  }
  const files = (parsed[0] as NpmPackDryRun).files;
  if (!Array.isArray(files)) {
    throw new Error("npm pack --dry-run did not report package files.");
  }
  return files.map((entry) => {
    if (typeof entry.path !== "string") {
      throw new Error("npm pack --dry-run reported a file without a path.");
    }
    return entry.path;
  });
}

function assertAllowlisted(files: readonly string[], source: string): void {
  const actual = [...new Set(files)].sort();
  const expected = [...CLI_TARBALL_ALLOWLIST].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${source} does not match the CLI tarball allowlist.\nExpected: ${expected.join(", ")}\nActual: ${actual.join(", ")}`,
    );
  }
}

async function createClientShims(binDirectory: string): Promise<void> {
  await mkdir(binDirectory, { recursive: true });
  await Promise.all([
    writeExecutable(path.join(binDirectory, "codex"), codexShimSource),
    writeExecutable(path.join(binDirectory, "claude"), claudeShimSource),
    writeExecutable(path.join(binDirectory, "code"), applicationShimSource),
  ]);
}

async function writeExecutable(filePath: string, source: string): Promise<void> {
  await writeFile(filePath, source, { encoding: "utf8", mode: 0o755 });
  await chmod(filePath, 0o755);
}

const codexShimSource = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const statePath = process.env.MCPDIR_CODEX_SANDBOX_FILE;
const readState = () => { try { return JSON.parse(readFileSync(statePath, "utf8")); } catch { return []; } };
const writeState = (value) => writeFileSync(statePath, JSON.stringify(value));
if (args[0] === "--version") console.log("codex-cli 1.0.0");
else if (args.join(" ") === "mcp --help") console.log("  add\\n  list\\n  remove");
else if (args.join(" ") === "mcp add --help") console.log("Usage: codex mcp add NAME -- <COMMAND>\\n  --url <URL>\\n  --bearer-token-env-var <ENV>");
else if (args.join(" ") === "mcp list --help") console.log("Usage: codex mcp list --json");
else if (args.join(" ") === "mcp remove --help") console.log("Usage: codex mcp remove NAME");
else if (args.join(" ") === "mcp list --json") console.log(JSON.stringify(readState()));
else if (args[0] === "mcp" && args[1] === "add") {
  const entries = readState().filter((entry) => entry.name !== args[2]);
  entries.push({ name: args[2], enabled: true, transport: { type: "stdio" } });
  writeState(entries);
} else if (args[0] === "mcp" && args[1] === "remove") {
  writeState(readState().filter((entry) => entry.name !== args[2]));
} else process.exitCode = 2;
`;

const claudeShimSource = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const statePath = process.env.MCPDIR_CLAUDE_SANDBOX_FILE;
const readState = () => { try { return JSON.parse(readFileSync(statePath, "utf8")); } catch { return []; } };
const writeState = (value) => writeFileSync(statePath, JSON.stringify(value));
if (args[0] === "--version") console.log("1.0.0");
else if (args.join(" ") === "mcp --help") console.log("  add\\n  add-json\\n  list\\n  remove");
else if (args.join(" ") === "mcp add --help") console.log("Usage: claude mcp add NAME --scope local project user --transport http -- <COMMAND>\\n  --env <NAME>\\n  --header <HEADER>");
else if (args.join(" ") === "mcp add-json --help") console.log("Usage: claude mcp add-json NAME JSON --scope local project user");
else if (args.join(" ") === "mcp list --help") console.log("Usage: claude mcp list");
else if (args.join(" ") === "mcp remove --help") console.log("Usage: claude mcp remove NAME");
else if (args.join(" ") === "mcp list") for (const entry of readState()) console.log(entry.name + ": " + entry.scope + " connected");
else if (args[0] === "mcp" && args[1] === "get") {
  const entry = readState().find((candidate) => candidate.name === args[2]);
  if (!entry) process.exitCode = 1;
  else console.log("Name: " + entry.name + "\\nScope: " + entry.scope + "\\nTransport: stdio\\nStatus: connected");
} else if (args[0] === "mcp" && (args[1] === "add" || args[1] === "add-json")) {
  const scopeIndex = args.indexOf("--scope");
  const scopeValue = scopeIndex >= 0 ? args[scopeIndex + 1] : "local";
  const scope = scopeValue === "local" ? "global" : scopeValue;
  const entries = readState().filter((entry) => entry.name !== args[2] || entry.scope !== scope);
  entries.push({ name: args[2], scope });
  writeState(entries);
} else if (args[0] === "mcp" && args[1] === "remove") {
  writeState(readState().filter((entry) => entry.name !== args[2]));
} else process.exitCode = 2;
`;

const applicationShimSource = `#!/usr/bin/env node
if (process.argv.includes("--version")) console.log("1.0.0");
`;

async function runPackedJson(
  binaryPath: string,
  args: readonly string[],
  command: CliJsonSchemaName,
  packedModule: PackedCliModule,
  cwd: string,
  env: NodeJS.ProcessEnv,
  acceptedExitCodes: readonly number[] = [0],
): Promise<unknown> {
  const result = await runCommand(binaryPath, [...args, "--json"], {
    cwd,
    env,
    acceptedExitCodes,
  });
  const parsed = JSON.parse(result.stdout) as unknown;
  return packedModule.parseCliJsonEnvelope(command, parsed);
}

async function snapshotTree(root: string): Promise<string> {
  const entries: string[] = [];

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.posix.join(relativeDirectory, child.name);
      const absolutePath = path.join(directory, child.name);
      if (child.isDirectory()) {
        entries.push(`${relativePath}/`);
        await visit(absolutePath, relativePath);
      } else if (child.isFile()) {
        entries.push(
          `${relativePath}:${createHash("sha256")
            .update(await readFile(absolutePath))
            .digest("hex")}`,
        );
      } else {
        entries.push(`${relativePath}:${child.isSymbolicLink() ? "symlink" : "other"}`);
      }
    }
  }

  await visit(root, "");
  return entries.join("\n");
}

async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(path.join(CLI_PACKAGE_DIRECTORY, "package.json"), "utf8"),
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string") throw new Error("CLI package version is missing.");
  return packageJson.version;
}

export async function verifyCliTarball(rootDirectory = REPOSITORY_ROOT): Promise<CliTarballReport> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mcpdir-tarball-"));
  const packageDirectory = path.join(rootDirectory, "packages", "cli");
  const packDirectory = path.join(temporaryRoot, "pack");
  const installPrefix = path.join(temporaryRoot, "install-prefix");
  const sandbox = path.join(temporaryRoot, "sandbox");
  const stateDirectory = path.join(sandbox, "state");
  const projectDirectory = path.join(sandbox, "project");
  const shimDirectory = path.join(sandbox, "bin");
  let fakeApi: Awaited<ReturnType<typeof startFakeDirectoryApi>> | undefined;

  try {
    await mkdir(packDirectory, { recursive: true });
    await mkdir(projectDirectory, { recursive: true });
    await runCommand("pnpm", ["--filter", "@themcpdirectory/cli", "build"], {
      cwd: rootDirectory,
    });

    const dryRun = await runCommand("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: packageDirectory,
    });
    assertAllowlisted(parseDryRunFiles(dryRun.stdout), "npm pack --dry-run");

    await runCommand("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageDirectory,
    });
    const tarballs = (await readdir(packDirectory)).filter((entry) => entry.endsWith(".tgz"));
    if (tarballs.length !== 1 || !tarballs[0]) {
      throw new Error(`Expected one packed CLI tarball, found ${tarballs.length}.`);
    }
    const tarballPath = path.join(packDirectory, tarballs[0]);
    const archive = await runCommand("tar", ["-tzf", tarballPath], { cwd: rootDirectory });
    const archiveFiles = archive.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((entry) => entry.replace(/^package\//u, ""));
    assertAllowlisted(archiveFiles, "Packed tarball");

    const sha256 = createHash("sha256")
      .update(await readFile(tarballPath))
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
        tarballPath,
      ],
      { cwd: temporaryRoot },
    );

    await runCommand(
      "node",
      [
        "--input-type=module",
        "--eval",
        "const root = await import('@themcpdirectory/cli'); const metadata = await import('@themcpdirectory/cli/command-metadata'); if (typeof root.runCli !== 'function' || !Array.isArray(metadata.CLI_COMMANDS)) process.exit(1);",
      ],
      { cwd: installPrefix },
    );

    const consumerConfigPath = path.join(installPrefix, "tsconfig.json");
    await writeFile(
      path.join(installPrefix, "consumer.ts"),
      [
        'import { parseCliJsonEnvelope, runCli } from "@themcpdirectory/cli";',
        'import { CLI_COMMANDS, type CliCommandMetadata } from "@themcpdirectory/cli/command-metadata";',
        "const firstCommand: CliCommandMetadata | undefined = CLI_COMMANDS[0];",
        "void firstCommand;",
        "void parseCliJsonEnvelope;",
        "void runCli;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      consumerConfigPath,
      `${JSON.stringify(
        {
          compilerOptions: {
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
          },
          files: ["consumer.ts"],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await runCommand(process.execPath, [TYPESCRIPT_CLI_PATH, "--project", consumerConfigPath], {
      cwd: installPrefix,
    });

    const binaryPath = path.join(
      installPrefix,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "mcpdir.cmd" : "mcpdir",
    );
    const installedBundlePath = path.join(
      installPrefix,
      "node_modules",
      "@themcpdirectory",
      "cli",
      "dist",
      "index.js",
    );
    const packedModule = (await import(
      `${pathToFileURL(installedBundlePath).href}?sha256=${sha256}`
    )) as PackedCliModule;
    if (typeof packedModule.parseCliJsonEnvelope !== "function") {
      throw new Error("Packed CLI does not export its JSON envelope parser.");
    }

    await createClientShims(shimDirectory);
    await mkdir(path.join(sandbox, "home", "Applications", "Cursor.app"), { recursive: true });
    fakeApi = await startFakeDirectoryApi();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: path.join(sandbox, "home"),
      USERPROFILE: path.join(sandbox, "home"),
      XDG_CONFIG_HOME: path.join(sandbox, "xdg"),
      APPDATA: path.join(sandbox, "appdata"),
      LOCALAPPDATA: path.join(sandbox, "local-appdata"),
      PATH: `${shimDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      MCPDIR_API_BASE_URL: fakeApi.baseUrl,
      MCPDIR_STATE_DIR: stateDirectory,
      MCPDIR_CODEX_SANDBOX_FILE: path.join(sandbox, "codex.json"),
      MCPDIR_CLAUDE_SANDBOX_FILE: path.join(sandbox, "claude.json"),
    };

    const help = await runCommand(binaryPath, ["--help"], { cwd: projectDirectory, env });
    if (!help.stdout.startsWith("Usage: mcpdir")) throw new Error("Packed CLI help is invalid.");
    const packageVersion = await readPackageVersion();
    const version = await runCommand(binaryPath, ["--version"], { cwd: projectDirectory, env });
    if (version.stdout.trim() !== packageVersion) {
      throw new Error(
        `Packed CLI version ${version.stdout.trim()} does not match ${packageVersion}.`,
      );
    }

    await runPackedJson(
      binaryPath,
      ["search", "github-server"],
      "search",
      packedModule,
      projectDirectory,
      env,
    );
    await runPackedJson(
      binaryPath,
      ["info", "github-server"],
      "info",
      packedModule,
      projectDirectory,
      env,
    );
    await runPackedJson(binaryPath, ["list"], "list", packedModule, projectDirectory, env);
    await runPackedJson(binaryPath, ["doctor"], "doctor", packedModule, projectDirectory, env);
    const dryRunSnapshot = await snapshotTree(sandbox);
    const defaultDryRun = (await runPackedJson(
      binaryPath,
      ["add", "github-server", "--dry-run"],
      "add",
      packedModule,
      projectDirectory,
      env,
      [1],
    )) as { readonly ok?: unknown; readonly error?: { readonly code?: unknown } };
    if (defaultDryRun.ok !== false || defaultDryRun.error?.code !== "REQUIRED_INPUT") {
      throw new Error("Default add dry-run did not report deterministic multi-client selection.");
    }
    await runPackedJson(
      binaryPath,
      ["add", "github-server", "--to", "all", "--dry-run"],
      "add",
      packedModule,
      projectDirectory,
      env,
    );
    for (const client of ["codex", "claude-code", "cursor", "vscode"] as const) {
      await runPackedJson(
        binaryPath,
        ["add", "github-server", "--to", client, "--dry-run"],
        "add",
        packedModule,
        projectDirectory,
        env,
      );
    }
    if ((await snapshotTree(sandbox)) !== dryRunSnapshot) {
      throw new Error("One or more add dry-runs mutated the client sandbox.");
    }

    await mkdir(stateDirectory, { recursive: true });
    await copyFile(LEGACY_RECEIPT_FIXTURE, path.join(stateDirectory, "receipts.v1.json"));
    await runPackedJson(
      binaryPath,
      ["add", "github-server", "--to", "codex", "--yes"],
      "add",
      packedModule,
      projectDirectory,
      env,
    );
    await runPackedJson(
      binaryPath,
      ["add", "github-server", "--to", "claude-code", "--yes"],
      "add",
      packedModule,
      projectDirectory,
      env,
    );
    await runPackedJson(
      binaryPath,
      ["add", "github-server", "--to", "cursor", "--scope", "project", "--yes"],
      "add",
      packedModule,
      projectDirectory,
      env,
    );

    const codexState = await readFile(path.join(sandbox, "codex.json"), "utf8");
    const claudeState = await readFile(path.join(sandbox, "claude.json"), "utf8");
    const cursorState = await readFile(path.join(projectDirectory, ".cursor", "mcp.json"), "utf8");
    if (![codexState, claudeState, cursorState].every((value) => value.includes("github-server"))) {
      throw new Error("One or more adapter sandboxes did not record github-server.");
    }

    const migratedReceiptText = await readFile(
      path.join(stateDirectory, "receipts.v1.json"),
      "utf8",
    );
    const migratedReceipt = JSON.parse(migratedReceiptText) as {
      schemaVersion?: unknown;
      receipts?: readonly Record<string, unknown>[];
    };
    const expectedLegacyReceipt = {
      schemaVersion: 1,
      slug: "legacy-server",
      client: "codex",
      scope: "user",
      serverVersion: "0.9.0",
      variantId: "00000000-0000-4000-8000-000000000015",
      manifestHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      installedAt: "2026-08-31T12:00:00.000Z",
      adapterFingerprint: "legacy:codex:v1",
    } as const;
    const legacyReceipt = migratedReceipt.receipts?.find(
      (receipt) => receipt.slug === "legacy-server",
    );
    if (JSON.stringify(legacyReceipt) !== JSON.stringify(expectedLegacyReceipt)) {
      throw new Error("Legacy receipt v1 was not preserved and canonically rewritten.");
    }
    if (migratedReceiptText !== `${JSON.stringify(migratedReceipt, null, 2)}\n`) {
      throw new Error("Migrated receipt state is not canonical JSON.");
    }

    const report: CliTarballReport = {
      schemaVersion: 1,
      packageName: "@themcpdirectory/cli",
      packageVersion,
      sha256,
      files: [...CLI_TARBALL_ALLOWLIST],
      steps: CLI_TARBALL_SMOKE_STEPS,
    };
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
  } finally {
    await fakeApi?.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await verifyCliTarball();
    console.log(`CLI tarball ${report.sha256} passed ${report.steps.length} smoke checks.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
