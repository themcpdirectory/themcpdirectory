import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const db = { name: "test-db" };

const browseServers = vi.fn();
const getCategories = vi.fn();

vi.mock("@themcpdirectory/domain", () => ({
  browseServers: (...args: unknown[]) => browseServers(...args),
  getCategories: (...args: unknown[]) => getCategories(...args),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("BrowsePage", () => {
  beforeEach(() => {
    browseServers.mockReset();
    getCategories.mockReset();

    browseServers.mockResolvedValue({
      items: [
        {
          id: "server-1",
          slug: "github",
          title: "GitHub MCP",
          shortDescription: "GitHub automation",
          publisher: { slug: "github", name: "GitHub", verified: true },
          categorySlugs: ["developer-tools"],
          officialRegistry: true,
          sourceAvailable: true,
          openSource: true,
          supportedClients: ["cursor"],
          transports: ["streamable-http"],
          firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
          updatedAt: new Date("2026-09-02T00:00:00.000Z"),
          stars: 120,
        },
      ],
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });

    getCategories.mockResolvedValue([
      {
        slug: "developer-tools",
        name: "Developer Tools",
        description: "Developer tooling",
        sortOrder: 1,
        serverCount: 8,
      },
    ]);
  });

  it("forwards supported async search params into browseServers and preserves them in pagination", async () => {
    const pageModule = await import("./page").catch(() => null);

    expect(pageModule).not.toBeNull();
    if (!pageModule) return;

    const markup = renderToStaticMarkup(
      await pageModule.default({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({
          q: " github ",
          category: "developer-tools",
          publisher: "github",
          client: "cursor",
          transport: "streamable-http",
          registryType: "npm",
          officialRegistry: "true",
          verified: "true",
          sourceAvailable: "true",
          openSource: "true",
          healthy: "true",
          sort: "stars",
          page: "2",
          pageSize: "1",
        }),
      }),
    );

    expect(browseServers).toHaveBeenCalledWith(db, {
      query: "github",
      category: "developer-tools",
      publisher: "github",
      client: "cursor",
      transport: "streamable-http",
      registryType: "npm",
      officialRegistry: true,
      verified: true,
      sourceAvailable: true,
      openSource: true,
      healthy: true,
      sort: "stars",
      page: 2,
      pageSize: 1,
    });
    expect(markup).toContain("Browse");
    expect(markup).toContain("Most starred");
    expect(markup).toContain(
      "/browse?q=github&amp;category=developer-tools&amp;publisher=github&amp;client=cursor&amp;transport=streamable-http&amp;registryType=npm&amp;officialRegistry=true&amp;verified=true&amp;sourceAvailable=true&amp;openSource=true&amp;healthy=true&amp;sort=stars&amp;page=3&amp;pageSize=1",
    );
  });

  it("defaults to recently added browsing without a query and relevance when a query is present", async () => {
    const pageModule = await import("./page").catch(() => null);

    expect(pageModule).not.toBeNull();
    if (!pageModule) return;

    await pageModule.default({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    await pageModule.default({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ q: "playwright" }),
    });

    expect(browseServers).toHaveBeenNthCalledWith(1, db, {
      sort: "recent",
      page: 1,
      pageSize: 24,
    });
    expect(browseServers).toHaveBeenNthCalledWith(2, db, {
      query: "playwright",
      sort: "relevance",
      page: 1,
      pageSize: 24,
    });
  });
});
