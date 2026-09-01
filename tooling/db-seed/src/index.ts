import { pathToFileURL } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
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
} from "@themcpdirectory/db";
import * as schema from "@themcpdirectory/db";
import { CURATED_CATEGORIES } from "./categories.js";
import { SEED_FIXTURES, type SeedFixtureBundle } from "./registry-fixtures.js";

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

interface RunSeedOptions {
  readonly databaseUrl: string;
  readonly fixtures?: SeedFixtureBundle;
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

async function ensureRegistrySource(
  db: SeedDb,
  fixtures: SeedFixtureBundle,
): Promise<{ id: string; key: string; name: string }> {
  const source = fixtures.source;

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

async function ingestRegistryFixtures(db: SeedDb, fixtures: SeedFixtureBundle): Promise<void> {
  const source = await ensureRegistrySource(db, fixtures);
  for (const page of fixtures.pages) {
    await synchronizeRegistryPage(db, source, page, {
      observedAt: fixtures.observedAt,
    });
  }
}

async function upsertPublishers(db: SeedDb, fixtures: SeedFixtureBundle): Promise<Map<string, string>> {
  const publisherIdsBySlug = new Map<string, string>();

  for (const publisher of fixtures.publishers) {
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

async function updateServerPublisherLinks(
  db: SeedDb,
  fixtures: SeedFixtureBundle,
  publisherIdsBySlug: Map<string, string>,
): Promise<void> {
  for (const link of fixtures.publisherLinks) {
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

async function upsertAlias(db: SeedDb, alias: string, serverId: string, kind: "manual"): Promise<void> {
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

async function upsertAliases(
  db: SeedDb,
  fixtures: SeedFixtureBundle,
  serverIdsBySlug: Map<string, string>,
): Promise<void> {
  for (const alias of fixtures.aliases) {
    const serverId = serverIdsBySlug.get(alias.serverSlug);
    if (!serverId) {
      throw new Error(`Unknown server slug '${alias.serverSlug}' in alias fixture.`);
    }

    await upsertAlias(db, alias.alias, serverId, alias.kind);
  }
}

async function reconcileManagedAliases(
  db: SeedDb,
  fixtures: SeedFixtureBundle,
  serverIdsBySlug: Map<string, string>,
): Promise<void> {
  const seededServerIds = Array.from(
    new Set(
      fixtures.publisherLinks
        .map((link) => serverIdsBySlug.get(link.serverSlug))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (seededServerIds.length === 0) {
    return;
  }

  const managedAliasValues = new Set(fixtures.managedAliasValues.map((alias) => alias.toLowerCase()));
  if (managedAliasValues.size === 0) {
    return;
  }
  const currentAliasValues = new Set(fixtures.aliases.map((alias) => alias.alias.toLowerCase()));

  const existingManagedAliases = await db
    .select({ id: serverAliases.id, alias: serverAliases.alias })
    .from(serverAliases)
    .where(
      and(
        inArray(serverAliases.serverId, seededServerIds),
        eq(serverAliases.kind, "manual"),
      ),
    );

  const staleAliasIds = existingManagedAliases
    .filter((row) => {
      const normalized = row.alias.toLowerCase();
      return managedAliasValues.has(normalized) && !currentAliasValues.has(normalized);
    })
    .map((row) => row.id);

  if (staleAliasIds.length > 0) {
    await db.delete(serverAliases).where(inArray(serverAliases.id, staleAliasIds));
  }
}

async function upsertServerCategoryAssignments(
  db: SeedDb,
  fixtures: SeedFixtureBundle,
  serverIdsBySlug: Map<string, string>,
): Promise<void> {
  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryIdsBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));

  for (const assignment of fixtures.categoryAssignments) {
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

async function reconcileManagedCategoryAssignments(
  db: SeedDb,
  fixtures: SeedFixtureBundle,
  serverIdsBySlug: Map<string, string>,
): Promise<void> {
  const seededServerIds = Array.from(
    new Set(
      fixtures.publisherLinks
        .map((link) => serverIdsBySlug.get(link.serverSlug))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (seededServerIds.length === 0) {
    return;
  }

  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryIdsBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));

  const ownedAssignmentKeys = new Set<string>();
  for (const managedKey of fixtures.managedCategoryAssignmentKeys) {
    const serverId = serverIdsBySlug.get(managedKey.serverSlug);
    const categoryId = categoryIdsBySlug.get(managedKey.categorySlug);

    if (!serverId) {
      throw new Error(
        `Unknown server slug '${managedKey.serverSlug}' in managed category assignment ownership set.`,
      );
    }
    if (!categoryId) {
      throw new Error(
        `Unknown category slug '${managedKey.categorySlug}' in managed category assignment ownership set.`,
      );
    }

    ownedAssignmentKeys.add(`${serverId}:${categoryId}`);
  }

  const currentOwnedAssignmentKeys = new Set<string>();
  for (const assignment of fixtures.categoryAssignments) {
    const serverId = serverIdsBySlug.get(assignment.serverSlug);
    const categoryId = categoryIdsBySlug.get(assignment.categorySlug);

    if (!serverId) {
      throw new Error(`Unknown server slug '${assignment.serverSlug}' in category assignment.`);
    }
    if (!categoryId) {
      throw new Error(`Unknown category slug '${assignment.categorySlug}' in category assignment.`);
    }

    const key = `${serverId}:${categoryId}`;
    if (ownedAssignmentKeys.has(key)) {
      currentOwnedAssignmentKeys.add(key);
    }
  }

  const existingRows = await db
    .select({ serverId: serverCategories.serverId, categoryId: serverCategories.categoryId })
    .from(serverCategories)
    .where(inArray(serverCategories.serverId, seededServerIds));

  const staleRows = existingRows.filter((row) => {
    const key = `${row.serverId}:${row.categoryId}`;
    return ownedAssignmentKeys.has(key) && !currentOwnedAssignmentKeys.has(key);
  });

  for (const row of staleRows) {
    await db
      .delete(serverCategories)
      .where(
        and(
          eq(serverCategories.serverId, row.serverId),
          eq(serverCategories.categoryId, row.categoryId),
        ),
      );
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
  const fixtures = options.fixtures ?? SEED_FIXTURES;

  try {
    await upsertCuratedCategories(db);
    await ingestRegistryFixtures(db, fixtures);

    const publisherIdsBySlug = await upsertPublishers(db, fixtures);
    await updateServerPublisherLinks(db, fixtures, publisherIdsBySlug);

    const serverIdsBySlug = await lookupServerIdsBySlug(db);
    await upsertAliases(db, fixtures, serverIdsBySlug);
    await reconcileManagedAliases(db, fixtures, serverIdsBySlug);
    await upsertServerCategoryAssignments(db, fixtures, serverIdsBySlug);
    await reconcileManagedCategoryAssignments(db, fixtures, serverIdsBySlug);

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
