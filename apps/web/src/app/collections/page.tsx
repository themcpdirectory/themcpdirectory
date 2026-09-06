import type { Metadata } from "next";
import Link from "next/link";
import { buildDocumentMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Collections",
  description:
    "Browse goal-oriented MCP server collections as the directory discovery surfaces expand.",
  path: "/collections",
  index: true,
});

export default function CollectionsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow page-container--reading">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>Collections</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">Collections</h1>
          <p className="page-description">
            Goal-oriented server collections are landing next. Browse the directory today through
            search while the curated inclusion rules are wired into this surface.
          </p>
        </header>
      </div>
    </main>
  );
}
