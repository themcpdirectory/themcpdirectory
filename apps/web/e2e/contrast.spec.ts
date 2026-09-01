import { expect, test, type Page } from "@playwright/test";

interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${value}`);
  return { red: channels[0]!, green: channels[1]!, blue: channels[2]! };
}

function luminance(color: Rgb): number {
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = luminance(parseRgb(first));
  const secondLuminance = luminance(parseRgb(second));
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function searchColors(page: Page) {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('form[role="search"] button');
    const input = document.querySelector<HTMLInputElement>('form[role="search"] input');
    if (!button || !input) throw new Error("Search controls not found");

    const buttonStyle = getComputedStyle(button);
    const inputStyle = getComputedStyle(input);
    return {
      buttonBackground: buttonStyle.backgroundColor,
      buttonText: buttonStyle.color,
      inputBackground: inputStyle.backgroundColor,
      inputBorder: inputStyle.borderTopColor,
    };
  });
}

test("uses the supplied brand canvas and accent", async ({ page }) => {
  await page.goto("/");

  const palette = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      background: rootStyle.getPropertyValue("--bg").trim(),
      accent: rootStyle.getPropertyValue("--accent").trim(),
    };
  });

  expect(palette).toEqual({ background: "#151515", accent: "#44ef56" });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`search controls meet contrast requirements in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    const colors = await searchColors(page);

    expect(contrastRatio(colors.buttonText, colors.buttonBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.inputBorder, colors.inputBackground)).toBeGreaterThanOrEqual(3);
  });
}

test("search input has a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Search MCP servers" });
  await input.focus();

  const focusStyle = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });

  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);
});
