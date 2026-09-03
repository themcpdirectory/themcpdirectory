import { z } from "zod";
import type {
  CategoriesCollectionResponse,
  CategoryDetailResponse,
  ClientDetailResponse,
  ClientsCollectionResponse,
  PublisherDetailResponse,
} from "./discovery.js";
import {
  HealthCheckOutcomeSchema,
  RemoteHealthObservationV1ClientSchema,
} from "./health.js";
import {
  compatibilityStatusSchema,
  listingStatusSchema,
  supportedClientIdSchema,
} from "./servers.js";
import type { InstallManifestResponse } from "./install.js";
import {
  InstallAvailabilitySchema,
  installManifestNpmPackageVersionSchema,
  installManifestPackageRuntimeHintSchema,
  installManifestPackageTransportSchema,
  installManifestPypiPackageVersionSchema,
  installManifestRemoteTransportSchema,
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
import { legacyTrustProfileClientSchema } from "./trust.js";

export class UnsupportedManifestVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(
      `Unsupported install manifest schema version: ${schemaVersion}. Upgrade the MCP Directory client or CLI to a version that supports this schema version.`,
    );
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
  publisherVerified: z.boolean().optional(),
  latestHealthOutcome: HealthCheckOutcomeSchema.nullable().optional(),
  installAvailability: InstallAvailabilitySchema.optional(),
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
      vscode: compatibilityStatusSchema.optional(),
    }),
    trustProfile: legacyTrustProfileClientSchema,
    latestHealth: RemoteHealthObservationV1ClientSchema.optional(),
    installAvailability: InstallAvailabilitySchema.optional(),
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

const categorySummaryClientSchema = clientObject({
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  serverCount: z.number().int().nonnegative(),
});

const categoriesCollectionClientResponseSchema = clientObject({
  data: z.array(categorySummaryClientSchema),
  meta: clientObject({
    requestId: requestIdSchema,
    nextCursor: z.string().nullable(),
  }),
});

const categoryDetailClientResponseSchema = clientObject({
  data: clientObject({
    category: clientObject({
      slug: slugSchema,
      name: z.string().min(1),
      description: z.string().nullable(),
    }),
    servers: z.array(serverSummaryClientSchema),
    nextCursor: z.string().nullable(),
  }),
  meta: clientObject({ requestId: requestIdSchema }),
});

const publisherDetailClientResponseSchema = clientObject({
  data: clientObject({
    publisher: clientObject({
      slug: slugSchema,
      name: z.string().min(1),
      verified: z.boolean(),
      websiteUrl: httpUrlSchema.nullable(),
    }),
    servers: z.array(serverSummaryClientSchema),
    nextCursor: z.string().nullable(),
  }),
  meta: clientObject({ requestId: requestIdSchema }),
});

const clientCapabilitiesClientSchema = clientObject({
  deeplink: z.boolean(),
  stdio: z.boolean(),
  streamableHttp: z.boolean(),
  headers: z.boolean(),
  environmentVariables: z.boolean(),
  remoteVariables: z.boolean(),
});

const clientSummaryClientSchema = clientObject({
  id: supportedClientIdSchema,
  name: z.string().min(1),
  capabilities: clientCapabilitiesClientSchema,
  serverCount: z.number().int().nonnegative(),
});

const clientsCollectionClientResponseSchema = clientObject({
  data: z.array(clientSummaryClientSchema),
  meta: clientObject({
    requestId: requestIdSchema,
    nextCursor: z.string().nullable(),
  }),
});

const clientDetailClientResponseSchema = clientObject({
  data: clientObject({
    client: clientSummaryClientSchema.omit({ serverCount: true }),
    servers: z.array(serverSummaryClientSchema),
    nextCursor: z.string().nullable(),
  }),
  meta: clientObject({ requestId: requestIdSchema }),
});

const installManifestArgumentClientSchema = clientObject({
  type: z.enum(["positional", "named"]),
  name: z.string().min(1).nullable().optional(),
  valueHint: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  required: z.boolean().optional(),
});

const packageVariantClientShape = {
  id: uuidSchema,
  kind: z.literal("package"),
  identifier: z.string().min(1),
  runtimeHint: installManifestPackageRuntimeHintSchema.nullable(),
  transport: installManifestPackageTransportSchema,
  runtimeArguments: z.array(installManifestArgumentClientSchema),
  packageArguments: z.array(installManifestArgumentClientSchema),
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
};

