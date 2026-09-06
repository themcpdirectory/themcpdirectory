"use client";

import { useState } from "react";
import { HamburgerMenuIcon, Cross1Icon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import Link from "next/link";
import { ThemeControl } from "@/components/theme-control";

export function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header role="banner" className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-wordmark" aria-label="The MCP Directory — home">
          <span className="site-wordmark__name">The MCP</span>
          <span className="site-wordmark__prompt" aria-hidden="true">
            &gt;_
          </span>
          <span className="site-wordmark__name">Directory</span>
        </Link>

        <div className="site-nav__actions">
          <nav aria-label="Site navigation" className="desktop-nav site-nav-links">
            <Link href="/categories" className="site-nav-link">
              Browse
            </Link>
            <Link href="/security" className="site-nav-link">
              Security
            </Link>
            <Link href="/docs" className="site-nav-link">
              Docs
            </Link>
            <Link href="/publish" className="site-nav-link">
              Publish
            </Link>
          </nav>

          <ThemeControl />

          <IconButton
            type="button"
            aria-label={`${menuOpen ? "Close" : "Open"} navigation menu`}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
            variant="soft"
            className="mobile-menu-btn"
          >
            {menuOpen ? (
              <Cross1Icon aria-hidden="true" />
            ) : (
              <HamburgerMenuIcon aria-hidden="true" />
            )}
          </IconButton>
        </div>
      </div>

      <nav id="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen} className="mobile-nav">
        <Link href="/categories" onClick={() => setMenuOpen(false)} className="site-nav-link">
          Browse
        </Link>
        <Link href="/security" onClick={() => setMenuOpen(false)} className="site-nav-link">
          Security
        </Link>
        <Link href="/docs" onClick={() => setMenuOpen(false)} className="site-nav-link">
          Docs
        </Link>
        <Link href="/publish" onClick={() => setMenuOpen(false)} className="site-nav-link">
          Publish
        </Link>
      </nav>
    </header>
  );
}
