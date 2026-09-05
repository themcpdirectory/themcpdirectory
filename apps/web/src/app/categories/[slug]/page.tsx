import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryServers, getCategories } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";
import { ServerCard } from "@/components/server-card";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();
  const cats = await getCategories(db);
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) return { title: "Category not found" };
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
  if (!category) {
    notFound();
  }

  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <nav
          aria-label="Breadcrumb"
          style={{ marginBottom: "1rem", fontSize: "0.8125rem", color: "var(--fg-muted)" }}
        >
          <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
            The MCP Directory
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/categories" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Categories
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{category.name}</span>
        </nav>

        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            marginBottom: category.description ? "0.5rem" : "1.25rem",
          }}
        >
          {category.name}
        </h1>

        {category.description && (
          <p style={{ color: "var(--fg-muted)", fontSize: "0.9375rem", marginBottom: "1.5rem" }}>
            {category.description}
          </p>
        )}

        {servers.length === 0 ? (
          <p style={{ color: "var(--fg-muted)" }}>No servers in this category yet.</p>
        ) : (
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
        )}
      </div>
    </main>
  );
}
