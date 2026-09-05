import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { getAdvertiseDocument } from "@/content/advertise";

export const metadata: Metadata = {
  title: "Advertising status",
  description: "Current advertising availability and policy boundaries.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdvertisePage() {
  return <DocumentPage document={getAdvertiseDocument()} />;
}