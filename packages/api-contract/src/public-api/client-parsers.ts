import { z } from "zod";
import {
  compatibilityStatusSchema,
  listingStatusSchema,
} from "./servers.js";
import type {
  InstallManifestResponse,
} from "./install.js";
import type {
  ResolvedServerResponse,
  ServerCollectionResponse,
  ServerDetailResponse,
} from "./servers.js";
import {
  clientObject,
  httpUrlSchema,
  requestIdSchema,
  rfc3339UtcSchema,
  slugSchema,
  uuidSchema,
} from "./shared.js";

export class UnsupportedManifestVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Unsupported install manifest schema version: ${schemaVersion}`);
    this.name = "UnsupportedManifestVersionError";
  }
}

const publisherSummaryClientSchema = clientObject({
  slug: slugSchema,
  name: z.string().min(1),
  verified: z.boolean(),
});

const serverSignalsClientSchema = clientObject({
  officialRegistry: z.boolean(),
  publisherVerified: z.boolean(),
  sourceAvailable: z.boolean().nullable(),
  openSource: z.boolean().nullable(),
});

const serverSummaryClientSchema = clientObject({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  publisher: publisherSummaryClientSchema.nullable(),
  version: z.string().min(1).nullable(),
  repository: clientObject({ url: httpUrlSchema }).nullable(),
  listingStatus: listingStatusSchema,
  signals: serverSignalsClientSchema,
});

const serverCollectionClientResponseSchema = clientObject({
  data: z.array(serverSummaryClientSchema),
  meta: clientObject({
    requestId: requestIdSchema,
    nextCursor: z.string().nullable(),
  }),
});

const serverDetailClientResponseSchema = clientObject({
  data: clientObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    shortDescription: z.string().min(1),
    longDescription: z.string().nullable(),
    listingStatus: listingStatusSchema,
    aliases: z.array(z.string().min(1)),
    publisher: publisherSummaryClientSchema.nullable(),
    repository: clientObject({ url: httpUrlSchema }).nullable(),
    version: z.string().min(1).nullable(),
    categories: z.array(
      clientObject({
        slug: slugSchema,
        name: z.string().min(1),
      }),
    ),
    packages: z.array(
      clientObject({
        id: uuidSchema,
        registryType: z.string().min(1),
        identifier: z.string().min(1),
        version: z.string().min(1).nullable(),
        runtimeHint: z.string().min(1).nullable(),
        transport: z.string().min(1),
        runtimeArguments: z.array(
          clientObject({
            type: z.enum(["positional", "named"]),
            name: z.string().min(1).nullable().optional(),
            valueHint: z.string().min(1).nullable().optional(),
            description: z.string().min(1).nullable().optional(),
            required: z.boolean().optional(),
          }),
        ),
        packageArguments: z.array(
          clientObject({
            type: z.enum(["positional", "named"]),
            name: z.string().min(1).nullable().optional(),
            valueHint: z.string().min(1).nullable().optional(),
            description: z.string().min(1).nullable().optional(),
            required: z.boolean().optional(),
          }),
        ),
        environmentVariables: z.array(
          clientObject({
            name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
            description: z.string().min(1).nullable(),
            required: z.boolean(),
            defaultValue: z.string().min(1).nullable(),
            valueSource: z.literal("environment"),
          }),
        ),
      }),
    ),
    remotes: z.array(
      clientObject({
        id: uuidSchema,
        transport: z.string().min(1),
        urlTemplate: httpUrlSchema,
        headers: z.array(clientObject({ name: z.string().min(1), value: z.string().min(1) })),
        variables: z.array(
          clientObject({
            name: z.string().min(1),
            description: z.string().min(1).nullable(),
            required: z.boolean(),
            defaultValue: z.string().min(1).nullable(),
          }),
        ),
      }),
    ),
    compatibility: clientObject({
      "claude-code": compatibilityStatusSchema.optional(),
      codex: compatibilityStatusSchema.optional(),
      cursor: compatibilityStatusSchema.optional(),
    }),
    trustProfile: clientObject({
      officialRegistry: z.boolean(),
      publisherVerified: z.boolean(),
      sourceAvailable: z.boolean().nullable(),
      openSource: z.boolean().nullable(),
      signals: z.array(
        clientObject({
          key: z.string().min(1),
          status: z.enum(["positive", "neutral", "warning", "negative", "unknown"]),
          summary: z.string().nullable(),
          checkedAt: rfc3339UtcSchema.nullable(),
        }),
      ),
    }),
    timestamps: clientObject({
      firstSeenAt: rfc3339UtcSchema,
      lastSeenAt: rfc3339UtcSchema,
      publishedAt: rfc3339UtcSchema.nullable(),
      updatedAt: rfc3339UtcSchema.nullable(),
    }),
  }),
  meta: clientObject({ requestId: requestIdSchema }),
});

const resolveServerIdentifierClientResponseSchema = clientObject({
  data: clientObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    version: z.string().min(1).nullable(),
    canonicalUrl: httpUrlSchema,
    matchedBy: z.enum(["slug", "alias", "canonical_registry_name", "package_identifier"]),
    matchedValue: z.string().min(1),
    needsRedirect: z.boolean(),
  }),
  meta: clientObject({ requestId: requestIdSchema }),
});

const packageVariantClientSchema = clientObject({
  id: uuidSchema,
  kind: z.literal("package"),
  registryType: z.string().min(1),
  identifier: z.string().min(1),
  version: z.string().min(1),
  runtimeHint: z.string().min(1),
  transport: z.string().min(1),
  runtimeArguments: z.array(clientObject({ type: z.enum(["positional", "named"]) })),
  packageArguments: z.array(clientObject({ type: z.enum(["positional", "named"]) })),
  environmentVariables: z.array(
    clientObject({
      name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
      valueSource: z.literal("environment"),
    }),
  ),
  integrity: clientObject({
    algorithm: z.literal("sha256"),
    digest: z.string().regex(/^[a-f0-9]{64}$/i),
  }).nullable(),
});

const remoteVariantClientSchema = clientObject({
  id: uuidSchema,
  kind: z.literal("remote"),
  transport: z.string().min(1),
  urlTemplate: httpUrlSchema,
  headers: z.array(clientObject({ name: z.string().min(1), value: z.string().min(1) })),
  variables: z.array(
    clientObject({
      name: z.string().min(1),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
    }),
  ),
});

const installManifestClientSchema = clientObject({
  schemaVersion: z.literal(1),
  server: clientObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    version: z.string().min(1).nullable(),
  }),
  provenance: clientObject({
    registry: z.string().min(1),
    registryName: z.string().min(1),
    observedAt: rfc3339UtcSchema,
  }),
  variants: z.array(
    z.discriminatedUnion("kind", [packageVariantClientSchema, remoteVariantClientSchema]),
  ),
  compatibility: clientObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
  }),
});

const installManifestClientResponseSchema = clientObject({
  data: installManifestClientSchema,
  meta: clientObject({ requestId: requestIdSchema }),
});

function getInstallManifestSchemaVersion(input: unknown): number | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const data = Reflect.get(input, "data");
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const schemaVersion = Reflect.get(data, "schemaVersion");
  return typeof schemaVersion === "number" ? schemaVersion : undefined;
}

export function parseServerCollectionResponse(
  input: unknown,
): ServerCollectionResponse {
  return serverCollectionClientResponseSchema.parse(input) as ServerCollectionResponse;
}

export function parseServerDetailResponse(input: unknown): ServerDetailResponse {
  return serverDetailClientResponseSchema.parse(input) as ServerDetailResponse;
}

export function parseResolvedServerResponse(
  input: unknown,
): ResolvedServerResponse {
  return resolveServerIdentifierClientResponseSchema.parse(input) as ResolvedServerResponse;
}

export function parseInstallManifestResponse(
  input: unknown,
): InstallManifestResponse {
  const schemaVersion = getInstallManifestSchemaVersion(input);

  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new UnsupportedManifestVersionError(schemaVersion);
  }

  return installManifestClientResponseSchema.parse(input) as InstallManifestResponse;
}