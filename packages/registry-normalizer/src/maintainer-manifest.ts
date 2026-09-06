import { z } from "zod";
import { isPublicIpAddress } from "@themcpdirectory/security";

export const MCPDIR_MANIFEST_SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

const exactSemVerSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "Use an exact semantic version such as 1.2.3; ranges and tags are not allowed.",
  );

const environmentNameSchema = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]*$/, "Use an uppercase environment variable name such as API_KEY.");

const inputFormatSchema = z.enum(["string", "number", "boolean", "filepath"]);

const environmentDeclarationSchema = z.strictObject({
  name: environmentNameSchema,
  description: z.string().trim().min(1).optional(),
  isRequired: z.boolean().optional(),
  format: inputFormatSchema.optional(),
  isSecret: z.boolean().optional(),
  placeholder: z.string().trim().min(1).optional(),
  choices: z.array(z.string().min(1)).min(1).optional(),
});

const variableDeclarationSchema = z.strictObject({
  description: z.string().trim().min(1).optional(),
  isRequired: z.boolean().optional(),
  format: inputFormatSchema.optional(),
  isSecret: z.boolean().optional(),
  placeholder: z.string().trim().min(1).optional(),
  choices: z.array(z.string().min(1)).min(1).optional(),
});

const headerSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(256),
    description: z.string().trim().min(1).optional(),
    isRequired: z.boolean().optional(),
    format: inputFormatSchema.optional(),
    value: z.string().optional(),
    isSecret: z.boolean().optional(),
    placeholder: z.string().trim().min(1).optional(),
    choices: z.array(z.string().min(1)).min(1).optional(),
    variables: z.record(environmentNameSchema, variableDeclarationSchema).optional(),
  })
  .superRefine((header, context) => {
    if (
      header.value !== undefined &&
      !/^(?:[A-Za-z][A-Za-z0-9_-]* )?\{[A-Z_][A-Z0-9_]*\}$/.test(header.value)
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Header values must be declarative environment variable templates.",
      });
    }
  });

const argumentSchema = z
  .strictObject({
    type: z.enum(["positional", "named"]),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    isRequired: z.boolean().optional(),
    format: inputFormatSchema.optional(),
    value: z.string().optional(),
    valueHint: z.string().optional(),
    isRepeated: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    placeholder: z.string().trim().min(1).optional(),
    choices: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((argument, context) => {
    if (argument.isSecret === true && argument.value !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Secret argument values must not be embedded in mcpdir.json.",
      });
    }
  });

const stdioTransportSchema = z.strictObject({ type: z.literal("stdio") });

const remoteUrlSchema = z.string().superRefine((value, context) => {
  if (!isSafePublicHttpsUrl(value)) {
    context.addIssue({
      code: "custom",
      message: "Use a public HTTPS remote URL without embedded credentials.",
    });
  }
});

const streamableHttpTransportSchema = z.strictObject({
  type: z.literal("streamable-http"),
  url: remoteUrlSchema,
  headers: z.array(headerSchema).optional(),
});

const sseTransportSchema = z.strictObject({
  type: z.literal("sse"),
  url: remoteUrlSchema,
  headers: z.array(headerSchema).optional(),
});

const packageTransportSchema = z.discriminatedUnion("type", [
  stdioTransportSchema,
  streamableHttpTransportSchema,
  sseTransportSchema,
]);

const packageSchema = z.strictObject({
  registryType: z.string().trim().min(1).max(64),
  registryBaseUrl: z.string().url().optional(),
  identifier: z.string().trim().min(1).max(256),
  version: exactSemVerSchema,
  fileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  runtimeHint: z.string().trim().min(1).max(64).optional(),
  transport: packageTransportSchema,
  runtimeArguments: z.array(argumentSchema).optional(),
  packageArguments: z.array(argumentSchema).optional(),
  environmentVariables: z.array(environmentDeclarationSchema).optional(),
});

const remoteSchema = z.discriminatedUnion("type", [
  streamableHttpTransportSchema.extend({
    variables: z.record(environmentNameSchema, variableDeclarationSchema).optional(),
  }),
  sseTransportSchema.extend({
    variables: z.record(environmentNameSchema, variableDeclarationSchema).optional(),
  }),
]);

const repositorySchema = z.strictObject({
  url: z.string().url().startsWith("https://"),
  source: z.string().trim().min(1).max(64).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  subfolder: z.string().trim().min(1).max(512).optional(),
});

const iconSchema = z.strictObject({
  src: z.string().url().startsWith("https://"),
  mimeType: z.string().trim().min(1).max(128).optional(),
  sizes: z.array(z.string().trim().min(1).max(32)).min(1).optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

const registryServerSchema = z
  .strictObject({
    $schema: z.literal(MCPDIR_MANIFEST_SCHEMA_URL),
    name: z.string().trim().min(1).max(256),
    description: z.string().trim().min(1).max(10_000),
    title: z.string().trim().min(1).max(256).optional(),
    version: exactSemVerSchema,
    repository: repositorySchema.optional(),
    websiteUrl: z.string().url().startsWith("https://").optional(),
    icons: z.array(iconSchema).optional(),
    packages: z.array(packageSchema).min(1).optional(),
    remotes: z.array(remoteSchema).min(1).optional(),
  })
  .superRefine((server, context) => {
    if (!server.packages?.length && !server.remotes?.length) {
      context.addIssue({
        code: "custom",
        message: "Declare at least one package or remote server.",
      });
    }
  });

export const mcpdirManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  server: registryServerSchema,
});

export type McpdirManifest = z.infer<typeof mcpdirManifestSchema>;
export type RegistryPublishArtifact = McpdirManifest["server"];

export interface McpdirManifestIssue {
  readonly path: string;
  readonly message: string;
}

export type McpdirManifestParseResult =
  | { readonly success: true; readonly data: McpdirManifest }
  | { readonly success: false; readonly issues: readonly McpdirManifestIssue[] };

export function parseMcpdirManifest(input: unknown): McpdirManifestParseResult {
  const parsed = mcpdirManifestSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };

  return {
    success: false,
    issues: parsed.error.issues.flatMap((issue) => {
      if (issue.code === "unrecognized_keys") {
        return issue.keys.map((key) => ({
          path: [...issue.path, key].join("."),
          message: "Unknown field; remove it from mcpdir.json.",
        }));
      }
      return [{ path: issue.path.join(".") || "mcpdir.json", message: issue.message }];
    }),
  };
}

export function toRegistryPublishArtifact(manifest: McpdirManifest): RegistryPublishArtifact {
  return structuredClone(manifest.server);
}

export function isSafePublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      !isPrivateHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const rawHost = normalized.replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const isIpLiteral = rawHost.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHost);
  return isIpLiteral && !isPublicIpAddress(rawHost);
}
