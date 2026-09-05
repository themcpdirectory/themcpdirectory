import { apiErrorCodeSchema, createPublicApiOpenApiDocument } from "@themcpdirectory/api-contract";
import type { ReleaseDocument } from "@/content/document-model";

const openApi = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");

function formatRoutePath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ":$1");
}

export const PUBLIC_API_DOC_ROUTES = Object.entries(openApi.paths ?? {}).flatMap(
  ([path, methods]) =>
    Object.keys(methods ?? {}).map((method) => `${method.toUpperCase()} ${formatRoutePath(path)}`),
);

export function getApiReferenceDocument(): ReleaseDocument & { readonly openApi: typeof openApi } {
  return {
    title: "Public API Reference",
    description:
      "Versioned read-only routes, envelopes, pagination, rate limits, and install-manifest rules.",
    sections: [
      {
        id: "routes",
        heading: "Routes",
        body: PUBLIC_API_DOC_ROUTES,
      },
      { id: "errors", heading: "Errors", body: apiErrorCodeSchema.options },
      {
        id: "deletion",
        heading: "Upstream deletion",
        body: [
          "deleted_upstream",
          "Install requests for upstream-deleted listings return HTTP 410.",
        ],
      },
    ],
    openApi,
  };
}
