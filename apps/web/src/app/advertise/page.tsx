import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getAdvertiseDocument } from "@/content/advertise";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Advertising status",
  description: "Current advertising availability and policy boundaries.",
  path: "/advertise",
  index: false,
});

export default function AdvertisePage() {
  return <DocumentPage document={getAdvertiseDocument()} />;
}
