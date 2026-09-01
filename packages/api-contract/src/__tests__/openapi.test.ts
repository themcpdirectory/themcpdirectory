import { describe, expect, it } from "vitest";
import {
  categoryDetailResponseSchema,
  clientDetailResponseSchema,
  createPublicApiOpenApiDocument,
  installManifestResponseSchema,
  publisherDetailResponseSchema,
} from "../index.js";

type OpenAPIObject = ReturnType<typeof createPublicApiOpenApiDocument>;
type OpenApiParameter = {
  readonly $ref?: string;
  readonly in?: string;
  readonly name?: string;
};
type OpenApiResponse = {
  readonly $ref?: string;
  readonly content?: Record<string, { readonly schema?: { readonly $ref?: string } }>;
};

const serverSummaryExample = {
  id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
  slug: "github",
  title: "GitHub",
  description: "Access GitHub repositories.",
  publisher: {
    slug: "github",
    name: "GitHub",
    verified: true,
  },
  version: "1.2.3",
  repository: { url: "https://github.com/modelcontextprotocol/servers" },
  listingStatus: "active",
  signals: {
    officialRegistry: true,
    publisherVerified: true,
    sourceAvailable: true,
    openSource: true,
  },
};

function getResponseSchemaRef(document: OpenAPIObject, path: string): string | null {
  const paths = document.paths ?? {};
  const response = paths[path]?.get?.responses?.["200"];
  if (!response || isReferenceObject(response)) {
    return null;
  }

  const schema = response.content?.["application/json"]?.schema;
  if (!schema || !isReferenceObject(schema)) {
    return null;
  }

  return schema.$ref;
}

function getQueryParameterNames(document: OpenAPIObject, path: string): string[] {
  const paths = document.paths ?? {};

  return ((paths[path]?.get?.parameters as OpenApiParameter[] | undefined) ?? []).flatMap(
    (parameter) => {
    if (isReferenceObject(parameter)) {
      return [parameter.$ref];
    }

    return parameter.in === "query" ? [`${parameter.in}:${parameter.name}`] : [];
    },
  );
}

function isReferenceObject(
  value: OpenApiParameter | OpenApiResponse | { readonly $ref?: string },
): value is { readonly $ref: string } {
  return "$ref" in value;
}

function createOpenApiDriftView(document: OpenAPIObject) {
  const paths = document.paths ?? {};

  return {
    openapi: document.openapi,
    info: document.info,
    servers: document.servers,
    schemaKeys: Object.keys(document.components?.schemas ?? {}).sort(),
    operations: Object.keys(paths).map((path) => ({
      path,
      queryParameters: getQueryParameterNames(document, path),
      responseSchemaRef: getResponseSchemaRef(document, path),
    })),
  };
}

