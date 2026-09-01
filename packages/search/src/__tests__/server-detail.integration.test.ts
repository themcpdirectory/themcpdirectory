import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  publishers,
  registrySources,
  serverAliases,
  serverCategories,
  serverPackages,
  serverVersions,
  servers,
  categories,
  type Database,
} from "@themcpdirectory/db";
import { refreshServerSearchDocument } from "../index.js";
import { getCategories, getPublicSitemapEntries, getServerDetail } from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";
import { sql } from "drizzle-orm";

let db: Database;
let destroy: () => Promise<void>;

async function seedTestData(db: Database): Promise<void> {
  // Registry source
  const [registrySource] = await db
    .insert(registrySources)
    .values({
      key: "official",
      name: "Official MCP Registry",
      baseUrl: "https://registry.modelcontextprotocol.io",
      kind: "mcp-registry",
      enabled: true,
    })
    .returning({ id: registrySources.id });

  if (!registrySource) throw new Error("Expected registry source");

  // Publisher
  const [pub] = await db
    .insert(publishers)
    .values({
      slug: "github",
      displayName: "GitHub",
      description: "Source hosting and collaboration platform.",
      websiteUrl: "https://github.com",
      verificationState: "verified",
    })
    .returning({ id: publishers.id });

  const pubId = pub!.id;

  // Category
  await db.insert(categories).values([
    { slug: "developer-tools", name: "Developer Tools", description: "CLI helpers", sortOrder: 1 },
    { slug: "databases", name: "Databases", description: "DB ops", sortOrder: 2 },
  ]);

  // Server
  const now = new Date("2026-09-01T00:00:00.000Z");
  const [server] = await db
    .insert(servers)
    .values({
      slug: "github",
      title: "GitHub MCP",
      shortDescription: "Repository, issue, and pull-request workflows from GitHub.",
      longDescription: "Full GitHub MCP integration for local assistants.",
      canonicalRegistryName: "io.github.official/github",
      publisherId: pubId,
      listingStatus: "active",
      moderationStatus: "normal",
      repositoryUrl: "https://github.com/themcpdirectory/github-mcp",
      homepageUrl: "https://github.com/themcpdirectory/github-mcp",
      licenseSpdx: "MIT",
      sourceAvailable: true,
      openSource: true,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning({ id: servers.id });

  const serverId = server!.id;

  // ServerVersion
  const [sv] = await db
    .insert(serverVersions)
    .values({
      serverId,
      registrySourceId: registrySource.id,
      version: "2.3.0",
      upstreamStatus: "active",
      firstSeenAt: now,
      lastSeenAt: now,
      normalizedPayload: {},
    })
    .returning({ id: serverVersions.id });

  const svId = sv!.id;

  // Link current version
  await db
    .update(servers)
    .set({ currentVersionId: svId })
    .where(sql`${servers.id} = ${serverId}`);

  // ServerPackage
  await db.insert(serverPackages).values({
    serverVersionId: svId,
    registryType: "npm",
    identifier: "@themcpdirectory/github-mcp",
    version: "2.3.0",
    runtimeHint: "npx",
    transportType: "stdio",
    environmentVariables: [{ name: "GITHUB_TOKEN", isRequired: true, isSecret: true }],
  });

  // Alias
  await db.insert(serverAliases).values({ serverId, alias: "github-server", kind: "manual" });

  // Category assignment
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`${categories.slug} = 'developer-tools'`);
  await db.insert(serverCategories).values({ serverId, categoryId: cat!.id, source: "import" });

  const nonPublicServers = await db
    .insert(servers)
    .values([
      {
        slug: "deprecated-test",
        title: "Deprecated",
        shortDescription: "Deprecated category member",
        listingStatus: "deprecated",
        moderationStatus: "normal",
        firstSeenAt: now,
        lastSeenAt: now,
      },
      {
        slug: "hidden-category-test",
        title: "Hidden category member",
        shortDescription: "Hidden category member",
        listingStatus: "active",
        moderationStatus: "hidden",
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ])
    .returning({ id: servers.id });

  await db.insert(serverCategories).values(
    nonPublicServers.map(({ id }) => ({
      serverId: id,
      categoryId: cat!.id,
      source: "import" as const,
    })),
  );

  await refreshServerSearchDocument(db, { serverId });
}

beforeAll(async () => {
  const tmp = await createTempDatabase("task8_detail");
  db = tmp.db;
  destroy = tmp.destroy;
  await seedTestData(db);
});

afterAll(async () => {
  await destroy();
});

describe("getServerDetail", () => {
  it("returns full detail for a known slug", async () => {
    const detail = await getServerDetail(db, "github");
    expect(detail).not.toBeNull();
    expect(detail!.slug).toBe("github");
    expect(detail!.title).toBe("GitHub MCP");
    expect(detail!.publisherDisplayName).toBe("GitHub");
    expect(detail!.publisherVerified).toBe(true);
    expect(detail!.currentVersion).toBe("2.3.0");
    expect(detail!.licenseSpdx).toBe("MIT");
    expect(detail!.repositoryUrl).toBe("https://github.com/themcpdirectory/github-mcp");
    expect(detail!.registrySourceKey).toBe("official");
    expect(detail!.currentUpstreamStatus).toBe("active");
  });

  it("returns packages with env vars", async () => {
    const detail = await getServerDetail(db, "github");
    expect(detail!.packages).toHaveLength(1);
    const pkg = detail!.packages[0]!;
    expect(pkg.identifier).toBe("@themcpdirectory/github-mcp");
    expect(pkg.transportType).toBe("stdio");
    expect(pkg.runtimeHint).toBe("npx");
  });

  it("returns aliases", async () => {
    const detail = await getServerDetail(db, "github");
    expect(detail!.aliases).toContain("github-server");
  });

  it("returns category slugs", async () => {
    const detail = await getServerDetail(db, "github");
    expect(detail!.categorySlugs).toContain("developer-tools");
  });

  it("returns null for unknown slug", async () => {
    const detail = await getServerDetail(db, "does-not-exist");
    expect(detail).toBeNull();
  });

  it("returns null for hidden server", async () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    await db.insert(servers).values({
      slug: "hidden-test",
      title: "Hidden",
      shortDescription: "hidden",
      listingStatus: "active",
      moderationStatus: "hidden",
      firstSeenAt: now,
      lastSeenAt: now,
    });
    const detail = await getServerDetail(db, "hidden-test");
    expect(detail).toBeNull();
  });
});

describe("getCategories", () => {
  it("returns all categories with server counts", async () => {
    const cats = await getCategories(db);
    expect(cats.length).toBeGreaterThan(0);
    const devTools = cats.find((c) => c.slug === "developer-tools");
    expect(devTools).toBeDefined();
    expect(devTools!.serverCount).toBe(1);
  });

  it("returns zero-count for categories with no active servers", async () => {
    const cats = await getCategories(db);
    const databases = cats.find((c) => c.slug === "databases");
    expect(databases).toBeDefined();
    expect(databases!.serverCount).toBe(0);
  });

  it("returns categories sorted by sortOrder", async () => {
    const cats = await getCategories(db);
    const sortOrders = cats.map((c) => c.sortOrder);
    const sorted = [...sortOrders].sort((a, b) => a - b);
    expect(sortOrders).toEqual(sorted);
  });
});

describe("getPublicSitemapEntries", () => {
  it("returns only visible servers and categories containing visible servers", async () => {
    const entries = await getPublicSitemapEntries(db);

    expect(entries.serverSlugs).toEqual(["github"]);
    expect(entries.categorySlugs).toEqual(["developer-tools"]);
  });
});
