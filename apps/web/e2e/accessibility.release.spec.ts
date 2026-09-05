import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  AUTHENTICATED_FIXTURE_ROUTE_MATRIX,
  PUBLIC_RELEASE_ROUTE_MATRIX,
} from "@themcpdirectory/test-utils";
import { seedPublisherSession } from "./setup/publisher-session-fixtures";

async function expectRouteToMeetAutomatedAccessibilityGate(page: Page, route: string) {
  await test.step(route, async () => {
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.setViewportSize({ width: 320, height: 900 });
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), `${route} response`).toBe(true);
    const finalUrl = new URL(page.url());
    expect(`${finalUrl.pathname}${finalUrl.search}`, `${route} did not redirect`).toBe(route);
    await page.locator('main[aria-label="Loading"]').waitFor({ state: "detached" });

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const overflow = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      elements: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .map((element) => ({
          element: element.tagName.toLowerCase(),
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .slice(0, 10),
    }));
    expect(
      overflow.pageWidth,
      `${route} reflows at 320 CSS pixels; overflow candidates: ${JSON.stringify(overflow.elements)}`,
    ).toBeLessThanOrEqual(overflow.viewportWidth + 1);

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((entry) => ["serious", "critical"].includes(entry.impact ?? "")),
      `${route} serious or critical Axe violations`,
    ).toEqual([]);
  });
}

test("public release routes pass the automated accessibility gate", async ({ page }) => {
  test.setTimeout(180_000);

  for (const route of PUBLIC_RELEASE_ROUTE_MATRIX) {
    await expectRouteToMeetAutomatedAccessibilityGate(page, route);
  }
});

test("authenticated fixture routes pass the automated accessibility gate", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const session = await seedPublisherSession({ role: "owner" });
  await context.addCookies([session.cookie]);

  for (const route of AUTHENTICATED_FIXTURE_ROUTE_MATRIX) {
    await expectRouteToMeetAutomatedAccessibilityGate(page, route);
  }
});
