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

  it("can refresh one scoped server deterministically and idempotently", async () => {
    const first = await seedServer(db, sourceIds, {
      slug: "scoped-first",
      title: "Scoped First",
      shortDescription: "scoped alpha",
      officialSource: true,
    });

    const second = await seedServer(db, sourceIds, {
      slug: "scoped-second",
      title: "Scoped Second",
      shortDescription: "scoped beta",
      officialSource: true,
    });

    await refreshServerSearchDocument(db, { serverId: first.id });

    const [firstRow] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, first.id));

    const [secondRow] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(eq(servers.id, second.id));

    expect(firstRow?.text).toContain("scoped first");
    expect(firstRow?.document).toBeTruthy();
    expect(secondRow?.text).toBeNull();
    expect(secondRow?.document).toBeNull();

    await refreshServerSearchDocument(db, { serverId: first.id });

    const [afterSecondRefresh] = await db
      .select({ text: servers.searchText, document: servers.searchDocument })
      .from(servers)
      .where(and(eq(servers.id, first.id), eq(servers.searchText, firstRow?.text ?? "")));

    expect(afterSecondRefresh).toBeTruthy();
  });
});
