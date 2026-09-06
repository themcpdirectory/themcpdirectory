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
    const openButton = page.getByRole("button", { name: "Open navigation menu" });
    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });

    await expect(openButton).toBeVisible();
    await expect(openButton).toHaveAttribute("aria-expanded", "false");
    await expect(mobileNav).toBeHidden();

    await openButton.click();

    const closeButton = page.getByRole("button", { name: "Close navigation menu" });

    await expect(closeButton).toBeVisible();
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");
    await expect(mobileNav).toBeVisible();

    await closeButton.click();

    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
    await expect(mobileNav).toBeHidden();
  });

  test("mobile navigation exposes Search, Collections, Docs, and Publish with correct destinations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();

    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(mobileNav.getByRole("link", { name: "Search", exact: true })).toHaveAttribute(
      "href",
      "/search",
    );
    await expect(mobileNav.getByRole("link", { name: "Collections", exact: true })).toHaveAttribute(
      "href",
      "/collections",
    );
    await expect(mobileNav.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute(
      "href",
      "/docs",
    );
    await expect(mobileNav.getByRole("link", { name: "Publish", exact: true })).toHaveAttribute(
      "href",
      "/publish",
    );

    await mobileNav.getByRole("link", { name: "Collections", exact: true }).click();
    await expect(page).toHaveURL(/\/collections$/);
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
  });

  test("primary navigation exposes Search, Collections, Docs, and Publish", async ({ page }) => {
    await page.goto("/");
    const siteNav = page.getByRole("navigation", { name: "Site navigation" });
    await expect(siteNav.getByRole("link", { name: "Search", exact: true })).toBeVisible();
    await expect(siteNav.getByRole("link", { name: "Collections", exact: true })).toBeVisible();
    await expect(siteNav.getByRole("link", { name: "Docs", exact: true })).toBeVisible();
    await expect(siteNav.getByRole("link", { name: "Publish", exact: true })).toBeVisible();
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
