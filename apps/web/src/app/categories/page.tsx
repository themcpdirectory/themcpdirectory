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
          <span>Categories</span>
        </nav>

        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            marginBottom: "1.5rem",
          }}
        >
          Categories
        </h1>

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
          {allCategories.map((cat) => (
            <li key={cat.slug}>
              <Link
                href={`/categories/${cat.slug}` as Route}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface)",
                  textDecoration: "none",
                  gap: "1rem",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9375rem",
                      color: "var(--fg)",
                      display: "block",
                    }}
                  >
                    {cat.name}
                  </span>
                  {cat.description && (
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--fg-muted)",
                        lineHeight: 1.4,
                        display: "block",
                        marginTop: "0.125rem",
                      }}
                    >
                      {cat.description}
                    </span>
                  )}
                </div>
                <span
                  data-count={cat.serverCount}
                  aria-label={`${cat.serverCount} server${cat.serverCount !== 1 ? "s" : ""}`}
                  style={{
                    fontSize: "0.75rem",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.125rem 0.5rem",
                    color: "var(--fg-muted)",
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                  }}
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
