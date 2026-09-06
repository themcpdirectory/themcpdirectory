import { ExternalLinkIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import type { Route } from "next";
import { BrandMark } from "@/components/brand-mark";

const GITHUB_HREF = "https://github.com/themcpdirectory/themcpdirectory";

const FOOTER_GROUPS: ReadonlyArray<{
  readonly title: string;
  readonly links: ReadonlyArray<{
    readonly label: string;
    readonly href: string;
    readonly external?: boolean;
  }>;
}> = [
  {
    title: "Product",
    links: [
      { label: "Search", href: "/search" },
      { label: "Collections", href: "/collections" },
      { label: "Publish", href: "/publish" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Security", href: "/security" },
      { label: "GitHub", href: GITHUB_HREF, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Advertise", href: "/advertise" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Cookies", href: "/cookies" },
      { label: "Imprint", href: "/imprint" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer role="contentinfo" className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand-block">
          <Link href="/" className="site-footer__brand-link">
            <BrandMark kind="mark" className="site-footer__brand-mark" />
            <span className="site-footer__brand-name">The MCP Directory</span>
          </Link>
          <p className="site-footer__summary">
            Find, inspect, and install MCP servers without inventing trust.
          </p>
          <p className="site-footer__source">Built on data from the Official MCP Registry.</p>
        </div>

        <nav aria-label="Footer" className="site-footer__groups">
          {FOOTER_GROUPS.map((group) => (
            <section key={group.title} className="site-footer__group">
              <h2 className="site-footer__heading">{group.title}</h2>
              <ul className="site-footer__list">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="site-footer__link"
                      >
                        <GitHubLogoIcon aria-hidden="true" />
                        {link.label}
                        <ExternalLinkIcon aria-hidden="true" />
                      </a>
                    ) : (
                      <Link href={link.href as Route} className="site-footer__link">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </footer>
  );
}
