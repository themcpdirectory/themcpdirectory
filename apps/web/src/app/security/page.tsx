import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getSecurityPolicyDocument } from "@/content/legal";

export const metadata: Metadata = {
  title: "Security policy",
  description: "Vulnerability reporting and security boundaries for The MCP Directory.",
};

export default function SecurityPage() {
  return <DocumentPage document={getSecurityPolicyDocument()} />;
}