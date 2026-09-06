import semver from "semver";
import { z } from "zod";
import { slugSchema, strictObject } from "./shared.js";
import { supportedClientIdSchema } from "./servers.js";

const cliVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => semver.valid(value) === value, "cliVersion must be an exact semver");

export const cliTelemetryEventV1Schema = strictObject({
  schemaVersion: z.literal(1),
  event: z.enum(["search", "add", "remove", "update"]),
  slug: slugSchema.optional(),
  cliVersion: cliVersionSchema,
  client: supportedClientIdSchema.optional(),
  success: z.boolean(),
  installVariant: z.enum(["package", "remote"]).optional(),
});

export type CliTelemetryEventV1 = z.infer<typeof cliTelemetryEventV1Schema>;
