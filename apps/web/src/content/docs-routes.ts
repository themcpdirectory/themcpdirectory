import type { ReleaseDocument } from "@/content/document-model";
import { PUBLIC_SITE_ROUTE_REFERENCE } from "@/content/site-route-reference";

const ACCESS_DESCRIPTIONS = {
  available: {
    anonymous: "Access: available without signing in.",
    authenticated: "Access: requires publisher authentication.",
  },
  planned: {
    anonymous: "Access: anonymous access planned.",
    authenticated: "Access: publisher authentication planned.",
  },
} as const;

const AVAILABILITY_DESCRIPTIONS = {
  available: "Availability: available now.",
  planned: "Availability: planned; not yet available.",
} as const;

function getSectionId(path: string): string {
  if (path === "/") return "route-home";
  return `route-${path.slice(1).replaceAll("/", "-").replaceAll("[", "").replaceAll("]", "")}`;
}

export function getDocsRoutesDocument(): ReleaseDocument {
  return {
    title: "Site routes",
    description:
      "The current and planned browsing and publisher route families, with their availability, access, and search-index boundaries.",
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
          `${route.title}. ${ACCESS_DESCRIPTIONS[route.availability][route.auth]}`,
          route.availability === "planned"
            ? route.index
              ? "Search indexing: planned for inclusion in the public index."
              : "Search indexing: planned for exclusion from the public index."
            : route.index
              ? "Search indexing: included in the public index."
              : "Search indexing: excluded from the public index.",
          AVAILABILITY_DESCRIPTIONS[route.availability],
        ],
      })),
    ],
  };
}