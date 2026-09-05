import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getPublisherDocument } from "@/content/docs-publishers";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Publisher reference",
  description: "Publisher roles, claims, account export, and account erasure.",
  path: "/docs/publishers",
  index: true,
});

export default function PublisherDocsPage() {
  return <DocumentPage document={getPublisherDocument()} />;
}
