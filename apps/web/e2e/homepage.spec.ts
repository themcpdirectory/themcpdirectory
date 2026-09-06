import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders the discovery hero with product identity", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "The MCP Directory" })).toBeVisible();
    await expect(page.getByText("mcp>_", { exact: true })).toBeVisible();
    await expect(page.getByText("Find it. Trust it. Install it.", { exact: true })).toBeVisible();
  });

  test("has skip link as first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("href", "#main-content");
  });

  test("has main landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("has nav landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Site navigation" })).toBeVisible();
  });

  test("uses the accessible brand lockup for the home link", async ({ page }) => {
    await page.goto("/");
    const brand = page.getByRole("link", { name: "The MCP Directory — home" });

    await expect(brand).toBeVisible();
    await expect(brand).toContainText("The MCP");
    await expect(brand).toContainText("Directory");
    await expect(brand).toHaveAttribute("href", "/");
  });

  test("publishes the compact brand icon", async ({ page }) => {
    await page.goto("/");
    const iconHrefs = await page
      .locator('link[rel="icon"]')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute("href")));

    expect(iconHrefs).toContainEqual(expect.stringMatching(/^\/icon\.svg\?/));
  });

  test("has search form with labeled input", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByRole("searchbox");
    await expect(searchInput).toBeVisible();
  });

  test("search input keeps a persistent visible label", async ({ page }) => {
    await page.goto("/");
    const label = page.locator('label[for="search-input"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText(/search/i);
  });

  test("focuses search with slash without hijacking normal typing", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByRole("searchbox", { name: "Search MCP servers" });

    await page.keyboard.press("/");
    await expect(searchInput).toBeFocused();
    await expect(searchInput).toHaveValue("");

    await searchInput.type("playwright");
    await expect(searchInput).toHaveValue("playwright");

    await searchInput.press("/");
    await expect(searchInput).toHaveValue("playwright/");
  });

  test("shows the public install command and copy action", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");

    await expect(
      page.getByText("npx @themcpdirectory/cli add github", { exact: true }),
    ).toBeVisible();

    const commandBlock = page.locator(".command-block").filter({
      hasText: "Production install command",
    });
    const copyButton = commandBlock.locator("button.copy-button");
    await expect(copyButton).toHaveText("Copy");
    await copyButton.click();
    await expect(copyButton).toHaveText("Copied");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("npx @themcpdirectory/cli add github");
  });

  test("shows factual ecosystem metrics from live discovery data", async ({ page }) => {
    await page.goto("/");

    const facts = page.locator(".home-facts__item");
    await expect(facts).toHaveCount(4);
    await expect(facts.filter({ hasText: "Active servers" })).toContainText(/\d+/);
    await expect(facts.filter({ hasText: "Official Registry servers" })).toContainText(/\d+/);
    await expect(facts.filter({ hasText: "Verified publishers" })).toContainText(/\d+/);
    await expect(facts.filter({ hasText: "CLI targets" })).toContainText("4");
    await expect(page.getByText("Source", { exact: true })).toHaveCount(0);
  });

  test("shows recommended and recently added sections with direct server links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const recommendedSection = page.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name: "Recommended servers" }),
    });
    const recentSection = page.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name: "Recently added" }),
    });

    await expect(recommendedSection).toBeVisible();
    await expect(recentSection).toBeVisible();

    const githubLink = page.getByRole("link", { name: /GitHub MCP/i }).first();
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute("href", "/github");

    const recentServerLink = recentSection
      .locator(
        'a[href^="/"]:not([href^="/collections/"]):not([href^="/categories/"]):not([href="/browse"])',
      )
      .first();
    await expect(recentServerLink).toBeVisible();
    await expect(recentServerLink).toHaveAttribute(
      "href",
      /^\/(github|playwright|postgresql|supabase|shared-handle)$/,
    );
  });

  test("shows only non-empty collections and categories plus a publisher CTA", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 2, name: "Collections" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Categories" })).toBeVisible();

    await expect(page.getByRole("link", { name: /Official Registry essentials/i })).toHaveAttribute(
      "href",
      "/collections/official-registry-essentials",
    );
    await expect(page.getByRole("link", { name: /Developer Tools/i })).toHaveAttribute(
      "href",
      "/categories/developer-tools",
    );
    await expect(page.getByRole("link", { name: /Publish a server/i })).toHaveAttribute(
      "href",
      "/publish",
    );

    await expect(page.getByRole("link", { name: /Works with Codex/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Works with Cursor/i })).toHaveCount(0);
  });

  test("disables the homepage entry transition under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const durationSeconds = await page
      .locator(".home-hero")
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(durationSeconds).toBeLessThan(0.001);
  });

  test("search form submits via GET to /search", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("searchbox");
    await input.fill("github");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=github/);
  });

  test("does not render the old quick-entry rail or full-registry section", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("navigation", { name: "Quick entry points" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: /^Servers$/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All categories" })).toHaveCount(0);
  });

  test("has Open Graph meta tags", async ({ page }) => {
    await page.goto("/");
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
    expect(ogTitle).toBeTruthy();
  });

  test("page title is set", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).toContain("MCP Directory");
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("passes the focused automated accessibility gate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.setViewportSize({ width: 320, height: 900 });

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok(), "homepage response").toBe(true);

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
      `homepage reflows at 320 CSS pixels; overflow candidates: ${JSON.stringify(overflow.elements)}`,
    ).toBeLessThanOrEqual(overflow.viewportWidth + 1);

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((entry) => ["serious", "critical"].includes(entry.impact ?? "")),
      "homepage serious or critical Axe violations",
    ).toEqual([]);
  });
});
