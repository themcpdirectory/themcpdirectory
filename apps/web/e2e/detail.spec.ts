import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./setup/test-database";

test.describe("Server detail page", () => {
  test("renders server title as h1", async ({ page }) => {
    await page.goto("/github");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("GitHub MCP");
  });

  test("shows publisher name", async ({ page }) => {
    await page.goto("/github");
    await expect(page.getByRole("link", { name: "GitHub", exact: true })).toBeVisible();
  });

  test("shows short description", async ({ page }) => {
    await page.goto("/github");
    await expect(page.getByText(/repository.*issue/i)).toBeVisible();
  });

  test("shows package identifier", async ({ page }) => {
    await page.goto("/github");
    await expect(page.getByText("@themcpdirectory/github-mcp")).toBeVisible();
  });

  test("shows repository link when present", async ({ page }) => {
    await page.goto("/github");
    const repositoryRow = page.getByText("Repository", { exact: true }).locator("..");
    const repoLink = repositoryRow.getByRole("link", {
      name: "github.com/themcpdirectory/github-mcp",
      exact: true,
    });
    await expect(repoLink).toBeVisible();
    await expect(repoLink).not.toHaveAttribute("aria-label");
  });

  test("has breadcrumb / back link to homepage", async ({ page }) => {
    await page.goto("/github");
    const homeLink = page.getByRole("link", { name: /directory/i }).first();
    await expect(homeLink).toBeVisible();
  });

  test("shows env vars when present", async ({ page }) => {
    await page.goto("/github");
    await expect(page.getByText("GITHUB_TOKEN")).toBeVisible();
  });

  test("has canonical Open Graph URL", async ({ page }) => {
    await page.goto("/github");
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute("content");
    expect(ogUrl).toBe(new URL("/github", page.url()).toString());
  });

  test("safely serializes stored values in JSON-LD", async ({ page }) => {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    const payload = "</script><script>window.__jsonLdXss = true</script>";
    const originalRows = await client<{ short_description: string }[]>`
      select short_description
      from servers
      where slug = 'github'
    `;
    const originalDescription = originalRows[0]?.short_description;
    if (!originalDescription) throw new Error("Seeded GitHub server not found");

    try {
      await client`
        update servers
        set short_description = ${payload}
        where slug = 'github'
      `;

      await page.goto("/github");

      expect(
        await page.evaluate(() =>
          Boolean((window as Window & { __jsonLdXss?: boolean }).__jsonLdXss),
        ),
      ).toBe(false);
      const jsonLdBlocks = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent ?? "{}")));
      const softwareJsonLd = jsonLdBlocks.find((entry) => entry["@type"] === "SoftwareApplication");
      expect(softwareJsonLd?.description).toBe(payload);
    } finally {
      await client`
        update servers
        set short_description = ${originalDescription}
        where slug = 'github'
      `;
      await client.end({ timeout: 0 });
    }
  });

  test("alias redirects to canonical slug", async ({ page }) => {
    const response = await page.request.get("/github-server", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/github");

    await page.goto("/github-server");
    await expect(page).toHaveURL("/github");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("GitHub MCP");
  });

  test("alias 'postgres' redirects to /postgresql", async ({ page }) => {
    await page.goto("/postgres");
    await expect(page).toHaveURL("/postgresql");
  });

  test("shows remote URL for playwright (remote-only server)", async ({ page }) => {
    await page.goto("/playwright");
    await expect(page.getByText(/mcp\.playwright\.dev/)).toBeVisible();
  });

  test("shows remote header metadata without rendering values", async ({ page }) => {
    await page.goto("/playwright");
    await expect(page.getByRole("heading", { name: "Request headers" })).toBeVisible();
    await expect(page.getByText("Authorization", { exact: true })).toBeVisible();
    await expect(page.getByText("Bearer token for remote execution.")).toBeVisible();
    await expect(page.getByText("Bearer {token}", { exact: true })).toHaveCount(0);
  });

  test("does not infer source availability or official provenance", async ({ page }) => {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    const originalRows = await client<
      {
        server_id: string;
        version_id: string;
        source_available: boolean | null;
        open_source: boolean | null;
        registry_source_id: string | null;
      }[]
    >`
      select
        s.id as server_id,
        sv.id as version_id,
        s.source_available,
        s.open_source,
        sv.registry_source_id
      from servers s
      inner join server_versions sv on sv.id = s.current_version_id
      where s.slug = 'github'
    `;
    const original = originalRows[0];
    if (!original) throw new Error("Seeded GitHub server version not found");

    try {
      await client`
        update servers
        set source_available = null, open_source = null
        where id = ${original.server_id}
      `;
      await client`
        update server_versions
        set registry_source_id = null
        where id = ${original.version_id}
      `;

      await page.goto("/github");
      const serverInfo = page.getByRole("region", { name: "Server info" });
      await expect(serverInfo.getByText("Unknown", { exact: true })).toBeVisible();
      await expect(page.getByText("official registry", { exact: true })).toHaveCount(0);

      const sourceStates = [
        { openSource: false, sourceAvailable: null, label: "Unknown" },
        { openSource: null, sourceAvailable: false, label: "Source unavailable" },
        { openSource: true, sourceAvailable: false, label: "Source unavailable" },
        { openSource: false, sourceAvailable: true, label: "Source available" },
      ] as const;

      for (const state of sourceStates) {
        await client`
          update servers
          set
            source_available = ${state.sourceAvailable},
            open_source = ${state.openSource}
          where id = ${original.server_id}
        `;
        await page.goto("/github");
        await expect(serverInfo.getByText(state.label, { exact: true })).toBeVisible();
      }

      await page.goto("/");
      await expect(
        page.getByRole("article", { name: "GitHub MCP" }).getByText("official", { exact: true }),
      ).toHaveCount(0);

      await page.goto("/search?q=github");
      await expect(
        page.getByRole("article").filter({ hasText: "GitHub MCP" }).getByText("official", {
          exact: true,
        }),
      ).toHaveCount(0);
    } finally {
      await client`
        update servers
        set
          source_available = ${original.source_available},
          open_source = ${original.open_source}
        where id = ${original.server_id}
      `;
      await client`
        update server_versions
        set registry_source_id = ${original.registry_source_id}
        where id = ${original.version_id}
      `;
      await client.end({ timeout: 0 });
    }
  });

  test("omits unsafe stored external links", async ({ page }) => {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    const originalRows = await client<
      {
        server_id: string;
        publisher_id: string;
        repository_url: string | null;
        homepage_url: string | null;
        publisher_website_url: string | null;
      }[]
    >`
      select
        s.id as server_id,
        p.id as publisher_id,
        s.repository_url,
        s.homepage_url,
        p.website_url as publisher_website_url
      from servers s
      inner join publishers p on p.id = s.publisher_id
      where s.slug = 'github'
    `;
    const original = originalRows[0];
    if (!original) throw new Error("Seeded GitHub server and publisher not found");

    try {
      await client`
        update servers
        set
          repository_url = 'javascript:alert(1)',
          homepage_url = 'https://user:password@example.com/path'
        where id = ${original.server_id}
      `;
      await client`
        update publishers
        set website_url = 'data:text/html,<h1>unsafe</h1>'
        where id = ${original.publisher_id}
      `;

      await page.goto("/github");
      await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
      await expect(page.locator('a[href^="data:"]')).toHaveCount(0);
      await expect(page.locator('a[href*="user:password@"]')).toHaveCount(0);
      await expect(page.getByText("Repository", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Homepage", { exact: true })).toHaveCount(0);
      await expect(page.getByText("GitHub", { exact: true })).toBeVisible();
    } finally {
      await client`
        update servers
        set
          repository_url = ${original.repository_url},
          homepage_url = ${original.homepage_url}
        where id = ${original.server_id}
      `;
      await client`
        update publishers
        set website_url = ${original.publisher_website_url}
        where id = ${original.publisher_id}
      `;
      await client.end({ timeout: 0 });
    }
  });

  test("shows CLI unavailable note (no install action)", async ({ page }) => {
    await page.goto("/github");
    // Should show unavailable note for CLI, not a fake install command
    await expect(page.getByText(/cli.*not yet available|installation.*coming/i)).toBeVisible();
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/github");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("shows deleted-upstream warning before installation and reflows at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/retired-notifier");

    const warning = page.getByRole("alert").filter({ hasText: "removed upstream" });
    const installation = page.getByRole("heading", { name: "Installation" });
    await expect(warning).toContainText("removed upstream");
    await expect(installation).toBeVisible();
    expect(
      await warning.evaluate((element) => {
        const heading = document.getElementById("install-heading");
        return Boolean(
          heading && element.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("shows factual trust and health content without scores", async ({ page }) => {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    const [healthCheck] = await client<{ id: string }[]>`
      insert into server_health_checks (
        server_id, server_version_id, remote_id, check_type, status, latency_ms,
        http_status, final_origin, redirect_count, method_used, checked_at
      )
      select
        s.id, sv.id, sr.id, 'remote_probe', 'healthy', 184,
        204, 'https://mcp.playwright.dev', 0, 'HEAD', '2026-09-03T11:55:00.000Z'
      from servers s
      inner join server_versions sv on sv.id = s.current_version_id
      inner join server_remotes sr on sr.server_version_id = sv.id
      where s.slug = 'playwright'
      returning id
    `;
    if (!healthCheck) throw new Error("Seeded Playwright remote not found");

    try {
      await page.goto("/playwright");
      await expect(page.getByRole("heading", { name: "Trust profile" })).toBeVisible();
      await expect(page.getByText(/Remote responded on.*UTC/i)).toBeVisible();
      await expect(
        page.getByText(
          /score|stars?|grade|ratings?|confidence|\b\d+(?:\.\d+)?%|overall trust|trusted|certified|certification|ranking|weighted/i,
        ),
      ).toHaveCount(0);
    } finally {
      await client`delete from server_health_checks where id = ${healthCheck.id}`;
      await client.end({ timeout: 0 });
    }
  });
});
