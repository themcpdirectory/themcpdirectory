import PgBoss from "pg-boss";
import { pathToFileURL } from "node:url";
import { desc, eq, sql } from "drizzle-orm";
import {
  createDatabase,
  registrySnapshots,
  registrySources,
  registrySyncRuns,
  serverIcons,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { loadEnv } from "@themcpdirectory/config";
import {
  OfficialRegistryClient,
  RegistryPageSchema,
  VALID_REGISTRY_PAGE,
  type RegistryPage,
} from "@themcpdirectory/registry-client";
import {
  enrichGitHubRepository,
  GitHubRateLimitError,
  synchronizeRegistryPage,
  type GitHubRequestOptions,
} from "@themcpdirectory/domain";

export const REGISTRY_SYNC_QUEUE = "registry.sync";
export const GITHUB_ENRICH_QUEUE = "github.enrich";
export const GITHUB_ENRICH_RETRY_LIMIT = 5;
export const REGISTRY_SYNC_QUEUE_OPTIONS = {
  policy: "short",
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
} as const;
export const GITHUB_ENRICH_QUEUE_OPTIONS = {
  policy: "short",
  retryLimit: GITHUB_ENRICH_RETRY_LIMIT,
  retryDelay: 30,
  retryBackoff: true,
} as const;

export interface RegistrySyncJobData {
  sourceKey?: string;
  cursorStart?: string;
}

export interface GitHubEnrichJobData {
  serverId: string;
  checkedAt?: string;
  retriesConsumed?: number;
}

export class GitHubEnrichJobDataError extends Error {
  constructor() {
    super(
      "GitHub enrichment job data must contain a valid serverId UUID and optional canonical checkedAt timestamp.",
    );
    this.name = "GitHubEnrichJobDataError";
  }
}

export class GitHubEnrichmentDeferralError extends Error {
  constructor() {
    super("Unable to schedule a deferred GitHub enrichment job.");
    this.name = "GitHubEnrichmentDeferralError";
  }
}

export interface SyncRunSummary {
  runId: string;
  status: "succeeded" | "partially_failed" | "failed";
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  cursorStart: string | null;
  cursorEnd: string | null;
  errorSummary: string | null;
}

export class RegistrySyncTerminalError extends Error {
  readonly summary: SyncRunSummary;

  constructor(summary: SyncRunSummary) {
    super(
      summary.errorSummary ??
        `Registry sync finished with status '${summary.status}' and ${summary.recordsFailed} failed records.`,
    );
    this.name = "RegistrySyncTerminalError";
    this.summary = summary;
  }
}

interface CountSnapshot {
  servers: number;
  versions: number;
  snapshots: number;
  packages: number;
  remotes: number;
  icons: number;
}

function asCursor(value: string | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toSafeErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 400);
  }
  return "Unknown synchronization error";
}

export function parseRegistrySyncJobData(data: unknown): RegistrySyncJobData {
  if (!data || typeof data !== "object") {
    return {};
  }

  const candidate = data as Record<string, unknown>;

  const sourceKey = typeof candidate.sourceKey === "string" ? candidate.sourceKey : null;
  const cursorStart = typeof candidate.cursorStart === "string" ? candidate.cursorStart : null;

  return {
    ...(sourceKey !== null ? { sourceKey } : {}),
    ...(cursorStart !== null ? { cursorStart } : {}),
  };
}

export function parseGitHubEnrichJobData(data: unknown): GitHubEnrichJobData {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GitHubEnrichJobDataError();
  }

  const candidate = data as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const validUuid =
    typeof candidate.serverId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.serverId);
  const validCheckedAt =
    candidate.checkedAt === undefined ||
    (typeof candidate.checkedAt === "string" &&
      !Number.isNaN(Date.parse(candidate.checkedAt)) &&
      new Date(candidate.checkedAt).toISOString() === candidate.checkedAt);
  const validRetriesConsumed =
    candidate.retriesConsumed === undefined ||
    (typeof candidate.retriesConsumed === "number" &&
      Number.isInteger(candidate.retriesConsumed) &&
      candidate.retriesConsumed >= 1 &&
      candidate.retriesConsumed <= GITHUB_ENRICH_RETRY_LIMIT);
  const validKeys = keys.every(
    (key) => key === "serverId" || key === "checkedAt" || key === "retriesConsumed",
  );
  if (!validUuid || !validCheckedAt || !validRetriesConsumed || !validKeys) {
    throw new GitHubEnrichJobDataError();
  }

  return {
    serverId: candidate.serverId as string,
    ...(typeof candidate.checkedAt === "string" ? { checkedAt: candidate.checkedAt } : {}),
    ...(typeof candidate.retriesConsumed === "number"
      ? { retriesConsumed: candidate.retriesConsumed }
      : {}),
  };
}

