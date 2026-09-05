import type { ReleaseDocument } from "@/content/document-model";

export function getPublishDocument(): ReleaseDocument {
  return {
    title: "Publish a server",
    description: "How a server enters the directory and how publisher authority is verified.",
    sections: [
      {
        id: "registry",
        heading: "Publish through the Registry",
        body: [
          "The Official MCP Registry is the primary source of server listings. Publish and maintain your server there according to the Registry's own requirements; The MCP Directory does not provide a separate listing-upload form.",
          "The Directory periodically imports Registry records into a normalized local mirror. Publication upstream does not promise immediate appearance here, and a record removed upstream is retained only with a clear deleted_upstream warning.",
        ],
      },
      {
        id: "claim",
        heading: "Claim the imported listing",
        body: [
          "After the listing and its GitHub repository identity appear in the Directory, an owner or admin of an existing publisher membership can sign in with GitHub and use the publisher dashboard to create a repository or organization claim.",
          "The service contract supports a membership-free bootstrap claim for its original requester, but the current public dashboard does not expose that starting path. A new publisher without an existing membership cannot complete a self-service claim from this page today.",
          "Claim verification uses a separate GitHub App authorization flow. It verifies authority over the listing's repository identity; GitHub sign-in alone does not grant publisher access.",
        ],
      },
      {
        id: "verification",
        heading: "Verification and ranking",
        body: [
          "Verification cannot be purchased. It records accepted authority evidence and is not a security certification or endorsement.",
          "Payment does not change organic search ranking, verification state, health information, or security information.",
        ],
      },
      {
        id: "publisher-tools",
        heading: "Publisher tools",
        body: [
          "Publisher members can use role-scoped dashboard tools to inspect listings and manage claims or memberships when their role permits it.",
          "Account export includes account audit summaries. Export and erasure are available from the publisher account workflow; active legal holds or publisher ownership responsibilities can delay erasure.",
        ],
      },
    ],
  };
}