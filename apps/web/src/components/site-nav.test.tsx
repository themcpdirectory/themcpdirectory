import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/theme-control", () => ({
  ThemeControl: () => <span>Theme</span>,
}));

import { SiteNav } from "./site-nav";

describe("SiteNav", () => {
  it("renders the approved navigation labels and one mobile disclosure control", () => {
    const markup = renderToStaticMarkup(<SiteNav />);

    expect(markup).toContain("Search");
    expect(markup).toContain("Collections");
    expect(markup).toContain("Docs");
    expect(markup).toContain("Publish");
    expect(markup).toContain("GitHub");
    expect(markup).not.toContain("Security");
    expect(markup).toContain('aria-label="Open navigation menu"');
    expect(markup).toContain('aria-controls="mobile-nav"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Mobile navigation"');
    expect((markup.match(/aria-controls="mobile-nav"/g) ?? []).length).toBe(1);
  });
});
