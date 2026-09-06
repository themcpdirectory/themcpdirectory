"use client";

import { Cross1Icon, GitHubLogoIcon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

interface SiteNavItem {
  readonly href: string;
  readonly label: string;
}

interface SiteNavMenuProps {
  readonly items: readonly SiteNavItem[];
  readonly githubHref: string;
}

export function SiteNavMenu({ items, githubHref }: SiteNavMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="site-nav-menu">
      <Button
        type="button"
        variant="soft"
        size="2"
        aria-label={`${menuOpen ? "Close" : "Open"} navigation menu`}
        aria-expanded={menuOpen}
        aria-controls="mobile-nav"
        onClick={() => setMenuOpen((open) => !open)}
        className="mobile-menu-button"
      >
        {menuOpen ? <Cross1Icon aria-hidden="true" /> : <HamburgerMenuIcon aria-hidden="true" />}
        {menuOpen ? "Close" : "Menu"}
      </Button>

      <nav id="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen} className="mobile-nav">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href as Route}
            onClick={() => setMenuOpen(false)}
            className="site-nav-link"
          >
            {item.label}
          </Link>
        ))}
        <a
          href={githubHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setMenuOpen(false)}
          className="site-nav-link site-nav-link--utility"
        >
          <GitHubLogoIcon aria-hidden="true" />
          GitHub
        </a>
      </nav>
    </div>
  );
}
