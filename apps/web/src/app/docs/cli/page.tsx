import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getCliReferenceDocument } from "@/content/docs-cli";

export const metadata: Metadata = {
  title: "CLI Reference",
  description: "Commands, supported clients, and safe workflows for The MCP Directory CLI.",
};

export default function CliDocsPage() {
  return <DocumentPage document={getCliReferenceDocument()} />;
}
