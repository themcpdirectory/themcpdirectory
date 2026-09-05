import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getPublishDocument } from "@/content/publish";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Publish a server",
  description: "Publish through the Official MCP Registry and verify publisher authority.",
  path: "/publish",
  index: true,
});

export default function PublishPage() {
  return <DocumentPage document={getPublishDocument()} />;
}
