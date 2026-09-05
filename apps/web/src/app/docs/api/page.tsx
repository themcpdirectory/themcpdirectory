import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getApiReferenceDocument } from "@/content/docs-api";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Public API Reference",
  description: "Verified routes and contracts for The MCP Directory public API.",
  path: "/docs/api",
  index: true,
});

export default function ApiDocsPage() {
  return <DocumentPage document={getApiReferenceDocument()} />;
}
