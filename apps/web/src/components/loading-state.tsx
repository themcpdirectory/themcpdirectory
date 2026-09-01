export function LoadingState() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-label="Loading"
    >
      <p
        style={{ color: "var(--fg-muted)", fontSize: "0.875rem" }}
        aria-busy="true"
        aria-live="polite"
      >
        Loading…
      </p>
    </main>
  );
}
