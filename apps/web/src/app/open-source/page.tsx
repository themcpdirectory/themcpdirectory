import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getOpenSourceDocument } from "@/content/open-source";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Open source status",
  description: "Current licence and contribution status for The MCP Directory.",
  path: "/open-source",
  index: true,
});

export default function OpenSourcePage() {
  return <DocumentPage document={getOpenSourceDocument()} />;
}
