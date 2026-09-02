import { valid as validPep440 } from "@renovatebot/pep440";
import { valid as validSemver } from "semver";
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

function isExactNpmPackageVersion(version: string): boolean {
  return validSemver(version) !== null && version.trim() === version && /^\d/.test(version);
}

function isExactPypiPackageVersion(version: string): boolean {
  return validPep440(version) !== null;
}

export const installManifestPackageRegistryTypeSchema = z.enum(["npm", "pypi"]);
export const installManifestPackageVersionSchema = z
  .string()
  .refine(
    (version) =>
      isExactNpmPackageVersion(version) || isExactPypiPackageVersion(version),
    "Package version must be an exact immutable npm or PyPI version",
  );
export const installManifestPackageRuntimeHintSchema = z.enum(["npx"]);
export const installManifestPackageTransportSchema = z.literal("stdio");
export const installManifestRemoteTransportSchema = z.enum(["streamable-http", "sse"]);

export function isExactPackageVersionForRegistry(
  registryType: z.infer<typeof installManifestPackageRegistryTypeSchema>,
  version: string,
): boolean {
  return registryType === "npm"
    ? isExactNpmPackageVersion(version)
    : isExactPypiPackageVersion(version);
}

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
        registryType: installManifestPackageRegistryTypeSchema,
        identifier: z.string().min(1),
        version: installManifestPackageVersionSchema,
        runtimeHint: installManifestPackageRuntimeHintSchema.nullable(),
        transport: installManifestPackageTransportSchema,
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
        transport: installManifestRemoteTransportSchema,
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
}).superRefine((manifest, context) => {
  manifest.variants.forEach((variant, index) => {
    if (
      variant.kind === "package" &&
      !isExactPackageVersionForRegistry(variant.registryType, variant.version)
    ) {
      context.addIssue({
        code: "custom",
        message: `Version must be an exact immutable ${variant.registryType} version`,
        path: ["variants", index, "version"],
      });
    }
  });
});

export const installManifestResponseSchema = createResourceResponseSchema(
  installManifestServerSchema,
);

export type InstallManifestV1 = z.infer<typeof installManifestResponseSchema>["data"];
export type InstallManifestResponse = z.infer<typeof installManifestResponseSchema>;