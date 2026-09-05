import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getDocsRoutesDocument } from "@/content/docs-routes";

export const metadata: Metadata = {
  title: "Site routes",
  description: "Access and search-index boundaries for The MCP Directory website routes.",
};

export default function DocsPage() {
  return <DocumentPage document={getDocsRoutesDocument()} />;
}