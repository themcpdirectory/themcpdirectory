import { expect, test } from "@playwright/test";

test("legal and governance routes preserve repository truth", async ({ page }) => {
  const routes = [
    ["/security", "Security policy"],
    ["/privacy", "Privacy notice"],
    ["/terms", "Terms of service"],
    ["/about", "About The MCP Directory"],
    ["/open-source", "Open source status"],
  ] as const;

  for (const [path, heading] of routes) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  }

  await page.goto("/security");
  await expect(page.getByText(/GitHub's private vulnerability reporting form/i)).toBeVisible();
  await expect(
    page.getByText(/does not currently promise a response or resolution/i),
  ).toBeVisible();

  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByLabel("Legal document status")).toContainText(
      "Draft requiring qualified legal review",
    );
  }

  await page.goto("/privacy");
  await expect(page.getByText("Estopia Engineering Ltd")).toBeVisible();
  await expect(page.getByText(/No behavioural analytics/i)).toBeVisible();
  await expect(page.getByText(/IP address and user-agent/i)).toBeVisible();
  await expect(page.getByText(/protected same-origin session cookies/i)).toBeVisible();
  await expect(page.getByText(/secret redaction/i)).toHaveCount(0);

  await page.goto("/open-source");
  await expect(page.getByText("No open-source licence has been selected yet.")).toBeVisible();
  await expect(page.getByText(/External code contributions are paused/i)).toBeVisible();
});
