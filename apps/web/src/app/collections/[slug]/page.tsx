import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollection } from "@themcpdirectory/domain";
import { ServerGrid } from "@/components/server-grid";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

function toSentenceFragment(rule: string): string {
  const normalizedRule = rule.trim();
  if (normalizedRule.length === 0) return normalizedRule;
  return `${normalizedRule.slice(0, 1).toLowerCase()}${normalizedRule.slice(1)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(getDb(), slug);

  if (!collection) {
    return { title: "Collection not found" };
  }

  return buildDocumentMetadata({
    title: collection.name,
    description: collection.description,
    path: `/collections/${collection.slug}`,
    index: true,
  });
}

export default async function CollectionDetailPage({ params }: Props) {
  const { slug } = await params;
  const collection = await getCollection(getDb(), slug, { pageSize: 24 });

  if (!collection) {
    notFound();
  }

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow page-container--reading">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/collections">Collections</Link>
          <span aria-hidden="true"> / </span>
          <span>{collection.name}</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">{collection.name}</h1>
          <p className="page-description">{collection.description}</p>
          <p className="page-description">
            This collection currently includes {toSentenceFragment(collection.inclusionRule)}
          </p>
          <p className="section-label">{collection.serverCount} servers</p>
        </header>

        <section aria-labelledby="collection-servers-heading" className="search-panel">
          <h2 id="collection-servers-heading" className="section-title">
            Current servers
          </h2>
          <ServerGrid
            servers={collection.items}
            emptyMessage="No servers currently satisfy this collection."
          />
        </section>
      </div>
    </main>
  );
}
