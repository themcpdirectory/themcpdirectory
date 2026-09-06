import { test, expect } from "@playwright/test";

test.describe("Browse", () => {
  test("renders a browse page with mobile filters in a dialog", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });

    const response = await page.goto("/browse", { waitUntil: "domcontentloaded" });

    expect(response?.ok(), "browse response").toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: /browse/i })).toBeVisible();

    const filtersButton = page.getByRole("button", { name: /filters/i });
    await expect(filtersButton).toBeVisible({ timeout: 15000 });
    const dialog = page.getByRole("dialog", { name: /filters/i });

    let lastError: unknown = null;
    for (const _attempt of [1, 2, 3, 4, 5]) {
      try {
        await filtersButton.click();
        await expect(dialog).toBeVisible({ timeout: 3000 });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
  });

  test("serves bounded JSON suggestions", async ({ page }) => {
    const response = await page.request.get("/api/search/suggestions?q=git");

    expect(response.ok()).toBe(true);
    const payload = (await response.json()) as {
      servers: unknown[];
      categories: unknown[];
      collections: unknown[];
    };

    expect(payload.servers.length).toBeLessThanOrEqual(5);
    expect(payload.categories.length).toBeLessThanOrEqual(3);
    expect(payload.collections.length).toBeLessThanOrEqual(3);
  });

  test("supports keyboard navigation across homepage suggestions", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.getByRole("combobox", { name: "Search MCP servers" });
    await page.keyboard.press("/");
    await expect(searchInput).toBeFocused();

    await searchInput.fill("git");
    await expect(page.getByRole("listbox", { name: /search suggestions/i })).toBeVisible();

    await searchInput.press("ArrowDown");
    await expect(searchInput).toHaveAttribute("aria-activedescendant", /search-suggestion-/);

    await searchInput.press("Escape");
    await expect(page.getByRole("listbox", { name: /search suggestions/i })).toBeHidden();

    await searchInput.fill("github");
    await expect(page.getByRole("listbox", { name: /search suggestions/i })).toBeVisible();
    await searchInput.press("ArrowDown");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/\/github$/, { timeout: 15000 });
  });
});
