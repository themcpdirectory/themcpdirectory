import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  categoryDetailResponseSchema,
  clientDetailResponseSchema,
  clientsCollectionResponseSchema,
  publisherDetailResponseSchema,
} from "@themcpdirectory/api-contract";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import {
  getPublicCategoryBySlug,
  getPublicClientById,
  getPublicPublisherBySlug,
  listPublicCategories,
  listPublicClients,
} from "../../index.js";
import type { PublicApiTestContext } from "./public-api-test-context.js";
import { createPublicApiTestContext } from "./public-api-test-context.js";

let context: PublicApiTestContext;
const options = {
  cursorCodec: createServerSearchCursorCodec("task-7-discovery-cursor-secret-32-bytes"),
};

beforeAll(async () => {
  context = await createPublicApiTestContext();
}, 30_000);

afterAll(async () => {
  await context.destroy();
});

describe("public discovery queries", () => {
  it("counts only distinct visible non-deleted category listings", async () => {
    const categories = await listPublicCategories(context.db);

    expect(categories).toContainEqual({
      slug: "developer-tools",
      name: "Developer Tools",
      description: null,
      serverCount: 2,
    });
  });

  it("returns a category detail with stable cursor pagination", async () => {
    const first = await getPublicCategoryBySlug(
      context.db,
      { slug: " Developer-Tools ", limit: 1 },
      options,
    );
    expect(first?.servers).toHaveLength(1);
    expect(first?.nextCursor).toEqual(expect.any(String));

    const second = await getPublicCategoryBySlug(
      context.db,
      { slug: "developer-tools", limit: 1, cursor: first?.nextCursor ?? "" },
      options,
    );
    expect(second?.servers).toHaveLength(1);
    expect(second?.servers[0]?.slug).not.toBe(first?.servers[0]?.slug);
    expect(second?.nextCursor).toBeNull();
    expect(
      categoryDetailResponseSchema.safeParse({
        data: first,
        meta: { requestId: crypto.randomUUID() },
      }).success,
    ).toBe(true);
  });

  it("returns publisher detail without membership or internal moderation data", async () => {
    const detail = await getPublicPublisherBySlug(
      context.db,
      { slug: " GITHUB ", limit: 10 },
      options,
    );

    expect(detail).toMatchObject({
      publisher: {
        slug: "github",
        name: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
      },
      servers: [expect.objectContaining({ slug: "github" })],
      nextCursor: null,
    });
    expect(
      publisherDetailResponseSchema.safeParse({
        data: detail,
        meta: { requestId: crypto.randomUUID() },
      }).success,
    ).toBe(true);
    expect(JSON.stringify(detail)).not.toMatch(/approvedBy|moderationStatus|membership/i);
  });

  it("returns catalogue clients with distinct visible compatibility counts", async () => {
    const clients = await listPublicClients(context.db);

    expect(clients.find((client) => client.id === "cursor")?.serverCount).toBe(2);
    expect(clients.find((client) => client.id === "codex")?.serverCount).toBe(0);
    expect(
      clientsCollectionResponseSchema.safeParse({
        data: clients,
        meta: { requestId: crypto.randomUUID(), nextCursor: null },
      }).success,
    ).toBe(true);
  });

  it("uses the same effective compatibility for client detail listings", async () => {
    const cursor = await getPublicClientById(context.db, { id: "cursor", limit: 10 }, options);
    expect(cursor?.servers.map((server) => server.slug).sort()).toEqual([
      "category-second",
      "github",
    ]);
    expect(
      clientDetailResponseSchema.safeParse({
        data: cursor,
        meta: { requestId: crypto.randomUUID() },
      }).success,
    ).toBe(true);

    const codex = await getPublicClientById(context.db, { id: "codex", limit: 10 }, options);
    expect(codex?.servers).toEqual([]);
    expect(
      await getPublicClientById(context.db, { id: "unknown" as "cursor" }, options),
    ).toBeNull();
  });

  it("returns null for unknown category and publisher slugs", async () => {
    await expect(
      getPublicCategoryBySlug(context.db, { slug: "unknown" }, options),
    ).resolves.toBeNull();
    await expect(
      getPublicPublisherBySlug(context.db, { slug: "unknown" }, options),
    ).resolves.toBeNull();
  });
});
