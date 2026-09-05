import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getTrustDocument } from "@/content/docs-trust";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Trust and health",
  description: "Trust signals and remote health outcomes used by The MCP Directory.",
  path: "/docs/trust",
  index: true,
});

export default function TrustDocsPage() {
  return <DocumentPage document={getTrustDocument()} />;
}
