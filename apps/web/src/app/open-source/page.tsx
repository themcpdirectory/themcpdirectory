import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getOpenSourceDocument } from "@/content/open-source";

export const metadata: Metadata = {
  title: "Open source status",
  description: "Current licence and contribution status for The MCP Directory.",
};

export default function OpenSourcePage() {
  return <DocumentPage document={getOpenSourceDocument()} />;
}