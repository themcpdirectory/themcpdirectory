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
  readonly required?: boolean;
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

function getParameterNames(document: OpenAPIObject, path: string): string[] {
  const paths = document.paths ?? {};

  return ((paths[path]?.get?.parameters as OpenApiParameter[] | undefined) ?? []).flatMap(
    (parameter) => {
      if (isReferenceObject(parameter)) {
        return [parameter.$ref];
      }

      return parameter.in ? [`${parameter.in}:${parameter.name}`] : [];
    },
  );
}

function getPathParameters(document: OpenAPIObject, path: string): OpenApiParameter[] {
  const paths = document.paths ?? {};

  return ((paths[path]?.get?.parameters as OpenApiParameter[] | undefined) ?? []).filter(
    (parameter) => !isReferenceObject(parameter) && parameter.in === "path",
  );
}

function findPackageVersionPatterns(
  value: unknown,
  patterns: Partial<Record<"npm" | "pypi", string>> = {},
): Partial<Record<"npm" | "pypi", string>> {
  if (!value || typeof value !== "object") {
    return patterns;
  }

  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (properties && typeof properties === "object") {
    const propertyRecord = properties as Record<string, unknown>;
    if ("registryType" in propertyRecord && "version" in propertyRecord) {
      const registryType = propertyRecord.registryType;
      const version = propertyRecord.version;
      if (
        registryType &&
        typeof registryType === "object" &&
        version &&
        typeof version === "object"
      ) {
        const registryTypeRecord = registryType as Record<string, unknown>;
        const registry: unknown =
          registryTypeRecord.const ??
          (Array.isArray(registryTypeRecord.enum) ? registryTypeRecord.enum[0] : undefined);
        const pattern = (version as Record<string, unknown>).pattern;
        if ((registry === "npm" || registry === "pypi") && typeof pattern === "string") {
          patterns[registry] = pattern;
        }
      }
    }
  }

  for (const child of Object.values(record)) {
    findPackageVersionPatterns(child, patterns);
  }

  return patterns;
}

function findHttpUrlSchemas(value: unknown, schemas: Record<string, unknown>[] = []) {
  if (!value || typeof value !== "object") {
    return schemas;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.pattern === "string" && record.pattern.includes("[hH][tT][tT][pP]")) {
    schemas.push(record);
  }

  for (const child of Object.values(record)) {
    findHttpUrlSchemas(child, schemas);
  }

  return schemas;
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
      parameters: getParameterNames(document, path),
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

  it.each([
    ["/api/v1/categories/{slug}", "slug"],
    ["/api/v1/clients/{id}", "id"],
    ["/api/v1/publishers/{slug}", "slug"],
    ["/api/v1/resolve/{identifier}", "identifier"],
    ["/api/v1/resolve/{identifier}/install", "identifier"],
    ["/api/v1/servers/{slug}", "slug"],
    ["/api/v1/servers/{slug}/install", "slug"],
  ])("declares required path parameter %s", (path, parameterName) => {
    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");

    expect(getPathParameters(document, path)).toEqual([
      expect.objectContaining({
        in: "path",
        name: parameterName,
        required: true,
      }),
    ]);
  });

  it("documents exact package version restrictions", () => {
    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");
    const packageVersionPatterns = findPackageVersionPatterns(document.components?.schemas);

    expect(packageVersionPatterns).toEqual({
      npm: expect.any(String),
      pypi: expect.any(String),
    });

    const npmVersionRegex = new RegExp(packageVersionPatterns.npm ?? "");
    expect(npmVersionRegex.test("1.2.3")).toBe(true);
    expect(npmVersionRegex.test("1.2.3-beta.1+build.7")).toBe(true);
    expect(npmVersionRegex.test("1.2.3-9007199254740992")).toBe(true);
    expect(npmVersionRegex.test("9007199254740991.0.0")).toBe(true);
    expect(npmVersionRegex.test("1.2")).toBe(false);
    expect(npmVersionRegex.test("1.x")).toBe(false);
    expect(npmVersionRegex.test("^1.2.3")).toBe(false);
    expect(npmVersionRegex.test("9007199254740992.0.0")).toBe(false);

    const pypiVersionRegex = new RegExp(packageVersionPatterns.pypi ?? "");
    expect(pypiVersionRegex.test("1.2.3beta2")).toBe(true);
    expect(pypiVersionRegex.test("1!2.3rc1.post2.dev3+linux.x86_64")).toBe(true);
    expect(pypiVersionRegex.test("1.2.3....")).toBe(false);
    expect(pypiVersionRegex.test("latest")).toBe(false);
    expect(pypiVersionRegex.test(">=1.2.3")).toBe(false);
  });

  it("documents and validates HTTP(S)-only URLs", () => {
    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");
    const httpUrlSchemas = findHttpUrlSchemas(document.components?.schemas);

    expect(httpUrlSchemas.length).toBeGreaterThan(0);
    expect(httpUrlSchemas.every((schema) => schema.format === "uri")).toBe(true);
    expect(() => createPublicApiOpenApiDocument("file:///tmp/openapi")).toThrow(
      "URL must use the HTTP or HTTPS protocol",
    );
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
            "parameters": [],
            "path": "/api/v1/categories",
            "responseSchemaRef": "#/components/schemas/CategoriesCollectionResponse",
          },
          {
            "parameters": [
              "path:slug",
            ],
            "path": "/api/v1/categories/{slug}",
            "responseSchemaRef": "#/components/schemas/CategoryDetailResponse",
          },
          {
            "parameters": [],
            "path": "/api/v1/clients",
            "responseSchemaRef": "#/components/schemas/ClientsCollectionResponse",
          },
          {
            "parameters": [
              "path:id",
            ],
            "path": "/api/v1/clients/{id}",
            "responseSchemaRef": "#/components/schemas/ClientDetailResponse",
          },
          {
            "parameters": [
              "path:slug",
            ],
            "path": "/api/v1/publishers/{slug}",
            "responseSchemaRef": "#/components/schemas/PublisherDetailResponse",
          },
          {
            "parameters": [
              "path:identifier",
            ],
            "path": "/api/v1/resolve/{identifier}",
            "responseSchemaRef": "#/components/schemas/ResolvedServerResponse",
          },
          {
            "parameters": [
              "path:identifier",
              "query:client",
            ],
            "path": "/api/v1/resolve/{identifier}/install",
            "responseSchemaRef": "#/components/schemas/InstallManifestResponse",
          },
          {
            "parameters": [
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
            "path": "/api/v1/search",
            "responseSchemaRef": "#/components/schemas/ServerCollectionResponse",
          },
          {
            "parameters": [
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
            "path": "/api/v1/servers",
            "responseSchemaRef": "#/components/schemas/ServerCollectionResponse",
          },
          {
            "parameters": [
              "path:slug",
            ],
            "path": "/api/v1/servers/{slug}",
            "responseSchemaRef": "#/components/schemas/ServerDetailResponse",
          },
          {
            "parameters": [
              "path:slug",
              "query:client",
            ],
            "path": "/api/v1/servers/{slug}/install",
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
