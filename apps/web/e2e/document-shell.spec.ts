import { test, expect } from "@playwright/test";

test("document routes share the accessible launch shell", async ({ page }) => {
  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "Site navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
