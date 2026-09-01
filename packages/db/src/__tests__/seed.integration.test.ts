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
  serverVersions,
  servers,
  type Database,
} from "../index.js";
import { runSeed } from "../seed.js";
import { createTempDatabase } from "./postgres-test-db.js";

const EXPECTED_CATEGORIES = [
  {
    slug: "developer-tools",
    name: "Developer Tools",
    description: "CLI helpers, local utilities, and workflow tooling for developers.",
    sortOrder: 1,
  },
  {
    slug: "databases",
    name: "Databases",
    description: "Data access, querying, schema management, and database operations.",
    sortOrder: 2,
  },
  {
    slug: "browser-automation",
    name: "Browser Automation",
    description: "Browser control, scripted interaction, and UI automation workflows.",
    sortOrder: 3,
  },
  { slug: "search", name: "Search", description: "Indexing, retrieval, and search experience tooling.", sortOrder: 4 },
  {
    slug: "productivity",
    name: "Productivity",
    description: "Personal and team productivity helpers for daily development work.",
    sortOrder: 5,
  },
  {
    slug: "communication",
    name: "Communication",
    description: "Messaging, collaboration, and communication platform integrations.",
    sortOrder: 6,
  },
  {
    slug: "project-management",
    name: "Project Management",
    description: "Planning, issue tracking, and project coordination tools.",
    sortOrder: 7,
  },
  { slug: "cloud", name: "Cloud", description: "Cloud services, deployment, and hosted infrastructure.", sortOrder: 8 },
  {
    slug: "infrastructure",
    name: "Infrastructure",
    description: "Platform infrastructure, runtime operations, and environment setup.",
    sortOrder: 9,
  },
  {
    slug: "monitoring",
    name: "Monitoring",
    description: "Observability signals, health checks, and system monitoring.",
    sortOrder: 10,
  },
  {
    slug: "data-and-analytics",
    name: "Data and Analytics",
    description: "Data pipelines, analytics workflows, and reporting systems.",
    sortOrder: 11,
  },
  {
    slug: "ai-and-machine-learning",
    name: "AI and Machine Learning",
    description: "AI model workflows, evaluation, and machine learning tooling.",
    sortOrder: 12,
  },
  {
    slug: "files-and-storage",
    name: "Files and Storage",
    description: "File access, storage backends, and document management systems.",
    sortOrder: 13,
  },
  { slug: "commerce", name: "Commerce", description: "Payments, billing, and commerce-related tooling.", sortOrder: 14 },
  {
    slug: "security",
    name: "Security",
    description: "Authentication, authorization, secrets, and security operations.",
    sortOrder: 15,
  },
] as const;

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

  if (!counts) {
    return {
      categories: 0,
      publishers: 0,
      sources: 0,
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
    sources: Number(counts.sources),
    servers: Number(counts.servers),
    versions: Number(counts.versions),
    packages: Number(counts.packages),
    remotes: Number(counts.remotes),
    aliases: Number(counts.aliases),
    serverCategories: Number(counts.serverCategories),
    searchReady: Number(counts.searchReady),
  };
}

async function getServerBySlug(db: Database, slug: string) {
  const [row] = await db
    .select({
      id: servers.id,
      slug: servers.slug,
      title: servers.title,
      listingStatus: servers.listingStatus,
      canonicalRegistryName: servers.canonicalRegistryName,
      publisherId: servers.publisherId,
      currentVersionId: servers.currentVersionId,
      searchText: servers.searchText,
    })
    .from(servers)
    .where(eq(servers.slug, slug));
  return row;
}

