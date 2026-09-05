import { expect, test } from "@playwright/test";

test("trust and publisher docs project shipped contracts", async ({ page }) => {
  await page.goto("/docs/trust");
  await expect(page.getByRole("heading", { level: 1, name: "Trust and health" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Health outcomes" })).toContainText("healthy");
  await expect(page.getByRole("region", { name: "Health outcomes" })).toContainText(
    "unsafe_destination",
  );
  await expect(page.getByRole("region", { name: "Upstream deletion" })).toContainText(
    "deleted_upstream",
  );
  await expect(page.getByRole("region", { name: "Trust model" })).toContainText(
    "No aggregate trust score",
  );

  await page.goto("/docs/publishers");
  await expect(page.getByRole("heading", { level: 1, name: "Publisher reference" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Roles and capabilities" })).toContainText(
    "owner: publisher.read, publisher.edit, claims.manage, members.manage, ownership.transfer, publisher.destroy",
  );
  await expect(page.getByRole("region", { name: "Roles and capabilities" })).toContainText(
    "admin: publisher.read, publisher.edit, claims.manage, members.manage",
  );
  await expect(page.getByRole("region", { name: "Claim statuses" })).toContainText("verified");
  await expect(page.getByRole("region", { name: "Claim statuses" })).toContainText(
    "revoked: The claim was stopped by the system before verification was completed, or previously verified authority was removed.",
  );
  await expect(page.getByRole("region", { name: "Claim verification" })).toContainText(
    "A signed-in user can bootstrap a publisher with no memberships and manage that claim while they remain its original requester.",
  );
  await expect(page.getByRole("region", { name: "Account data" })).toContainText(
    "POST /api/publisher/v1/account/export",
  );
  await expect(page.getByRole("region", { name: "Account data" })).toContainText(
    "POST /api/publisher/v1/account/erasure",
  );
});