import {
  errorResponseSchema,
  PUBLIC_API_ERROR_DEFINITIONS,
  PUBLIC_API_RATE_LIMIT_RESPONSE,
} from "./errors.js";
import { installManifestResponseSchema, PUBLIC_API_INSTALL_SAFETY } from "./install.js";
import {
  listingStatusSchema,
  resolveServerIdentifierResponseSchema,
  serverCollectionResponseSchema,
} from "./servers.js";
import { PUBLIC_API_PAGINATION } from "./shared.js";

const example = errorResponseSchema.parse({
  error: {
    code: "RATE_LIMITED",
    message: PUBLIC_API_ERROR_DEFINITIONS.RATE_LIMITED.message,
    requestId: "req_example_001",
  },
});

export const PUBLIC_API_SUCCESS_EXAMPLES = {
  collection: serverCollectionResponseSchema.parse({
    data: [
      {
        id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
        slug: "github",
        title: "GitHub",
        description: "Access GitHub repositories.",
        publisher: { slug: "github", name: "GitHub", verified: true },
        version: "1.2.3",
        repository: { url: "https://github.com/modelcontextprotocol/servers" },
        listingStatus: "active",
        signals: {
          officialRegistry: true,
          publisherVerified: true,
          sourceAvailable: true,
          openSource: true,
        },
      },
    ],
    meta: { requestId: "req_example_collection", nextCursor: null },
  }),
  resource: resolveServerIdentifierResponseSchema.parse({
    data: {
      id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      slug: "github",
      title: "GitHub",
      version: "1.2.3",
      canonicalUrl: "https://themcpdirectory.com/servers/github",
      matchedBy: "slug",
      matchedValue: "github",
      needsRedirect: false,
    },
    meta: { requestId: "req_example_resource" },
  }),
  install: installManifestResponseSchema.parse({
    data: {
      schemaVersion: 1,
      server: {
        id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
        slug: "github",
        title: "GitHub",
        version: "1.2.3",
      },
      provenance: {
        registry: "official",
        registryName: "Official MCP Registry",
        observedAt: "2026-09-01T12:00:00Z",
      },
      variants: [
        {
          id: "130dbf31-0f47-4cc7-8797-f1bcf47c3b80",
          kind: "remote",
          transport: "streamable-http",
          urlTemplate: "https://api.example.test/mcp",
          headers: [],
          variables: [],
        },
      ],
      compatibility: { vscode: "supported" },
    },
    meta: { requestId: "req_example_install" },
  }),
} as const;

export const PUBLIC_API_DOCUMENTATION = {
  envelopes: {
    resource: ["data", "meta.requestId"],
    collection: ["data[]", "meta.requestId", "meta.nextCursor"],
    error: ["error.code", "error.message", "error.requestId", "error.details[]?"],
  },
  pagination: PUBLIC_API_PAGINATION,
  rateLimit: PUBLIC_API_RATE_LIMIT_RESPONSE,
  listingStatuses: listingStatusSchema.options,
  upstreamDeletion: {
    listingStatus: listingStatusSchema.parse("deleted_upstream"),
    installError: {
      code: "UPSTREAM_DELETED",
      ...PUBLIC_API_ERROR_DEFINITIONS.UPSTREAM_DELETED,
    },
  },
  example,
  installSafety: PUBLIC_API_INSTALL_SAFETY,
} as const;

export type PublicApiDocumentation = typeof PUBLIC_API_DOCUMENTATION;
