import Link from "next/link";
import type { Route } from "next";
import type { DirectoryServerListing } from "@themcpdirectory/domain";

interface ServerCardProps {
  server: DirectoryServerListing;
}

export function ServerCard({ server }: ServerCardProps) {
  return (
    <article
      aria-label={server.title}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        padding: "0.875rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        transition: "border-color 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link
          href={`/${server.slug}` as Route}
          style={{
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          {server.title}
        </Link>
        {server.isOfficialRegistry && (
          <span
            title="Official Registry listing"
            style={{
              fontSize: "0.6875rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0 0.35rem",
              color: "var(--fg-muted)",
              lineHeight: "1.5",
              fontFamily: "var(--font-mono)",
            }}
          >
            official
          </span>
        )}
      </div>

      <p
        style={{
          fontSize: "0.8125rem",
          color: "var(--fg-muted)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {server.shortDescription}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
        {server.publisherDisplayName && (
          <span style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
            {server.publisherDisplayName}
          </span>
        )}
        {server.categorySlugs.slice(0, 2).map((cat) => (
          <Link
            key={cat}
            href={`/categories/${cat}` as Route}
            style={{
              fontSize: "0.6875rem",
              padding: "0 0.4rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              color: "var(--fg-muted)",
              textDecoration: "none",
              border: "1px solid var(--border)",
            }}
          >
            {cat}
          </Link>
        ))}
      </div>
    </article>
  );
}
