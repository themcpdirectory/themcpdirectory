import type { Metadata } from "next";
import { searchServers } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { SearchForm } from "@/components/search-form";
import { ServerDirectoryList } from "@/components/server-directory-list";

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

        {query && (
          <>
            {results.length > 0 && (
              <p
                style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", marginBottom: "1rem" }}
                aria-live="polite"
                aria-atomic="true"
              >
                {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
                <strong>&ldquo;{query}&rdquo;</strong>
              </p>
            )}
            <ServerDirectoryList
              servers={results}
              emptyMessage={`No results found for “${query}”. Try a different term.`}
            />
          </>
        )}
      </div>
    </main>
  );
}
