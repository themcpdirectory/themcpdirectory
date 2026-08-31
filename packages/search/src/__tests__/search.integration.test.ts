import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  categories,
  publishers,
  registrySources,
  serverAliases,
  serverCategories,
  serverPackages,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import {
  AmbiguousServerIdentifierError,
  getCategoryServers,
  getHomepageServers,
  getServerByIdentifier,
  refreshServerSearchDocument,
  searchServers,
} from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";

interface SeedServerInput {
  slug: string;
  title: string;
  shortDescription: string;
  longDescription?: string;
  canonicalRegistryName?: string;
  listingStatus?: "active" | "deprecated" | "deleted_upstream" | "unavailable";
  moderationStatus?: "normal" | "under_review" | "hidden" | "blocked";
  aliases?: string[];
  category?: { slug: string; name: string };
  publisher?: { slug: string; displayName: string; verified?: boolean };
  packageIdentifier?: string;
  officialSource?: boolean;
  homepageUrl?: string;
  documentationUrl?: string;
  licenseSpdx?: string;
}

async function seedServer(
  db: Database,
  sourceIds: { official: string; community: string },
  input: SeedServerInput,
): Promise<{ id: string; slug: string }> {
  let publisherId: string | null = null;
  if (input.publisher) {
    const [publisher] = await db
      .insert(publishers)
      .values({
        slug: input.publisher.slug,
        displayName: input.publisher.displayName,
        verificationState: input.publisher.verified ? "verified" : "unverified",
      })
      .onConflictDoNothing()
      .returning({ id: publishers.id });

    if (publisher) {
      publisherId = publisher.id;
    } else {
      const [existing] = await db
        .select({ id: publishers.id })
        .from(publishers)
        .where(eq(publishers.slug, input.publisher.slug));
      publisherId = existing?.id ?? null;
    }
  }

  const now = new Date("2026-09-01T12:00:00.000Z");
  const [server] = await db
    .insert(servers)
    .values({
      slug: input.slug,
      title: input.title,
      shortDescription: input.shortDescription,
      longDescription: input.longDescription,
      canonicalRegistryName: input.canonicalRegistryName,
      listingStatus: input.listingStatus ?? "active",
      moderationStatus: input.moderationStatus ?? "normal",
      publisherId,
      homepageUrl: input.homepageUrl,
      documentationUrl: input.documentationUrl,
      licenseSpdx: input.licenseSpdx,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning({ id: servers.id, slug: servers.slug });

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
      registryType: "npm",
      identifier: input.packageIdentifier,
      transportType: "stdio",
    });
  }

  if (input.aliases && input.aliases.length > 0) {
    await db.insert(serverAliases).values(
      input.aliases.map((aliasValue) => ({
        serverId: server.id,
        alias: aliasValue,
        kind: "manual",
      })),
    );
  }

  if (input.category) {
    const [category] = await db
      .insert(categories)
      .values({
        slug: input.category.slug,
        name: input.category.name,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });

    const categoryId = category
      ? category.id
      : (
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

  return server;
}

describe("search integration", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;
  let sourceIds: { official: string; community: string };

  beforeEach(async () => {
    const temp = await createTempDatabase();
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
    if (destroy) {
      await destroy();
      destroy = undefined;
    }
  });

  it("searches across title, slug, aliases, descriptions, publisher, registry name, package identifier, and categories", async () => {
    await seedServer(db, sourceIds, {
      slug: "alpha-tool",
      title: "Alpha Tool",
      shortDescription: "Primary automation service",
      longDescription: "Provides deterministic automation workflows",
      canonicalRegistryName: "io.github.acme/alpha-tool",
      aliases: ["legacy-alpha", "alpha-old"],
      publisher: { slug: "acme", displayName: "Acme Labs", verified: true },
      packageIdentifier: "@acme/alpha-tool",
      category: { slug: "automation", name: "Automation" },
      officialSource: true,
    });

    await refreshServerSearchDocument(db);

    const checks: Array<{ query: string; expectedSlug: string }> = [
      { query: "Alpha Tool", expectedSlug: "alpha-tool" },
      { query: "alpha-tool", expectedSlug: "alpha-tool" },
      { query: "legacy-alpha", expectedSlug: "alpha-tool" },
      { query: "deterministic automation workflows", expectedSlug: "alpha-tool" },
      { query: "Acme Labs", expectedSlug: "alpha-tool" },
      { query: "io.github.acme/alpha-tool", expectedSlug: "alpha-tool" },
      { query: "@acme/alpha-tool", expectedSlug: "alpha-tool" },
      { query: "automation", expectedSlug: "alpha-tool" },
    ];

    for (const check of checks) {
      const results = await searchServers(db, { query: check.query, limit: 10 });
      expect(results[0]?.slug).toBe(check.expectedSlug);
    }
  });

  it("ranks exact slug and exact title above partial textual matches", async () => {
    await seedServer(db, sourceIds, {
      slug: "alpha-tool",
      title: "Alpha Tool",
      shortDescription: "A platform for alpha operations",
      packageIdentifier: "@acme/alpha-tool",
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "alpha-toolkit",
      title: "Alpha Toolkit",
      shortDescription: "Contains alpha tool and alpha extensions",
      packageIdentifier: "@acme/alpha-toolkit",
      officialSource: true,
    });

    await refreshServerSearchDocument(db);

    const bySlug = await searchServers(db, { query: "alpha-tool", limit: 10 });
    expect(bySlug[0]?.slug).toBe("alpha-tool");

    const byTitle = await searchServers(db, { query: "Alpha Tool", limit: 10 });
    expect(byTitle[0]?.slug).toBe("alpha-tool");
  });

  it("gives alias exact matches priority over generic text matches", async () => {
    await seedServer(db, sourceIds, {
      slug: "canonical-server",
      title: "Canonical Server",
      shortDescription: "Handles canonical workflows",
      aliases: ["special-alias"],
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "generic-special",
      title: "Generic Special",
      shortDescription: "special alias words but no alias record",
      officialSource: true,
    });

    await refreshServerSearchDocument(db);
    const results = await searchServers(db, { query: "special-alias", limit: 10 });
    expect(results[0]?.slug).toBe("canonical-server");
  });

  it("only includes publicly visible active-normal listings in search/home/category queries", async () => {
    await seedServer(db, sourceIds, {
      slug: "public-visible",
      title: "Visibility Probe",
      shortDescription: "visible",
      category: { slug: "ops", name: "Operations" },
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "deprecated-visible",
      title: "Visibility Probe",
      shortDescription: "deprecated",
      listingStatus: "deprecated",
      category: { slug: "ops", name: "Operations" },
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "hidden-server",
      title: "Visibility Probe",
      shortDescription: "hidden",
      moderationStatus: "hidden",
      category: { slug: "ops", name: "Operations" },
      officialSource: true,
    });

    await refreshServerSearchDocument(db);

    const searchResults = await searchServers(db, { query: "Visibility Probe", limit: 10 });
    expect(searchResults.map((row) => row.slug)).toEqual(["public-visible"]);

    const homepageResults = await getHomepageServers(db, { limit: 10 });
    expect(homepageResults.map((row) => row.slug)).toEqual(["public-visible"]);

    const categoryResults = await getCategoryServers(db, {
      categorySlug: "ops",
      limit: 10,
    });
    expect(categoryResults.map((row) => row.slug)).toEqual(["public-visible"]);
  });

  it("uses deterministic stable tie-break ordering for equivalent scores", async () => {
    await seedServer(db, sourceIds, {
      slug: "tie-a",
      title: "Tie Candidate",
      shortDescription: "same score phrase",
      packageIdentifier: "@tie/a",
      officialSource: false,
    });

    await seedServer(db, sourceIds, {
      slug: "tie-b",
      title: "Tie Candidate",
      shortDescription: "same score phrase",
      packageIdentifier: "@tie/b",
      officialSource: false,
    });

    await refreshServerSearchDocument(db);
    const results = await searchServers(db, { query: "Tie Candidate", limit: 10 });

    expect(results.map((row) => row.slug)).toEqual(["tie-a", "tie-b"]);
  });

  it("resolves identifiers with canonical/alias metadata and explicit ambiguity failures", async () => {
    const canonical = await seedServer(db, sourceIds, {
      slug: "canonical-main",
      title: "Canonical Main",
      shortDescription: "canonical",
      aliases: ["Legacy-Main"],
      packageIdentifier: "@canonical/main",
      listingStatus: "deprecated",
      moderationStatus: "normal",
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "hidden-main",
      title: "Hidden Main",
      shortDescription: "hidden",
      moderationStatus: "hidden",
      packageIdentifier: "@hidden/main",
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "ambiguous-one",
      title: "Ambiguous One",
      shortDescription: "ambiguous",
      packageIdentifier: "@shared/duplicate",
      officialSource: true,
    });

    await seedServer(db, sourceIds, {
      slug: "ambiguous-two",
      title: "Ambiguous Two",
      shortDescription: "ambiguous",
      packageIdentifier: "@shared/duplicate",
      officialSource: true,
    });

    await refreshServerSearchDocument(db);

    const canonicalLookup = await getServerByIdentifier(db, "canonical-main");
    expect(canonicalLookup?.canonicalSlug).toBe("canonical-main");
    expect(canonicalLookup?.matchedBy).toBe("slug");
    expect(canonicalLookup?.needsRedirect).toBe(false);

    const aliasLookup = await getServerByIdentifier(db, "legacy-main");
    expect(aliasLookup?.server.id).toBe(canonical.id);
    expect(aliasLookup?.canonicalSlug).toBe("canonical-main");
    expect(aliasLookup?.matchedBy).toBe("alias");
    expect(aliasLookup?.needsRedirect).toBe(true);

    const hiddenLookup = await getServerByIdentifier(db, "hidden-main");
    expect(hiddenLookup).toBeNull();

    await expect(getServerByIdentifier(db, "@shared/duplicate")).rejects.toBeInstanceOf(
      AmbiguousServerIdentifierError,
    );
  });

  it("refresh updates deterministic search data after related-row mutations with scoped and idempotent behavior", async () => {
    const primary = await seedServer(db, sourceIds, {
      slug: "mutable-primary",
      title: "Mutable Primary",
      shortDescription: "original description",
      aliases: ["legacy-handle"],
      publisher: { slug: "old-publisher", displayName: "Old Publisher", verified: true },
      packageIdentifier: "@scope/legacy-package",
      category: { slug: "legacy-ops", name: "Legacy Ops" },
      officialSource: true,
    });

    const untouched = await seedServer(db, sourceIds, {
      slug: "untouched-secondary",
      title: "Untouched Secondary",
      shortDescription: "unchanged profile",
      aliases: ["stays-secondary"],
      packageIdentifier: "@scope/secondary-package",
      category: { slug: "secondary", name: "Secondary" },
      officialSource: true,
    });

    await refreshServerSearchDocument(db);

    const [beforePrimary] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, primary.id));

    const [beforeUntouched] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, untouched.id));

    expect(beforePrimary?.text).toContain("legacy-handle");
    expect(beforePrimary?.text).toContain("@scope/legacy-package");
    expect(beforePrimary?.text).toContain("legacy-ops");
    expect(beforePrimary?.text).toContain("old publisher");

    const [newPublisher] = await db
      .insert(publishers)
      .values({
        slug: "new-publisher",
        displayName: "New Publisher",
        verificationState: "verified",
      })
      .returning({ id: publishers.id });

    if (!newPublisher) throw new Error("expected new publisher row");

    await db.update(servers).set({ publisherId: newPublisher.id }).where(eq(servers.id, primary.id));

    await db
      .delete(serverAliases)
      .where(and(eq(serverAliases.serverId, primary.id), eq(serverAliases.alias, "legacy-handle")));
    await db.insert(serverAliases).values({
      serverId: primary.id,
      alias: "current-handle",
      kind: "manual",
    });

    const [legacyCategory] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, "legacy-ops"));
    if (!legacyCategory) throw new Error("expected legacy category");

    await db
      .delete(serverCategories)
      .where(and(eq(serverCategories.serverId, primary.id), eq(serverCategories.categoryId, legacyCategory.id)));

    const [modernCategory] = await db
      .insert(categories)
      .values({ slug: "modern-ops", name: "Modern Ops" })
      .returning({ id: categories.id });
    if (!modernCategory) throw new Error("expected modern category");

    await db.insert(serverCategories).values({
      serverId: primary.id,
      categoryId: modernCategory.id,
      source: "manual",
      confidence: 1,
    });

    const [newVersion] = await db
      .insert(serverVersions)
      .values({
        serverId: primary.id,
        registrySourceId: sourceIds.official,
        version: "2.0.0",
        firstSeenAt: new Date("2026-09-02T12:00:00.000Z"),
        lastSeenAt: new Date("2026-09-02T12:00:00.000Z"),
        normalizedPayload: { seed: "v2" },
        upstreamStatus: "active",
        title: "Mutable Primary",
        description: "updated",
      })
      .returning({ id: serverVersions.id });
    if (!newVersion) throw new Error("expected v2 row");

    await db.insert(serverPackages).values({
      serverVersionId: newVersion.id,
      registryType: "npm",
      identifier: "@scope/current-package",
      transportType: "stdio",
    });

    await db.update(servers).set({ currentVersionId: newVersion.id }).where(eq(servers.id, primary.id));

    await refreshServerSearchDocument(db, { serverId: primary.id });

    const [afterScopedRefresh] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, primary.id));

    expect(afterScopedRefresh?.text).toContain("current-handle");
    expect(afterScopedRefresh?.text).toContain("@scope/current-package");
    expect(afterScopedRefresh?.text).toContain("modern-ops");
    expect(afterScopedRefresh?.text).toContain("new publisher");

    expect(afterScopedRefresh?.text).not.toContain("legacy-handle");
    expect(afterScopedRefresh?.text).not.toContain("@scope/legacy-package");
    expect(afterScopedRefresh?.text).not.toContain("legacy-ops");
    expect(afterScopedRefresh?.text).not.toContain("old publisher");

    const [afterUntouched] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, untouched.id));

    expect(afterUntouched).toEqual(beforeUntouched);

    await refreshServerSearchDocument(db, { serverId: primary.id });

    const [afterIdempotentRefresh] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, primary.id));

    expect(afterIdempotentRefresh).toEqual(afterScopedRefresh);

    const aliasSearch = await searchServers(db, { query: "current-handle", limit: 5 });
    expect(aliasSearch.map((row) => row.slug)).toContain("mutable-primary");

    const packageSearch = await searchServers(db, { query: "@scope/current-package", limit: 5 });
    expect(packageSearch.map((row) => row.slug)).toContain("mutable-primary");

    const categorySearch = await searchServers(db, { query: "modern-ops", limit: 5 });
    expect(categorySearch.map((row) => row.slug)).toContain("mutable-primary");

    const publisherSearch = await searchServers(db, { query: "new publisher", limit: 5 });
    expect(publisherSearch.map((row) => row.slug)).toContain("mutable-primary");
  });
});
