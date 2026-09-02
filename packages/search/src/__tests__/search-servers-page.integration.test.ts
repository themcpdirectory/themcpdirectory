import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  repositorySnapshots,
  serverCategories,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import {
  createServerSearchCursorCodec,
  refreshServerSearchDocument,
  searchServersPage,
} from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";

interface SeedSearchPageServerInput {
  slug: string;
  title: string;
  shortDescription: string;
  listingStatus?: "active" | "deprecated" | "deleted_upstream" | "unavailable";
  category?: { slug: string; name: string };
  publisher?: { slug: string; displayName: string; verified?: boolean };
  packageIdentifier?: string;
  packageRegistryType?: string;
  packageTransportType?: string;
  remoteTransportType?: string;
  compatibility?: readonly {
    clientId: "claude-code" | "codex" | "cursor";
    status: "supported" | "supported_with_configuration" | "unsupported" | "unknown";
  }[];
  repositorySnapshot?: { stars: number; lastPushAt: string };
  openSource?: boolean | null;
  officialSource?: boolean;
}

async function seedSearchPageServer(
  db: Database,
  sourceIds: { official: string; community: string },
  input: SeedSearchPageServerInput,
): Promise<void> {
  let publisherId: string | null = null;
  if (input.publisher) {
    const [insertedPublisher] = await db
      .insert(publishers)
      .values({
        slug: input.publisher.slug,
        displayName: input.publisher.displayName,
        verificationState: input.publisher.verified ? "verified" : "unverified",
      })
      .onConflictDoNothing()
      .returning({ id: publishers.id });
    publisherId = insertedPublisher?.id ?? null;
    if (!publisherId) {
      const [existingPublisher] = await db
        .select({ id: publishers.id })
        .from(publishers)
        .where(eq(publishers.slug, input.publisher.slug));
      publisherId = existingPublisher?.id ?? null;
    }
  }

  const now = new Date("2026-09-01T12:00:00.000Z");
  const [server] = await db
    .insert(servers)
    .values({
      slug: input.slug,
      title: input.title,
      shortDescription: input.shortDescription,
      listingStatus: input.listingStatus ?? "active",
      moderationStatus: "normal",
      publisherId,
      repositoryUrl: `https://github.com/acme/${input.slug}`,
      sourceAvailable: true,
      openSource: input.openSource ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning({ id: servers.id });
  if (!server) throw new Error("expected server row");

  const [version] = await db
    .insert(serverVersions)
    .values({
      serverId: server.id,
      registrySourceId: input.officialSource ? sourceIds.official : sourceIds.community,
      version: "1.0.0",
      firstSeenAt: now,
      lastSeenAt: now,
      normalizedPayload: { seed: true },
      upstreamStatus: "active",
      title: input.title,
      description: input.shortDescription,
    })
    .returning({ id: serverVersions.id });
  if (!version) throw new Error("expected version row");

  await db.update(servers).set({ currentVersionId: version.id }).where(eq(servers.id, server.id));

  if (input.packageIdentifier) {
    await db.insert(serverPackages).values({
      serverVersionId: version.id,
      registryType: input.packageRegistryType ?? "npm",
      identifier: input.packageIdentifier,
      version: "1.0.0",
      transportType: input.packageTransportType ?? "stdio",
    });
  }

  if (input.remoteTransportType) {
    await db.insert(serverRemotes).values({
      serverVersionId: version.id,
      transportType: input.remoteTransportType,
      urlTemplate: `https://api.example.test/${input.slug}`,
    });
  }

  if (input.compatibility?.length) {
    await db.insert(clientCompatibility).values(
      input.compatibility.map((compatibility) => ({
        serverId: server.id,
        clientId: compatibility.clientId,
        status: compatibility.status,
      })),
    );
  }

  if (input.repositorySnapshot) {
    await db.insert(repositorySnapshots).values({
      serverId: server.id,
      provider: "github",
      externalRepositoryId: input.slug,
      owner: "acme",
      name: input.slug,
      url: `https://github.com/acme/${input.slug}`,
      stars: input.repositorySnapshot.stars,
      lastPushAt: new Date(input.repositorySnapshot.lastPushAt),
      checkedAt: now,
    });
  }

  if (input.category) {
    const [insertedCategory] = await db
      .insert(categories)
      .values(input.category)
      .onConflictDoNothing()
      .returning({ id: categories.id });
    const categoryId =
      insertedCategory?.id ??
      (
        await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, input.category.slug))
      )[0]?.id;
    if (!categoryId) throw new Error("expected category row");
    await db.insert(serverCategories).values({
      serverId: server.id,
      categoryId,
      source: "manual",
      confidence: 1,
    });
  }
}

