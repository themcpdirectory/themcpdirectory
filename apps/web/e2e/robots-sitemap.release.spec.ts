import { expect, test } from "@playwright/test";
import { buildIndexableSitemapPaths } from "../src/content/site-route-reference";

test("robots and sitemap expose only canonical indexable launch pages", async ({ page }) => {
  const robotsResponse = await page.goto("/robots.txt");
  const robots = await robotsResponse?.text();
  expect(robots).toContain("Sitemap:");
  expect(robots).toContain("Disallow: /dashboard$");
  expect(robots).toContain("Disallow: /dashboard/");
  expect(robots).not.toContain("Disallow: /search");
  expect(robots).not.toContain("Disallow: /advertise");

  const sitemapResponse = await page.goto("/sitemap.xml");
  const sitemap = (await sitemapResponse?.text()) ?? "";
  const sitemapPaths = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
    (match) => new URL(match[1]!).pathname,
  );
  expect(sitemapPaths).toContain("/docs/trust");
  expect(sitemapPaths).toContain("/categories/developer-tools");
  expect(sitemapPaths).toContain("/github");
  expect(sitemapPaths).not.toContain("/search");
  expect(sitemapPaths).not.toContain("/advertise");
  expect(sitemapPaths).not.toContain("/dashboard");
  expect(sitemapPaths.every((path) => !path.includes("[slug]"))).toBe(true);

  const collisionPaths = buildIndexableSitemapPaths({
    categorySlugs: [],
    serverSlugs: ["search", "search-tool", "advertise", "dashboard", "dashboard-kit"],
  });
  expect(collisionPaths).not.toContain("/search");
  expect(collisionPaths).not.toContain("/advertise");
  expect(collisionPaths).not.toContain("/dashboard");
  expect(collisionPaths).toContain("/search-tool");
  expect(collisionPaths).toContain("/dashboard-kit");
});
