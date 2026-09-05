import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getCliReferenceDocument } from "@/content/docs-cli";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "CLI Reference",
  description: "Commands, supported clients, and safe workflows for The MCP Directory CLI.",
  path: "/docs/cli",
  index: true,
});

export default function CliDocsPage() {
  return <DocumentPage document={getCliReferenceDocument()} />;
}
