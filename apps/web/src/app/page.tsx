import type { Metadata, Route } from "next";
import { getHomepageServers, getCategories } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { SearchForm } from "@/components/search-form";
import { ServerCard } from "@/components/server-card";
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
    <Suspense fallback={<LoadingState />}>
      <HomeDirectory />
    </Suspense>
  );
}

async function HomeDirectory() {
  const db = getDb();
  const [servers, allCategories] = await Promise.all([
    getHomepageServers(db, { limit: 12 }),
    getCategories(db),
  ]);

  const featuredCategories = allCategories.filter((c) => c.serverCount > 0).slice(0, 6);

  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh" }}>
      {/* Hero search */}
      <section
        aria-label="Search MCP servers"
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "3rem 1rem 2.5rem",
          background: "var(--surface)",
        }}
      >
        <div style={{ maxWidth: "42rem", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "clamp(1.375rem, 4vw, 2rem)",
              fontWeight: 700,
              marginBottom: "0.375rem",
              lineHeight: 1.15,
            }}
          >
            The MCP Directory
          </h1>
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: "0.9375rem",
              marginBottom: "1.5rem",
            }}
          >
            Find it. Trust it. Install it. — The open directory for the MCP ecosystem.
          </p>
          <SearchForm placeholder="Search MCP servers…" />
        </div>
      </section>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Featured categories */}
        {featuredCategories.length > 0 && (
          <section aria-labelledby="categories-heading" style={{ marginBottom: "2.5rem" }}>
            <h2
              id="categories-heading"
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-muted)",
                marginBottom: "0.875rem",
              }}
            >
              Browse by category
            </h2>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              {featuredCategories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/categories/${cat.slug}` as Route}
                  style={{
                    fontSize: "0.8125rem",
                    padding: "0.3125rem 0.75rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                    color: "var(--fg)",
                    textDecoration: "none",
                    display: "flex",
                    gap: "0.375rem",
                    alignItems: "center",
                  }}
                >
                  {cat.name}
                  <span
                    aria-label={`${cat.serverCount} ${cat.serverCount === 1 ? "server" : "servers"}`}
                    style={{
                      fontSize: "0.6875rem",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0 0.3rem",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {cat.serverCount}
                  </span>
                </Link>
              ))}
              <Link
                href="/categories"
                style={{
                  fontSize: "0.8125rem",
                  padding: "0.3125rem 0.75rem",
                  color: "var(--accent)",
                  textDecoration: "none",
                  alignSelf: "center",
                }}
              >
                All categories
              </Link>
            </div>
          </section>
        )}

        {/* Server listing */}
        {servers.length > 0 ? (
          <section aria-labelledby="servers-heading">
            <h2
              id="servers-heading"
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-muted)",
                marginBottom: "0.875rem",
              }}
            >
              Servers
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 20rem), 1fr))",
                gap: "0.75rem",
              }}
            >
              {servers.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </section>
        ) : (
          <p style={{ color: "var(--fg-muted)", textAlign: "center", padding: "2rem 0" }}>
            No servers yet. Check back soon.
          </p>
        )}
      </div>
    </main>
  );
}
