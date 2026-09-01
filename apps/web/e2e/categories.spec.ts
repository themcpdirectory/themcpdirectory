import { test, expect } from "@playwright/test";

test.describe("Categories", () => {
  test("categories index lists categories", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Categories");
    await expect(page.getByText("Developer Tools")).toBeVisible();
    await expect(page.getByText("Databases")).toBeVisible();
  });

  test("category links navigate to category detail", async ({ page }) => {
    await page.goto("/categories");
    const link = page.getByRole("link", { name: /Developer Tools/i }).first();
    await link.click();
    await expect(page).toHaveURL(/\/categories\/developer-tools/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Developer Tools");
  });

  test("category detail shows servers in that category", async ({ page }) => {
    await page.goto("/categories/developer-tools");
    await expect(page.getByText("GitHub MCP")).toBeVisible();
  });

  test("unknown category shows 404", async ({ page }) => {
    await page.goto("/categories/does-not-exist");
    await expect(page).toHaveURL(/\/categories\/does-not-exist/);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("shows server count badges", async ({ page }) => {
    await page.goto("/categories");
    // At least one category should have a numeric count
    const badge = page.locator("[data-count]").first();
    await expect(badge).toBeVisible();
  });

  test("no horizontal overflow at 320px on categories index", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/categories");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
