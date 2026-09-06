export function LoadingState({ withinMain = false }: { withinMain?: boolean }) {
  const Container = withinMain ? "div" : "main";

  return (
    <Container
      {...(!withinMain && { id: "main-content", tabIndex: -1, "aria-label": "Loading" })}
      className="status-layout"
    >
      <p className="page-description" role="status" aria-busy="true" aria-live="polite">
        Loading…
      </p>
    </Container>
  );
}
