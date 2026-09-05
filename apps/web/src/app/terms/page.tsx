import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getTermsDraftDocument } from "@/content/legal";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Draft terms for The MCP Directory.",
};

export default function TermsPage() {
  return <DocumentPage document={getTermsDraftDocument()} />;
}