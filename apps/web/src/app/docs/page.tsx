import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import type { ReleaseDocument } from "@/content/document-model";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Documentation for The MCP Directory.",
};

const DOCUMENTATION: ReleaseDocument = {
  title: "Documentation",
  description: "Guides and reference material for The MCP Directory.",
  sections: [],
};

export default function DocsPage() {
  return <DocumentPage document={DOCUMENTATION} />;
}