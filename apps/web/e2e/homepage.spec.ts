import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders h1 with site title", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("The MCP Directory");
  });

  test("has skip link as first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("href", "#main-content");
  });

  test("has main landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("has nav landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Site navigation" })).toBeVisible();
  });

  test("uses the accessible brand lockup for the home link", async ({ page }) => {
    await page.goto("/");
    const brand = page.getByRole("link", { name: "The MCP Directory — home" });

    await expect(brand).toBeVisible();
    await expect(brand).toContainText("The MCP");
    await expect(brand).toContainText("Directory");
    await expect(brand).toHaveAttribute("href", "/");
  });

  test("publishes the compact brand icon", async ({ page }) => {
    await page.goto("/");
    const iconHrefs = await page
      .locator('link[rel="icon"]')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute("href")));

    expect(iconHrefs).toContainEqual(expect.stringMatching(/^\/icon\.svg\?/));
  });

  test("has search form with labeled input", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByRole("searchbox");
    await expect(searchInput).toBeVisible();
  });

  test("search input keeps a persistent visible label", async ({ page }) => {
    await page.goto("/");
    const label = page.locator('label[for="search-input"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText(/search/i);
  });

  test("shows server cards from seeded data", async ({ page }) => {
    await page.goto("/");
    // At least one server card should appear
    await expect(page.getByRole("article").first()).toBeVisible();
  });

  test("shows a category and client entry-point rail in the first viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const entryRail = page.getByRole("navigation", { name: "Quick entry points" });
    await expect(entryRail).toBeInViewport();
    await expect(entryRail.getByRole("link", { name: "Supported clients" })).toBeVisible();
    await expect(entryRail.getByRole("link", { name: "All categories" })).toBeVisible();
  });

  test("shows a real server row within the first 1440x900 viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("article").first()).toBeInViewport();
  });

  test("Supported clients entry point reaches the CLI supported-clients section", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Quick entry points" })
      .getByRole("link", { name: "Supported clients" })
      .click();
    await expect(page).toHaveURL(/\/docs\/cli$/);
    await expect(page.getByRole("heading", { level: 1, name: "CLI Reference" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Supported clients" })).toBeVisible();
  });

  test("disables the homepage entry transition under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const durationSeconds = await page
      .locator(".home-hero")
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(durationSeconds).toBeLessThan(0.001);
  });

  test("search form submits via GET to /search", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("searchbox");
    await input.fill("github");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=github/);
  });

  test("has Open Graph meta tags", async ({ page }) => {
    await page.goto("/");
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
    expect(ogTitle).toBeTruthy();
  });

  test("page title is set", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).toContain("MCP Directory");
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