describe("development seed integration", () => {
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

  it("seeds deterministic categories and required fixture states idempotently", async () => {
    const first = await runSeed({ databaseUrl });
    const firstCounts = await countTables(db);

    const second = await runSeed({ databaseUrl });
    const secondCounts = await countTables(db);

    expect(secondCounts).toEqual(firstCounts);
    expect(firstCounts.categories).toBe(15);
    expect(firstCounts.searchReady).toBe(firstCounts.servers);
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");

    const categoryRows = await db
      .select({
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(categories.sortOrder, categories.slug);

    expect(categoryRows).toEqual(EXPECTED_CATEGORIES);

    const publisherRows = await db
      .select({ slug: publishers.slug, verificationState: publishers.verificationState })
      .from(publishers)
      .orderBy(publishers.slug);

    expect(publisherRows).toContainEqual({ slug: "github", verificationState: "verified" });
    expect(publisherRows).toContainEqual({ slug: "community-labs", verificationState: "unverified" });

    const githubServer = await getServerBySlug(db, "github");
    expect(githubServer?.canonicalRegistryName).toBe("io.github.official/github");

    const [githubPackage] = await db
      .select({
        transportType: serverPackages.transportType,
        identifier: serverPackages.identifier,
        environmentVariables: serverPackages.environmentVariables,
      })
      .from(serverPackages)
      .innerJoin(serverVersions, eq(serverVersions.id, serverPackages.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "github"));

    expect(githubPackage?.transportType).toBe("stdio");
    expect(githubPackage?.identifier).toBe("@themcpdirectory/github-mcp");
    expect(githubPackage?.environmentVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "GITHUB_TOKEN", isRequired: true }),
      ]),
    );

    const [playwrightRemote] = await db
      .select({
        transportType: serverRemotes.transportType,
        urlTemplate: serverRemotes.urlTemplate,
        variables: serverRemotes.variables,
      })
      .from(serverRemotes)
      .innerJoin(serverVersions, eq(serverVersions.id, serverRemotes.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "playwright"));

    expect(playwrightRemote?.transportType).toBe("streamable-http");
    expect(playwrightRemote?.urlTemplate).toContain("{tenant}");
    expect(playwrightRemote?.variables).toEqual(
      expect.objectContaining({
        tenant: expect.objectContaining({ isRequired: true }),
      }),
    );

    const [postgresPackage] = await db
      .select({ id: serverPackages.id })
      .from(serverPackages)
      .innerJoin(serverVersions, eq(serverVersions.id, serverPackages.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "postgresql"));
    expect(postgresPackage).toBeTruthy();

    const [postgresRemote] = await db
      .select({ id: serverRemotes.id })
      .from(serverRemotes)
      .innerJoin(serverVersions, eq(serverVersions.id, serverRemotes.serverVersionId))
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "postgresql"));
    expect(postgresRemote).toBeTruthy();

    const postgresVersions = await db
      .select({ version: serverVersions.version })
      .from(serverVersions)
      .innerJoin(servers, eq(servers.id, serverVersions.serverId))
      .where(eq(servers.slug, "postgresql"));
    expect(postgresVersions.map((row) => row.version).sort()).toEqual(["1.4.0", "1.5.0"]);

    const deprecatedServer = await getServerBySlug(db, "legacy-monitor");
    expect(deprecatedServer?.listingStatus).toBe("deprecated");

    const deletedServer = await getServerBySlug(db, "retired-notifier");
    expect(deletedServer?.listingStatus).toBe("deleted_upstream");
    expect(deletedServer?.currentVersionId).toBeNull();

    const aliasRows = await db
      .select({ alias: serverAliases.alias, serverId: serverAliases.serverId, kind: serverAliases.kind })
      .from(serverAliases)
      .where(inArray(serverAliases.alias, ["github-server", "shared-handle"]));

    expect(aliasRows).toContainEqual(
      expect.objectContaining({ alias: "github-server", kind: "manual" }),
    );
    expect(aliasRows).toContainEqual(
      expect.objectContaining({ alias: "shared-handle", kind: "manual" }),
    );

    const sharedHandleServer = await getServerBySlug(db, "shared-handle");
    const sharedHandleAlias = aliasRows.find((row) => row.alias === "shared-handle");
    expect(sharedHandleServer).toBeTruthy();
    expect(sharedHandleAlias).toBeTruthy();
    expect(sharedHandleAlias?.serverId).not.toBe(sharedHandleServer?.id);

    const assignmentRows = await db
      .select({
        categorySlug: categories.slug,
        source: serverCategories.source,
        confidence: serverCategories.confidence,
      })
      .from(serverCategories)
      .innerJoin(categories, eq(categories.id, serverCategories.categoryId));

    expect(assignmentRows.length).toBeGreaterThanOrEqual(8);
    expect(assignmentRows.every((row) => row.source === "manual" || row.source === "import")).toBe(true);
    expect(assignmentRows.every((row) => row.confidence === null)).toBe(true);

    const [searchSample] = await db
      .select({ slug: servers.slug, searchText: servers.searchText })
      .from(servers)
      .where(eq(servers.slug, "github"));
    expect(searchSample?.searchText).toContain("github-server");
    expect(searchSample?.searchText).toContain("developer-tools");
  });
});
