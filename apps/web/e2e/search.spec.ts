import { test, expect } from "@playwright/test";

test.describe("Search", () => {
  test("shows results for 'github' query", async ({ page }) => {
    await page.goto("/search?q=github");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Search");
    // GitHub MCP should appear
    await expect(page.getByText("GitHub MCP")).toBeVisible();
  });

  test("shows no-results message for unknown query", async ({ page }) => {
    await page.goto("/search?q=zzznoresultszzz");
    await expect(page.getByText(/no results/i)).toBeVisible();
  });

  test("shows empty-query prompt when q param is missing", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Search");
    // Should show prompt to enter query, not results
    await expect(page.getByText(/enter a search/i)).toBeVisible();
  });

  test("search input is pre-filled with query param", async ({ page }) => {
    await page.goto("/search?q=playwright");
    const input = page.getByRole("searchbox");
    await expect(input).toHaveValue("playwright");
  });

  test("uses the first repeated query parameter", async ({ page }) => {
    const response = await page.goto("/search?q=github&q=playwright");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("searchbox")).toHaveValue("github");
    await expect(page.getByText("GitHub MCP")).toBeVisible();
  });

  test("limits oversized search queries", async ({ page }) => {
    const oversizedQuery = "x".repeat(250);
    const response = await page.goto(`/search?q=${oversizedQuery}`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("searchbox")).toHaveValue("x".repeat(200));
  });

  test("result links navigate to detail page", async ({ page }) => {
    await page.goto("/search?q=github");
    const link = page.getByRole("link", { name: /GitHub MCP/i }).first();
    await link.click();
    await expect(page).toHaveURL(/\/github/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("GitHub MCP");
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/search?q=github");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
