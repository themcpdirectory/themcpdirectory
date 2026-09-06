import type { Metadata } from "next";
import { getVisibleCollections } from "@themcpdirectory/domain";
import { CollectionCard } from "@/components/collection-card";
import { SectionHeader } from "@/components/section-header";
import { getDb } from "@/lib/db";
import Link from "next/link";
import { buildDocumentMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Collections",
  description:
    "Goal-oriented MCP server collections assembled from current public directory facts.",
  path: "/collections",
  index: true,
});

export default async function CollectionsPage() {
  const collections = await getVisibleCollections(getDb());

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>Collections</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">Collections</h1>
          <p className="page-description">
            Collections are assembled from current public directory facts. Open any collection to
            inspect its current inclusion rule and server membership.
          </p>
        </header>

        <section aria-labelledby="collections-list-heading" className="search-panel">
          <SectionHeader
            title="Current collections"
            description="Each collection updates from the same public directory facts used across the site."
          />

          <h2 id="collections-list-heading" className="sr-only">
            Current collections
          </h2>

          <ul className="server-grid">
            {collections.map((collection) => (
              <li key={collection.slug}>
                <CollectionCard collection={collection} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
