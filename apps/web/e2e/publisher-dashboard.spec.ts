import { test, expect } from "@playwright/test";
import { seedPublisherSession } from "./setup/publisher-session-fixtures";

test("dashboard explains claim permissions, works at 320px, and focuses the error summary on invalid claim submission", async ({
  page,
  context,
}) => {
  const session = await seedPublisherSession({ role: "owner" });

  await context.addCookies([session.cookie]);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard");
  const claimRegion = page.getByRole("region", { name: "Claim a listing" });
  await expect(claimRegion).toContainText("GitHub sign-in only reads your identity");
  await expect(claimRegion).toContainText("one-time installation token");
  const listingSelect = claimRegion.getByLabel("Listing", { exact: true });
  await listingSelect.selectOption(session.unclaimedListingId);
  await expect(page.getByLabel("Verification method")).toHaveValue("github_repository");
  await expect(
    page.getByLabel("Verification method").locator('option[value="github_organization"]'),
  ).toHaveCount(0);
  expect(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith("publisher_claim_verification_"),
    ),
  ).toBe(false);
  await listingSelect.selectOption("");
  await page.getByRole("button", { name: "Submit claim" }).click();

  const errorSummary = page
    .getByRole("alert")
    .filter({ hasText: "Select a listing before you submit a claim" });
  await expect(errorSummary).toBeFocused();
  await expect(errorSummary).toContainText("Select a listing before you submit a claim");
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

  await page.goto(`/dashboard/listings/${session.claimedListingId}`);
  await expect(page.getByText("Claim status:")).toContainText("pending");

  const unauthorizedResponse = await page.goto(
    `/dashboard/listings/${session.unclaimedListingId}`,
  );
  expect(unauthorizedResponse?.status()).toBe(404);
});
