import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./setup/test-database";

test.describe("Server detail hierarchy", () => {
  test("orders identity before requirements and install, then shows related servers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/github");

    const identityHeading = page.getByRole("heading", { level: 1 });
    const requirementsHeading = page.getByRole("heading", { name: "Requirements" });
    const evidenceRegion = page.getByRole("region", { name: "Trust profile" });
    const installHeading = page.getByRole("heading", { name: "Installation" });
    const installControl = page.getByRole("button", { name: "Copy", exact: true });
    const relatedHeading = page.getByRole("heading", { name: "Related servers" });

    await expect(identityHeading).toBeInViewport();
    await expect(requirementsHeading).toBeInViewport();
    await expect(installHeading).toBeInViewport();
    await expect(installControl).toBeInViewport();
    await expect(evidenceRegion).toBeVisible();
    await expect(relatedHeading).toBeVisible();

    const order = await page.evaluate(() => {
      const identity = document.querySelector("h1");
      const requirements = document.getElementById("requirements-heading");
      const evidence = document.getElementById("trust-profile-heading");
      const install = document.getElementById("install-heading");
      const related = document.getElementById("related-servers-heading");
      if (!identity || !requirements || !evidence || !install || !related) return null;
      return {
        identityBeforeRequirements: Boolean(
          identity.compareDocumentPosition(requirements) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        requirementsBeforeInstall: Boolean(
          requirements.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        installBeforeEvidence: Boolean(
          install.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        evidenceBeforeRelated: Boolean(
          evidence.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });

    expect(order).toEqual({
      identityBeforeRequirements: true,
      requirementsBeforeInstall: true,
      installBeforeEvidence: true,
      evidenceBeforeRelated: true,
    });
  });

  test("shows timestamped evidence language in the evidence summary", async ({ page }) => {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    const [healthCheck] = await client<{ id: string }[]>`
      insert into server_health_checks (
        server_id, server_version_id, remote_id, check_type, status, latency_ms,
        http_status, final_origin, redirect_count, method_used, checked_at
      )
      select
        s.id, sv.id, sr.id, 'remote_probe', 'healthy', 184,
        204, 'https://mcp.playwright.dev', 0, 'HEAD', '2026-09-03T11:55:00.000Z'
      from servers s
      inner join server_versions sv on sv.id = s.current_version_id
      inner join server_remotes sr on sr.server_version_id = sv.id
      where s.slug = 'playwright'
      returning id
    `;
    if (!healthCheck) throw new Error("Seeded Playwright remote not found");

    try {
      await page.goto("/playwright");
      const evidenceSummary = page.locator(".detail-observations");
      await expect(evidenceSummary.getByText(/Remote responded on.*UTC/i)).toBeVisible();
      await expect(evidenceSummary.locator("time").first()).toBeVisible();
    } finally {
      await client`delete from server_health_checks where id = ${healthCheck.id}`;
      await client.end({ timeout: 0 });
    }
  });

  test("shows a supported clients evidence region without inferring support", async ({ page }) => {
    await page.goto("/github");

    const clientsRegion = page.getByRole("region", { name: "Supported clients" });
    await expect(clientsRegion).toBeVisible();
    await expect(
      clientsRegion.getByText(/score|rating|certified|certification|trusted/i),
    ).toHaveCount(0);
  });

  test("uses the shared copy button behavior for install commands", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/github");

    const code = page.locator(".install-command__code");
    await expect(code).toHaveText("npx @themcpdirectory/cli add github");

    const copyButton = page.getByRole("button", { name: "Copy", exact: true });
    await expect(copyButton).toBeVisible();
    await copyButton.focus();
    await expect(copyButton).toBeFocused();
    await copyButton.click();

    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Command copied.");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("npx @themcpdirectory/cli add github");

    await page.waitForTimeout(2_100);
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  });

  test("explains the install command assumes the CLI is installed and links to CLI setup and status", async ({
    page,
  }) => {
    await page.goto("/github");

    const supportText = page.locator(".install-command > .detail-empty-state");
    await expect(supportText).toContainText(/runs.*@themcpdirectory\/cli.*with npx/i);

    const setupLink = supportText.getByRole("link", { name: "CLI setup and status" });
    await expect(setupLink).toHaveAttribute("href", "/docs/cli");
  });

  test("keeps the install command selectable when copying fails", async ({ page }) => {
    await page.goto("/github");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
    });

    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/manually|select/i);

    const selectable = await page.locator(".install-command__code").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return (selection?.toString().length ?? 0) > 0;
    });
    expect(selectable).toBe(true);
  });
});
