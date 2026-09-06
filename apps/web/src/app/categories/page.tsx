import type { Metadata, Route } from "next";
import { getCategories } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Categories",
  description: "Browse MCP servers by category.",
  path: "/categories",
  index: true,
});

export default async function CategoriesPage() {
  const db = getDb();
  const allCategories = await getCategories(db);

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>Categories</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">Categories</h1>
          <p className="page-description">Browse MCP servers by their primary use and domain.</p>
        </header>

        <ul className="category-list">
          {allCategories.map((cat) => (
            <li key={cat.slug}>
              <Link href={`/categories/${cat.slug}` as Route} className="category-row">
                <div>
                  <span className="category-row__name">{cat.name}</span>
                  {cat.description && (
                    <span className="category-row__description">{cat.description}</span>
                  )}
                </div>
                <span
                  data-count={cat.serverCount}
                  aria-label={`${cat.serverCount} server${cat.serverCount !== 1 ? "s" : ""}`}
                  className="count-badge"
                >
                  {cat.serverCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