describe("searchServersPage", () => {
  const cursorCodec = createServerSearchCursorCodec("phase-d-test-secret-phase-d-test-secret");
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;
  let sourceIds: { official: string; community: string };

  beforeEach(async () => {
    const temp = await createTempDatabase("task5_search_page");
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

  it("returns deterministic keyset pages without duplicates for recent sort", async () => {
    for (const slug of ["alpha", "beta", "gamma"]) {
      await seedSearchPageServer(db, sourceIds, {
        slug,
        title: slug.toUpperCase(),
        shortDescription: `${slug} tools`,
        officialSource: true,
      });
    }

    const firstPage = await searchServersPage(db, { sort: "recent", limit: 2 }, { cursorCodec });
    const secondPage = await searchServersPage(
      db,
      { sort: "recent", limit: 2, cursor: firstPage.nextCursor! },
      { cursorCodec },
    );

    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.slug)).size).toBe(
      3,
    );
  });

  it("filters by category and publisher through the real join tables", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "github",
      title: "GitHub",
      shortDescription: "GitHub tools",
      category: { slug: "developer-tools", name: "Developer Tools" },
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "noise",
      title: "Noise",
      shortDescription: "Noise tools",
      category: { slug: "automation", name: "Automation" },
      publisher: { slug: "acme", displayName: "Acme", verified: false },
      officialSource: true,
    });

    const page = await searchServersPage(
      db,
      { category: "developer-tools", publisher: "github", sort: "recent", limit: 10 },
      { cursorCodec },
    );

    expect(page.items.map((item) => item.slug)).toEqual(["github"]);
    expect(page.items[0]?.publisher).toEqual({ slug: "github", name: "GitHub", verified: true });
  });

  it("filters by client, transport, and registryType through current install data", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "cursor-remote",
      title: "Cursor Remote",
      shortDescription: "Remote install target",
      packageIdentifier: "@acme/cursor-remote",
      packageRegistryType: "npm",
      packageTransportType: "stdio",
      remoteTransportType: "streamable-http",
      compatibility: [{ clientId: "cursor", status: "supported" }],
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "claude-only",
      title: "Claude Only",
      shortDescription: "Claude Code target",
      packageIdentifier: "claude-only",
      packageRegistryType: "pypi",
      packageTransportType: "stdio",
      compatibility: [{ clientId: "claude-code", status: "supported" }],
      officialSource: true,
    });

    const page = await searchServersPage(
      db,
      {
        client: "cursor",
        transport: "streamable-http",
        registryType: "npm",
        sort: "recent",
        limit: 10,
      },
      { cursorCodec },
    );

    expect(page.items.map((item) => item.slug)).toEqual(["cursor-remote"]);
  });

  it("excludes deleted_upstream by default and returns it when explicitly requested", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "upstream-deleted",
      title: "Deleted Upstream",
      shortDescription: "Removed upstream",
      listingStatus: "deleted_upstream",
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "still-active",
      title: "Still Active",
      shortDescription: "Visible listing",
      officialSource: true,
    });

    const defaultPage = await searchServersPage(db, { sort: "recent", limit: 10 }, { cursorCodec });
    expect(defaultPage.items.map((item) => item.slug)).toEqual(["still-active"]);

    const deletedOnly = await searchServersPage(
      db,
      { status: "deleted_upstream", sort: "recent", limit: 10 },
      { cursorCodec },
    );
    expect(deletedOnly.items.map((item) => item.slug)).toEqual(["upstream-deleted"]);
  });

  it("filters publisher verification and open-source state without treating null as false", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "verified-open",
      title: "Verified Open",
      shortDescription: "Verified open source server",
      publisher: { slug: "verified", displayName: "Verified", verified: true },
      openSource: true,
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "unverified-closed",
      title: "Unverified Closed",
      shortDescription: "Unverified closed source server",
      publisher: { slug: "unverified", displayName: "Unverified", verified: false },
      openSource: false,
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "unknown-source",
      title: "Unknown Source",
      shortDescription: "Unknown source availability",
      openSource: null,
      officialSource: true,
    });

    const verifiedOpen = await searchServersPage(
      db,
      { verified: true, openSource: true, sort: "recent", limit: 10 },
      { cursorCodec },
    );
    expect(verifiedOpen.items.map((item) => item.slug)).toEqual(["verified-open"]);

    const unverifiedClosed = await searchServersPage(
      db,
      { verified: false, openSource: false, sort: "recent", limit: 10 },
      { cursorCodec },
    );
    expect(unverifiedClosed.items.map((item) => item.slug)).toEqual(["unverified-closed"]);
  });

  it("supports popular, updated, and name sorts with stable keyset continuation", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "alpha-tool",
      title: "Alpha Tool",
      shortDescription: "Alpha",
      repositorySnapshot: { stars: 10, lastPushAt: "2026-08-31T00:00:00.000Z" },
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "alpha-toolkit",
      title: "Alpha Toolkit",
      shortDescription: "Alpha Toolkit",
      repositorySnapshot: { stars: 50, lastPushAt: "2026-09-01T00:00:00.000Z" },
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "beta-tool",
      title: "Beta Tool",
      shortDescription: "Beta",
      repositorySnapshot: { stars: 5, lastPushAt: "2026-08-15T00:00:00.000Z" },
      officialSource: true,
    });

    const popular = await searchServersPage(db, { sort: "popular", limit: 2 }, { cursorCodec });
    expect(popular.items.map((item) => item.slug)).toEqual(["alpha-toolkit", "alpha-tool"]);
    const popularNext = await searchServersPage(
      db,
      { sort: "popular", limit: 2, cursor: popular.nextCursor! },
      { cursorCodec },
    );
    expect(popularNext.items.map((item) => item.slug)).toEqual(["beta-tool"]);

    const updated = await searchServersPage(db, { sort: "updated", limit: 3 }, { cursorCodec });
    expect(updated.items.map((item) => item.slug)).toEqual([
      "alpha-toolkit",
      "alpha-tool",
      "beta-tool",
    ]);

    const name = await searchServersPage(db, { sort: "name", limit: 3 }, { cursorCodec });
    expect(name.items.map((item) => item.slug)).toEqual([
      "alpha-tool",
      "alpha-toolkit",
      "beta-tool",
    ]);
  });

  it("uses the exact PostgreSQL name sort key for Unicode cursor continuation", async () => {
    for (const server of [
      { slug: "alpha-unicode", title: "Alpha" },
      { slug: "istanbul-unicode", title: "İstanbul" },
      { slug: "omega-unicode", title: "Ωmega" },
    ]) {
      await seedSearchPageServer(db, sourceIds, {
        ...server,
        shortDescription: `${server.title} tools`,
        officialSource: true,
      });
    }

    const firstPage = await searchServersPage(db, { sort: "name", limit: 2 }, { cursorCodec });
    const secondPage = await searchServersPage(
      db,
      { sort: "name", limit: 2, cursor: firstPage.nextCursor! },
      { cursorCodec },
    );

    expect(firstPage.items.map((item) => item.slug)).toEqual(["alpha-unicode", "istanbul-unicode"]);
    expect(secondPage.items.map((item) => item.slug)).toEqual(["omega-unicode"]);
  });

  it("rejects a reused cursor when the effective filters change", async () => {
    for (const slug of ["github-one", "github-two"]) {
      await seedSearchPageServer(db, sourceIds, {
        slug,
        title: slug,
        shortDescription: "GitHub integration",
        officialSource: true,
      });
    }
    await refreshServerSearchDocument(db);

    const firstPage = await searchServersPage(
      db,
      { q: "github", sort: "relevance", limit: 1 },
      { cursorCodec },
    );
    expect(firstPage.nextCursor).not.toBeNull();

    await expect(
      searchServersPage(
        db,
        { q: "supabase", sort: "relevance", limit: 1, cursor: firstPage.nextCursor! },
        { cursorCodec },
      ),
    ).rejects.toMatchObject({ name: "InvalidCursorError" });
  });
});
