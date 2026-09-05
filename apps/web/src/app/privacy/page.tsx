import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getPrivacyDraftDocument } from "@/content/legal";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Privacy notice",
  description: "Draft privacy information for The MCP Directory.",
  path: "/privacy",
  index: true,
});

export default function PrivacyPage() {
  return <DocumentPage document={getPrivacyDraftDocument()} />;
}
