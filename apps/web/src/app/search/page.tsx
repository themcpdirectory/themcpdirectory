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
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow">
        <header className="page-header">
          <h1 className="page-title">Search</h1>
          <p className="page-description">Search the directory by server name or description.</p>
        </header>

        <div className="search-panel">
          <SearchForm defaultValue={query} />
        </div>

        {!query && <p className="page-description">Enter a search query to find MCP servers.</p>}

        {query && (
          <>
            {results.length > 0 && (
              <p className="results-summary" aria-live="polite" aria-atomic="true">
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
