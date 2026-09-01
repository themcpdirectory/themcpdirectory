import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  categories,
  publishers,
  registrySources,
  serverAliases,
  serverCategories,
  serverPackages,
  serverRemotes,
  servers,
  serverVersions,
  type Database,
} from "@themcpdirectory/db";
import { runSeed } from "../index.js";
import { SEED_FIXTURES, type SeedFixtureBundle } from "../registry-fixtures.js";
import { createTempDatabase } from "./postgres-test-db.js";

const EXPECTED_CATEGORY_COUNT = 15;

async function countTables(db: Database) {
  const [counts] = await db
    .select({
      categories: sql<number>`(select count(*) from ${categories})`,
      publishers: sql<number>`(select count(*) from ${publishers})`,
      sources: sql<number>`(select count(*) from ${registrySources})`,
      servers: sql<number>`(select count(*) from ${servers})`,
      versions: sql<number>`(select count(*) from ${serverVersions})`,
      packages: sql<number>`(select count(*) from ${serverPackages})`,
      remotes: sql<number>`(select count(*) from ${serverRemotes})`,
      aliases: sql<number>`(select count(*) from ${serverAliases})`,
      serverCategories: sql<number>`(select count(*) from ${serverCategories})`,
      searchReady: sql<number>`(select count(*) from ${servers} where ${servers.searchDocument} is not null)`,
    })
    .from(servers)
    .limit(1);

  return {
    categories: Number(counts?.categories ?? 0),
    publishers: Number(counts?.publishers ?? 0),
    sources: Number(counts?.sources ?? 0),
    servers: Number(counts?.servers ?? 0),
    versions: Number(counts?.versions ?? 0),
    packages: Number(counts?.packages ?? 0),
    remotes: Number(counts?.remotes ?? 0),
    aliases: Number(counts?.aliases ?? 0),
    serverCategories: Number(counts?.serverCategories ?? 0),
    searchReady: Number(counts?.searchReady ?? 0),
  };
}

async function getServerIdBySlug(db: Database, slug: string): Promise<string> {
  const [row] = await db.select({ id: servers.id }).from(servers).where(eq(servers.slug, slug));
  if (!row) {
    throw new Error(`Missing seeded server '${slug}'.`);
  }
  return row.id;
}

function withoutFixtureAlias(aliasValue: string): SeedFixtureBundle {
  return {
    ...SEED_FIXTURES,
    aliases: SEED_FIXTURES.aliases.filter((alias) => alias.alias !== aliasValue),
    categoryAssignments: SEED_FIXTURES.categoryAssignments.filter(
      (assignment) => !(assignment.serverSlug === "postgresql" && assignment.categorySlug === "databases"),
    ),
  };
}

function hasRequiredEnvVar(value: unknown, variableName: string): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((variable) => {
    if (typeof variable !== "object" || variable === null) {
      return false;
    }

    const candidate = variable as { name?: unknown; isRequired?: unknown };
    return candidate.name === variableName && candidate.isRequired === true;
  });
}

