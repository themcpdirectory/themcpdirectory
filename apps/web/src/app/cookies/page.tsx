import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getCookieDraftDocument } from "@/content/legal";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Cookie policy",
  description: "How The MCP Directory uses strictly necessary browser storage.",
  path: "/cookies",
  index: true,
});

export default function CookiePolicyPage() {
  return <DocumentPage document={getCookieDraftDocument()} />;
}
