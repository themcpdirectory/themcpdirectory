import {
  apiErrorCodeSchema,
  createPublicApiOpenApiDocument,
  listingStatusSchema,
  PUBLIC_API_DOCUMENTATION,
  PUBLIC_API_ERROR_DEFINITIONS,
  PUBLIC_API_SUCCESS_EXAMPLES,
} from "@themcpdirectory/api-contract";
import type { ReleaseDocument } from "@/content/document-model";

const openApi = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

interface OpenApiParameterSchema {
  readonly enum?: readonly (string | number | boolean)[];
  readonly anyOf?: readonly OpenApiParameterSchema[];
  readonly default?: string | number | boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}

interface OpenApiParameter {
  readonly $ref?: string;
  readonly name?: string;
  readonly in?: string;
  readonly required?: boolean;
  readonly schema?: OpenApiParameterSchema;
}

interface OpenApiResponse {
  readonly $ref?: string;
  readonly content?: Readonly<Record<string, { readonly schema?: { readonly $ref?: string } }>>;
}

export interface PublicApiParameterDocumentation {
  readonly name: string;
  readonly location: "path" | "query";
  readonly required: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly allowedValues?: readonly (string | number | boolean)[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minimumLength?: number;
  readonly maximumLength?: number;
  readonly pattern?: string;
}

export interface PublicApiOperationDocumentation {
  readonly method: Uppercase<(typeof HTTP_METHODS)[number]>;
  readonly path: string;
  readonly parameters: readonly PublicApiParameterDocumentation[];
  readonly responseStatuses: readonly string[];
  readonly successSchema: string;
}

function formatRoutePath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ":$1");
}

function getAllowedValues(schema: OpenApiParameterSchema): readonly (string | number | boolean)[] {
  if (schema.enum) return schema.enum;
  return schema.anyOf?.flatMap((option) => option.enum ?? []) ?? [];
}

function getSuccessSchema(response: OpenApiResponse | undefined, route: string): string {
  const reference = response?.content?.["application/json"]?.schema?.$ref;
  if (!reference) throw new Error(`Missing success response schema for ${route}`);
  return reference.replace("#/components/schemas/", "");
}

export const PUBLIC_API_DOC_OPERATIONS: readonly PublicApiOperationDocumentation[] = Object.entries(
  openApi.paths ?? {},
).flatMap(([path, pathItem]) =>
  HTTP_METHODS.flatMap((method) => {
    const operation = pathItem?.[method];
    if (!operation) return [];

    const route = `${method.toUpperCase()} ${formatRoutePath(path)}`;
    const parameters = ((operation.parameters ?? []) as readonly OpenApiParameter[]).map(
      (parameter): PublicApiParameterDocumentation => {
        if (
          parameter.$ref ||
          !parameter.name ||
          (parameter.in !== "path" && parameter.in !== "query") ||
          !parameter.schema
        ) {
          throw new Error(`Unsupported parameter reference for ${route}`);
        }

        const allowedValues = getAllowedValues(parameter.schema);
        return {
          name: parameter.name,
          location: parameter.in,
          required: parameter.required ?? false,
          ...(parameter.schema.default === undefined
            ? {}
            : { defaultValue: parameter.schema.default }),
          ...(allowedValues.length === 0 ? {} : { allowedValues }),
          ...(parameter.schema.minimum === undefined ? {} : { minimum: parameter.schema.minimum }),
          ...(parameter.schema.maximum === undefined ? {} : { maximum: parameter.schema.maximum }),
          ...(parameter.schema.minLength === undefined
            ? {}
            : { minimumLength: parameter.schema.minLength }),
          ...(parameter.schema.maxLength === undefined
            ? {}
            : { maximumLength: parameter.schema.maxLength }),
          ...(parameter.schema.pattern === undefined ? {} : { pattern: parameter.schema.pattern }),
        };
      },
    );
    const responses = operation.responses ?? {};

    return [
      {
        method: method.toUpperCase() as PublicApiOperationDocumentation["method"],
        path: formatRoutePath(path),
        parameters,
        responseStatuses: Object.keys(responses),
        successSchema: getSuccessSchema(responses["200"] as OpenApiResponse | undefined, route),
      },
    ];
  }),
);

export const PUBLIC_API_DOC_ROUTES = PUBLIC_API_DOC_OPERATIONS.map(
  (operation) => `${operation.method} ${operation.path}`,
);

function formatParameter(parameter: PublicApiParameterDocumentation): string {
  const facts = [
    `in ${parameter.location}`,
    parameter.required ? "required" : "optional",
    ...(parameter.defaultValue === undefined ? [] : [`default ${parameter.defaultValue}`]),
    ...(parameter.allowedValues ? [`allowed ${parameter.allowedValues.join(", ")}`] : []),
    ...(parameter.minimum === undefined ? [] : [`minimum ${parameter.minimum}`]),
    ...(parameter.maximum === undefined ? [] : [`maximum ${parameter.maximum}`]),
    ...(parameter.minimumLength === undefined ? [] : [`minimum length ${parameter.minimumLength}`]),
    ...(parameter.maximumLength === undefined ? [] : [`maximum length ${parameter.maximumLength}`]),
    ...(parameter.pattern === undefined ? [] : [`pattern ${parameter.pattern}`]),
  ];
  return `Parameter: ${parameter.name}; ${facts.join("; ")}.`;
}

const operationSections = PUBLIC_API_DOC_OPERATIONS.map((operation) => ({
  id: `operation-${operation.method.toLowerCase()}-${operation.path.replaceAll(/[^a-z0-9]+/gi, "-")}`,
  heading: `${operation.method} ${operation.path}`,
  body: [
    ...(operation.parameters.length === 0
      ? ["Parameters: none."]
      : operation.parameters.map(formatParameter)),
    `Responses: ${operation.responseStatuses.join(", ")}.`,
    `Success schema: ${operation.successSchema}.`,
  ],
}));

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
  `${PUBLIC_API_DOCUMENTATION.rateLimit.header.name} reports seconds until retry; quota is ${PUBLIC_API_DOCUMENTATION.rateLimit.quota}.`,
];

const installSafetyFacts = [
  `Install URLs allow only ${PUBLIC_API_DOCUMENTATION.installSafety.urlProtocols.join(" and ")}.`,
  `Package versions must be ${PUBLIC_API_DOCUMENTATION.installSafety.packageVersions}.`,
  `Environment variable metadata contains ${PUBLIC_API_DOCUMENTATION.installSafety.environmentValues}.`,
];

const upstreamDeletion = PUBLIC_API_DOCUMENTATION.upstreamDeletion;

export function getApiReferenceDocument(): ReleaseDocument {
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
      ...operationSections,
      { id: "pagination", heading: "Pagination", body: paginationFacts },
      { id: "errors", heading: "Errors", body: errorFacts },
      { id: "rate-limits", heading: "Rate limits", body: rateLimitFacts },
      {
        id: "example",
        heading: "Example",
        body: [JSON.stringify(PUBLIC_API_DOCUMENTATION.example, null, 2)],
      },
      {
        id: "successful-examples",
        heading: "Successful examples",
        body: [
          "Collection - ServerCollectionResponse",
          JSON.stringify(PUBLIC_API_SUCCESS_EXAMPLES.collection, null, 2),
          "Resource - ResolvedServerResponse",
          JSON.stringify(PUBLIC_API_SUCCESS_EXAMPLES.resource, null, 2),
          "Install - InstallManifestResponse",
          JSON.stringify(PUBLIC_API_SUCCESS_EXAMPLES.install, null, 2),
        ],
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
  };
}
