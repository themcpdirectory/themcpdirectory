import { pathToFileURL } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv } from "@themcpdirectory/config";
import { refreshServerSearchDocument, synchronizeRegistryPage } from "@themcpdirectory/domain";
import {
	categories,
	publishers,
	registrySources,
	serverAliases,
	serverCategories,
	servers,
} from "./schema/index.js";
import * as schema from "./schema/index.js";
import { CURATED_CATEGORIES } from "./seed/categories.js";
import { SEED_FIXTURES } from "./seed/registry-fixtures.js";

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

interface RunSeedOptions {
	readonly databaseUrl: string;
}

interface SeedCounts {
	readonly categories: number;
	readonly publishers: number;
	readonly servers: number;
	readonly versions: number;
	readonly packages: number;
	readonly remotes: number;
	readonly aliases: number;
	readonly serverCategories: number;
	readonly searchReady: number;
}

export interface RunSeedResult {
	readonly status: "ok";
	readonly counts: SeedCounts;
}

async function upsertCuratedCategories(db: SeedDb): Promise<void> {
	for (const category of CURATED_CATEGORIES) {
		await db
			.insert(categories)
			.values({
				slug: category.slug,
				name: category.name,
				description: category.description,
				sortOrder: category.sortOrder,
			})
			.onConflictDoUpdate({
				target: categories.slug,
				set: {
					name: category.name,
					description: category.description,
					sortOrder: category.sortOrder,
				},
			});
	}
}

async function ensureRegistrySource(db: SeedDb): Promise<{ id: string; key: string; name: string }> {
	const source = SEED_FIXTURES.source;

	const [existing] = await db
		.select({ id: registrySources.id, key: registrySources.key, name: registrySources.name })
		.from(registrySources)
		.where(eq(registrySources.key, source.key));

	if (existing) {
		await db
			.update(registrySources)
			.set({
				name: source.name,
				baseUrl: source.baseUrl,
				kind: source.kind,
				enabled: source.enabled,
			})
			.where(eq(registrySources.id, existing.id));

		return existing;
	}

	const [created] = await db
		.insert(registrySources)
		.values({
			key: source.key,
			name: source.name,
			baseUrl: source.baseUrl,
			kind: source.kind,
			enabled: source.enabled,
		})
		.returning({ id: registrySources.id, key: registrySources.key, name: registrySources.name });

	if (!created) {
		throw new Error("Unable to create registry source for seed fixtures.");
	}

	return created;
}

async function ingestRegistryFixtures(db: SeedDb): Promise<void> {
	const source = await ensureRegistrySource(db);
	for (const page of SEED_FIXTURES.pages) {
		await synchronizeRegistryPage(db, source, page, {
			observedAt: SEED_FIXTURES.observedAt,
		});
	}
}

async function upsertPublishers(db: SeedDb): Promise<Map<string, string>> {
	const publisherIdsBySlug = new Map<string, string>();

	for (const publisher of SEED_FIXTURES.publishers) {
		const [saved] = await db
			.insert(publishers)
			.values({
				slug: publisher.slug,
				displayName: publisher.displayName,
				description: publisher.description,
				websiteUrl: publisher.websiteUrl,
				githubOrg: publisher.githubOrg,
				verificationState: publisher.verificationState,
			})
			.onConflictDoUpdate({
				target: publishers.slug,
				set: {
					displayName: publisher.displayName,
					description: publisher.description,
					websiteUrl: publisher.websiteUrl,
					githubOrg: publisher.githubOrg,
					verificationState: publisher.verificationState,
				},
			})
			.returning({ id: publishers.id, slug: publishers.slug });

		if (!saved) {
			throw new Error(`Failed to upsert publisher '${publisher.slug}'.`);
		}

		publisherIdsBySlug.set(saved.slug, saved.id);
	}

	return publisherIdsBySlug;
}

async function updateServerPublisherLinks(db: SeedDb, publisherIdsBySlug: Map<string, string>): Promise<void> {
	for (const link of SEED_FIXTURES.publisherLinks) {
		const publisherId = publisherIdsBySlug.get(link.publisherSlug);
		if (!publisherId) {
			throw new Error(`Unknown publisher slug '${link.publisherSlug}' in fixture mapping.`);
		}

		await db.update(servers).set({ publisherId }).where(eq(servers.slug, link.serverSlug));
	}
}

async function lookupServerIdsBySlug(db: SeedDb): Promise<Map<string, string>> {
	const serverRows = await db.select({ id: servers.id, slug: servers.slug }).from(servers);
	return new Map(serverRows.map((row) => [String(row.slug), row.id]));
}

