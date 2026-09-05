import { test, expect } from "@playwright/test";

test("docs landing lists only the shipped route families", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByText("/", { exact: true })).toBeVisible();
  await expect(page.getByText("/search", { exact: true })).toBeVisible();
  await expect(page.getByText("/categories/[slug]", { exact: true })).toBeVisible();
  await expect(page.getByText("/docs/api", { exact: true })).toBeVisible();
  await expect(page.getByText("/sign-in", { exact: true })).toBeVisible();
  await expect(page.getByText("/dashboard", { exact: true })).toBeVisible();
  await expect(page.getByText(/anonymous browsing remains available/i)).toBeVisible();
});