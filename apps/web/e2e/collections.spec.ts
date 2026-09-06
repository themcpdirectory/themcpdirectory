import { expect, test } from "@playwright/test";

test.describe("Collections", () => {
  test("collections index shows live collection cards instead of placeholder copy", async ({
    page,
  }) => {
    await page.goto("/collections");

    await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    await expect(
      page.getByText(/Collections are assembled from current public directory facts\./i),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Official Registry essentials/i })).toHaveAttribute(
      "href",
      "/collections/official-registry-essentials",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/collections$/);
    await expect(
      page.getByText(/landing next|while the curated inclusion rules are wired/i),
    ).toHaveCount(0);
  });

  test("collection detail shows live servers, truthful inclusion rules, and canonical metadata", async ({
    page,
  }) => {
    await page.goto("/collections/official-registry-essentials");

    await expect(
      page.getByRole("heading", { level: 1, name: "Official Registry essentials" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /This collection currently includes active, normally moderated listings whose current version is from the Official Registry\./i,
      ),
    ).toBeVisible();
    await expect(page.getByText("GitHub MCP", { exact: true })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/collections\/official-registry-essentials$/,
    );
  });

  test("unknown collections use the shared not found route", async ({ page }) => {
    await page.goto("/collections/does-not-exist");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });
});
