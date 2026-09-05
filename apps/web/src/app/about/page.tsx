import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getAboutDocument } from "@/content/about";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "About",
  description: "The purpose, principles, and operator of The MCP Directory.",
  path: "/about",
  index: true,
});

export default function AboutPage() {
  return <DocumentPage document={getAboutDocument()} />;
}
