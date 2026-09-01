import type { Metadata, Route } from "next";
import { searchServers } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { SearchForm } from "@/components/search-form";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ q?: string | string[] }>;
}

const MAX_SEARCH_QUERY_LENGTH = 200;

function normalizeSearchQuery(value: string | string[] | undefined): string {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim().slice(0, MAX_SEARCH_QUERY_LENGTH) ?? "";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = normalizeSearchQuery(q);
  return {
    title: query ? `"${query}" search results` : "Search MCP servers",
    robots: { index: false },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = normalizeSearchQuery(q);
  const db = getDb();

  const results = query ? await searchServers(db, { query, limit: 30 }) : [];

  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            marginBottom: "1.25rem",
          }}
        >
          Search
        </h1>

        <div style={{ marginBottom: "1.5rem" }}>
          <SearchForm defaultValue={query} />
        </div>

        {!query && (
          <p style={{ color: "var(--fg-muted)", fontSize: "0.9375rem" }}>
            Enter a search query to find MCP servers.
          </p>
        )}

        {query && results.length === 0 && (
          <p style={{ color: "var(--fg-muted)", fontSize: "0.9375rem" }}>
            No results found for <strong>&ldquo;{query}&rdquo;</strong>. Try a different term.
          </p>
        )}

        {results.length > 0 && (
          <>
            <p
              style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", marginBottom: "1rem" }}
              aria-live="polite"
              aria-atomic="true"
            >
              {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
              <strong>&ldquo;{query}&rdquo;</strong>
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {results.map((server) => (
                <li key={server.id}>
                  <article
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "0.75rem 1rem",
                      background: "var(--surface)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <Link
                        href={`/${server.slug}` as Route}
                        style={{
                          fontWeight: 600,
                          color: "var(--accent)",
                          textDecoration: "none",
                          fontSize: "0.9375rem",
                        }}
                      >
                        {server.title}
                      </Link>
                      {server.isOfficialRegistry && (
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0 0.35rem",
                            color: "var(--fg-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          official
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        margin: "0.25rem 0 0",
                        fontSize: "0.8125rem",
                        color: "var(--fg-muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      {server.shortDescription}
                    </p>
                    <div
                      style={{
                        marginTop: "0.375rem",
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {server.publisherDisplayName && (
                        <span style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                          {server.publisherDisplayName}
                        </span>
                      )}
                      {server.categorySlugs.slice(0, 3).map((cat) => (
                        <Link
                          key={cat}
                          href={`/categories/${cat}` as Route}
                          style={{
                            fontSize: "0.6875rem",
                            padding: "0 0.4rem",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--surface-2)",
                            color: "var(--fg-muted)",
                            textDecoration: "none",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {cat}
                        </Link>
                      ))}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
