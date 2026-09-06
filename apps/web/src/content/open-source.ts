import type { ReleaseDocument } from "@/content/document-model";

export function getOpenSourceDocument(): ReleaseDocument {
  return {
    title: "Source and licensing",
    description: "Current licensing and contribution terms for the repository and published CLI.",
    sections: [
      {
        id: "repository-licence",
        heading: "Repository licence",
        body: [
          "No open-source licence has been selected yet.",
          "Source visibility does not by itself grant permission to copy, modify, or redistribute the repository. Wait for an explicit published licence before assuming those permissions.",
        ],
      },
      {
        id: "cli-package-licence",
        heading: "CLI package licence",
        body: [
          "The published @themcpdirectory/cli npm package declares the MIT licence.",
          "That package declaration applies to the files distributed in the CLI package. It does not imply that the repository as a whole has been released under the same terms.",
        ],
        links: [{ label: "CLI reference", href: "/docs/cli" }],
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
