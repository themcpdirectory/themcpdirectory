export function LegalDraftBanner({ label }: { label: string }) {
  return (
    <aside
      aria-label="Legal document status"
      style={{
        marginBottom: "1.5rem",
        padding: "0.875rem 1rem",
        border: "1px solid var(--warn-fg)",
        borderRadius: "var(--radius-md)",
        background: "var(--warn-bg)",
        color: "var(--fg)",
        overflowWrap: "anywhere",
      }}
    >
      <strong style={{ color: "var(--warn-fg)" }}>{label}</strong>
    </aside>
  );
}
