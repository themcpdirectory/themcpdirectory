import { expect, test } from "@playwright/test";
import { PUBLIC_SITE_ROUTE_REFERENCE } from "../src/content/site-route-reference";

test("launch pages emit canonical metadata and factual JSON-LD", async ({ page }) => {
  test.setTimeout(90_000);

  const concreteRoute = (path: string) => {
    if (path === "/[slug]") return "/github";
    if (path === "/categories/[slug]") return "/categories/developer-tools";
    return path;
  };

  const indexableRoutes = PUBLIC_SITE_ROUTE_REFERENCE.filter(
    (route) => route.availability === "available" && route.index,
  ).map((route) => concreteRoute(route.path));

  for (const path of indexableRoutes) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical, `${path} canonical`).not.toBeNull();
    expect(new URL(canonical!).pathname).toBe(path);
  }

  await page.goto("/docs/api");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/docs\/api$/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/docs\/api$/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "The MCP Directory",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/i);

  await page.goto("/github");
  const structuredData = page.locator('script[type="application/ld+json"]');
  await expect(structuredData).toHaveCount(2);
  const schemas = await structuredData.evaluateAll((scripts) =>
    scripts.map((script) => JSON.parse(script.textContent ?? "{}") as Record<string, unknown>),
  );
  expect(schemas.map((schema) => schema["@type"])).toEqual([
    "SoftwareApplication",
    "BreadcrumbList",
  ]);
  expect(schemas[0]).not.toHaveProperty("aggregateRating");
  expect(schemas[0]).not.toHaveProperty("review");
  expect(schemas[0]).not.toHaveProperty("offers");
  expect(schemas[0]).not.toHaveProperty("codeRepository");
  expect(schemas[0]).not.toHaveProperty("license");
});
