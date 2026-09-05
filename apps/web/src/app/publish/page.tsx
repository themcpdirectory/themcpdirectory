import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getPublishDocument } from "@/content/publish";

export const metadata: Metadata = {
  title: "Publish a server",
  description: "Publish through the Official MCP Registry and verify publisher authority.",
};

export default function PublishPage() {
  return <DocumentPage document={getPublishDocument()} />;
}