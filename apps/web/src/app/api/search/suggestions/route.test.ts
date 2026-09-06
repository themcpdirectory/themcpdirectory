import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { name: "test-db" };

const getSearchSuggestions = vi.fn();

vi.mock("@themcpdirectory/domain", () => ({
  getSearchSuggestions: (...args: unknown[]) => getSearchSuggestions(...args),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

describe("search suggestions route", () => {
  beforeEach(() => {
    getSearchSuggestions.mockReset();
    getSearchSuggestions.mockResolvedValue({
      servers: Array.from({ length: 6 }, (_, index) => ({
        id: `server-${index + 1}`,
        slug: `server-${index + 1}`,
        title: `Server ${index + 1}`,
        shortDescription: `Description ${index + 1}`,
      })),
      categories: Array.from({ length: 4 }, (_, index) => ({
        slug: `category-${index + 1}`,
        name: `Category ${index + 1}`,
        description: null,
        serverCount: index + 1,
      })),
      collections: Array.from({ length: 4 }, (_, index) => ({
        slug: `collection-${index + 1}`,
        name: `Collection ${index + 1}`,
        description: `Description ${index + 1}`,
        serverCount: index + 1,
      })),
    });
  });

  it("normalizes GET query input and defensively bounds the JSON payload", async () => {
    const routeModule = await import("./route").catch(() => null);

    expect(routeModule).not.toBeNull();
    if (!routeModule) return;

    const response = await routeModule.GET(
      new Request(
        "http://localhost:3000/api/search/suggestions?q=%20github%20&q=ignored-second-value",
      ),
    );

    expect(getSearchSuggestions).toHaveBeenCalledWith(db, { query: "github" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);

    const payload = await response.json();

    expect(payload).toMatchObject({
      servers: expect.arrayContaining([expect.objectContaining({ slug: "server-1" })]),
      categories: expect.arrayContaining([expect.objectContaining({ slug: "category-1" })]),
      collections: expect.arrayContaining([expect.objectContaining({ slug: "collection-1" })]),
    });
    expect(payload.servers).toHaveLength(5);
    expect(payload.categories).toHaveLength(3);
    expect(payload.collections).toHaveLength(3);
  });

  it("returns empty suggestion groups for blank queries without touching the domain", async () => {
    const routeModule = await import("./route").catch(() => null);

    expect(routeModule).not.toBeNull();
    if (!routeModule) return;

    const response = await routeModule.GET(
      new Request("http://localhost:3000/api/search/suggestions?q=%20%20%20"),
    );

    expect(getSearchSuggestions).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      servers: [],
      categories: [],
      collections: [],
    });
  });
});
