import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getTermsDraftDocument } from "@/content/legal";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Terms of service",
  description: "Draft terms for The MCP Directory.",
  path: "/terms",
  index: true,
});

export default function TermsPage() {
  return <DocumentPage document={getTermsDraftDocument()} />;
}
