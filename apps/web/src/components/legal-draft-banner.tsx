export function LegalDraftBanner({ label }: { label: string }) {
  return (
    <aside aria-label="Legal document status" className="legal-status-callout">
      <strong>{label}</strong>
    </aside>
  );
}