const npmPackageVariantClientSchema = clientObject({
  ...packageVariantClientShape,
  registryType: z.literal("npm"),
  version: installManifestNpmPackageVersionSchema,
});

const pypiPackageVariantClientSchema = clientObject({
  ...packageVariantClientShape,
  registryType: z.literal("pypi"),
  version: installManifestPypiPackageVersionSchema,
});

const remoteVariantClientSchema = clientObject({
  id: uuidSchema,
  kind: z.literal("remote"),
  transport: installManifestRemoteTransportSchema,
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

const forbiddenInstallManifestKeys = new Set([
  "bash",
  "bin",
  "callback",
  "cmd",
  "command",
  "entrypoint",
  "eval",
  "exec",
  "executable",
  "executablepath",
  "executableurl",
  "expression",
  "hook",
  "postinstall",
  "powershell",
  "preinstall",
  "run",
  "script",
  "scripts",
  "shell",
  "shellcommand",
]);

function normalizeInstallManifestKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_\s]/g, "");
}

function getInstallManifestKeyTokens(key: string): string[] {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isForbiddenInstallManifestKey(key: string): boolean {
  return (
    forbiddenInstallManifestKeys.has(normalizeInstallManifestKey(key)) ||
    getInstallManifestKeyTokens(key).some((token) => forbiddenInstallManifestKeys.has(token))
  );
}

function findForbiddenInstallManifestPath(
  value: unknown,
  path: PropertyKey[] = [],
  seen = new WeakSet<object>(),
): PropertyKey[] | undefined {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (isForbiddenInstallManifestKey(key)) {
      return childPath;
    }

    const forbiddenPath = findForbiddenInstallManifestPath(child, childPath, seen);
    if (forbiddenPath) {
      return forbiddenPath;
    }
  }

  return undefined;
}

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
  trustProfile: legacyTrustProfileClientSchema.optional(),
  latestHealth: RemoteHealthObservationV1ClientSchema.optional(),
  installAvailability: InstallAvailabilitySchema.optional(),
  variants: z.array(
    z.union([
      npmPackageVariantClientSchema,
      pypiPackageVariantClientSchema,
      remoteVariantClientSchema,
    ]),
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
}).superRefine((manifest, context) => {
  const forbiddenPath = findForbiddenInstallManifestPath(manifest);
  if (forbiddenPath) {
    context.addIssue({
      code: "custom",
      message: `Install manifest contains forbidden executable key ${String(forbiddenPath.at(-1))}`,
      path: forbiddenPath,
    });
  }
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

export function parseServerCollectionResponse(input: unknown): ServerCollectionResponse {
  return serverCollectionClientResponseSchema.parse(input) as ServerCollectionResponse;
}

export function parseServerDetailResponse(input: unknown): ServerDetailResponse {
  return serverDetailClientResponseSchema.parse(input) as ServerDetailResponse;
}

export function parseResolvedServerResponse(input: unknown): ResolvedServerResponse {
  return resolveServerIdentifierClientResponseSchema.parse(input) as ResolvedServerResponse;
}

export function parseCategoriesCollectionResponse(input: unknown): CategoriesCollectionResponse {
  return categoriesCollectionClientResponseSchema.parse(input) as CategoriesCollectionResponse;
}

export function parseCategoryDetailResponse(input: unknown): CategoryDetailResponse {
  return categoryDetailClientResponseSchema.parse(input) as CategoryDetailResponse;
}

export function parsePublisherDetailResponse(input: unknown): PublisherDetailResponse {
  return publisherDetailClientResponseSchema.parse(input) as PublisherDetailResponse;
}

export function parseClientsCollectionResponse(input: unknown): ClientsCollectionResponse {
  return clientsCollectionClientResponseSchema.parse(input) as ClientsCollectionResponse;
}

export function parseClientDetailResponse(input: unknown): ClientDetailResponse {
  return clientDetailClientResponseSchema.parse(input) as ClientDetailResponse;
}

export function parseInstallManifestResponse(input: unknown): InstallManifestResponse {
  const schemaVersion = getInstallManifestSchemaVersion(input);

  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new UnsupportedManifestVersionError(schemaVersion);
  }

  return installManifestClientResponseSchema.parse(input) as InstallManifestResponse;
}
