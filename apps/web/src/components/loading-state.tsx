export function LoadingState({ withinMain = false }: { withinMain?: boolean }) {
  const Container = withinMain ? "div" : "main";

  return (
    <Container
      {...(!withinMain && { id: "main-content", tabIndex: -1, "aria-label": "Loading" })}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p
        style={{ color: "var(--fg-muted)", fontSize: "0.875rem" }}
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        Loading…
      </p>
    </Container>
  );
}
