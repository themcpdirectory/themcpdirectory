import type { Route } from "next";
import Link from "next/link";
import type { ReleaseDocument } from "@/content/document-model";
import { LegalDraftBanner } from "@/components/legal-draft-banner";

export function DocumentPage({ document }: { document: ReleaseDocument }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="document-page"
      style={{ minHeight: "100vh", padding: "2.5rem 1rem 4rem" }}
    >
      <div className="document-page__inner" style={{ maxWidth: "72rem", margin: "0 auto" }}>
        {document.draftLabel ? <LegalDraftBanner label={document.draftLabel} /> : null}
        <header style={{ maxWidth: "48rem", padding: "1rem 0 2rem" }}>
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
        </header>
        <div
          className="document-page__layout"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
            gap: "2.5rem clamp(2rem, 6vw, 6rem)",
            alignItems: "start",
          }}
        >
          <nav
            className="document-page__navigation"
            aria-label={`On this page: ${document.title}`}
            style={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            <p
              style={{
                margin: "0 0 0.75rem",
                color: "var(--fg)",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              On this page
            </p>
            <ol style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--fg-muted)" }}>
              {document.sections.map((section) => (
                <li
                  key={section.id}
                  style={{ minWidth: 0, marginBottom: "0.6rem", paddingLeft: "0.25rem" }}
                >
                  <a
                    href={`#${section.id}`}
                    style={{ color: "inherit", textDecorationThickness: 1 }}
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="document-page__article" style={{ minWidth: 0 }}>
            {document.sections.map((section) => (
              <section
                key={section.id}
                aria-labelledby={section.id}
                style={{ borderTop: "1px solid var(--border)", padding: "1.5rem 0 0.75rem" }}
              >
                <h2 id={section.id} style={{ margin: "0 0 0.75rem", fontSize: "1.125rem" }}>
                  {section.heading}
                </h2>
                {section.body.map((paragraph, paragraphIndex) => (
                  <p
                    key={`${section.id}-${paragraphIndex}`}
                    style={{
                      margin: "0 0 1rem",
                      color: "var(--fg-muted)",
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
                {section.links && section.links.length > 0 ? (
                  <ul
                    style={{
                      margin: "0 0 1rem",
                      padding: 0,
                      listStyle: "none",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}
                  >
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href as Route}
                          style={{ color: "var(--accent)", fontWeight: 600 }}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </div>
    </main>
  );
}