async function upsertAlias(
	db: SeedDb,
	alias: string,
	serverId: string,
	kind: "manual",
): Promise<void> {
	const [existing] = await db
		.select({ id: serverAliases.id })
		.from(serverAliases)
		.where(eq(sql`lower(${serverAliases.alias})`, alias.toLowerCase()));

	if (existing) {
		await db
			.update(serverAliases)
			.set({
				serverId,
				alias,
				kind,
			})
			.where(eq(serverAliases.id, existing.id));
		return;
	}

	await db.insert(serverAliases).values({
		serverId,
		alias,
		kind,
	});
}

async function upsertAliases(db: SeedDb, serverIdsBySlug: Map<string, string>): Promise<void> {
	for (const alias of SEED_FIXTURES.aliases) {
		const serverId = serverIdsBySlug.get(alias.serverSlug);
		if (!serverId) {
			throw new Error(`Unknown server slug '${alias.serverSlug}' in alias fixture.`);
		}

		await upsertAlias(db, alias.alias, serverId, alias.kind);
	}
}

async function upsertServerCategoryAssignments(
	db: SeedDb,
	serverIdsBySlug: Map<string, string>,
): Promise<void> {
	const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
	const categoryIdsBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));

	for (const assignment of SEED_FIXTURES.categoryAssignments) {
		const serverId = serverIdsBySlug.get(assignment.serverSlug);
		const categoryId = categoryIdsBySlug.get(assignment.categorySlug);

		if (!serverId) {
			throw new Error(`Unknown server slug '${assignment.serverSlug}' in category assignment.`);
		}
		if (!categoryId) {
			throw new Error(`Unknown category slug '${assignment.categorySlug}' in category assignment.`);
		}

		await db
			.insert(serverCategories)
			.values({
				serverId,
				categoryId,
				source: assignment.source,
				confidence: null,
			})
			.onConflictDoUpdate({
				target: [serverCategories.serverId, serverCategories.categoryId],
				set: {
					source: assignment.source,
					confidence: null,
				},
			});
	}
}

async function summarizeCounts(db: SeedDb): Promise<SeedCounts> {
	const [counts] = await db
		.select({
			categories: sql<number>`(select count(*) from ${categories})`,
			publishers: sql<number>`(select count(*) from ${publishers})`,
			servers: sql<number>`(select count(*) from ${servers})`,
			versions: sql<number>`(select count(*) from server_versions)`,
			packages: sql<number>`(select count(*) from server_packages)`,
			remotes: sql<number>`(select count(*) from server_remotes)`,
			aliases: sql<number>`(select count(*) from ${serverAliases})`,
			serverCategories: sql<number>`(select count(*) from ${serverCategories})`,
			searchReady: sql<number>`(select count(*) from ${servers} where ${servers.searchDocument} is not null)`,
		})
		.from(servers)
		.limit(1);

	if (!counts) {
		return {
			categories: 0,
			publishers: 0,
			servers: 0,
			versions: 0,
			packages: 0,
			remotes: 0,
			aliases: 0,
			serverCategories: 0,
			searchReady: 0,
		};
	}

	return {
		categories: Number(counts.categories),
		publishers: Number(counts.publishers),
		servers: Number(counts.servers),
		versions: Number(counts.versions),
		packages: Number(counts.packages),
		remotes: Number(counts.remotes),
		aliases: Number(counts.aliases),
		serverCategories: Number(counts.serverCategories),
		searchReady: Number(counts.searchReady),
	};
}

export async function runSeed(options: RunSeedOptions): Promise<RunSeedResult> {
	const client = postgres(options.databaseUrl, { max: 4 });
	const db = drizzle(client, { schema });

	try {
		await upsertCuratedCategories(db);
		await ingestRegistryFixtures(db);

		const publisherIdsBySlug = await upsertPublishers(db);
		await updateServerPublisherLinks(db, publisherIdsBySlug);

		const serverIdsBySlug = await lookupServerIdsBySlug(db);
		await upsertAliases(db, serverIdsBySlug);
		await upsertServerCategoryAssignments(db, serverIdsBySlug);

		await refreshServerSearchDocument(db);

		const counts = await summarizeCounts(db);
		return { status: "ok", counts };
	} finally {
		await client.end();
	}
}

async function main() {
	const env = loadEnv();
	const result = await runSeed({ databaseUrl: env.DATABASE_URL });
	console.log("Seed completed.");
	console.log(result);
}

const directRunTarget = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (directRunTarget && import.meta.url === directRunTarget) {
	main().catch((error) => {
		console.error("Seed failed:", error);
		process.exit(1);
	});
}
