import { test, expect } from "@playwright/test";

const cli = "node packages/cli/dist/index.js";

test("CLI docs project commands, clients, safety, and current distribution state", async ({
  page,
}) => {
  const response = await page.goto("/docs/cli");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1, name: "CLI Reference" })).toBeVisible();
  await expect(page.getByText(`${cli} add github-server`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${cli} add github-server --to codex`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Supported clients" }).locator("p")).toHaveText([
    "Claude Code (claude-code): supported scopes are capability-probed from the installed CLI at runtime.",
    "Codex (codex): user.",
    "Cursor (cursor): user, project.",
    "VS Code (vscode): user, project.",
  ]);
  const commandReference = page.getByRole("region", { name: "Commands and options" });
  await expect(commandReference).toContainText(`Usage: ${cli} help`);
  await expect(commandReference).toContainText("Aliases: --help, -h.");
  await expect(commandReference).toContainText(`Usage: ${cli} doctor [--json]`);
  await expect(commandReference).toContainText(
    `Usage: ${cli} update [server] [--to <client>] [--yes] [--dry-run] [--json]`,
  );
  await expect(commandReference).toContainText("--yes, -y");
  await expect(page.getByText(/secrets are never written to receipts/i)).toBeVisible();
  await expect(page.getByText(/receipt writes are locked and atomic/i)).toBeVisible();
  await expect(page.getByText(/backups preserve corrupt receipt state/i)).toBeVisible();
  await expect(
    page.getByText(/unsupported clients and ambiguous servers fail clearly/i),
  ).toBeVisible();
  await expect(page.getByText(/not published to a package registry/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Exit codes" })).toContainText(
    "2 means invalid command usage",
  );
  await expect(page.getByRole("region", { name: "Removal and uninstall" })).toContainText(
    `${cli} remove github-server --to codex --scope user --dry-run`,
  );
  await expect(page.getByRole("region", { name: "Quick start" })).not.toContainText("mcpdir ");
});