async function ensureRegistrySource(db: Database, key: string, baseUrl: string) {
  const [existing] = await db.select().from(registrySources).where(eq(registrySources.key, key));
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(registrySources)
    .values({
      key,
      name: key === "official" ? "Official MCP Registry" : key,
      baseUrl,
      kind: key,
      enabled: true,
    })
    .returning();

  if (!created) {
    throw new Error("Unable to create registry source.");
  }

  return created;
}

async function resolveResumeCursor(db: Database, sourceId: string): Promise<string | null> {
  const [latestRun] = await db
    .select({ cursorEnd: registrySyncRuns.cursorEnd, status: registrySyncRuns.status })
    .from(registrySyncRuns)
    .where(eq(registrySyncRuns.registrySourceId, sourceId))
    .orderBy(desc(registrySyncRuns.startedAt))
    .limit(1);

  if (!latestRun) return null;
  if (latestRun.status === "partially_failed" || latestRun.status === "failed") {
    return latestRun.cursorEnd;
  }
  return null;
}

async function recordTableCounts(db: Database): Promise<CountSnapshot> {
  const [count] = await db
    .select({
      servers: sql<number>`(select count(*) from ${servers})`,
      versions: sql<number>`(select count(*) from ${serverVersions})`,
      snapshots: sql<number>`(select count(*) from ${registrySnapshots})`,
      packages: sql<number>`(select count(*) from ${serverPackages})`,
      remotes: sql<number>`(select count(*) from ${serverRemotes})`,
      icons: sql<number>`(select count(*) from ${serverIcons})`,
    })
    .from(servers)
    .limit(1);

  return count ?? { servers: 0, versions: 0, snapshots: 0, packages: 0, remotes: 0, icons: 0 };
}

async function* singleFixturePageGenerator(): AsyncGenerator<RegistryPage> {
  yield RegistryPageSchema.parse(structuredClone(VALID_REGISTRY_PAGE));
}

export async function runRegistrySync(params: {
  db: Database;
  sourceKey: string;
  baseUrl: string;
  cursorStart?: string;
  pages?: AsyncIterable<RegistryPage>;
  enqueueGitHubEnrichment?: (serverId: string) => Promise<unknown>;
}): Promise<SyncRunSummary> {
  const source = await ensureRegistrySource(params.db, params.sourceKey, params.baseUrl);
  const resumeCursor =
    params.cursorStart ?? (await resolveResumeCursor(params.db, source.id)) ?? null;

  const startedAt = new Date();
  const [run] = await params.db
    .insert(registrySyncRuns)
    .values({
      registrySourceId: source.id,
      startedAt,
      status: "running",
      cursorStart: resumeCursor,
      recordsSeen: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
    })
    .returning({ id: registrySyncRuns.id });

  if (!run) {
    throw new Error("Unable to start sync run.");
  }

  let recordsSeen = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsFailed = 0;
  let cursorEnd: string | null = resumeCursor;
  let fatalError: unknown;
  const errorSummaries: string[] = [];

  const pages =
    params.pages ??
    new OfficialRegistryClient({
      baseUrl: params.baseUrl,
      timeoutMs: 15_000,
      maxRetries: 5,
      maxRedirects: 3,
      maxResponseBytes: 2_000_000,
    }).pages(resumeCursor === null ? undefined : { cursor: resumeCursor });

  try {
    for await (const page of pages) {
      const pageCursorStart = cursorEnd;
      const pageCursorEnd = asCursor(page.metadata.nextCursor);

      const result = await synchronizeRegistryPage(params.db, source, page, {
        observedAt: new Date(),
        syncRunId: run.id,
        ...(pageCursorStart !== null ? { cursorStart: pageCursorStart } : {}),
        ...(pageCursorEnd !== null ? { cursorEnd: pageCursorEnd } : {}),
      });

      recordsSeen += result.recordsSeen;
      recordsCreated += result.recordsCreated;
      recordsUpdated += result.recordsUpdated;
      recordsFailed += result.recordsFailed;

      if (params.enqueueGitHubEnrichment) {
        for (const serverId of result.githubEnrichmentServerIds) {
          await params.enqueueGitHubEnrichment(serverId);
        }
      }

      cursorEnd = pageCursorEnd ?? pageCursorStart;

      if (result.recordFailures.length > 0) {
        for (const failure of result.recordFailures) {
          errorSummaries.push(
            `record[${failure.recordIndex}] ${failure.serverName}: ${failure.code} ${failure.message}`,
          );
        }
      }
    }
  } catch (error) {
    fatalError = error;
    errorSummaries.push(toSafeErrorSummary(error));
  }

  const status: SyncRunSummary["status"] =
    fatalError !== undefined
      ? recordsSeen > 0
        ? "partially_failed"
        : "failed"
      : recordsFailed > 0
        ? "partially_failed"
        : "succeeded";

  const errorSummary = errorSummaries.length > 0 ? errorSummaries.join(" | ").slice(0, 2000) : null;

  await params.db
    .update(registrySyncRuns)
    .set({
      finishedAt: new Date(),
      status,
      cursorEnd,
      recordsSeen,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      errorSummary,
    })
    .where(eq(registrySyncRuns.id, run.id));

  const summary: SyncRunSummary = {
    runId: run.id,
    status,
    recordsSeen,
    recordsCreated,
    recordsUpdated,
    recordsFailed,
    cursorStart: resumeCursor,
    cursorEnd,
    errorSummary,
  };

  if (status !== "succeeded") {
    throw new RegistrySyncTerminalError(summary);
  }

  return summary;
}

