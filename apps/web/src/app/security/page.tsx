import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getSecurityPolicyDocument } from "@/content/legal";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Security policy",
  description: "Vulnerability reporting and security boundaries for The MCP Directory.",
  path: "/security",
  index: true,
});

export default function SecurityPage() {
  return <DocumentPage document={getSecurityPolicyDocument()} />;
}
