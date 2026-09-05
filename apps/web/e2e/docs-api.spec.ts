import { test, expect } from "@playwright/test";

test("API docs list the shipped routes, errors, and deletion semantics", async ({ page }) => {
  await page.goto("/docs/api");
  await expect(page.getByText("GET /api/v1/servers", { exact: true })).toBeVisible();
  await expect(
    page.getByText("GET /api/v1/resolve/:identifier/install", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("UPSTREAM_DELETED", { exact: true })).toBeVisible();
  await expect(page.getByText("deleted_upstream", { exact: true })).toBeVisible();
});
