import type { ReleaseDocument } from "@/content/document-model";
import { PUBLIC_SITE_ROUTE_REFERENCE } from "@/content/site-route-reference";

const ACCESS_DESCRIPTIONS = {
  anonymous: "Available without signing in.",
  authenticated: "Requires publisher authentication.",
} as const;

function getSectionId(path: string): string {
  if (path === "/") return "route-home";
  return `route-${path.slice(1).replaceAll("/", "-").replaceAll("[", "").replaceAll("]", "")}`;
}

export function getDocsRoutesDocument(): ReleaseDocument {
  return {
    title: "Site routes",
    description:
      "The shipped browsing and publisher route families, with their access and search-index boundaries.",
    sections: [
      {
        id: "access-boundary",
        heading: "Access boundary",
        body: [
          "Anonymous browsing remains available for discovering and evaluating MCP servers. Signing in is optional and is required only for publisher management routes.",
        ],
      },
      ...PUBLIC_SITE_ROUTE_REFERENCE.map((route) => ({
        id: getSectionId(route.path),
        heading: route.path,
        body: [
          `${route.title}. ${ACCESS_DESCRIPTIONS[route.auth]}`,
          route.index
            ? "Search indexing: included in the public index."
            : "Search indexing: excluded from the public index.",
        ],
      })),
    ],
  };
}