import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getTrustDocument } from "@/content/docs-trust";

export const metadata: Metadata = {
  title: "Trust and health",
  description: "Trust signals and remote health outcomes used by The MCP Directory.",
};

export default function TrustDocsPage() {
  return <DocumentPage document={getTrustDocument()} />;
}