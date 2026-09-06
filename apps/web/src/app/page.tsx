import type { Metadata, Route } from "next";
import { getHomepageServers, getCategories } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { SearchForm } from "@/components/search-form";
import { ServerDirectoryList } from "@/components/server-directory-list";
import { LoadingState } from "@/components/loading-state";
import { buildDocumentMetadata } from "@/lib/metadata";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "The MCP Directory — Find it. Trust it. Install it.",
  description:
    "The open directory for the MCP ecosystem. Discover MCP servers, inspect their metadata, and understand what they require.",
  path: "/",
  index: true,
});

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <Suspense fallback={<LoadingState withinMain />}>
        <HomeDirectory />
      </Suspense>
    </main>
  );
}

async function HomeDirectory() {
  const db = getDb();
  const [servers, allCategories] = await Promise.all([
    getHomepageServers(db, { limit: 12 }),
    getCategories(db),
  ]);

  const featuredCategories = allCategories.filter((c) => c.serverCount > 0).slice(0, 4);

  return (
    <>
      {/* Compact masthead: identity, search-led intro, entry-point rail */}
      <section aria-label="Search MCP servers" className="home-hero">
        <div className="home-hero__inner">
          <h1 className="home-title">The MCP Directory</h1>
          <p className="home-tagline">
            Find it. Trust it. Install it. — The open directory for the MCP ecosystem.
          </p>
          <SearchForm placeholder="Search MCP servers…" />
          <nav aria-label="Quick entry points" className="entry-point-rail">
            <Link href="/docs/cli" className="entry-point-rail__link">
              Supported clients
            </Link>
            {featuredCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}` as Route}
                className="entry-point-rail__link"
              >
                {cat.name}
                <span
                  aria-label={`${cat.serverCount} ${cat.serverCount === 1 ? "server" : "servers"}`}
                  className="entry-point-rail__badge"
                >
                  {cat.serverCount}
                </span>
              </Link>
            ))}
            <Link href="/categories" className="entry-point-rail__link entry-point-rail__link--all">
              All categories
            </Link>
          </nav>
        </div>
      </section>

      <div className="page-container">
        {/* Server listing */}
        <section aria-labelledby="servers-heading">
          <h2 id="servers-heading" className="section-label">
            Servers
          </h2>
          <ServerDirectoryList servers={servers} emptyMessage="No servers yet. Check back soon." />
        </section>
      </div>
    </>
  );
}
