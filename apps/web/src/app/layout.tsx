import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { headers } from "next/headers";
import type { Route } from "next";
import "@radix-ui/themes/styles.css";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { ThemeProvider } from "@/components/theme-provider";
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

const themeBootstrapScript = `
  (() => {
    const key = "mcp-directory-theme";
    let stored = null;
    try {
      stored = localStorage.getItem(key);
    } catch {}
    const preference = stored === "light" || stored === "dark" ? stored : "system";
    const theme = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  })();
`;

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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeProvider>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <SiteNav />
          {children}
          <footer role="contentinfo" className="site-footer">
            <div className="site-footer__inner">
              <div>
                <span>© 2026 The MCP Directory</span>
                {" · "}
                <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">
                  MCP Protocol
                </a>
              </div>
              <nav aria-label="Release information">
                <ul className="site-footer__links">
                  {RELEASE_DOCUMENT_LINKS.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href as Route}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
