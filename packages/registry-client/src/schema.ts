import { z } from "zod/v4";

// --- Leaf schemas ---

const InputSchema = z
  .object({
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    format: z.enum(["string", "number", "boolean", "filepath"]).optional(),
    value: z.string().optional(),
    isSecret: z.boolean().optional(),
    default: z.string().optional(),
    placeholder: z.string().optional(),
    choices: z.array(z.string()).optional(),
  })
  .passthrough();

const InputWithVariablesSchema = InputSchema.extend({
  variables: z.record(z.string(), InputSchema).optional(),
});

const KeyValueInputSchema = InputWithVariablesSchema.extend({
  name: z.string(),
});

const ArgumentSchema = InputWithVariablesSchema.extend({
  type: z.enum(["positional", "named"]),
  name: z.string().optional(),
  valueHint: z.string().optional(),
  isRepeated: z.boolean().optional(),
});

const TransportSchema = z
  .object({
    type: z.string(),
    url: z.string().optional(),
    headers: z.array(KeyValueInputSchema).optional(),
    variables: z.record(z.string(), InputSchema).optional(),
  })
  .passthrough();

const PackageSchema = z
  .object({
    registryType: z.string(),
    registryBaseUrl: z.string().optional(),
    identifier: z.string(),
    version: z.string().optional(),
    fileSha256: z.string().optional(),
    runtimeHint: z.string().optional(),
    transport: TransportSchema,
    runtimeArguments: z.array(ArgumentSchema).optional(),
    packageArguments: z.array(ArgumentSchema).optional(),
    environmentVariables: z.array(KeyValueInputSchema).optional(),
  })
  .passthrough();

const RepositorySchema = z
  .object({
    url: z.string().optional(),
    source: z.string().optional(),
    id: z.string().optional(),
    subfolder: z.string().optional(),
  })
  .passthrough();

const IconSchema = z
  .object({
    src: z.string(),
    mimeType: z.string().optional(),
    sizes: z.array(z.string()).optional(),
    theme: z.enum(["light", "dark"]).optional(),
  })
  .passthrough();

// --- ServerJSON (the `server` envelope) ---

const ServerJSONSchema = z
  .object({
    $schema: z.string(),
    name: z.string(),
    description: z.string(),
    title: z.string().optional(),
    version: z.string(),
    repository: RepositorySchema.optional(),
    websiteUrl: z.string().optional(),
    icons: z.array(IconSchema).optional(),
    packages: z.array(PackageSchema).optional(),
    remotes: z.array(TransportSchema).optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

// --- Registry extensions (the response-level _meta) ---

const RegistryExtensionsSchema = z
  .object({
    status: z.enum(["active", "deprecated", "deleted"]),
    statusChangedAt: z.string(),
    statusMessage: z.string().optional(),
    publishedAt: z.string(),
    updatedAt: z.string().optional(),
    isLatest: z.boolean(),
  })
  .passthrough();

const ResponseMetaSchema = z
  .object({
    "io.modelcontextprotocol.registry/official": RegistryExtensionsSchema.optional(),
  })
  .passthrough();

// --- ServerResponse (single entry in servers array) ---

const ServerResponseSchema = z
  .object({
    server: ServerJSONSchema,
    _meta: ResponseMetaSchema,
  })
  .passthrough();

// --- Pagination metadata ---

const MetadataSchema = z
  .object({
    nextCursor: z.string().optional(),
    count: z.number().int(),
  })
  .passthrough();

// --- Top-level page response ---

export const RegistryPageSchema = z
  .object({
    servers: z.array(ServerResponseSchema),
    metadata: MetadataSchema,
  })
  .passthrough();

export type RegistryPage = z.infer<typeof RegistryPageSchema>;
export type RegistryServerResponse = z.infer<typeof ServerResponseSchema>;
export type RegistryServerJSON = z.infer<typeof ServerJSONSchema>;
export type RegistryMetadata = z.infer<typeof MetadataSchema>;
