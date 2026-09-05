import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { lighthouseVersion } from "lighthouse/shared/root.js";
import { chromium } from "playwright-core";
import {
  AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX,
  LIGHTHOUSE_PROFILES,
  NOINDEX_LIGHTHOUSE_ROUTES,
  PUBLIC_LIGHTHOUSE_ROUTE_MATRIX,
} from "./lighthouse-profiles.js";
import {
  type LighthouseCategoryScores,
  type LighthouseRouteResult,
  writeLighthouseReleaseReport,
} from "./release-report.js";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB_DIRECTORY = path.join(REPOSITORY_ROOT, "apps/web");
const LIGHTHOUSE_PORT = "3100";
const LIGHTHOUSE_DATABASE_NAME = "task8_web_e2e_lighthouse";
const LIGHTHOUSE_RUNS = 3;
const MINIMUM_SCORE = 0.95;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const CRAWLABILITY_AUDIT = "is-crawlable";

interface TestDatabaseModule {
  readonly TEST_BETTER_AUTH_SECRET: string;
  readonly TEST_DATABASE_URL: string;
  readonly TEST_GITHUB_APP_ENV: Readonly<Record<string, string>>;
  prepareTestDatabase(): Promise<void>;
  dropTestDatabase(): Promise<void>;
}

interface SessionFixtureModule {
  seedPublisherSession(input: { readonly role: "owner" }): Promise<{
    readonly cookie: { readonly name: string; readonly value: string };
  }>;
}