export async function processRegistrySyncJob(params: {
  db: Database;
  jobData: RegistrySyncJobData;
  baseUrl: string;
  pages?: AsyncIterable<RegistryPage>;
  enqueueGitHubEnrichment?: (serverId: string) => Promise<unknown>;
}) {
  const summary = await runRegistrySync({
    db: params.db,
    sourceKey: params.jobData.sourceKey ?? "official",
    baseUrl: params.baseUrl,
    ...(params.jobData.cursorStart !== undefined
      ? { cursorStart: params.jobData.cursorStart }
      : {}),
    ...(params.pages ? { pages: params.pages } : {}),
    ...(params.enqueueGitHubEnrichment
      ? { enqueueGitHubEnrichment: params.enqueueGitHubEnrichment }
      : {}),
  });

  return summary;
}

export async function processGitHubEnrichJob(
  params: {
    db: Database;
    jobData: GitHubEnrichJobData;
    checkedAt: Date;
  } & GitHubRequestOptions,
) {
  return enrichGitHubRepository(params.db, params.jobData.serverId, {
    checkedAt: params.checkedAt,
    ...(params.token !== undefined ? { token: params.token } : {}),
    ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
    ...(params.fetchImpl !== undefined ? { fetchImpl: params.fetchImpl } : {}),
  });
}

export async function enqueueGitHubEnrichment(
  boss: PgBoss,
  serverId: string,
  options: { checkedAt?: Date; startAfter?: Date; retriesConsumed?: number } = {},
): Promise<string | null> {
  return boss.send(
    GITHUB_ENRICH_QUEUE,
    {
      serverId,
      ...(options.checkedAt !== undefined ? { checkedAt: options.checkedAt.toISOString() } : {}),
      ...(options.retriesConsumed !== undefined
        ? { retriesConsumed: options.retriesConsumed }
        : {}),
    },
    {
      singletonKey: serverId,
      ...(options.startAfter !== undefined ? { startAfter: options.startAfter } : {}),
      ...(options.retriesConsumed !== undefined
        ? { retryLimit: GITHUB_ENRICH_RETRY_LIMIT - options.retriesConsumed }
        : {}),
    },
  );
}

export async function deferGitHubEnrichment(
  boss: PgBoss,
  serverId: string,
  options: { checkedAt: Date; startAfter: Date; retriesConsumed: number },
): Promise<string> {
  const jobId = await enqueueGitHubEnrichment(boss, serverId, options);
  if (jobId === null) throw new GitHubEnrichmentDeferralError();
  return jobId;
}

export async function initializeWorkerQueues(
  boss: PgBoss,
): Promise<{ initialRegistrySyncJobId: string | null }> {
  await boss.createQueue(REGISTRY_SYNC_QUEUE, {
    name: REGISTRY_SYNC_QUEUE,
    ...REGISTRY_SYNC_QUEUE_OPTIONS,
  });
  await boss.createQueue(GITHUB_ENRICH_QUEUE, {
    name: GITHUB_ENRICH_QUEUE,
    ...GITHUB_ENRICH_QUEUE_OPTIONS,
  });

  const initialRegistrySyncJobId = await boss.send(
    REGISTRY_SYNC_QUEUE,
    { sourceKey: "official" },
    { singletonKey: "official" },
  );
  return { initialRegistrySyncJobId };
}

