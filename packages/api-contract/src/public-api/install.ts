import { valid as validPep440 } from "@renovatebot/pep440";
import { valid as validSemver } from "semver";
import { z } from "zod";
import {
  RemoteHealthObservationV1Schema,
} from "./health.js";
import {
  createResourceResponseSchema,
  httpUrlSchema,
  rfc3339UtcSchema,
  slugSchema,
  strictObject,
  uuidSchema,
} from "./shared.js";
import {
  compatibilityStatusSchema,
  installAvailabilityValues,
  supportedClientIdSchema,
} from "./servers.js";
import { legacyTrustProfileServerSchema } from "./trust.js";

export const InstallAvailabilitySchema = z.enum(installAvailabilityValues);

function isExactNpmPackageVersion(version: string): boolean {
  return validSemver(version) !== null && version.trim() === version && /^\d/.test(version);
}

function isExactPypiPackageVersion(version: string): boolean {
  return validPep440(version) !== null;
}

function createBoundedUnsignedIntegerPattern(maximum: string): string {
  const alternatives = [`[1-9]\\d{0,${maximum.length - 2}}`];

  for (let index = 0; index < maximum.length; index += 1) {
    const maximumDigit = Number(maximum[index]);
    const minimumDigit = index === 0 ? 1 : 0;
    if (maximumDigit <= minimumDigit) {
      continue;
    }

    const prefix = maximum.slice(0, index);
    const upperDigit = maximumDigit - 1;
    const digitPattern =
      minimumDigit === upperDigit ? `${upperDigit}` : `[${minimumDigit}-${upperDigit}]`;
    const remainingDigits = maximum.length - index - 1;
    alternatives.push(
      `${prefix}${digitPattern}${remainingDigits === 0 ? "" : `\\d{${remainingDigits}}`}`,
    );
  }

  alternatives.push(maximum);
  return `(?:0|${alternatives.join("|")})`;
}

const npmNumericIdentifierPattern = createBoundedUnsignedIntegerPattern(
  String(Number.MAX_SAFE_INTEGER),
);
const npmPrereleaseNumericIdentifierPattern = "(?:0|[1-9]\\d*)";
const EXACT_NPM_PACKAGE_VERSION_PATTERN = new RegExp(
  `^${npmNumericIdentifierPattern}\\.${npmNumericIdentifierPattern}\\.${npmNumericIdentifierPattern}(?:-(?:${npmPrereleaseNumericIdentifierPattern}|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:${npmPrereleaseNumericIdentifierPattern}|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
const EXACT_PYPI_PACKAGE_VERSION_PATTERN =
  /^[vV]?(?:(?:[0-9]+!)?[0-9]+(?:\.[0-9]+)*(?:[-_.]?(?:[aA]|[bB]|[cC]|[rR][cC]|[aA][lL][pP][hH][aA]|[bB][eE][tT][aA]|[pP][rR][eE]|[pP][rR][eE][vV][iI][eE][wW])[-_.]?[0-9]*)?(?:(?:-[0-9]+)|(?:[-_.]?(?:[pP][oO][sS][tT]|[rR][eE][vV]|[rR])[-_.]?[0-9]*))?(?:[-_.]?[dD][eE][vV][-_.]?[0-9]*)?)(?:\+[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*)?$/;

export const installManifestPackageRegistryTypeSchema = z.enum(["npm", "pypi"]);
export const installManifestNpmPackageVersionSchema = z
  .string()
  .regex(EXACT_NPM_PACKAGE_VERSION_PATTERN)
  .refine(isExactNpmPackageVersion, "Package version must be an exact immutable npm version");
export const installManifestPypiPackageVersionSchema = z
  .string()
  .regex(EXACT_PYPI_PACKAGE_VERSION_PATTERN)
  .refine(isExactPypiPackageVersion, "Package version must be an exact immutable PyPI version");
export const installManifestPackageVersionSchema = z.union([
  installManifestNpmPackageVersionSchema,
  installManifestPypiPackageVersionSchema,
]);
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

const packageVariantShape = {
  id: uuidSchema,
  kind: z.literal("package"),
  identifier: z.string().min(1),
  runtimeHint: installManifestPackageRuntimeHintSchema.nullable(),
  transport: installManifestPackageTransportSchema,
  runtimeArguments: z.array(argumentSchema),
  packageArguments: z.array(argumentSchema),
  environmentVariables: z.array(environmentVariableSchema),
  integrity: strictObject({
    algorithm: z.literal("sha256"),
    digest: z.string().regex(/^[a-f0-9]{64}$/i),
  }).nullable(),
};

const npmPackageVariantSchema = strictObject({
  ...packageVariantShape,
  registryType: z.literal("npm"),
  version: installManifestNpmPackageVersionSchema,
});

const pypiPackageVariantSchema = strictObject({
  ...packageVariantShape,
  registryType: z.literal("pypi"),
  version: installManifestPypiPackageVersionSchema,
});

const remoteVariantSchema = strictObject({
  id: uuidSchema,
  kind: z.literal("remote"),
  transport: installManifestRemoteTransportSchema,
  urlTemplate: httpUrlSchema,
  headers: z.array(headerSchema),
  variables: z.array(remoteVariableSchema),
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
  trustProfile: legacyTrustProfileServerSchema.optional(),
  latestHealth: RemoteHealthObservationV1Schema.optional(),
  installAvailability: InstallAvailabilitySchema.optional(),
  variants: z.array(
    z.union([npmPackageVariantSchema, pypiPackageVariantSchema, remoteVariantSchema]),
  ),
  compatibility: strictObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
    vscode: compatibilityStatusSchema.optional(),
  }),
});

export const installManifestResponseSchema = createResourceResponseSchema(
  installManifestServerSchema,
);

export type InstallManifestV1 = z.infer<typeof installManifestResponseSchema>["data"];
export type InstallManifestResponse = z.infer<typeof installManifestResponseSchema>;
