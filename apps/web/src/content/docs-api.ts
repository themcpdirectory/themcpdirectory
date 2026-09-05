import {
  apiErrorCodeSchema,
  createPublicApiOpenApiDocument,
  listingStatusSchema,
  PUBLIC_API_DOCUMENTATION,
  PUBLIC_API_ERROR_DEFINITIONS,
} from "@themcpdirectory/api-contract";
import type { ReleaseDocument } from "@/content/document-model";

const openApi = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");

function formatRoutePath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ":$1");
}

export const PUBLIC_API_DOC_ROUTES = Object.entries(openApi.paths ?? {}).flatMap(
  ([path, methods]) =>
    Object.keys(methods ?? {}).map((method) => `${method.toUpperCase()} ${formatRoutePath(path)}`),
);

const errorFacts = apiErrorCodeSchema.options.map((code) => {
  const definition = PUBLIC_API_ERROR_DEFINITIONS[code];
  return `${definition.status} ${code}: ${definition.message}`;
});

const envelopeFacts = [
  `Resource: ${PUBLIC_API_DOCUMENTATION.envelopes.resource.join("; ")}.`,
  `Collection: ${PUBLIC_API_DOCUMENTATION.envelopes.collection.join("; ")}.`,
  `Error: ${PUBLIC_API_DOCUMENTATION.envelopes.error.join("; ")}.`,
];

const paginationFacts = [
  `limit defaults to ${PUBLIC_API_DOCUMENTATION.pagination.defaultLimit}; minimum ${PUBLIC_API_DOCUMENTATION.pagination.minimumLimit}; maximum ${PUBLIC_API_DOCUMENTATION.pagination.maximumLimit}.`,
  `cursor is opaque, optional, and at most ${PUBLIC_API_DOCUMENTATION.pagination.maximumCursorLength} characters.`,
];

const rateLimitFacts = [
  `${PUBLIC_API_DOCUMENTATION.rateLimit.status} ${PUBLIC_API_DOCUMENTATION.rateLimit.code}: ${PUBLIC_API_ERROR_DEFINITIONS.RATE_LIMITED.message}.`,
  `${PUBLIC_API_DOCUMENTATION.rateLimit.retryAfterHeader} reports seconds until retry; quota is ${PUBLIC_API_DOCUMENTATION.rateLimit.quota}.`,
];

const installSafetyFacts = [
  `Install URLs allow only ${PUBLIC_API_DOCUMENTATION.installSafety.urlProtocols.join(" and ")}.`,
  `Package versions must be ${PUBLIC_API_DOCUMENTATION.installSafety.packageVersions}.`,
  `Environment variable metadata contains ${PUBLIC_API_DOCUMENTATION.installSafety.environmentValues}.`,
];

const upstreamDeletion = PUBLIC_API_DOCUMENTATION.upstreamDeletion;

export function getApiReferenceDocument(): ReleaseDocument & { readonly openApi: typeof openApi } {
  return {
    title: "Public API Reference",
    description:
      "Versioned read-only routes, envelopes, pagination, rate limits, and install-manifest rules.",
    sections: [
      {
        id: "response-envelopes",
        heading: "Response envelopes",
        body: envelopeFacts,
      },
      { id: "routes", heading: "Routes", body: PUBLIC_API_DOC_ROUTES },
      { id: "pagination", heading: "Pagination", body: paginationFacts },
      { id: "errors", heading: "Errors", body: errorFacts },
      { id: "rate-limits", heading: "Rate limits", body: rateLimitFacts },
      {
        id: "example",
        heading: "Example",
        body: [JSON.stringify(PUBLIC_API_DOCUMENTATION.example, null, 2)],
      },
      { id: "install-safety", heading: "Install safety", body: installSafetyFacts },
      {
        id: "listing-statuses",
        heading: "Listing statuses",
        body: listingStatusSchema.options,
      },
      {
        id: "deletion",
        heading: "Upstream deletion",
        body: [
          `${upstreamDeletion.listingStatus} listings return ${upstreamDeletion.installError.status} ${upstreamDeletion.installError.code} for install requests.`,
        ],
      },
    ],
    openApi,
  };
}
