import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
