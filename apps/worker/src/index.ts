import PgBoss from "pg-boss";
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
import { synchronizeRegistryPage } from "@themcpdirectory/domain";

const REGISTRY_SYNC_QUEUE = "registry.sync";

interface RegistrySyncJobData {
	sourceKey?: string;
	cursorStart?: string;
}

interface SyncRunSummary {
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

function parseRegistrySyncJobData(data: unknown): RegistrySyncJobData {
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

async function runRegistrySync(params: {
	db: Database;
	sourceKey: string;
	baseUrl: string;
	cursorStart?: string;
	pages?: AsyncIterable<RegistryPage>;
}): Promise<SyncRunSummary> {
	const source = await ensureRegistrySource(params.db, params.sourceKey, params.baseUrl);
	const resumeCursor = params.cursorStart ?? (await resolveResumeCursor(params.db, source.id)) ?? null;

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
			cursorEnd = asCursor(page.metadata.nextCursor) ?? cursorEnd;

			try {
				const result = await synchronizeRegistryPage(params.db, source, page, {
					observedAt: new Date(),
					syncRunId: run.id,
					...(resumeCursor !== null ? { cursorStart: resumeCursor } : {}),
					...(cursorEnd !== null ? { cursorEnd } : {}),
				});

				recordsSeen += result.recordsSeen;
				recordsCreated += result.recordsCreated;
				recordsUpdated += result.recordsUpdated;
				recordsFailed += result.recordsFailed;
			} catch (error) {
				recordsSeen += page.servers.length;
				recordsFailed += page.servers.length;
				errorSummaries.push(toSafeErrorSummary(error));
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
			errorSummary: errorSummaries.length > 0 ? errorSummaries.join(" | ").slice(0, 2000) : null,
		})
		.where(eq(registrySyncRuns.id, run.id));

	return {
		runId: run.id,
		status,
		recordsSeen,
		recordsCreated,
		recordsUpdated,
		recordsFailed,
		cursorStart: resumeCursor,
		cursorEnd,
		errorSummary: errorSummaries.length > 0 ? errorSummaries.join(" | ").slice(0, 2000) : null,
	};
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

async function startWorker(): Promise<void> {
	const env = loadEnv();
	const db = createDatabase(env.DATABASE_URL);

	if (process.argv.includes("sync-fixture")) {
		await runFixtureSyncCommand(db, env.MCP_REGISTRY_BASE_URL);
		return;
	}

	const boss = new PgBoss({ connectionString: env.DATABASE_URL });
	await boss.start();
	await boss.createQueue(REGISTRY_SYNC_QUEUE, {
		name: REGISTRY_SYNC_QUEUE,
		retryLimit: 5,
		retryDelay: 30,
		retryBackoff: true,
	});

	await boss.work(REGISTRY_SYNC_QUEUE, async ([job]) => {
		const jobData = parseRegistrySyncJobData(job?.data);

		const summary = await runRegistrySync({
			db,
			sourceKey: jobData.sourceKey ?? "official",
			baseUrl: env.MCP_REGISTRY_BASE_URL,
			...(jobData.cursorStart !== undefined ? { cursorStart: jobData.cursorStart } : {}),
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
	});

	const shutdown = async () => {
		await boss.stop({ graceful: true });
		process.exit(0);
	};

	process.on("SIGINT", () => void shutdown());
	process.on("SIGTERM", () => void shutdown());

	console.info({ event: "worker_started", queue: REGISTRY_SYNC_QUEUE });
}

startWorker().catch((error) => {
	console.error({ event: "worker_failed", error: toSafeErrorSummary(error) });
	process.exit(1);
});

