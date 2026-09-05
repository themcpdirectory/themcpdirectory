import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const LIGHTHOUSE_REPORT_PATH = "test-results/release/lighthouse.json";

export interface LighthouseCategoryScores {
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
}

export interface LighthouseRouteResult {
  readonly route: string;
  readonly authenticated: boolean;
  readonly profile: "mobile" | "desktop";
  readonly excludedAudits: readonly string[];
  readonly runs: readonly LighthouseCategoryScores[];
  readonly median: LighthouseCategoryScores;
}

export interface LighthouseReleaseReport {
  readonly schemaVersion: 1;
  readonly status: "in-progress" | "passed" | "failed";
  readonly generatedAt: string;
  readonly lighthouseVersion: string;
  readonly minimumScore: number;
  readonly runsPerRouteAndProfile: number;
  readonly expectedResults: number;
  readonly results: readonly LighthouseRouteResult[];
}

export async function writeLighthouseReleaseReport(
  rootDirectory: string,
  report: LighthouseReleaseReport,
): Promise<string> {
  const reportPath = path.join(rootDirectory, LIGHTHOUSE_REPORT_PATH);
  const temporaryPath = `${reportPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, reportPath);
  return reportPath;
}
