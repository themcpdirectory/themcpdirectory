import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getOpenSourceDocument } from "@/content/open-source";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Source and licensing",
  description: "Current repository and CLI package licensing terms for The MCP Directory.",
  path: "/open-source",
  index: true,
});

export default function OpenSourcePage() {
  return <DocumentPage document={getOpenSourceDocument()} />;
}
