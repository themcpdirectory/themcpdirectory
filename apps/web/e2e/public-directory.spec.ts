import { test, expect } from "@playwright/test";

const GITHUB_ROW = '[data-server-row="github"]';
const GITHUB_DESCRIPTION =
  "Repository, issue, and pull-request workflows from GitHub for local assistants.";

const ROUTES = [
  { label: "homepage", path: "/" },
  { label: "search results", path: "/search?q=github" },
  { label: "category results", path: "/categories/developer-tools" },
] as const;

for (const route of ROUTES) {
  test(`${route.label} render the shared directory row for GitHub MCP`, async ({ page }) => {
    await page.goto(route.path);

    const row = page.locator(GITHUB_ROW);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "GitHub MCP", exact: true })).toHaveAttribute(
      "href",
      "/github",
    );
    await expect(row.getByText("GitHub", { exact: true })).toBeVisible();
    await expect(row.getByText("Official Registry listing", { exact: true })).toBeVisible();
    await expect(row.getByText(GITHUB_DESCRIPTION)).toBeVisible();
    await expect(row.getByRole("link", { name: /Inspect/ })).toHaveAttribute("href", "/github");
  });
}
