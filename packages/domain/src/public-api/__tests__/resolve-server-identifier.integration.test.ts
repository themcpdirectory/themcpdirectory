import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { repositorySnapshots, servers } from "@themcpdirectory/db";
import type { PublicApiTestContext } from "./public-api-test-context.js";
import { createPublicApiTestContext } from "./public-api-test-context.js";
import { resolveServerIdentifier } from "../../index.js";

let context: PublicApiTestContext;

beforeAll(async () => {
  context = await createPublicApiTestContext();
}, 30_000);

afterAll(async () => {
  await context.destroy();
});

describe("resolveServerIdentifier", () => {
  it("resolves aliases to a canonical public URL", async () => {
    await expect(resolveServerIdentifier(context.db, " GITHUB-SERVER ")).resolves.toMatchObject({
      slug: "github",
      matchedBy: "alias",
      matchedValue: "github-server",
      canonicalUrl: "https://themcpdirectory.org/github",
      needsRedirect: true,
    });
  });

  it("uses slug precedence without redirecting", async () => {
    await expect(resolveServerIdentifier(context.db, "github")).resolves.toMatchObject({
      slug: "github",
      matchedBy: "slug",
      matchedValue: "github",
      needsRedirect: false,
      installAvailability: "available",
    });
  });

  it.each([
    "https://github.com/GitHub/github-mcp-server",
    "https://github.com/GitHub/github-mcp-server/",
    "github/github-mcp-server",
    "GITHUB/GITHUB-MCP-SERVER",
  ])("resolves the validated GitHub repository source %s", async (identifier) => {
    await expect(resolveServerIdentifier(context.db, identifier)).resolves.toMatchObject({
      slug: "github",
      matchedBy: "github_repository",
      matchedValue: "GitHub/github-mcp-server",
      needsRedirect: true,
    });
  });

  it("gives existing registry identifiers precedence over GitHub-shaped sources", async () => {
    await context.db
      .update(servers)
      .set({ canonicalRegistryName: "github/github-mcp-server" })
      .where(eq(servers.slug, "category-second"));

    await expect(
      resolveServerIdentifier(context.db, "github/github-mcp-server"),
    ).resolves.toMatchObject({
      slug: "category-second",
      matchedBy: "canonical_registry_name",
    });

    await context.db
      .update(servers)
      .set({ canonicalRegistryName: null })
      .where(eq(servers.slug, "category-second"));
  });

  it("rejects unvalidated, malformed, and ambiguous GitHub repository sources", async () => {
    const [unvalidated] = await context.db
      .insert(servers)
      .values({
        slug: "unvalidated-github",
        title: "Unvalidated GitHub",
        shortDescription: "Unvalidated source",
        listingStatus: "active",
        moderationStatus: "normal",
        repositoryUrl: "https://github.com/acme/unvalidated",
        firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
        lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      })
      .returning({ id: servers.id });
    if (!unvalidated) throw new Error("Expected unvalidated GitHub server");

    for (const [slug, externalRepositoryId] of [
      ["ambiguous-github-one", "77001"],
      ["ambiguous-github-two", "77002"],
    ] as const) {
      const [server] = await context.db
        .insert(servers)
        .values({
          slug,
          title: slug,
          shortDescription: slug,
          listingStatus: "active",
          moderationStatus: "normal",
          repositoryUrl: "https://github.com/acme/shared",
          repositorySource: "github",
          repositoryExternalId: externalRepositoryId,
          firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
        })
        .returning({ id: servers.id });
      if (!server) throw new Error("Expected ambiguous GitHub server");
      await context.db.insert(repositorySnapshots).values({
        serverId: server.id,
        provider: "github",
        externalRepositoryId,
        owner: "Acme",
        name: "Shared",
        url: "https://github.com/acme/shared",
        payload: {},
        checkedAt: new Date(`2026-09-01T12:00:0${externalRepositoryId.at(-1)}.000Z`),
      });
    }

    await expect(
      resolveServerIdentifier(context.db, "https://github.com/acme/unvalidated"),
    ).resolves.toBeNull();
    await expect(
      resolveServerIdentifier(context.db, "http://github.com/github/github-mcp-server"),
    ).resolves.toBeNull();
    await expect(
      resolveServerIdentifier(context.db, "https://github.com/github/repo/issues"),
    ).resolves.toBeNull();
    await expect(
      resolveServerIdentifier(context.db, "https://github.com//github/github-mcp-server"),
    ).resolves.toBeNull();
    await expect(resolveServerIdentifier(context.db, "acme/shared")).rejects.toMatchObject({
      name: "AmbiguousServerIdentifierError",
      matchedBy: "github_repository",
      matches: [
        expect.objectContaining({ slug: "ambiguous-github-one" }),
        expect.objectContaining({ slug: "ambiguous-github-two" }),
      ],
    });
  });

  it("returns bounded summaries for ambiguous package identifiers", async () => {
    const error = await resolveServerIdentifier(context.db, "@shared/duplicate").catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({
      name: "AmbiguousServerIdentifierError",
      identifier: "@shared/duplicate",
      matchedBy: "package_identifier",
      matches: [
        expect.objectContaining({ slug: "ambiguous-four", matchedBy: "package_identifier" }),
        expect.objectContaining({ slug: "ambiguous-one", matchedBy: "package_identifier" }),
        expect.objectContaining({ slug: "ambiguous-three", matchedBy: "package_identifier" }),
      ],
    });
    expect(error).toHaveProperty("matches.length", 3);
  });

  it("does not resolve package identifiers from historical versions", async () => {
    await expect(
      resolveServerIdentifier(context.db, "@github/historical-only"),
    ).resolves.toBeNull();
  });

  it("deduplicates package matches belonging to one canonical server", async () => {
    await expect(
      resolveServerIdentifier(context.db, "@github/duplicate-current"),
    ).resolves.toMatchObject({ slug: "github", matchedBy: "package_identifier" });
  });

  it("does not expose a current version owned by another server", async () => {
    await expect(
      resolveServerIdentifier(context.db, "mismatched-current-version"),
    ).resolves.toMatchObject({ slug: "mismatched-current-version", version: null });
  });

  it("returns null for unknown identifiers", async () => {
    await expect(resolveServerIdentifier(context.db, "unknown")).resolves.toBeNull();
  });
});
