import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getDocsRoutesDocument } from "@/content/docs-routes";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Site routes",
  description: "Access and search-index boundaries for The MCP Directory website routes.",
  path: "/docs",
  index: true,
});

export default function DocsPage() {
  return <DocumentPage document={getDocsRoutesDocument()} />;
}
