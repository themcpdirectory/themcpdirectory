import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { SupportedClientId } from "@themcpdirectory/api-contract";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  repositorySnapshots,
  serverCategories,
  serverHealthChecks,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import {
  browseServers,
  getCollection,
  getDiscoverySections,
  getEcosystemFacts,
  getPublicPublisher,
  getRelatedServers,
  getVisibleCollections,
  refreshServerSearchDocument,
  type BrowseServersResult,
  type CollectionDetail,
  type CollectionSummary,
  type DiscoverySections,
  type DiscoveryServer,
  type EcosystemFacts,
  type PublicPublisherDetail,
} from "../index.js";
import * as discoveryModule from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";

type HealthOutcome =
  | "healthy"
  | "degraded"
  | "unreachable"
  | "timed_out"
  | "unsafe_destination"
  | "response_too_large"
  | "unsupported"
  | "unknown";

interface SeedDiscoveryServerInput {
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly longDescription?: string | null;
  readonly listingStatus?: "active" | "deprecated" | "deleted_upstream" | "unavailable";
  readonly moderationStatus?: "normal" | "hidden" | "blocked";
  readonly publisher?: {
    slug: string;
    displayName: string;
    verified?: boolean;
    websiteUrl?: string | null;
  };
  readonly categories?: readonly {
    slug: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
  }[];
  readonly package?: {
    identifier: string;
    registryType?: string;
    transportType?: string;
  };
  readonly remote?: {
    transportType: string;
    urlTemplate?: string;
  };
  readonly compatibility?: readonly {
    clientId: SupportedClientId;
    status: "supported" | "supported_with_configuration" | "unsupported" | "unknown";
    createdAt: string;
    updatedAt?: string;
    checkedAt?: string;
  }[];
  readonly repositorySnapshots?: readonly {
    stars: number;
    checkedAt: string;
    lastPushAt: string;
  }[];
  readonly healthChecks?: readonly {
    status: HealthOutcome;
    checkedAt: string;
  }[];
  readonly sourceAvailable?: boolean | null;
  readonly openSource?: boolean | null;
  readonly officialSource?: boolean;
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  readonly homepageUrl?: string | null;
  readonly documentationUrl?: string | null;
  readonly licenseSpdx?: string | null;
  readonly canonicalRegistryName?: string | null;
}

async function ensurePublisher(
  db: Database,
  input: NonNullable<SeedDiscoveryServerInput["publisher"]>,
): Promise<string> {
  const [inserted] = await db
    .insert(publishers)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      verificationState: input.verified ? "verified" : "unverified",
      websiteUrl: input.websiteUrl ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: publishers.id });

  if (inserted?.id) return inserted.id;

  const [existing] = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.slug, input.slug));
  if (!existing) throw new Error("expected publisher row");
  return existing.id;
}

async function ensureCategory(
  db: Database,
  input: NonNullable<SeedDiscoveryServerInput["categories"]>[number],
): Promise<string> {
  const [inserted] = await db
    .insert(categories)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .onConflictDoNothing()
    .returning({ id: categories.id });

  if (inserted?.id) return inserted.id;

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, input.slug));
  if (!existing) throw new Error("expected category row");
  return existing.id;
}

