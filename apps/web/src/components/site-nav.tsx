"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      role="banner"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          padding: "0 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "3rem",
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "2.75rem",
            minWidth: 0,
          }}
          aria-label="The MCP Directory — home"
        >
          <Image
            src="/wordmark.svg"
            width={822}
            height={84}
            alt="The MCP Directory"
            className="site-wordmark"
            preload
          />
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Site navigation" className="desktop-nav" style={{ gap: "1.5rem" }}>
          <Link
            href="/categories"
            style={{
              fontSize: "0.875rem",
              color: "var(--fg-muted)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: "2.75rem",
            }}
          >
            Categories
          </Link>
          <Link
            href="/search"
            style={{
              fontSize: "0.875rem",
              color: "var(--fg-muted)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: "2.75rem",
            }}
          >
            Search
          </Link>
          <Link
            href="/docs"
            style={{
              fontSize: "0.875rem",
              color: "var(--fg-muted)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: "2.75rem",
            }}
          >
            Docs
          </Link>
          <Link
            href="/dashboard"
            style={{
              fontSize: "0.875rem",
              color: "var(--fg-muted)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: "2.75rem",
            }}
          >
            Dashboard
          </Link>
        </nav>

        <button
          type="button"
          aria-label={`${menuOpen ? "Close" : "Open"} navigation menu`}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
            color: "var(--fg)",
          }}
          className="mobile-menu-btn"
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Mobile navigation"
        hidden={!menuOpen}
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "0.75rem 1rem",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <Link
          href="/categories"
          onClick={() => setMenuOpen(false)}
          style={{
            color: "var(--fg)",
            textDecoration: "none",
            fontSize: "0.9375rem",
            display: "flex",
            alignItems: "center",
            minHeight: "2.75rem",
          }}
        >
          Categories
        </Link>
        <Link
          href="/search"
          onClick={() => setMenuOpen(false)}
          style={{
            color: "var(--fg)",
            textDecoration: "none",
            fontSize: "0.9375rem",
            display: "flex",
            alignItems: "center",
            minHeight: "2.75rem",
          }}
        >
          Search
        </Link>
        <Link
          href="/docs"
          onClick={() => setMenuOpen(false)}
          style={{
            color: "var(--fg)",
            textDecoration: "none",
            fontSize: "0.9375rem",
            display: "flex",
            alignItems: "center",
            minHeight: "2.75rem",
          }}
        >
          Docs
        </Link>
        <Link
          href="/dashboard"
          onClick={() => setMenuOpen(false)}
          style={{
            color: "var(--fg)",
            textDecoration: "none",
            fontSize: "0.9375rem",
            display: "flex",
            alignItems: "center",
            minHeight: "2.75rem",
          }}
        >
          Dashboard
        </Link>
      </nav>
    </header>
  );
}
