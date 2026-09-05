import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getPublisherDocument } from "@/content/docs-publishers";

export const metadata: Metadata = {
  title: "Publisher reference",
  description: "Publisher roles, claims, account export, and account erasure.",
};

export default function PublisherDocsPage() {
  return <DocumentPage document={getPublisherDocument()} />;
}