import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getImprintDraftDocument } from "@/content/legal";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Operator information",
  description: "Organisation and publication information for The MCP Directory.",
  path: "/imprint",
  index: true,
});

export default function ImprintPage() {
  return <DocumentPage document={getImprintDraftDocument()} />;
}