describe("db seed integration", () => {
  let db: Database;
  let databaseUrl: string;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task7_seed_integration");
    db = temp.db;
    databaseUrl = temp.databaseUrl;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    if (destroy) {
      await destroy();
      destroy = undefined;
    }
  });

  it("seeds all required fixture states and remains idempotent", async () => {
    const first = await runSeed({ databaseUrl });
    const firstCounts = await countTables(db);

    const second = await runSeed({ databaseUrl });
    const secondCounts = await countTables(db);

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(secondCounts).toEqual(firstCounts);
    expect(firstCounts.categories).toBe(EXPECTED_CATEGORY_COUNT);
    expect(firstCounts.searchReady).toBe(firstCounts.servers);

    const publisherRows = await db
      .select({ slug: publishers.slug, verificationState: publishers.verificationState })
      .from(publishers)
      .orderBy(publishers.slug);
    expect(publisherRows).toContainEqual({ slug: "github", verificationState: "verified" });
    expect(publisherRows).toContainEqual({ slug: "community-labs", verificationState: "unverified" });

    const serverRows = await db
      .select({
        id: servers.id,
        slug: servers.slug,
        listingStatus: servers.listingStatus,
        currentVersionId: servers.currentVersionId,
        publisherId: servers.publisherId,
      })
      .from(servers)
      .where(
        inArray(servers.slug, ["github", "playwright", "postgresql", "supabase", "legacy-monitor", "retired-notifier", "shared-handle"]),
      );

    const serverBySlug = new Map(serverRows.map((row) => [String(row.slug), row]));
    expect(serverBySlug.get("legacy-monitor")?.listingStatus).toBe("deprecated");
    expect(serverBySlug.get("retired-notifier")?.listingStatus).toBe("deleted_upstream");
    expect(serverBySlug.get("retired-notifier")?.currentVersionId).toBeNull();

    const allPublishersLinked = serverRows.every((row) => row.publisherId !== null);
    expect(allPublishersLinked).toBe(true);

    const githubPkgRows = await db
      .select({
        identifier: serverPackages.identifier,
        environmentVariables: serverPackages.environmentVariables,
      })
      .from(serverPackages)
      .innerJoin(serverVersions, eq(serverVersions.id, serverPackages.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "github"));

    expect(githubPkgRows[0]?.identifier).toBe("@themcpdirectory/github-mcp");
    expect(githubPkgRows[0]?.environmentVariables).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "GITHUB_TOKEN", isRequired: true })]),
    );

    const supabasePkgRows = await db
      .select({ environmentVariables: serverPackages.environmentVariables })
      .from(serverPackages)
      .innerJoin(serverVersions, eq(serverVersions.id, serverPackages.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "supabase"));

    expect(supabasePkgRows[0]?.environmentVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "SUPABASE_ACCESS_TOKEN", isRequired: true }),
      ]),
    );

    const postgresPkgRows = await db
      .select({ environmentVariables: serverPackages.environmentVariables })
      .from(serverPackages)
      .innerJoin(serverVersions, eq(serverVersions.id, serverPackages.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "postgresql"));

    expect(postgresPkgRows.length).toBeGreaterThan(0);
    expect(
      postgresPkgRows.some((row) => hasRequiredEnvVar(row.environmentVariables, "DATABASE_URL")),
    ).toBe(true);

    const postgresRemoteRows = await db
      .select({ urlTemplate: serverRemotes.urlTemplate, variables: serverRemotes.variables })
      .from(serverRemotes)
      .innerJoin(serverVersions, eq(serverVersions.id, serverRemotes.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "postgresql"));

    expect(postgresRemoteRows.length).toBeGreaterThan(0);
    expect(postgresRemoteRows[0]?.urlTemplate).toContain("{projectRef}");
    expect(postgresRemoteRows[0]?.variables).toEqual(
      expect.objectContaining({ projectRef: expect.objectContaining({ isRequired: true }) }),
    );

    const playwrightRemoteRows = await db
      .select({ urlTemplate: serverRemotes.urlTemplate, variables: serverRemotes.variables })
      .from(serverRemotes)
      .innerJoin(serverVersions, eq(serverVersions.id, serverRemotes.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "playwright"));

    expect(playwrightRemoteRows[0]?.urlTemplate).toContain("{tenant}");
    expect(playwrightRemoteRows[0]?.variables).toEqual(
      expect.objectContaining({ tenant: expect.objectContaining({ isRequired: true }) }),
    );

    const aliasRows = await db
      .select({ alias: serverAliases.alias, serverId: serverAliases.serverId })
      .from(serverAliases)
      .where(inArray(serverAliases.alias, ["github-server", "shared-handle"]));

    const sharedHandleServerId = serverBySlug.get("shared-handle")?.id;
    const sharedHandleAlias = aliasRows.find((row) => row.alias === "shared-handle");
    expect(sharedHandleAlias).toBeTruthy();
    expect(sharedHandleAlias?.serverId).not.toBe(sharedHandleServerId);
  });

  it("reconciles stale seed-managed aliases/import categories while preserving non-seed manual rows", async () => {
    await runSeed({ databaseUrl });

    const githubId = await getServerIdBySlug(db, "github");
    const postgresId = await getServerIdBySlug(db, "postgresql");
    const securityCategoryId = (
      await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "security"))
    )[0]?.id;

    expect(securityCategoryId).toBeTruthy();

    await db.insert(serverAliases).values({
      serverId: githubId,
      alias: "user-defined-stable-alias",
      kind: "manual",
    });

    await db.insert(serverCategories).values({
      serverId: githubId,
      categoryId: securityCategoryId!,
      source: "manual",
      confidence: null,
    });

    await runSeed({ databaseUrl, fixtures: withoutFixtureAlias("postgres") });

    const postgresAliasRows = await db
      .select({ alias: serverAliases.alias, serverId: serverAliases.serverId })
      .from(serverAliases)
      .where(eq(serverAliases.alias, "postgres"));

    expect(postgresAliasRows.some((row) => row.serverId === postgresId)).toBe(false);

    const userAliasRows = await db
      .select({ alias: serverAliases.alias })
      .from(serverAliases)
      .where(eq(serverAliases.alias, "user-defined-stable-alias"));
    expect(userAliasRows.length).toBe(1);

    const postgresDatabasesRows = await db
      .select({ serverId: serverCategories.serverId, categoryId: serverCategories.categoryId, source: serverCategories.source })
      .from(serverCategories)
      .innerJoin(categories, eq(categories.id, serverCategories.categoryId))
      .where(eq(categories.slug, "databases"));

    const postgresImportAssignment = postgresDatabasesRows.find(
      (row) => row.serverId === postgresId && row.source === "import",
    );
    expect(postgresImportAssignment).toBeFalsy();

    const userManualCategoryRows = await db
      .select({ source: serverCategories.source })
      .from(serverCategories)
      .where(eq(serverCategories.serverId, githubId));

    expect(userManualCategoryRows.some((row) => row.source === "manual")).toBe(true);
  });
});
