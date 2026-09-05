import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { HealthCheckOutcomeSchema, RemoteHealthObservationV1Schema } from "./health.js";
import {
  categoryDetailResponseSchema,
  categoriesCollectionResponseSchema,
  clientDetailResponseSchema,
  clientPathParamsSchema,
  clientsCollectionResponseSchema,
  discoveryPageQuerySchema,
  publisherDetailResponseSchema,
} from "./discovery.js";
import { errorResponseSchema, PUBLIC_API_ERROR_DEFINITIONS, type ApiErrorCode } from "./errors.js";
import {
  InstallAvailabilitySchema,
  installManifestQuerySchema,
  installManifestResponseSchema,
} from "./install.js";
import {
  resolveServerIdentifierResponseSchema,
  searchCollectionQuerySchema,
  serverCollectionQuerySchema,
  serverCollectionResponseSchema,
  serverDetailResponseSchema,
} from "./servers.js";
import { httpUrlSchema, identifierPathParamsSchema, slugPathParamsSchema } from "./shared.js";
import { TrustProfileV1Schema, TrustSignalKeySchema, TrustSignalStateSchema } from "./trust.js";

extendZodWithOpenApi(z);

type OpenAPIObject = ReturnType<OpenApiGeneratorV31["generateDocument"]>;

function createErrorResponse(
  errorResponse: typeof errorResponseSchema,
  codes: readonly ApiErrorCode[],
  includeRetryAfter = false,
) {
  const statuses = new Set(codes.map((code) => PUBLIC_API_ERROR_DEFINITIONS[code].status));
  if (statuses.size !== 1) {
    throw new Error("OpenAPI error responses must group codes with the same HTTP status");
  }

  return {
    description: codes
      .map((code) => {
        const definition = PUBLIC_API_ERROR_DEFINITIONS[code];
        return `${definition.status} ${code}: ${definition.message}`;
      })
      .join("; "),
    ...(includeRetryAfter
      ? {
          headers: {
            "Retry-After": {
              description: "Seconds until the caller may retry.",
              schema: { type: "integer" as const, minimum: 1 },
            },
          },
        }
      : {}),
    content: { "application/json": { schema: errorResponse } },
  };
}

