import { test, expect } from "@playwright/test";

test.describe("Navigation and 404", () => {
  test("unknown slug shows 404 page", async ({ page }) => {
    await page.goto("/absolutely-no-such-server-xyzabc");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("robots.txt is accessible and correct", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    const body = await response?.text();
    expect(body).toContain("User-Agent");
    expect(body).toContain("Allow");
    expect(body).not.toContain("Disallow: /_next/");
  });

  test("sitemap.xml is accessible", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.status()).toBe(200);
    const body = await response?.text();
    expect(body).toContain("urlset");
    const locations = [...(body?.matchAll(/<loc>([^<]+)<\/loc>/g) ?? [])].map((match) => match[1]!);
    expect(locations.some((location) => new URL(location).pathname === "/search")).toBe(false);
  });

  test("mobile nav toggle button has accessible label", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: /navigation menu/i });

    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(mobileNav).toBeVisible();
    await mobileNav.getByRole("link", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/search$/);
  });

  test("categories link is in nav", async ({ page }) => {
    await page.goto("/");
    const siteNav = page.getByRole("navigation", { name: "Site navigation" });
    await expect(siteNav.getByRole("link", { name: "Categories", exact: true })).toBeVisible();
  });
});

test.describe("Viewport checks", () => {
  const viewports = [
    { width: 320, height: 568, label: "320px" },
    { width: 768, height: 1024, label: "768px (tablet)" },
    { width: 1280, height: 800, label: "1280px (desktop)" },
    { width: 1536, height: 864, label: "1536px (wide)" },
  ] as const;

  for (const vp of viewports) {
    test(`homepage no overflow at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });

    test(`detail page no overflow at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/github");
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  }
});
