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

  test("has search form with labeled input", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByRole("searchbox");
    await expect(searchInput).toBeVisible();
  });

  test("shows server cards from seeded data", async ({ page }) => {
    await page.goto("/");
    // At least one server card should appear
    await expect(page.getByRole("article").first()).toBeVisible();
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