export function createPublicApiOpenApiDocument(baseUrl: string): OpenAPIObject {
  const validatedBaseUrl = httpUrlSchema.parse(baseUrl);
  const registry = new OpenAPIRegistry();

  const slugPathParams = slugPathParamsSchema.extend({
    slug: slugPathParamsSchema.shape.slug.meta({ param: { in: "path", name: "slug" } }),
  });
  const clientPathParams = clientPathParamsSchema.extend({
    id: clientPathParamsSchema.shape.id.meta({ param: { in: "path", name: "id" } }),
  });
  const identifierPathParams = identifierPathParamsSchema.extend({
    identifier: identifierPathParamsSchema.shape.identifier.meta({
      param: { in: "path", name: "identifier" },
    }),
  });

  const serverCollectionResponse = serverCollectionResponseSchema.meta({
    id: "ServerCollectionResponse",
  });
  const serverDetailResponse = serverDetailResponseSchema.meta({
    id: "ServerDetailResponse",
    description: "Server detail with additive trust, health, and install availability fields.",
  });
  const resolvedServerResponse = resolveServerIdentifierResponseSchema.meta({
    id: "ResolvedServerResponse",
  });
  const installManifestResponse = installManifestResponseSchema.meta({
    id: "InstallManifestResponse",
    description: "Install manifest with optional trust, health, and availability metadata.",
  });
  const categoriesCollectionResponse = categoriesCollectionResponseSchema.meta({
    id: "CategoriesCollectionResponse",
  });
  const categoryDetailResponse = categoryDetailResponseSchema.meta({
    id: "CategoryDetailResponse",
  });
  const publisherDetailResponse = publisherDetailResponseSchema.meta({
    id: "PublisherDetailResponse",
  });
  const clientsCollectionResponse = clientsCollectionResponseSchema.meta({
    id: "ClientsCollectionResponse",
  });
  const clientDetailResponse = clientDetailResponseSchema.meta({
    id: "ClientDetailResponse",
  });
  const errorResponse = errorResponseSchema.meta({
    id: "ErrorResponse",
    description: "Fail-closed public error envelope.",
  });
  const validationError = createErrorResponse(errorResponse, ["VALIDATION_ERROR"]);
  const invalidCollectionRequest = createErrorResponse(errorResponse, [
    "VALIDATION_ERROR",
    "CURSOR_INVALID",
  ]);
  const notFoundError = createErrorResponse(errorResponse, ["SERVER_NOT_FOUND"]);
  const ambiguousServerError = createErrorResponse(errorResponse, ["AMBIGUOUS_SERVER"]);
  const installGoneError = createErrorResponse(errorResponse, [
    "INSTALL_UNAVAILABLE",
    "UPSTREAM_DELETED",
  ]);
  const rateLimitedError = createErrorResponse(errorResponse, ["RATE_LIMITED"], true);
  const internalError = createErrorResponse(errorResponse, ["INTERNAL_ERROR"]);
  const commonErrors = { 429: rateLimitedError, 500: internalError };

  registry.registerPath({
    method: "get",
    path: "/api/v1/categories",
    responses: {
      200: {
        description: "Category collection",
        content: { "application/json": { schema: categoriesCollectionResponse } },
      },
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/categories/{slug}",
    request: { params: slugPathParams, query: discoveryPageQuerySchema },
    responses: {
      200: {
        description: "Category detail",
        content: { "application/json": { schema: categoryDetailResponse } },
      },
      400: invalidCollectionRequest,
      404: notFoundError,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/clients",
    responses: {
      200: {
        description: "Client collection",
        content: { "application/json": { schema: clientsCollectionResponse } },
      },
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/clients/{id}",
    request: { params: clientPathParams, query: discoveryPageQuerySchema },
    responses: {
      200: {
        description: "Client detail",
        content: { "application/json": { schema: clientDetailResponse } },
      },
      400: invalidCollectionRequest,
      404: notFoundError,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/publishers/{slug}",
    request: { params: slugPathParams, query: discoveryPageQuerySchema },
    responses: {
      200: {
        description: "Publisher detail",
        content: { "application/json": { schema: publisherDetailResponse } },
      },
      400: invalidCollectionRequest,
      404: notFoundError,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/resolve/{identifier}",
    request: { params: identifierPathParams },
    responses: {
      200: {
        description: "Resolved server",
        content: { "application/json": { schema: resolvedServerResponse } },
      },
      400: validationError,
      404: notFoundError,
      409: ambiguousServerError,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/resolve/{identifier}/install",
    request: { params: identifierPathParams, query: installManifestQuerySchema },
    responses: {
      200: {
        description: "Install manifest via resolution",
        content: { "application/json": { schema: installManifestResponse } },
      },
      400: validationError,
      404: notFoundError,
      409: ambiguousServerError,
      410: installGoneError,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/search",
    request: { query: searchCollectionQuerySchema },
    responses: {
      200: {
        description: "Search projection",
        content: { "application/json": { schema: serverCollectionResponse } },
      },
      400: invalidCollectionRequest,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/servers",
    request: { query: serverCollectionQuerySchema },
    responses: {
      200: {
        description: "Server collection",
        content: { "application/json": { schema: serverCollectionResponse } },
      },
      400: invalidCollectionRequest,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/servers/{slug}",
    request: { params: slugPathParams },
    responses: {
      200: {
        description: "Server detail",
        content: { "application/json": { schema: serverDetailResponse } },
      },
      400: validationError,
      404: notFoundError,
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/servers/{slug}/install",
    request: { params: slugPathParams, query: installManifestQuerySchema },
    responses: {
      200: {
        description: "Install manifest",
        content: { "application/json": { schema: installManifestResponse } },
      },
      400: validationError,
      404: notFoundError,
      410: installGoneError,
      ...commonErrors,
    },
  });

  const generator = new OpenApiGeneratorV31([
    ...registry.definitions,
    { type: "schema", schema: TrustSignalStateSchema },
    { type: "schema", schema: TrustSignalKeySchema },
    { type: "schema", schema: TrustProfileV1Schema },
    { type: "schema", schema: HealthCheckOutcomeSchema },
    { type: "schema", schema: RemoteHealthObservationV1Schema },
    { type: "schema", schema: InstallAvailabilitySchema },
  ]);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: { title: "The MCP Directory Public API", version: "1.0.0" },
    servers: [{ url: validatedBaseUrl }],
  });
}
