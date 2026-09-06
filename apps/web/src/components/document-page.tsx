import type { Route } from "next";
import Link from "next/link";
import type { ReleaseDocument } from "@/content/document-model";
import { LegalDraftBanner } from "@/components/legal-draft-banner";

export function DocumentPage({ document }: { document: ReleaseDocument }) {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container">
        {document.draftLabel ? <LegalDraftBanner label={document.draftLabel} /> : null}
        <header className="page-header">
          <h1 className="page-title">{document.title}</h1>
          <p className="page-description">{document.description}</p>
        </header>
        <div className="document-layout">
          <nav className="document-toc" aria-label={`On this page: ${document.title}`}>
            <p className="section-label">On this page</p>
            <ol>
              {document.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="document-content">
            {document.sections.map((section) => (
              <section key={section.id} aria-labelledby={section.id} className="document-section">
                <h2 id={section.id}>{section.heading}</h2>
                {section.body.map((paragraph, paragraphIndex) => (
                  <p key={`${section.id}-${paragraphIndex}`}>{paragraph}</p>
                ))}
                {section.links && section.links.length > 0 ? (
                  <ul className="document-links">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href as Route}>{link.label}</Link>
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
