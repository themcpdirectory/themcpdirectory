import type { ReleaseDocument } from "@/content/document-model";

export function getAboutDocument(): ReleaseDocument {
  return {
    title: "About The MCP Directory",
    description: "A public discovery, trust, and installation layer for MCP servers.",
    sections: [
      {
        id: "purpose",
        heading: "Purpose",
        body: [
          "The MCP Directory helps people find, assess, and install Model Context Protocol servers. Public browsing does not require an account.",
          "The service combines records from the Official MCP Registry with independently observed repository, trust, and health facts while preserving source and observation context.",
        ],
      },
      {
        id: "principles",
        heading: "Principles",
        body: [
          "Search ranking is organic. Payment does not change ranking, verification state, health information, or security information.",
          "Trust evidence remains explainable and does not become an aggregate score, certification, or endorsement.",
        ],
      },
      {
        id: "publisher-platform",
        heading: "Publisher platform",
        body: [
          "Optional GitHub sign-in gives authorized publishers tools to claim listings, manage members, inspect audit history, export account data, and request account erasure.",
          "GitHub sign-in establishes identity only. Publisher authority is verified separately through the project's GitHub App workflow.",
        ],
      },
      {
        id: "operator",
        heading: "Operator",
        body: ["The MCP Directory is operated by Estopia Engineering Ltd in Scotland."],
      },
    ],
  };
}