async function seedDiscoveryServer(
  db: Database,
  sourceIds: { official: string; community: string },
  input: SeedDiscoveryServerInput,
): Promise<{ serverId: string; versionId: string }> {
  const publisherId = input.publisher ? await ensurePublisher(db, input.publisher) : null;
  const firstSeenAt = new Date(input.firstSeenAt ?? "2026-09-01T12:00:00.000Z");
  const lastSeenAt = new Date(input.lastSeenAt ?? input.firstSeenAt ?? "2026-09-01T12:00:00.000Z");

  const [server] = await db
    .insert(servers)
    .values({
      slug: input.slug,
      title: input.title,
      shortDescription: input.shortDescription,
      longDescription: input.longDescription ?? null,
      listingStatus: input.listingStatus ?? "active",
      moderationStatus: input.moderationStatus ?? "normal",
      publisherId,
      repositoryUrl: `https://github.com/acme/${input.slug}`,
      homepageUrl: input.homepageUrl ?? null,
      documentationUrl: input.documentationUrl ?? null,
      licenseSpdx: input.licenseSpdx ?? null,
      canonicalRegistryName: input.canonicalRegistryName ?? null,
      sourceAvailable: input.sourceAvailable ?? null,
      openSource: input.openSource ?? null,
      firstSeenAt,
      lastSeenAt,
    })
    .returning({ id: servers.id });
  if (!server) throw new Error("expected server row");

  const [version] = await db
    .insert(serverVersions)
    .values({
      serverId: server.id,
      registrySourceId: input.officialSource ? sourceIds.official : sourceIds.community,
      version: "1.0.0",
      firstSeenAt,
      lastSeenAt,
      normalizedPayload: { seed: true },
      upstreamStatus: "active",
      title: input.title,
      description: input.shortDescription,
    })
    .returning({ id: serverVersions.id });
  if (!version) throw new Error("expected version row");

  await db.update(servers).set({ currentVersionId: version.id }).where(eq(servers.id, server.id));

  if (input.package) {
    await db.insert(serverPackages).values({
      serverVersionId: version.id,
      registryType: input.package.registryType ?? "npm",
      identifier: input.package.identifier,
      version: "1.0.0",
      transportType: input.package.transportType ?? "stdio",
    });
  }

  if (input.remote) {
    await db.insert(serverRemotes).values({
      serverVersionId: version.id,
      transportType: input.remote.transportType,
      urlTemplate: input.remote.urlTemplate ?? `https://api.example.test/${input.slug}`,
    });
  }

  if (input.compatibility?.length) {
    await db.insert(clientCompatibility).values(
      input.compatibility.map((compatibility) => ({
        serverId: server.id,
        clientId: compatibility.clientId,
        status: compatibility.status,
        checkedAt: compatibility.checkedAt ? new Date(compatibility.checkedAt) : null,
        createdAt: new Date(compatibility.createdAt),
        updatedAt: new Date(compatibility.updatedAt ?? compatibility.createdAt),
      })),
    );
  }

  if (input.repositorySnapshots?.length) {
    await db.insert(repositorySnapshots).values(
      input.repositorySnapshots.map((snapshot, index) => ({
        serverId: server.id,
        provider: "github",
        externalRepositoryId: `${input.slug}-${index}`,
        owner: "acme",
        name: input.slug,
        url: `https://github.com/acme/${input.slug}`,
        stars: snapshot.stars,
        lastPushAt: new Date(snapshot.lastPushAt),
        checkedAt: new Date(snapshot.checkedAt),
      })),
    );
  }

  if (input.healthChecks?.length) {
    await db.insert(serverHealthChecks).values(
      input.healthChecks.map((check) => ({
        serverId: server.id,
        serverVersionId: version.id,
        checkType: "remote_probe",
        status: check.status,
        checkedAt: new Date(check.checkedAt),
      })),
    );
  }

  if (input.categories?.length) {
    for (const category of input.categories) {
      const categoryId = await ensureCategory(db, category);
      await db.insert(serverCategories).values({
        serverId: server.id,
        categoryId,
        source: "manual",
        confidence: 1,
      });
    }
  }

  return { serverId: server.id, versionId: version.id };
}

