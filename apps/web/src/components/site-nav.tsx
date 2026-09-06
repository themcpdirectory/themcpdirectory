import { GitHubLogoIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteNavMenu } from "@/components/site-nav-menu";
import { ThemeControl } from "@/components/theme-control";

const GITHUB_HREF = "https://github.com/themcpdirectory/themcpdirectory";

const NAV_ITEMS = [
  { href: "/search", label: "Browse" },
  { href: "/collections", label: "Collections" },
  { href: "/docs", label: "Docs" },
  { href: "/publish", label: "Publish" },
] as const satisfies ReadonlyArray<{ href: string; label: string }>;

export function SiteNav() {
  return (
    <header role="banner" className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-wordmark" aria-label="The MCP Directory home">
          <BrandMark kind="full" className="site-wordmark__mark" />
        </Link>

        <div className="site-nav__actions">
          <nav aria-label="Site navigation" className="desktop-nav site-nav-links">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="site-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <a
            href={GITHUB_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="site-nav-link site-nav-link--utility desktop-nav-link"
          >
            <GitHubLogoIcon aria-hidden="true" />
            GitHub
          </a>

          <ThemeControl />

          <SiteNavMenu items={NAV_ITEMS} githubHref={GITHUB_HREF} />
        </div>
      </div>
    </header>
  );
}
