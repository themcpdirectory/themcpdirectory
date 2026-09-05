import type { ReleaseDocument } from "@/content/document-model";
import { LegalDraftBanner } from "@/components/legal-draft-banner";

export function DocumentPage({ document }: { document: ReleaseDocument }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ minHeight: "100vh", padding: "2.5rem 1rem 4rem" }}
    >
      <div style={{ maxWidth: "48rem", margin: "0 auto" }}>
        {document.draftLabel ? <LegalDraftBanner label={document.draftLabel} /> : null}
        <article>
          <h1
            style={{
              margin: "0 0 0.75rem",
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              lineHeight: 1.15,
            }}
          >
            {document.title}
          </h1>
          <p style={{ margin: "0 0 2rem", color: "var(--fg-muted)", fontSize: "1rem" }}>
            {document.description}
          </p>
          {document.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id} style={{ marginTop: "2rem" }}>
              <h2 id={section.id} style={{ margin: "0 0 0.75rem", fontSize: "1.125rem" }}>
                {section.heading}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  style={{ margin: "0 0 1rem", color: "var(--fg-muted)", overflowWrap: "anywhere" }}
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}