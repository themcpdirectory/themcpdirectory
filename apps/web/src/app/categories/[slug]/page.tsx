import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryServers, getCategories } from "@themcpdirectory/domain";
import { SectionHeader } from "@/components/section-header";
import { ServerGrid } from "@/components/server-grid";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();
  const cats = await getCategories(db);
  const cat = cats.find((c) => c.slug === slug);
  if (!cat || cat.serverCount === 0) return { title: "Category not found" };
  return buildDocumentMetadata({
    title: cat.name,
    description: cat.description ?? `MCP servers in the ${cat.name} category.`,
    path: `/categories/${cat.slug}`,
    index: true,
  });
}

export default async function CategoryDetailPage({ params }: Props) {
  const { slug } = await params;
  const db = getDb();
  const [servers, cats] = await Promise.all([
    getCategoryServers(db, { categorySlug: slug, limit: 50 }),
    getCategories(db),
  ]);

  const category = cats.find((c) => c.slug === slug);
  if (!category || category.serverCount === 0 || servers.length === 0) {
    notFound();
  }

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow page-container--reading">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/categories">Categories</Link>
          <span aria-hidden="true"> / </span>
          <span>{category.name}</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">{category.name}</h1>
          {category.description && <p className="page-description">{category.description}</p>}
          <p className="section-label">{category.serverCount} servers</p>
        </header>

        <section className="search-panel">
          <SectionHeader
            title="Current servers"
            description="These cards reflect the active public listings currently assigned to this category."
            action={
              <Link href={`/browse?category=${category.slug}`} className="home-action-link">
                Open in Browse
              </Link>
            }
          />

          <ServerGrid
            servers={servers}
            emptyMessage="No active public server listings are currently assigned to this category."
          />
        </section>
      </div>
    </main>
  );
}