describe("createPublicApiOpenApiDocument", () => {
  it("emits deterministic Phase D paths from runtime schemas", () => {
    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");
    const paths = document.paths ?? {};

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(paths)).toEqual([
      "/api/v1/categories",
      "/api/v1/categories/{slug}",
      "/api/v1/clients",
      "/api/v1/clients/{id}",
      "/api/v1/publishers/{slug}",
      "/api/v1/resolve/{identifier}",
      "/api/v1/resolve/{identifier}/install",
      "/api/v1/search",
      "/api/v1/servers",
      "/api/v1/servers/{slug}",
      "/api/v1/servers/{slug}/install",
    ]);
  });

  it("keeps approved install and discovery examples valid against the runtime schemas", () => {
    const installExample = installManifestResponseSchema.parse({
      data: {
        schemaVersion: 1,
        server: {
          id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
          slug: "github",
          title: "GitHub",
          version: "1.2.3",
        },
        provenance: {
          registry: "https://github.com/modelcontextprotocol/servers",
          registryName: "Model Context Protocol Registry",
          observedAt: "2026-09-01T12:00:00Z",
        },
        variants: [
          {
            id: "8f6c5ae7-c883-4c12-b4c1-f528d6a3c4e5",
            kind: "package",
            registryType: "npm",
            identifier: "@modelcontextprotocol/server-github",
            version: "1.2.3",
            runtimeHint: "npx",
            transport: "stdio",
            runtimeArguments: [],
            packageArguments: [],
            environmentVariables: [
              {
                name: "GITHUB_TOKEN",
                description: "GitHub access token.",
                required: true,
                defaultValue: null,
                valueSource: "environment",
              },
            ],
            integrity: null,
          },
        ],
        compatibility: {
          "claude-code": "supported",
          codex: "supported_with_configuration",
          cursor: "unknown",
        },
      },
      meta: { requestId: "req_phase_d_028" },
    });

    const categoryExample = categoryDetailResponseSchema.parse({
      data: {
        category: {
          slug: "developer-tools",
          name: "Developer Tools",
          description: "Build and debugging tools.",
        },
        servers: [serverSummaryExample],
        nextCursor: null,
      },
      meta: { requestId: "req_phase_d_029" },
    });

    const publisherExample = publisherDetailResponseSchema.parse({
      data: {
        publisher: {
          slug: "github",
          name: "GitHub",
          verified: true,
          websiteUrl: "https://github.com",
        },
        servers: [serverSummaryExample],
        nextCursor: null,
      },
      meta: { requestId: "req_phase_d_030" },
    });

    const clientExample = clientDetailResponseSchema.parse({
      data: {
        client: {
          id: "cursor",
          name: "Cursor",
          capabilities: {
            deeplink: true,
            stdio: true,
            streamableHttp: true,
            headers: true,
            environmentVariables: true,
            remoteVariables: true,
          },
        },
        servers: [serverSummaryExample],
        nextCursor: null,
      },
      meta: { requestId: "req_phase_d_031" },
    });

    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");

    expect(installExample.data.schemaVersion).toBe(1);
    expect(categoryExample.data.category.slug).toBe("developer-tools");
    expect(publisherExample.data.publisher.websiteUrl).toBe("https://github.com");
    expect(clientExample.data.client.id).toBe("cursor");

    expect(getResponseSchemaRef(document, "/api/v1/servers/{slug}/install")).toBe(
      "#/components/schemas/InstallManifestResponse",
    );
    expect(getResponseSchemaRef(document, "/api/v1/categories/{slug}")).toBe(
      "#/components/schemas/CategoryDetailResponse",
    );
    expect(getResponseSchemaRef(document, "/api/v1/publishers/{slug}")).toBe(
      "#/components/schemas/PublisherDetailResponse",
    );
    expect(getResponseSchemaRef(document, "/api/v1/clients/{id}")).toBe(
      "#/components/schemas/ClientDetailResponse",
    );
  });

  it("matches the deterministic drift snapshot for contract-critical OpenAPI surfaces", () => {
    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");

    expect(createOpenApiDriftView(document)).toMatchInlineSnapshot(`
      {
        "info": {
          "title": "The MCP Directory Public API",
          "version": "1.0.0",
        },
        "openapi": "3.1.0",
        "operations": [
          {
            "path": "/api/v1/categories",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/CategoriesCollectionResponse",
          },
          {
            "path": "/api/v1/categories/{slug}",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/CategoryDetailResponse",
          },
          {
            "path": "/api/v1/clients",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/ClientsCollectionResponse",
          },
          {
            "path": "/api/v1/clients/{id}",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/ClientDetailResponse",
          },
          {
            "path": "/api/v1/publishers/{slug}",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/PublisherDetailResponse",
          },
          {
            "path": "/api/v1/resolve/{identifier}",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/ResolvedServerResponse",
          },
          {
            "path": "/api/v1/resolve/{identifier}/install",
            "queryParameters": [
              "query:client",
            ],
            "responseSchemaRef": "#/components/schemas/InstallManifestResponse",
          },
          {
            "path": "/api/v1/search",
            "queryParameters": [
              "query:q",
              "query:category",
              "query:publisher",
              "query:client",
              "query:transport",
              "query:registryType",
              "query:verified",
              "query:openSource",
              "query:status",
              "query:sort",
              "query:cursor",
              "query:limit",
            ],
            "responseSchemaRef": "#/components/schemas/ServerCollectionResponse",
          },
          {
            "path": "/api/v1/servers",
            "queryParameters": [
              "query:q",
              "query:category",
              "query:publisher",
              "query:client",
              "query:transport",
              "query:registryType",
              "query:verified",
              "query:openSource",
              "query:status",
              "query:sort",
              "query:cursor",
              "query:limit",
            ],
            "responseSchemaRef": "#/components/schemas/ServerCollectionResponse",
          },
          {
            "path": "/api/v1/servers/{slug}",
            "queryParameters": [],
            "responseSchemaRef": "#/components/schemas/ServerDetailResponse",
          },
          {
            "path": "/api/v1/servers/{slug}/install",
            "queryParameters": [
              "query:client",
            ],
            "responseSchemaRef": "#/components/schemas/InstallManifestResponse",
          },
        ],
        "schemaKeys": [
          "CategoriesCollectionResponse",
          "CategoryDetailResponse",
          "ClientDetailResponse",
          "ClientsCollectionResponse",
          "InstallManifestResponse",
          "PublisherDetailResponse",
          "ResolvedServerResponse",
          "ServerCollectionResponse",
          "ServerDetailResponse",
        ],
        "servers": [
          {
            "url": "https://api.themcpdirectory.test",
          },
        ],
      }
    `);
  });
});