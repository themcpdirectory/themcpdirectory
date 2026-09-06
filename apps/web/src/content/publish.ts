import type { ReleaseDocument } from "@/content/document-model";

export function getPublishDocument(): ReleaseDocument {
  return {
    title: "Publish a server",
    description: "List through the Official MCP Registry, then verify publisher authority here.",
    sections: [
      {
        id: "registry",
        heading: "1. Publish through the Registry",
        body: [
          "Publish and maintain your server in the Official MCP Registry. The MCP Directory does not accept separate listing uploads.",
        ],
      },
      {
        id: "import",
        heading: "2. Wait for import",
        body: [
          "The Directory periodically imports Registry records into a normalized mirror. Publication upstream does not guarantee immediate appearance here.",
          "If a Registry record is removed later, its page remains only as a clearly marked deleted-upstream record.",
        ],
      },
      {
        id: "claim",
        heading: "3. Claim the listing",
        body: [
          "After the listing and its GitHub repository identity appear, eligible publisher members can sign in with GitHub and create a repository or organization claim from the dashboard.",
          "New publishers without an existing membership cannot complete a self-service bootstrap claim yet. The dashboard states this limitation rather than accepting an incomplete request.",
        ],
        links: [{ label: "Open publisher dashboard", href: "/dashboard" }],
      },
      {
        id: "verification",
        heading: "4. Verify authority",
        body: [
          "Claim verification uses a separate GitHub App authorization flow. GitHub sign-in alone does not grant publisher access.",
          "Verification records accepted authority evidence. It is not a security certification, endorsement, paid placement, or ranking advantage.",
        ],
      },
    ],
  };
}
