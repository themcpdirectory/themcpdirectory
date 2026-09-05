import { test, expect } from "@playwright/test";

test("CLI docs project commands, clients, safety, and current distribution state", async ({
  page,
}) => {
  const response = await page.goto("/docs/cli");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1, name: "CLI Reference" })).toBeVisible();
  await expect(page.getByText("mcpdir add github-server", { exact: true })).toBeVisible();
  await expect(
    page.getByText("mcpdir add github-server --to codex", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Supported clients" }).locator("p")).toHaveText([
    "Claude Code (claude-code)",
    "Codex (codex)",
    "Cursor (cursor)",
    "VS Code (vscode)",
  ]);
  await expect(page.getByRole("region", { name: "Commands and options" })).toContainText(
    "Usage: mcpdir doctor [--json]",
  );
  await expect(page.getByRole("region", { name: "Commands and options" })).toContainText(
    "Usage: mcpdir update [server] [--to <client>] [--yes] [--dry-run] [--json]",
  );
  await expect(page.getByText(/secrets are never written to receipts/i)).toBeVisible();
  await expect(
    page.getByText(/unsupported clients and ambiguous servers fail clearly/i),
  ).toBeVisible();
  await expect(page.getByText(/not published to a package registry/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Exit codes" })).toContainText(
    "2 means invalid command usage",
  );
  await expect(page.getByRole("region", { name: "Removal and uninstall" })).toContainText(
    "mcpdir remove github-server --to codex --scope user --dry-run",
  );
});
