import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "24rem" }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8125rem",
            color: "var(--fg-muted)",
            marginBottom: "0.5rem",
            letterSpacing: "0.06em",
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
          }}
        >
          Page not found
        </h1>
        <p style={{ color: "var(--fg-muted)", fontSize: "0.9375rem", marginBottom: "1.5rem" }}>
          The server or page you are looking for does not exist or has been removed.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "0.5rem 1.25rem",
            background: "var(--accent)",
            color: "var(--accent-fg)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Back to directory
        </Link>
      </div>
    </main>
  );
}
