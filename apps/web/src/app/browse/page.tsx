import type { Metadata } from "next";
import { browseServers, getCategories } from "@themcpdirectory/domain";
import Link from "next/link";
import { FilterPanel } from "@/components/browse/filter-panel";
import { MobileFilterDialog } from "@/components/browse/mobile-filter-dialog";
import { BrowsePagination } from "@/components/browse/pagination";
import {
  buildBrowseHiddenFields,
  countActiveBrowseFilters,
  parseBrowseSearchParams,
  toBrowseServersInput,
} from "@/components/browse/query-state";
import { SortControl } from "@/components/browse/sort-control";
import { SearchBox } from "@/components/search-box";
import { ServerDirectoryList } from "@/components/server-directory-list";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Browse MCP servers",
  description: "Browse public MCP servers with factual server-side filters and pagination.",
  path: "/browse",
  index: true,
});

export default async function BrowsePage({ searchParams }: PageProps<"/browse">) {
  const state = parseBrowseSearchParams(await searchParams);
  const db = getDb();
  const [results, categories] = await Promise.all([
    browseServers(db, toBrowseServersInput(state)),
    getCategories(db),
  ]);

  const activeCategories = categories.filter((category) => category.serverCount > 0);
  const activeFilterCount = countActiveBrowseFilters(state);
  const hiddenSearchFields = buildBrowseHiddenFields(state, {
    exclude: ["q", "page"],
    overrides: { page: 1 },
  });

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>Browse</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">Browse</h1>
          <p className="page-description">
            Explore the directory with supported server-side filters. Sorts stay factual, pagination
            preserves the current filter state, and unsupported telemetry stays out of the UI.
          </p>
        </header>

        <section className="browse-search-panel" aria-labelledby="browse-search-heading">
          <h2 id="browse-search-heading" className="sr-only">
            Browse search
          </h2>
          <SearchBox
            key={state.query}
            action="/browse"
            defaultValue={state.query}
            hiddenFields={hiddenSearchFields}
            placeholder="Search by server, publisher, or task"
            submitLabel="Find servers"
            showShortcutHint
          />
        </section>

        <div className="browse-layout">
          <aside className="browse-filter-rail" aria-label="Browse filters">
            <div className="browse-filter-rail__sticky">
              <h2 className="section-title">Filters</h2>
              <p className="page-description">
                {activeFilterCount === 0
                  ? "Apply supported filters to narrow the directory."
                  : `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}.`}
              </p>
              <FilterPanel categories={activeCategories} state={state} />
            </div>
          </aside>

          <section className="browse-results" aria-labelledby="browse-results-heading">
            <div className="browse-results__toolbar">
              <div>
                <h2 id="browse-results-heading" className="section-title">
                  Results
                </h2>
                <p className="results-summary" aria-live="polite" aria-atomic="true">
                  {results.total} server{results.total === 1 ? "" : "s"}
                  {state.query ? (
                    <>
                      {" "}
                      for <strong>&ldquo;{state.query}&rdquo;</strong>
                    </>
                  ) : null}
                </p>
              </div>
              <SortControl state={state} />
            </div>

            <MobileFilterDialog categories={activeCategories} state={state} />

            <ServerDirectoryList
              servers={results.items}
              emptyMessage={
                state.query
                  ? `No servers matched “${state.query}”. Adjust the current filters or try another search.`
                  : "No servers matched the current filters. Clear one or more filters and try again."
              }
            />

            <BrowsePagination state={state} totalPages={results.totalPages} />
          </section>
        </div>
      </div>
    </main>
  );
}
