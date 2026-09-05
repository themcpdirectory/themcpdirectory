import { errorResponseSchema, PUBLIC_API_ERROR_DEFINITIONS } from "./errors.js";
import { listingStatusSchema } from "./servers.js";
import { PUBLIC_API_PAGINATION } from "./shared.js";

const example = errorResponseSchema.parse({
  error: {
    code: "RATE_LIMITED",
    message: PUBLIC_API_ERROR_DEFINITIONS.RATE_LIMITED.message,
    requestId: "req_example_001",
  },
});

export const PUBLIC_API_DOCUMENTATION = {
  envelopes: {
    resource: ["data", "meta.requestId"],
    collection: ["data[]", "meta.requestId", "meta.nextCursor"],
    error: ["error.code", "error.message", "error.requestId", "error.details[]?"],
  },
  pagination: PUBLIC_API_PAGINATION,
  rateLimit: {
    status: PUBLIC_API_ERROR_DEFINITIONS.RATE_LIMITED.status,
    code: "RATE_LIMITED",
    retryAfterHeader: "Retry-After",
    quota: "configuration-dependent",
  },
  listingStatuses: listingStatusSchema.options,
  upstreamDeletion: {
    listingStatus: listingStatusSchema.parse("deleted_upstream"),
    installError: {
      code: "UPSTREAM_DELETED",
      ...PUBLIC_API_ERROR_DEFINITIONS.UPSTREAM_DELETED,
    },
  },
  example,
  installSafety: {
    urlProtocols: ["http", "https"],
    packageVersions: "exact immutable versions only",
    environmentValues: "references only; secret values are never returned",
  },
} as const;

export type PublicApiDocumentation = typeof PUBLIC_API_DOCUMENTATION;
