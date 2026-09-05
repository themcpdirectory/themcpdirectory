import { test, expect } from "@playwright/test";

test("API docs project the complete verified public contract", async ({ page }) => {
  await page.goto("/docs/api");

  await expect(page.getByRole("region", { name: "Routes" }).locator("p")).toHaveText([
    "GET /api/v1/categories",
    "GET /api/v1/categories/:slug",
    "GET /api/v1/clients",
    "GET /api/v1/clients/:id",
    "GET /api/v1/publishers/:slug",
    "GET /api/v1/resolve/:identifier",
    "GET /api/v1/resolve/:identifier/install",
    "GET /api/v1/search",
    "GET /api/v1/servers",
    "GET /api/v1/servers/:slug",
    "GET /api/v1/servers/:slug/install",
  ]);
  await expect(page.getByRole("region", { name: "Errors" }).locator("p")).toHaveText([
    "400 VALIDATION_ERROR: Validation failed",
    "404 SERVER_NOT_FOUND: Server not found",
    "409 AMBIGUOUS_SERVER: Identifier matches multiple servers",
    "410 INSTALL_UNAVAILABLE: Install manifest is unavailable",
    "410 UPSTREAM_DELETED: Listing was deleted upstream",
    "400 CURSOR_INVALID: Cursor is invalid",
    "429 RATE_LIMITED: Too many requests",
    "500 INTERNAL_ERROR: Internal server error",
  ]);
  await expect(page.getByRole("region", { name: "Response envelopes" })).toContainText(
    "meta.nextCursor",
  );
  await expect(page.getByRole("region", { name: "Pagination" })).toContainText(
    "limit defaults to 30; minimum 1; maximum 100",
  );
  await expect(page.getByRole("region", { name: "Pagination" })).toContainText(
    "cursor is opaque, optional, and at most 2048 characters",
  );
  await expect(page.getByRole("region", { name: "Rate limits" })).toContainText(
    "Retry-After reports seconds until retry; quota is configuration-dependent",
  );
  await expect(page.getByRole("region", { name: "Example" })).toContainText(
    '"code": "RATE_LIMITED"',
  );
  await expect(page.getByRole("region", { name: "Install safety" })).toContainText(
    "Package versions must be exact immutable versions",
  );
  await expect(page.getByRole("region", { name: "Install safety" })).toContainText(
    "secret values are never returned",
  );
  await expect(page.getByRole("region", { name: "Listing statuses" }).locator("p")).toHaveText([
    "active",
    "deprecated",
    "deleted_upstream",
    "unavailable",
  ]);
  await expect(page.getByRole("region", { name: "Upstream deletion" }).locator("p")).toHaveText([
    "deleted_upstream listings return 410 UPSTREAM_DELETED for install requests.",
  ]);
});
