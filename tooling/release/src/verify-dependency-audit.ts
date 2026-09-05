import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type DependencyAuditSeverity = "high" | "critical";

export interface DependencyAuditFinding {
  readonly id: string;
  readonly package: string;
  readonly severity: DependencyAuditSeverity;
}

export interface DependencyAuditBaselineEntry extends DependencyAuditFinding {
  readonly owner: string;
  readonly expiresAt: string;
  readonly justification: string;
}

interface PnpmAuditAdvisory {
  readonly github_advisory_id?: unknown;
  readonly id?: unknown;
  readonly module_name?: unknown;
  readonly severity?: unknown;
}

interface PnpmAuditResult {
  readonly advisories?: Record<string, PnpmAuditAdvisory>;
}

interface CommandResult {
  readonly stderr: string;
  readonly stdout: string;
}

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASELINE_PATH = new URL("../dependency-audit-baseline.json", import.meta.url);
const EXPIRY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseExpiryDate(value: string): Date | null {
  if (!EXPIRY_PATTERN.test(value)) return null;
  const expiry = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(expiry.valueOf()) || expiry.toISOString().slice(0, 10) !== value
    ? null
    : expiry;
}

function parseBaseline(value: unknown): readonly DependencyAuditBaselineEntry[] {
  if (!Array.isArray(value)) throw new Error("Dependency audit baseline must be an array.");
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Dependency audit baseline entry ${index} must be an object.`);
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.package !== "string" ||
      (candidate.severity !== "high" && candidate.severity !== "critical") ||
      typeof candidate.owner !== "string" ||
      typeof candidate.justification !== "string" ||
      typeof candidate.expiresAt !== "string" ||
      parseExpiryDate(candidate.expiresAt) === null
    ) {
      throw new Error(`Dependency audit baseline entry ${index} is invalid.`);
    }
    return candidate as unknown as DependencyAuditBaselineEntry;
  });
}

export const DEPENDENCY_AUDIT_BASELINE = parseBaseline(
  JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as unknown,
);

export function findUntriagedDependencyFindings(
  findings: readonly DependencyAuditFinding[],
  baseline: readonly DependencyAuditBaselineEntry[],
  now = new Date(),
): DependencyAuditFinding[] {
  return findings.filter((finding) => {
    const entry = baseline.find(
      (candidate) =>
        candidate.id === finding.id &&
        candidate.package === finding.package &&
        candidate.severity === finding.severity,
    );
    if (!entry || entry.owner.trim() === "" || entry.justification.trim() === "") return true;
    const expiry = parseExpiryDate(entry.expiresAt);
    return expiry === null || expiry < now;
  });
}

export function parseDependencyAuditFindings(rawAudit: string): DependencyAuditFinding[] {
  const result = JSON.parse(rawAudit) as PnpmAuditResult;
  if (
    typeof result !== "object" ||
    result === null ||
    typeof result.advisories !== "object" ||
    result.advisories === null ||
    Array.isArray(result.advisories)
  ) {
    throw new Error("pnpm audit returned an unsupported JSON payload.");
  }
  return Object.entries(result.advisories ?? {}).flatMap(([advisoryKey, advisory]) => {
    if (advisory.severity !== "high" && advisory.severity !== "critical") return [];
    if (typeof advisory.module_name !== "string" || advisory.module_name.trim() === "") {
      throw new Error(`pnpm audit advisory ${advisoryKey} has no package name.`);
    }
    const id =
      typeof advisory.github_advisory_id === "string"
        ? advisory.github_advisory_id
        : String(advisory.id ?? advisoryKey);
    return [{ id, package: advisory.module_name, severity: advisory.severity }];
  });
}

function runAudit(rootDirectory: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["audit", "--json"], {
      cwd: rootDirectory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", () => resolve({ stderr, stdout }));
  });
}

export async function verifyDependencyAudit(
  rootDirectory = REPOSITORY_ROOT,
): Promise<readonly DependencyAuditFinding[]> {
  const result = await runAudit(rootDirectory);
  if (result.stdout.trim() === "") {
    throw new Error(
      `pnpm audit returned no JSON.${result.stderr ? ` ${result.stderr.trim()}` : ""}`,
    );
  }
  const findings = parseDependencyAuditFindings(result.stdout);
  const untriaged = findUntriagedDependencyFindings(findings, DEPENDENCY_AUDIT_BASELINE);
  if (untriaged.length > 0) {
    const summary = untriaged
      .map((finding) => `${finding.severity}: ${finding.package} (${finding.id})`)
      .join("\n");
    throw new Error(`Dependency audit found untriaged high-severity vulnerabilities:\n${summary}`);
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const findings = await verifyDependencyAudit();
    console.log(`Dependency audit passed with ${findings.length} triaged high-severity findings.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
