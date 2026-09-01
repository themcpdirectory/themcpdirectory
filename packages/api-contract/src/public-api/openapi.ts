import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  categoryDetailResponseSchema,
  categoriesCollectionResponseSchema,
  clientDetailResponseSchema,
  clientsCollectionResponseSchema,
  publisherDetailResponseSchema,
} from "./discovery.js";
import { installManifestQuerySchema, installManifestResponseSchema } from "./install.js";
import {
  resolveServerIdentifierResponseSchema,
  searchCollectionQuerySchema,
  serverCollectionQuerySchema,
  serverCollectionResponseSchema,
  serverDetailResponseSchema,
} from "./servers.js";

extendZodWithOpenApi(z);

type OpenAPIObject = ReturnType<OpenApiGeneratorV31["generateDocument"]>;

export function createPublicApiOpenApiDocument(baseUrl: string): OpenAPIObject {
  const registry = new OpenAPIRegistry();

  const serverCollectionResponse = serverCollectionResponseSchema.meta({
    id: "ServerCollectionResponse",
  });
  const serverDetailResponse = serverDetailResponseSchema.meta({
    id: "ServerDetailResponse",
  });
  const resolvedServerResponse = resolveServerIdentifierResponseSchema.meta({
    id: "ResolvedServerResponse",
  });
  const installManifestResponse = installManifestResponseSchema.meta({
    id: "InstallManifestResponse",
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

  registry.registerPath({
    method: "get",
    path: "/api/v1/categories",
    responses: {
      200: {
        description: "Category collection",
        content: { "application/json": { schema: categoriesCollectionResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/categories/{slug}",
    responses: {
      200: {
        description: "Category detail",
        content: { "application/json": { schema: categoryDetailResponse } },
      },
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
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/clients/{id}",
    responses: {
      200: {
        description: "Client detail",
        content: { "application/json": { schema: clientDetailResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/publishers/{slug}",
    responses: {
      200: {
        description: "Publisher detail",
        content: { "application/json": { schema: publisherDetailResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/resolve/{identifier}",
    responses: {
      200: {
        description: "Resolved server",
        content: { "application/json": { schema: resolvedServerResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/resolve/{identifier}/install",
    request: { query: installManifestQuerySchema },
    responses: {
      200: {
        description: "Install manifest via resolution",
        content: { "application/json": { schema: installManifestResponse } },
      },
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
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/servers/{slug}",
    responses: {
      200: {
        description: "Server detail",
        content: { "application/json": { schema: serverDetailResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/servers/{slug}/install",
    request: { query: installManifestQuerySchema },
    responses: {
      200: {
        description: "Install manifest",
        content: { "application/json": { schema: installManifestResponse } },
      },
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: { title: "The MCP Directory Public API", version: "1.0.0" },
    servers: [{ url: baseUrl }],
  });
}