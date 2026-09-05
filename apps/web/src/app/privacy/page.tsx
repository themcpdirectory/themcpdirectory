import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getPrivacyDraftDocument } from "@/content/legal";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "Draft privacy information for The MCP Directory.",
};

export default function PrivacyPage() {
  return <DocumentPage document={getPrivacyDraftDocument()} />;
}