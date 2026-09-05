import { expect, test } from "@playwright/test";

export const SECURITY_HEADER_EXPECTATIONS = {
  "content-security-policy": ["default-src 'self'", "frame-ancestors 'none'"],
  "strict-transport-security": ["max-age=31536000", "includeSubDomains"],
  "x-content-type-options": ["nosniff"],
  "x-frame-options": ["DENY"],
  "referrer-policy": ["strict-origin-when-cross-origin"],
  "permissions-policy": ["camera=()", "geolocation=()", "microphone=()"],
} as const;

test.skip(process.env.WEB_E2E_MODE !== "production", "requires a production Next.js build");

test("public headers and publisher mutations satisfy release security rules", async ({
  page,
  request,
}) => {
  const cspViolations: string[] = [];
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.text().toLowerCase().includes("content security policy")) {
      cspViolations.push(message.text());
    }
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.setViewportSize({ width: 375, height: 812 });

  for (const path of ["/", "/docs", "/github"] as const) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} loads`).toBe(true);
    await expect(page.locator("h1")).toHaveCount(1);
    const menuButton = page.locator("button.mobile-menu-btn");
    await expect(menuButton).toHaveAccessibleName("Open navigation menu");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(menuButton).toHaveAccessibleName("Close navigation menu");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  }

  const home = await page.goto("/");
  expect(home?.ok()).toBe(true);

  const headers = home?.headers() ?? {};
  for (const [name, expectedValues] of Object.entries(SECURITY_HEADER_EXPECTATIONS)) {
    for (const expectedValue of expectedValues) {
      expect(headers[name], `${name} includes ${expectedValue}`).toContain(expectedValue);
    }
  }
  const contentSecurityPolicy = headers["content-security-policy"] ?? "";
  const scriptPolicy = contentSecurityPolicy
    .split(";")
    .find((directive) => directive.trim().startsWith("script-src"));
  expect(scriptPolicy).toContain("'strict-dynamic'");
  expect(scriptPolicy).toMatch(/'nonce-[A-Za-z0-9+/]+=*'/);
  expect(scriptPolicy).not.toContain("'unsafe-inline'");

  const crossOrigin = await request.post("/api/publisher/v1/claims", {
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    data: { serverSlug: "github" },
  });
  expect(crossOrigin.status()).toBe(403);
  await expect(crossOrigin.json()).resolves.toMatchObject({
    error: { code: "ORIGIN_FORBIDDEN" },
  });
  expect(crossOrigin.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(cspViolations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
