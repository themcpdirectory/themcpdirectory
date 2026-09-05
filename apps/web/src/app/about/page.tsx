import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getAboutDocument } from "@/content/about";

export const metadata: Metadata = {
  title: "About",
  description: "The purpose, principles, and operator of The MCP Directory.",
};

export default function AboutPage() {
  return <DocumentPage document={getAboutDocument()} />;
}