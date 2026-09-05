import type { ReleaseDocument } from "@/content/document-model";

export function getOpenSourceDocument(): ReleaseDocument {
  return {
    title: "Open source status",
    description: "Current licence and contribution status for The MCP Directory repository.",
    sections: [
      {
        id: "licence",
        heading: "Licence",
        body: [
          "No open-source licence has been selected yet.",
          "Source visibility does not by itself grant permission to copy, modify, or redistribute the repository. Wait for an explicit published licence before assuming those permissions.",
        ],
      },
      {
        id: "contributions",
        heading: "Contributions",
        body: [
          "External code contributions are paused until contribution terms exist. Do not open a pull request unless a maintainer has invited the contribution.",
          "The repository contribution guide applies to maintainers and invited contributors.",
        ],
      },
      {
        id: "security-reports",
        heading: "Security reports",
        body: [
          "Security reports remain welcome through the private process described on the Security policy page. Do not disclose vulnerability details in a public contribution.",
        ],
      },
    ],
  };
}