import type { ReleaseDocument } from "@/content/document-model";

export function getAdvertiseDocument(): ReleaseDocument {
  return {
    title: "Advertising status",
    description: "Current availability and policy boundaries for paid placements.",
    sections: [
      {
        id: "launch-status",
        heading: "Launch status",
        body: [
          "The launch release does not accept paid campaigns, sponsored placements, or advertising enquiries. No advertising product or booking process is available.",
        ],
      },
      {
        id: "future-policy",
        heading: "Future policy",
        body: [
          "Any future sponsorship must be clearly labelled and remain separate from organic ranking and trust state.",
          "Payment must never alter verification status, health observations, security information, or the factual provenance of a listing.",
        ],
      },
    ],
  };
}