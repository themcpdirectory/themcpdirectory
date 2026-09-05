import { expect, test } from "@playwright/test";

test("publish and advertise pages state launch truth separately", async ({ page }) => {
  const publishResponse = await page.goto("/publish");
  expect(publishResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Publish a server" })).toBeVisible();
  await expect(page.getByText(/Official MCP Registry/i)).toBeVisible();
  await expect(page.getByText(/verification cannot be purchased/i)).toBeVisible();
  await expect(page.getByText(/cannot complete a self-service claim/i)).toBeVisible();
  await expect(page.getByText(/Account export includes account audit summaries/i)).toBeVisible();

  const advertiseResponse = await page.goto("/advertise");
  expect(advertiseResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Advertising status" })).toBeVisible();
  await expect(page.getByText(/does not accept paid campaigns/i)).toBeVisible();
  await expect(page.getByText(/organic ranking and trust state/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
});