export function medianScore(scores: readonly number[]): number {
  if (scores.length === 0) throw new Error("Cannot calculate a median without scores.");
  const ordered = [...scores].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[midpoint]!;
  return (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
}

function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPOSITORY_ROOT,
      env,
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

async function waitForServer(url: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production web server exited with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Production web server did not become ready at ${url}.`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.killed) return;
  await new Promise<void>((resolve) => {
    const forceTimer = setTimeout(() => {
      server.kill("SIGKILL");
    }, 5_000);
    server.once("exit", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

function categoryScores(result: Awaited<ReturnType<typeof lighthouse>>): LighthouseCategoryScores {
  if (!result) throw new Error("Lighthouse returned no result.");
  const score = (category: (typeof CATEGORIES)[number]): number => {
    const value = result.lhr.categories[category]?.score;
    if (value === null || value === undefined) {
      throw new Error(`Lighthouse did not return a ${category} score.`);
    }
    return value;
  };
  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo: score("seo"),
  };
}

function medianCategoryScores(runs: readonly LighthouseCategoryScores[]) {
  return {
    performance: medianScore(runs.map((run) => run.performance)),
    accessibility: medianScore(runs.map((run) => run.accessibility)),
    bestPractices: medianScore(runs.map((run) => run.bestPractices)),
    seo: medianScore(runs.map((run) => run.seo)),
  };
}

function assertAuditedRoute(
  result: Awaited<ReturnType<typeof lighthouse>>,
  requestedUrl: string,
): void {
  if (!result) throw new Error("Lighthouse returned no result.");
  const requested = new URL(requestedUrl);
  const final = new URL(result.lhr.finalDisplayedUrl);
  const requestedLocation = `${requested.origin}${requested.pathname}${requested.search}`;
  const finalLocation = `${final.origin}${final.pathname}${final.search}`;
  if (finalLocation !== requestedLocation) {
    throw new Error(`Lighthouse redirected ${requestedLocation} to ${finalLocation}.`);
  }
}

async function loadWebFixtures(): Promise<{
  readonly database: TestDatabaseModule;
  readonly session: SessionFixtureModule;
}> {
  const databaseUrl = pathToFileURL(path.join(WEB_DIRECTORY, "e2e/setup/test-database.ts")).href;
  const sessionUrl = pathToFileURL(
    path.join(WEB_DIRECTORY, "e2e/setup/publisher-session-fixtures.ts"),
  ).href;
  return {
    database: (await import(databaseUrl)) as TestDatabaseModule,
    session: (await import(sessionUrl)) as SessionFixtureModule,
  };
}

export async function runLighthouseReleaseGate(): Promise<void> {
  process.env.TEST_DATABASE_NAME = LIGHTHOUSE_DATABASE_NAME;
  process.env.TEST_PORT = LIGHTHOUSE_PORT;
  const { database, session } = await loadWebFixtures();
  const baseUrl = `http://localhost:${LIGHTHOUSE_PORT}`;
  const webEnv = {
    ...process.env,
    DATABASE_URL: database.TEST_DATABASE_URL,
    NEXT_PUBLIC_BASE_URL: baseUrl,
    MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
    WEB_PORT: LIGHTHOUSE_PORT,
    API_PORT: "3001",
    BETTER_AUTH_SECRET: database.TEST_BETTER_AUTH_SECRET,
    ...database.TEST_GITHUB_APP_ENV,
  };
  const routes = [
    ...PUBLIC_LIGHTHOUSE_ROUTE_MATRIX.map((route) => ({ route, authenticated: false })),
    ...AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX.map((route) => ({ route, authenticated: true })),
  ];
  const expectedResults = routes.length * LIGHTHOUSE_PROFILES.length;
  const results: LighthouseRouteResult[] = [];
  const writeReport = (status: "in-progress" | "passed" | "failed") =>
    writeLighthouseReleaseReport(REPOSITORY_ROOT, {
      schemaVersion: 1,
      status,
      generatedAt: new Date().toISOString(),
      lighthouseVersion,
      minimumScore: MINIMUM_SCORE,
      runsPerRouteAndProfile: LIGHTHOUSE_RUNS,
      expectedResults,
      results,
    });

  let server: ChildProcess | null = null;
  let chrome: Awaited<ReturnType<typeof chromeLauncher.launch>> | null = null;
  try {
    await writeReport("in-progress");
    await database.prepareTestDatabase();
    const seededSession = await session.seedPublisherSession({ role: "owner" });
    if (process.env.LIGHTHOUSE_SKIP_BUILD !== "1") {
      await runCommand("pnpm", ["--filter", "@themcpdirectory/web", "build"], webEnv);
    }

    const nextCli = path.join(WEB_DIRECTORY, "node_modules/next/dist/bin/next");
    server = spawn(process.execPath, [nextCli, "start", "--port", LIGHTHOUSE_PORT], {
      cwd: WEB_DIRECTORY,
      env: webEnv,
      stdio: "inherit",
    });
    await waitForServer(baseUrl, server);

    chrome = await chromeLauncher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    });

    for (const profile of LIGHTHOUSE_PROFILES) {
      for (const entry of routes) {
        const excludedAudits = NOINDEX_LIGHTHOUSE_ROUTES.has(entry.route)
          ? [CRAWLABILITY_AUDIT]
          : [];
        const runs: LighthouseCategoryScores[] = [];
        for (let run = 1; run <= LIGHTHOUSE_RUNS; run += 1) {
          console.log(`[lighthouse] ${profile.name} ${entry.route} run ${run}/${LIGHTHOUSE_RUNS}`);
          const requestedUrl = new URL(entry.route, baseUrl).toString();
          const audit = await lighthouse(
            requestedUrl,
            {
              port: chrome.port,
              output: "json",
              logLevel: "error",
              extraHeaders: entry.authenticated
                ? { Cookie: `${seededSession.cookie.name}=${seededSession.cookie.value}` }
                : null,
            },
            {
              extends: "lighthouse:default",
              settings: {
                onlyCategories: [...CATEGORIES],
                skipAudits: excludedAudits,
                formFactor: profile.formFactor,
                screenEmulation: profile.screenEmulation,
                throttlingMethod: "devtools",
                throttling: profile.throttling,
              },
            },
          );
          assertAuditedRoute(audit, requestedUrl);
          runs.push(categoryScores(audit));
        }
        results.push({
          route: entry.route,
          authenticated: entry.authenticated,
          profile: profile.name,
          excludedAudits,
          runs,
          median: medianCategoryScores(runs),
        });
        await writeReport("in-progress");
      }
    }

    if (results.length !== expectedResults) {
      throw new Error(
        `Lighthouse produced ${results.length} of ${expectedResults} expected results.`,
      );
    }
    const failures = results.flatMap((result) =>
      Object.entries(result.median)
        .filter(([, score]) => score < MINIMUM_SCORE)
        .map(
          ([category, score]) =>
            `${result.profile} ${result.route} ${category}: ${Math.round(score * 100)}`,
        ),
    );
    if (failures.length > 0) {
      await writeReport("failed");
      throw new Error(
        `Lighthouse median scores below ${MINIMUM_SCORE * 100}:\n${failures.join("\n")}`,
      );
    }
    const reportPath = await writeReport("passed");
    console.log(`Lighthouse release gate passed. Report: ${reportPath}`);
  } finally {
    if (chrome) await chrome.kill();
    if (server) await stopServer(server);
    await database.dropTestDatabase();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLighthouseReleaseGate().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
