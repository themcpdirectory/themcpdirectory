import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
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
          <div style={{ maxWidth: "72rem", margin: "0 auto" }}>
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
        </footer>
      </body>
    </html>
  );
}
