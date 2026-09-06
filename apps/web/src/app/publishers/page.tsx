import type { Metadata } from "next";
import { getPublicPublishers } from "@themcpdirectory/domain";
import Link from "next/link";
import { PublisherCard } from "@/components/publisher-card";
import { SectionHeader } from "@/components/section-header";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Publishers",
  description: "Browse verified publishers with active public MCP server listings.",
  path: "/publishers",
  index: true,
});

export default async function PublishersPage() {
  const publishers = await getPublicPublishers(getDb());

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>Publishers</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">Publishers</h1>
          <p className="page-description">
            Only verified publishers with at least one active public listing appear here.
          </p>
        </header>

        <section className="search-panel">
          <SectionHeader
            title="Verified publishers"
            description="Publisher cards reflect stored verification state, website metadata, and active public listing counts."
          />

          {publishers.length > 0 ? (
            <ul className="server-grid">
              {publishers.map((publisher) => (
                <li key={publisher.slug}>
                  <PublisherCard publisher={publisher} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="directory-empty-state">
              No verified public publishers are currently listed.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
