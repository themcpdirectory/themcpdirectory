import { z } from "zod";
import {
  createResourceResponseSchema,
  httpUrlSchema,
  rfc3339UtcSchema,
  slugSchema,
  strictObject,
  uuidSchema,
} from "./shared.js";
import { compatibilityStatusSchema, supportedClientIdSchema } from "./servers.js";

const argumentSchema = strictObject({
  type: z.enum(["positional", "named"]),
  valueHint: z.string().min(1).nullable().optional(),
  name: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  required: z.boolean().optional(),
});

const environmentVariableSchema = strictObject({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string().min(1).nullable(),
  required: z.boolean(),
  defaultValue: z.string().min(1).nullable(),
  valueSource: z.literal("environment"),
});

const headerSchema = strictObject({
  name: z.string().min(1),
  value: z.string().min(1),
});

const remoteVariableSchema = strictObject({
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  required: z.boolean(),
  defaultValue: z.string().min(1).nullable(),
});

export const installManifestQuerySchema = strictObject({
  client: supportedClientIdSchema.optional(),
});

const installManifestServerSchema = strictObject({
  schemaVersion: z.literal(1),
  server: strictObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    version: z.string().min(1).nullable(),
  }),
  provenance: strictObject({
    registry: z.string().min(1),
    registryName: z.string().min(1),
    observedAt: rfc3339UtcSchema,
  }),
  variants: z.array(
    z.discriminatedUnion("kind", [
      strictObject({
        id: uuidSchema,
        kind: z.literal("package"),
        registryType: z.string().min(1),
        identifier: z.string().min(1),
        version: z.string().min(1),
        runtimeHint: z.string().min(1),
        transport: z.string().min(1),
        runtimeArguments: z.array(argumentSchema),
        packageArguments: z.array(argumentSchema),
        environmentVariables: z.array(environmentVariableSchema),
        integrity: strictObject({
          algorithm: z.literal("sha256"),
          digest: z.string().regex(/^[a-f0-9]{64}$/i),
        }).nullable(),
      }),
      strictObject({
        id: uuidSchema,
        kind: z.literal("remote"),
        transport: z.string().min(1),
        urlTemplate: httpUrlSchema,
        headers: z.array(headerSchema),
        variables: z.array(remoteVariableSchema),
      }),
    ]),
  ),
  compatibility: strictObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
  }),
});

export const installManifestResponseSchema = createResourceResponseSchema(
  installManifestServerSchema,
);

export type InstallManifestV1 = z.infer<typeof installManifestResponseSchema>["data"];
export type InstallManifestResponse = z.infer<typeof installManifestResponseSchema>;