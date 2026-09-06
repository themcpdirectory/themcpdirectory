import type { Metadata } from "next";
import { getCategories } from "@themcpdirectory/domain";
import { CategoryCard } from "@/components/category-card";
import { SectionHeader } from "@/components/section-header";
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
  const activeCategories = allCategories.filter((category) => category.serverCount > 0);

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>Categories</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">Categories</h1>
          <p className="page-description">
            Browse categories with active public MCP server listings.
          </p>
        </header>

        <section className="search-panel">
          <SectionHeader
            title="Current categories"
            description="Only categories with one or more active public listings appear here."
          />

          <ul className="server-grid">
            {activeCategories.map((category) => (
              <li key={category.slug}>
                <CategoryCard category={category} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