export async function handleGitHubEnrichJob(
  params: {
    db: Database;
    jobData: GitHubEnrichJobData;
    checkedAt: Date;
    retryCount?: number;
    deferRateLimitRetry(retryAt: Date, checkedAt: Date, retriesConsumed: number): Promise<void>;
  } & GitHubRequestOptions,
) {
  try {
    const snapshot = await processGitHubEnrichJob(params);
    return { status: "succeeded" as const, snapshot };
  } catch (error) {
    if (
      error instanceof GitHubRateLimitError &&
      error.resetAt !== null &&
      error.resetAt.getTime() > Date.now()
    ) {
      const retriesConsumed = (params.jobData.retriesConsumed ?? 0) + (params.retryCount ?? 0);
      if (retriesConsumed >= GITHUB_ENRICH_RETRY_LIMIT) throw error;
      await params.deferRateLimitRetry(error.resetAt, params.checkedAt, retriesConsumed + 1);
      return { status: "deferred" as const, retryAt: error.resetAt };
    }
    throw error;
  }
}

async function runFixtureSyncCommand(db: Database, baseUrl: string): Promise<void> {
  const before = await recordTableCounts(db);

  await runRegistrySync({
    db,
    sourceKey: "official",
    baseUrl,
    pages: singleFixturePageGenerator(),
  });

  const afterFirst = await recordTableCounts(db);

  await runRegistrySync({
    db,
    sourceKey: "official",
    baseUrl,
    pages: singleFixturePageGenerator(),
  });

  const afterSecond = await recordTableCounts(db);

  console.info({
    event: "fixture_sync_complete",
    queue: REGISTRY_SYNC_QUEUE,
    before,
    afterFirst,
    afterSecond,
    idempotent: JSON.stringify(afterFirst) === JSON.stringify(afterSecond),
  });
}

export async function startWorker(): Promise<void> {
  const env = loadEnv();
  const db = createDatabase(env.DATABASE_URL);

  if (process.argv.includes("sync-fixture")) {
    await runFixtureSyncCommand(db, env.MCP_REGISTRY_BASE_URL);
    return;
  }

  const boss = new PgBoss({ connectionString: env.DATABASE_URL });
  await boss.start();
  await initializeWorkerQueues(boss);

  const handler: PgBoss.WorkHandler<RegistrySyncJobData> = async ([job]) => {
    const jobData = parseRegistrySyncJobData(job?.data);

    const summary = await processRegistrySyncJob({
      db,
      baseUrl: env.MCP_REGISTRY_BASE_URL,
      jobData,
      enqueueGitHubEnrichment: (serverId) => enqueueGitHubEnrichment(boss, serverId),
    });

    console.info({
      event: "registry_sync_job",
      queue: REGISTRY_SYNC_QUEUE,
      jobId: job?.id ?? null,
      runId: summary.runId,
      status: summary.status,
      recordsSeen: summary.recordsSeen,
      recordsCreated: summary.recordsCreated,
      recordsUpdated: summary.recordsUpdated,
      recordsFailed: summary.recordsFailed,
      cursorStart: summary.cursorStart,
      cursorEnd: summary.cursorEnd,
    });
  };

  await boss.work(REGISTRY_SYNC_QUEUE, handler);

  const githubHandler: PgBoss.WorkWithMetadataHandler<GitHubEnrichJobData> = async ([job]) => {
    const jobData = parseGitHubEnrichJobData(job?.data);
    const result = await handleGitHubEnrichJob({
      db,
      jobData,
      checkedAt:
        jobData.checkedAt !== undefined
          ? new Date(jobData.checkedAt)
          : (job?.createdOn ?? new Date()),
      retryCount: job?.retryCount ?? 0,
      ...(env.GITHUB_TOKEN !== undefined ? { token: env.GITHUB_TOKEN } : {}),
      async deferRateLimitRetry(retryAt, checkedAt, retriesConsumed) {
        await deferGitHubEnrichment(boss, jobData.serverId, {
          checkedAt,
          startAfter: retryAt,
          retriesConsumed,
        });
      },
    });

    if (result.status === "deferred") {
      console.info({
        event: "github_enrich_job_deferred",
        queue: GITHUB_ENRICH_QUEUE,
        jobId: job?.id ?? null,
        serverId: jobData.serverId,
        retryAt: result.retryAt.toISOString(),
      });
    } else {
      console.info({
        event: "github_enrich_job",
        queue: GITHUB_ENRICH_QUEUE,
        jobId: job?.id ?? null,
        serverId: jobData.serverId,
        snapshotId: result.snapshot.id,
        checkedAt: result.snapshot.checkedAt.toISOString(),
      });
    }
  };

  await boss.work(GITHUB_ENRICH_QUEUE, { includeMetadata: true }, githubHandler);

  const shutdown = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.info({
    event: "worker_started",
    queues: [REGISTRY_SYNC_QUEUE, GITHUB_ENRICH_QUEUE],
  });
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return pathToFileURL(entry).href === import.meta.url;
}

if (isCliEntry()) {
  startWorker().catch((error) => {
    console.error({ event: "worker_failed", error: toSafeErrorSummary(error) });
    process.exit(1);
  });
}
