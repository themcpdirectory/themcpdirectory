import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import type { Route } from "next";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { RELEASE_DOCUMENT_LINKS } from "@/content/release-nav";
import { getSiteOrigin } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "The MCP Directory",
    template: "%s — The MCP Directory",
  },
  description: "The open directory for the MCP ecosystem. Find, trust, and understand MCP servers.",
  metadataBase: new URL(getSiteOrigin()),
  openGraph: {
    siteName: "The MCP Directory",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteNav />
        {children}
        <footer
          role="contentinfo"
          style={{
            borderTop: "1px solid var(--border)",
            padding: "1.5rem 1rem",
            color: "var(--fg-muted)",
            fontSize: "0.875rem",
          }}
        >
          <div
            style={{
              maxWidth: "72rem",
              margin: "0 auto",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem 2rem",
            }}
          >
            <div>
              <span>© 2026 The MCP Directory</span>
              {" · "}
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                MCP Protocol
              </a>
            </div>
            <nav aria-label="Release information">
              <ul
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem 1rem",
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {RELEASE_DOCUMENT_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href as Route} style={{ color: "var(--fg-muted)" }}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
