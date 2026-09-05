import { expect, test } from "@playwright/test";
import { seedPublisherSession } from "./setup/publisher-session-fixtures";

test("claim creation starts the separate GitHub App flow without browser grant state", async ({
  page,
  context,
}) => {
  const session = await seedPublisherSession({ role: "owner" });
  await context.addCookies([session.cookie]);
  await page.goto("/dashboard");

  const result = await page.evaluate(
    async ({ publisherId, serverId }) => {
      const body = JSON.stringify({
        publisherId,
        serverId,
        verificationMethod: "github_repository",
      });
      const headers = { "content-type": "application/json" };
      const created = await fetch("/api/publisher/v1/claims", { method: "POST", headers, body });
      const claim = (await created.json()) as { claimId?: string };
      if (!claim.claimId) throw new Error("Claim response did not include an identifier.");

      const verification = await fetch(`/api/publisher/v1/claims/${claim.claimId}/verify`, {
        method: "POST",
        headers,
        body: "{}",
      });
      const verificationBody = (await verification.json()) as { redirectUrl?: string };
      const conflict = await fetch("/api/publisher/v1/claims", {
        method: "POST",
        headers,
        body,
      });

      return {
        createStatus: created.status,
        verifyStatus: verification.status,
        conflictStatus: conflict.status,
        redirectUrl: verificationBody.redirectUrl,
      };
    },
    { publisherId: session.publisherId, serverId: session.unclaimedListingId },
  );

  expect(result.createStatus).toBe(201);
  expect(result.verifyStatus).toBe(200);
  expect(result.conflictStatus).toBe(409);

  const redirectUrl = new URL(result.redirectUrl!);
  expect(redirectUrl.origin + redirectUrl.pathname).toBe(
    "https://github.com/login/oauth/authorize",
  );
  expect(redirectUrl.searchParams.get("client_id")).toBe("e2e-fixture-github-client-id");
  expect(redirectUrl.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3099/api/publisher/v1/claims/verify/callback",
  );
  expect(redirectUrl.searchParams.get("state")).toMatch(/^[^.]+\.[^.]+$/);
  expect(redirectUrl.searchParams.get("code_challenge")).toBeTruthy();
  expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
  expect(redirectUrl.searchParams.get("allow_signup")).toBe("false");

  expect(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith("publisher_claim_verification_"),
    ),
  ).toBe(false);
});
