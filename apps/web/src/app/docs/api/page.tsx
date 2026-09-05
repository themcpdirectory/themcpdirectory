import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getApiReferenceDocument } from "@/content/docs-api";

export const metadata: Metadata = {
  title: "Public API Reference",
  description: "Verified routes and contracts for The MCP Directory public API.",
};

export default function ApiDocsPage() {
  return <DocumentPage document={getApiReferenceDocument()} />;
}