describe("discovery queries", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;
  let sourceIds: { official: string; community: string };

  beforeEach(async () => {
    const temp = await createTempDatabase("task2_discovery");
    db = temp.db;
    destroy = temp.destroy;

    const [official] = await db
      .insert(registrySources)
      .values({
        key: "official",
        name: "Official Registry",
        baseUrl: "https://registry.modelcontextprotocol.io",
        kind: "official",
      })
      .returning({ id: registrySources.id });
    const [community] = await db
      .insert(registrySources)
      .values({
        key: "community",
        name: "Community Registry",
        baseUrl: "https://community.example.test",
        kind: "community",
      })
      .returning({ id: registrySources.id });
    if (!official || !community) throw new Error("expected registry sources");
    sourceIds = { official: official.id, community: community.id };
  });

  afterEach(async () => {
    if (destroy) await destroy();
  });

  it("browses only active public listings and applies all supported filters and sorts", async () => {
    await seedDiscoveryServer(db, sourceIds, {
      slug: "alpha-official",
      title: "Alpha Official",
      shortDescription: "Official streamable remote",
      longDescription: "Detailed docs for Alpha Official",
      publisher: {
        slug: "github",
        displayName: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
      },
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      package: { identifier: "@acme/alpha-official", registryType: "npm", transportType: "stdio" },
      remote: { transportType: "streamable-http" },
      compatibility: [
        { clientId: "cursor", status: "supported", createdAt: "2026-09-02T10:00:00.000Z" },
      ],
      repositorySnapshots: [
        {
          stars: 90,
          checkedAt: "2026-09-03T10:00:00.000Z",
          lastPushAt: "2026-09-03T08:00:00.000Z",
        },
        {
          stars: 50,
          checkedAt: "2026-09-05T10:00:00.000Z",
          lastPushAt: "2026-09-05T08:00:00.000Z",
        },
      ],
      healthChecks: [{ status: "healthy", checkedAt: "2026-09-05T11:00:00.000Z" }],
      sourceAvailable: true,
      openSource: true,
      officialSource: true,
      firstSeenAt: "2026-09-01T09:00:00.000Z",
      homepageUrl: "https://alpha.example.test",
      documentationUrl: "https://docs.alpha.example.test",
      licenseSpdx: "MIT",
      canonicalRegistryName: "acme/alpha-official",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "beta-community",
      title: "Beta Community",
      shortDescription: "Community stdio server",
      publisher: {
        slug: "acme",
        displayName: "Acme",
        verified: false,
        websiteUrl: "https://acme.example.test",
      },
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      package: { identifier: "beta-community", registryType: "pypi", transportType: "stdio" },
      compatibility: [
        { clientId: "cursor", status: "supported", createdAt: "2026-09-01T08:00:00.000Z" },
        { clientId: "cursor", status: "unsupported", createdAt: "2026-09-05T08:00:00.000Z" },
      ],
      repositorySnapshots: [
        {
          stars: 10,
          checkedAt: "2026-09-04T10:00:00.000Z",
          lastPushAt: "2026-09-04T06:00:00.000Z",
        },
      ],
      healthChecks: [{ status: "degraded", checkedAt: "2026-09-04T11:00:00.000Z" }],
      sourceAvailable: false,
      openSource: false,
      officialSource: false,
      firstSeenAt: "2026-09-02T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "gamma-remote",
      title: "Gamma Remote",
      shortDescription: "Gamma remote endpoint",
      categories: [{ slug: "automation", name: "Automation", sortOrder: 2 }],
      remote: { transportType: "sse" },
      compatibility: [
        {
          clientId: "vscode",
          status: "supported_with_configuration",
          createdAt: "2026-09-03T08:00:00.000Z",
        },
      ],
      repositorySnapshots: [
        {
          stars: 20,
          checkedAt: "2026-09-06T10:00:00.000Z",
          lastPushAt: "2026-09-06T09:00:00.000Z",
        },
      ],
      healthChecks: [{ status: "healthy", checkedAt: "2026-09-06T11:00:00.000Z" }],
      sourceAvailable: null,
      openSource: true,
      officialSource: false,
      firstSeenAt: "2026-09-03T09:00:00.000Z",
      lastSeenAt: "2026-09-06T09:00:00.000Z",
      homepageUrl: "https://gamma.example.test",
      documentationUrl: "https://docs.gamma.example.test",
      licenseSpdx: "Apache-2.0",
      canonicalRegistryName: "acme/gamma-remote",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "deprecated-visible",
      title: "Deprecated Visible",
      shortDescription: "Should not appear in discovery",
      listingStatus: "deprecated",
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      officialSource: true,
      firstSeenAt: "2026-09-04T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "hidden-server",
      title: "Hidden Server",
      shortDescription: "Should not appear in discovery",
      moderationStatus: "hidden",
      categories: [{ slug: "automation", name: "Automation", sortOrder: 2 }],
      officialSource: true,
      firstSeenAt: "2026-09-05T09:00:00.000Z",
    });

    await refreshServerSearchDocument(db);

    const recommended: BrowseServersResult = await browseServers(db, { sort: "recommended" });
    expect(recommended.total).toBe(3);
    expect(recommended.items[0]).toMatchObject({
      slug: "alpha-official",
      officialRegistry: true,
      supportedClients: ["cursor"],
      transports: ["stdio", "streamable-http"],
      stars: 50,
    });
    expect(recommended.items.map((item) => item.slug)).not.toContain("deprecated-visible");
    expect(recommended.items.map((item) => item.slug)).not.toContain("hidden-server");

    const relevance = await browseServers(db, { query: "Gamma Remote", sort: "relevance" });
    expect(relevance.items[0]?.slug).toBe("gamma-remote");

    const recent = await browseServers(db, { sort: "recent" });
    expect(recent.items.map((item) => item.slug)).toEqual([
      "gamma-remote",
      "beta-community",
      "alpha-official",
    ]);

    const updated = await browseServers(db, { sort: "updated" });
    expect(updated.items.map((item) => item.slug)).toEqual([
      "gamma-remote",
      "alpha-official",
      "beta-community",
    ]);

    const stars = await browseServers(db, { sort: "stars" });
    expect(stars.items.map((item) => item.slug)).toEqual([
      "alpha-official",
      "gamma-remote",
      "beta-community",
    ]);
    expect(stars.items[0]?.stars).toBe(50);

    const name = await browseServers(db, { sort: "name" });
    expect(name.items.map((item) => item.slug)).toEqual([
      "alpha-official",
      "beta-community",
      "gamma-remote",
    ]);

    await expect(browseServers(db, { officialRegistry: true })).resolves.toMatchObject({
      items: [expect.objectContaining({ slug: "alpha-official" })],
      total: 1,
    });

    await expect(
      browseServers(db, { category: "developer-tools", sort: "name", page: 2, pageSize: 1 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ slug: "beta-community" })],
      total: 2,
      totalPages: 2,
      page: 2,
      pageSize: 1,
    });

    expect(
      (await browseServers(db, { publisher: "github" })).items.map((item) => item.slug),
    ).toEqual(["alpha-official"]);
    expect((await browseServers(db, { client: "cursor" })).items.map((item) => item.slug)).toEqual([
      "alpha-official",
    ]);
    expect(
      (await browseServers(db, { transport: "streamable-http" })).items.map((item) => item.slug),
    ).toEqual(["alpha-official"]);
    expect(
      (await browseServers(db, { registryType: "npm" })).items.map((item) => item.slug),
    ).toEqual(["alpha-official"]);
    expect((await browseServers(db, { verified: true })).items.map((item) => item.slug)).toEqual([
      "alpha-official",
    ]);
    expect(
      (await browseServers(db, { sourceAvailable: true })).items.map((item) => item.slug),
    ).toEqual(["alpha-official"]);
    expect(
      (await browseServers(db, { openSource: true, sort: "name" })).items.map((item) => item.slug),
    ).toEqual(["alpha-official", "gamma-remote"]);
    expect(
      (await browseServers(db, { healthy: true, sort: "name" })).items.map((item) => item.slug),
    ).toEqual(["alpha-official", "gamma-remote"]);
  });

  it("prefers the newest checkedAt compatibility fact for projection and filtering", async () => {
    await seedDiscoveryServer(db, sourceIds, {
      slug: "cursor-factual",
      title: "Cursor Factual",
      shortDescription: "Latest checked compatibility stays authoritative",
      compatibility: [
        {
          clientId: "cursor",
          status: "unsupported",
          checkedAt: "2026-09-01T10:00:00.000Z",
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-08T10:00:00.000Z",
        },
        {
          clientId: "cursor",
          status: "supported",
          checkedAt: "2026-09-05T10:00:00.000Z",
          createdAt: "2026-09-05T10:00:00.000Z",
          updatedAt: "2026-09-05T10:05:00.000Z",
        },
      ],
      officialSource: true,
      firstSeenAt: "2026-09-02T09:00:00.000Z",
    });

    const allServers: BrowseServersResult = await browseServers(db, { sort: "name" });
    expect(allServers.items).toHaveLength(1);
    expect(allServers.items[0]).toMatchObject({
      slug: "cursor-factual",
      supportedClients: ["cursor"],
    });

    const cursorFiltered: BrowseServersResult = await browseServers(db, {
      client: "cursor",
      sort: "name",
    });
    expect(cursorFiltered.items.map((item) => item.slug)).toEqual(["cursor-factual"]);
  });

  it("computes ecosystem facts and homepage sections from active factual data only", async () => {
    await ensureCategory(db, {
      slug: "empty-category",
      name: "Empty Category",
      description: "Should not be surfaced",
      sortOrder: 99,
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "official-curated",
      title: "Official Curated",
      shortDescription: "Official curated server",
      publisher: { slug: "verified-pub", displayName: "Verified Pub", verified: true },
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      package: { identifier: "@acme/official-curated" },
      repositorySnapshots: [
        {
          stars: 15,
          checkedAt: "2026-09-03T10:00:00.000Z",
          lastPushAt: "2026-09-03T09:00:00.000Z",
        },
      ],
      officialSource: true,
      sourceAvailable: true,
      openSource: true,
      firstSeenAt: "2026-09-01T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "recent-remote",
      title: "Recent Remote",
      shortDescription: "Newest visible server",
      categories: [{ slug: "automation", name: "Automation", sortOrder: 2 }],
      remote: { transportType: "streamable-http" },
      compatibility: [
        { clientId: "vscode", status: "supported", createdAt: "2026-09-04T12:00:00.000Z" },
      ],
      repositorySnapshots: [
        {
          stars: 5,
          checkedAt: "2026-09-05T10:00:00.000Z",
          lastPushAt: "2026-09-05T08:00:00.000Z",
        },
      ],
      healthChecks: [{ status: "healthy", checkedAt: "2026-09-05T11:00:00.000Z" }],
      officialSource: false,
      sourceAvailable: null,
      openSource: true,
      firstSeenAt: "2026-09-05T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "not-public",
      title: "Not Public",
      shortDescription: "Hidden from sections",
      moderationStatus: "hidden",
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      officialSource: true,
      firstSeenAt: "2026-09-06T09:00:00.000Z",
    });

    await refreshServerSearchDocument(db);

    const facts: EcosystemFacts = await getEcosystemFacts(db);
    expect(facts).toEqual({
      activeServers: 2,
      officialServers: 1,
      verifiedPublishers: 1,
      supportedClientTargets: 4,
    });

    const sections: DiscoverySections = await getDiscoverySections(db);
    expect(sections.recommended[0]?.slug).toBe("official-curated");
    expect(sections.recentlyAdded[0]?.slug).toBe("recent-remote");
    expect(sections.collections.map((collection) => collection.slug)).toContain(
      "official-registry-essentials",
    );
    expect(sections.categories.map((category) => category.slug)).toEqual([
      "developer-tools",
      "automation",
    ]);
  });

  it("shows only non-empty collections and resolves collection membership from latest facts", async () => {
    await seedDiscoveryServer(db, sourceIds, {
      slug: "cursor-live",
      title: "Cursor Live",
      shortDescription: "Cursor-ready official server",
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      package: { identifier: "@acme/cursor-live" },
      remote: { transportType: "streamable-http" },
      compatibility: [
        { clientId: "cursor", status: "supported", createdAt: "2026-09-05T10:00:00.000Z" },
      ],
      repositorySnapshots: [
        {
          stars: 25,
          checkedAt: "2026-09-05T12:00:00.000Z",
          lastPushAt: "2026-09-05T11:00:00.000Z",
        },
      ],
      officialSource: true,
      sourceAvailable: true,
      openSource: true,
      firstSeenAt: "2026-09-02T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "cursor-regressed",
      title: "Cursor Regressed",
      shortDescription: "No longer works with Cursor",
      package: { identifier: "@acme/cursor-regressed" },
      compatibility: [
        { clientId: "cursor", status: "supported", createdAt: "2026-09-01T10:00:00.000Z" },
        { clientId: "cursor", status: "unsupported", createdAt: "2026-09-06T10:00:00.000Z" },
      ],
      repositorySnapshots: [
        {
          stars: 30,
          checkedAt: "2026-09-06T12:00:00.000Z",
          lastPushAt: "2026-09-06T11:00:00.000Z",
        },
      ],
      officialSource: false,
      sourceAvailable: true,
      openSource: false,
      firstSeenAt: "2026-09-06T09:00:00.000Z",
    });

    await refreshServerSearchDocument(db);

    const collections: readonly CollectionSummary[] = await getVisibleCollections(db);
    expect(collections.map((collection) => collection.slug)).toContain("works-with-cursor");
    expect(collections.map((collection) => collection.slug)).toContain(
      "official-registry-essentials",
    );
    expect(collections.map((collection) => collection.slug)).not.toContain("works-with-codex");

    const cursorCollection: CollectionDetail | null = await getCollection(db, "works-with-cursor");
    expect(cursorCollection).toMatchObject({
      slug: "works-with-cursor",
      serverCount: 1,
      items: [expect.objectContaining({ slug: "cursor-live" })],
    });

    const recentCollection: CollectionDetail | null = await getCollection(db, "recently-added", {
      page: 1,
      pageSize: 1,
    });
    expect(recentCollection).toMatchObject({
      slug: "recently-added",
      items: [expect.objectContaining({ slug: "cursor-regressed" })],
      total: 2,
      totalPages: 2,
    });

    await expect(getCollection(db, "works-with-codex")).resolves.toBeNull();
  });

  it("builds bounded suggestions from visible servers, categories, and collections", async () => {
    for (const [index, clientId] of ["claude-code", "codex", "cursor", "vscode"].entries()) {
      await seedDiscoveryServer(db, sourceIds, {
        slug: `workflow-${index + 1}`,
        title: `Workflow Server ${index + 1}`,
        shortDescription: "Workflow automation for developer tasks",
        publisher: {
          slug: `publisher-${index + 1}`,
          displayName: `Publisher ${index + 1}`,
          verified: index % 2 === 0,
        },
        categories: [
          {
            slug: `developer-workflows-${index + 1}`,
            name: `Developer Workflows ${index + 1}`,
            sortOrder: index + 1,
          },
        ],
        package: {
          identifier: `@workflow/server-${index + 1}`,
          registryType: "npm",
        },
        compatibility: [
          {
            clientId: clientId as SupportedClientId,
            status: "supported",
            createdAt: `2026-09-0${index + 1}T10:00:00.000Z`,
            checkedAt: `2026-09-0${index + 1}T10:00:00.000Z`,
          },
        ],
        officialSource: true,
        sourceAvailable: true,
        openSource: true,
      });
    }

    for (const index of [5, 6]) {
      await seedDiscoveryServer(db, sourceIds, {
        slug: `workflow-${index}`,
        title: `Workflow Server ${index}`,
        shortDescription: "Workflow automation for developer tasks",
        categories: [
          {
            slug: `developer-workflows-${index}`,
            name: `Developer Workflows ${index}`,
            sortOrder: index,
          },
        ],
        package: {
          identifier: `@workflow/server-${index}`,
          registryType: "npm",
        },
        officialSource: true,
      });
    }

    await refreshServerSearchDocument(db);

    expect(discoveryModule.getSearchSuggestions).toBeTypeOf("function");
    if (!discoveryModule.getSearchSuggestions) return;

    const workflowSuggestions = await discoveryModule.getSearchSuggestions(db, {
      query: "workflow",
    });
    expect(workflowSuggestions.servers).toHaveLength(5);

    const categorySuggestions = await discoveryModule.getSearchSuggestions(db, {
      query: "developer",
    });
    expect(categorySuggestions.categories).toHaveLength(3);

    const collectionSuggestions = await discoveryModule.getSearchSuggestions(db, {
      query: "works",
    });
    expect(collectionSuggestions.collections).toHaveLength(3);
    expect(collectionSuggestions.collections.map((collection) => collection.slug)).not.toContain(
      "recently-added",
    );
  });

  it("ranks related servers by bucket, then recommendation for same-bucket candidates", async () => {
    await seedDiscoveryServer(db, sourceIds, {
      slug: "subject-server",
      title: "Subject Server",
      shortDescription: "Primary subject",
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      categories: [
        { slug: "ops", name: "Operations", sortOrder: 1 },
        { slug: "ai", name: "AI", sortOrder: 2 },
      ],
      package: { identifier: "@acme/subject-server" },
      repositorySnapshots: [
        {
          stars: 10,
          checkedAt: "2026-09-03T12:00:00.000Z",
          lastPushAt: "2026-09-03T11:00:00.000Z",
        },
      ],
      officialSource: true,
      firstSeenAt: "2026-09-01T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "both-match",
      title: "Both Match",
      shortDescription: "Shared category and publisher",
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      categories: [{ slug: "ops", name: "Operations", sortOrder: 1 }],
      package: { identifier: "@acme/both-match" },
      repositorySnapshots: [
        {
          stars: 5,
          checkedAt: "2026-09-02T12:00:00.000Z",
          lastPushAt: "2026-09-02T11:00:00.000Z",
        },
      ],
      officialSource: true,
      firstSeenAt: "2026-09-02T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "shared-category",
      title: "Shared Category",
      shortDescription: "Shares category only",
      publisher: { slug: "other", displayName: "Other", verified: false },
      categories: [{ slug: "ai", name: "AI", sortOrder: 2 }],
      package: { identifier: "@acme/shared-category" },
      repositorySnapshots: [
        {
          stars: 100,
          checkedAt: "2026-09-06T12:00:00.000Z",
          lastPushAt: "2026-09-06T11:00:00.000Z",
        },
      ],
      officialSource: false,
      firstSeenAt: "2026-09-03T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "shared-category-basic",
      title: "Shared Category Basic",
      shortDescription: "Same category bucket with lower recommendation",
      categories: [{ slug: "ai", name: "AI", sortOrder: 2 }],
      package: { identifier: "shared-category-basic" },
      officialSource: false,
      firstSeenAt: "2026-09-03T10:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "same-publisher-only",
      title: "Same Publisher Only",
      shortDescription: "Shares publisher only",
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      categories: [{ slug: "security", name: "Security", sortOrder: 3 }],
      package: { identifier: "@acme/same-publisher-only" },
      repositorySnapshots: [
        {
          stars: 1_000,
          checkedAt: "2026-09-06T13:00:00.000Z",
          lastPushAt: "2026-09-06T12:00:00.000Z",
        },
      ],
      officialSource: true,
      firstSeenAt: "2026-09-04T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "shared-hidden",
      title: "Shared Hidden",
      shortDescription: "Hidden shared server",
      moderationStatus: "hidden",
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      categories: [{ slug: "ops", name: "Operations", sortOrder: 1 }],
      officialSource: true,
      firstSeenAt: "2026-09-05T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "unrelated",
      title: "Unrelated",
      shortDescription: "Should not be related",
      categories: [{ slug: "docs", name: "Docs", sortOrder: 4 }],
      officialSource: true,
      firstSeenAt: "2026-09-06T09:00:00.000Z",
    });

    await refreshServerSearchDocument(db);

    const related: readonly DiscoveryServer[] = await getRelatedServers(db, "subject-server", 10);
    expect(related.map((server) => server.slug)).toEqual([
      "both-match",
      "shared-category",
      "shared-category-basic",
      "same-publisher-only",
    ]);
  });

  it("returns only public publisher identity and active listings", async () => {
    await seedDiscoveryServer(db, sourceIds, {
      slug: "publisher-active",
      title: "Publisher Active",
      shortDescription: "Visible publisher listing",
      publisher: {
        slug: "github",
        displayName: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
      },
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      package: { identifier: "@acme/publisher-active" },
      repositorySnapshots: [
        {
          stars: 7,
          checkedAt: "2026-09-04T12:00:00.000Z",
          lastPushAt: "2026-09-04T11:00:00.000Z",
        },
      ],
      officialSource: true,
      firstSeenAt: "2026-09-02T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "publisher-deprecated",
      title: "Publisher Deprecated",
      shortDescription: "Hidden by discovery visibility",
      listingStatus: "deprecated",
      publisher: {
        slug: "github",
        displayName: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
      },
      categories: [{ slug: "developer-tools", name: "Developer Tools", sortOrder: 1 }],
      package: { identifier: "@acme/publisher-deprecated" },
      officialSource: true,
      firstSeenAt: "2026-09-03T09:00:00.000Z",
    });

    await seedDiscoveryServer(db, sourceIds, {
      slug: "legacy-only",
      title: "Legacy Only",
      shortDescription: "No active public listing remains",
      listingStatus: "deprecated",
      publisher: {
        slug: "legacy",
        displayName: "Legacy",
        verified: false,
        websiteUrl: "notaurl",
      },
      officialSource: true,
      firstSeenAt: "2026-09-04T09:00:00.000Z",
    });

    await refreshServerSearchDocument(db);

    const detail: PublicPublisherDetail | null = await getPublicPublisher(db, " GITHUB ");
    expect(detail).toMatchObject({
      publisher: {
        slug: "github",
        name: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
      },
      items: [expect.objectContaining({ slug: "publisher-active" })],
      total: 1,
    });
    expect(Object.keys(detail?.publisher ?? {}).sort()).toEqual([
      "name",
      "slug",
      "verified",
      "websiteUrl",
    ]);

    await expect(getPublicPublisher(db, "legacy")).resolves.toBeNull();
    await expect(getPublicPublisher(db, "unknown")).resolves.toBeNull();
  });
});
