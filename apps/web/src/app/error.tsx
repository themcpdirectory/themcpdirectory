"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      role="main"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "24rem" }}>
        <h1 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Something went wrong
        </h1>
        <p style={{ color: "var(--fg-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          An unexpected error occurred. Please try again.
        </p>
        <div
          style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}
        >
          <button
            type="button"
            onClick={retry}
            style={{
              padding: "0.5rem 1.25rem",
              background: "var(--accent)",
              color: "var(--accent-fg)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              padding: "0.5rem 1.25rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              color: "var(--fg)",
              fontSize: "0.875rem",
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
