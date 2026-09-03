import { z } from "zod";
import {
  HealthCheckOutcomeSchema,
  RemoteHealthObservationV1Schema,
} from "./health.js";
import {
  createCollectionResponseSchema,
  createResourceResponseSchema,
  httpUrlSchema,
  rfc3339UtcSchema,
  slugSchema,
  strictObject,
  uuidSchema,
} from "./shared.js";
import { legacyTrustProfileServerSchema } from "./trust.js";

export const supportedClientIdSchema = z.enum(["claude-code", "codex", "cursor", "vscode"]);
export type SupportedClientId = z.infer<typeof supportedClientIdSchema>;

export const listingStatusSchema = z.enum([
  "active",
  "deprecated",
  "deleted_upstream",
  "unavailable",
]);

export const compatibilityStatusSchema = z.enum([
  "supported",
  "supported_with_configuration",
  "unsupported",
  "unknown",
]);

export const installAvailabilityValues = [
  "available",
  "install_unavailable",
  "upstream_deleted",
] as const;

export const InstallAvailabilitySchema = z.enum(installAvailabilityValues).meta({
  id: "InstallAvailability",
  example: "available",
});

export const serverSortSchema = z.enum(["relevance", "recent", "updated", "popular", "name"]);
export type PublicServerSort = z.infer<typeof serverSortSchema>;

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

const baseServerCollectionQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    category: slugSchema.optional(),
    publisher: slugSchema.optional(),
    client: supportedClientIdSchema.optional(),
    transport: z.string().trim().min(1).max(64).optional(),
    registryType: z.string().trim().min(1).max(64).optional(),
    verified: queryBooleanSchema.optional(),
    openSource: queryBooleanSchema.optional(),
    status: listingStatusSchema.optional(),
    sort: serverSortSchema.default("recent"),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sort === "relevance" && !value.q) {
      ctx.addIssue({
        code: "custom",
        path: ["sort"],
        message: "q is required when sort is relevance",
      });
    }
  });

export const serverCollectionQuerySchema = baseServerCollectionQuerySchema;
export const searchCollectionQuerySchema = baseServerCollectionQuerySchema;

const publisherSummaryServerSchema = strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  verified: z.boolean(),
});
export type PublicPublisherSummary = {
  readonly slug: string;
  readonly name: string;
  readonly verified: boolean;
};

const repositorySummaryServerSchema = strictObject({
  url: httpUrlSchema,
});
export type PublicRepositorySummary = {
  readonly url: string;
};

const serverSignalsServerSchema = strictObject({
  officialRegistry: z.boolean(),
  publisherVerified: z.boolean(),
  sourceAvailable: z.boolean().nullable(),
  openSource: z.boolean().nullable(),
});
export type PublicServerSignals = {
  readonly officialRegistry: boolean;
  readonly publisherVerified: boolean;
  readonly sourceAvailable: boolean | null;
  readonly openSource: boolean | null;
};

export const serverCategorySchema = strictObject({
  slug: slugSchema,
  name: z.string().min(1),
});
export type PublicServerCategory = z.infer<typeof serverCategorySchema>;

export const serverSummaryServerSchema = strictObject({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  publisher: publisherSummaryServerSchema.nullable(),
  version: z.string().min(1).nullable(),
  repository: repositorySummaryServerSchema.nullable(),
  listingStatus: listingStatusSchema,
  signals: serverSignalsServerSchema,
  publisherVerified: z.boolean().optional(),
  latestHealthOutcome: HealthCheckOutcomeSchema.nullable().optional(),
  installAvailability: InstallAvailabilitySchema.optional(),
});

export const serverCollectionResponseSchema =
  createCollectionResponseSchema(serverSummaryServerSchema);
export type ServerCollectionResponse = z.infer<typeof serverCollectionResponseSchema>;
export type PublicServerSummary = z.infer<typeof serverCollectionResponseSchema>["data"][number];

const argumentSchema = strictObject({
  type: z.enum(["positional", "named"]),
  name: z.string().min(1).nullable().optional(),
  valueHint: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  required: z.boolean().optional(),
});

const serverPackageDetailSchema = strictObject({
  id: uuidSchema,
  registryType: z.string().min(1),
  identifier: z.string().min(1),
  version: z.string().min(1).nullable(),
  runtimeHint: z.string().min(1).nullable(),
  transport: z.string().min(1),
  runtimeArguments: z.array(argumentSchema),
  packageArguments: z.array(argumentSchema),
  environmentVariables: z.array(
    strictObject({
      name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
      valueSource: z.literal("environment"),
    }),
  ),
});

const serverRemoteDetailSchema = strictObject({
  id: uuidSchema,
  transport: z.string().min(1),
  urlTemplate: httpUrlSchema,
  headers: z.array(strictObject({ name: z.string().min(1), value: z.string().min(1) })),
  variables: z.array(
    strictObject({
      name: z.string().min(1),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
    }),
  ),
});

export type PublicTrustProfile = {
  readonly officialRegistry: boolean;
  readonly publisherVerified: boolean;
  readonly sourceAvailable: boolean | null;
  readonly openSource: boolean | null;
  readonly signals: ReadonlyArray<{
    readonly key: string;
    readonly status: "positive" | "neutral" | "warning" | "negative" | "unknown";
    readonly summary: string | null;
    readonly checkedAt: string | null;
  }>;
};

const serverTimestampsSchema = strictObject({
  firstSeenAt: rfc3339UtcSchema,
  lastSeenAt: rfc3339UtcSchema,
  publishedAt: rfc3339UtcSchema.nullable(),
  updatedAt: rfc3339UtcSchema.nullable(),
});
export type PublicServerTimestamps = {
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
};

const serverDetailServerSchema = strictObject({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  longDescription: z.string().nullable(),
  listingStatus: listingStatusSchema,
  aliases: z.array(z.string().min(1)),
  publisher: publisherSummaryServerSchema.nullable(),
  repository: repositorySummaryServerSchema.nullable(),
  version: z.string().min(1).nullable(),
  categories: z.array(serverCategorySchema),
  packages: z.array(serverPackageDetailSchema),
  remotes: z.array(serverRemoteDetailSchema),
  compatibility: strictObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
    vscode: compatibilityStatusSchema.optional(),
  }),
  trustProfile: legacyTrustProfileServerSchema,
  latestHealth: RemoteHealthObservationV1Schema.optional(),
  installAvailability: InstallAvailabilitySchema.optional(),
  timestamps: serverTimestampsSchema,
});

export const serverDetailResponseSchema =
  createResourceResponseSchema(serverDetailServerSchema);
export type ServerDetailResponse = z.infer<typeof serverDetailResponseSchema>;
export type PublicServerDetail = z.infer<typeof serverDetailResponseSchema>["data"];

const resolvedServerSchema = strictObject({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1),
  version: z.string().min(1).nullable(),
  canonicalUrl: httpUrlSchema,
  matchedBy: z.enum(["slug", "alias", "canonical_registry_name", "package_identifier"]),
  matchedValue: z.string().min(1),
  needsRedirect: z.boolean(),
});

export const resolveServerIdentifierResponseSchema =
  createResourceResponseSchema(resolvedServerSchema);
export type ResolvedServerResponse = z.infer<typeof resolveServerIdentifierResponseSchema>;
export type ResolvedServerIdentifier = z.infer<typeof resolveServerIdentifierResponseSchema>["data"];
