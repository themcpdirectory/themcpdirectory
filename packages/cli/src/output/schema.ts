import { z } from "zod";
import {
  serverCollectionResponseSchema,
  serverDetailResponseSchema,
  supportedClientIdSchema,
} from "@themcpdirectory/api-contract";

const errorSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
});

const warningsSchema = z.array(z.string());
const clientScopeSchema = z.enum(["user", "project", "global"]);
const transportSchema = z.enum(["stdio", "streamable-http", "http"]);

const listDataSchema = z.array(
  z.strictObject({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    client: supportedClientIdSchema,
    scope: clientScopeSchema,
    transport: transportSchema,
    managedBy: z.enum(["mcpdir", "external"]),
    variantId: z.string().min(1).optional(),
    manifestHash: z.string().min(1).optional(),
  }),
);

const doctorDataSchema = z.strictObject({
  exitCode: z.number().int().nonnegative(),
  checks: z.array(
    z.strictObject({
      name: z.string().min(1),
      status: z.enum(["ok", "warning", "error"]),
      message: z.string().min(1),
      recoveryHint: z.string().min(1).optional(),
    }),
  ),
});

const addDataSchema = z.strictObject({
  exitCode: z.number().int().nonnegative(),
  targets: z.array(
    z.strictObject({
      client: supportedClientIdSchema,
      scope: clientScopeSchema,
      status: z.enum(["installed", "failed", "skipped"]),
      verificationMessage: z.string().min(1),
      receiptWritten: z.boolean(),
      recoveryHint: z.string().min(1),
    }),
  ),
});

function commandEnvelope<TData extends z.ZodType>(command: string, dataSchema: TData) {
  return z.union([
    z.strictObject({
      schemaVersion: z.literal(1),
      command: z.literal(command),
      ok: z.literal(true),
      data: dataSchema,
      warnings: warningsSchema,
    }),
    z.strictObject({
      schemaVersion: z.literal(1),
      command: z.literal(command),
      ok: z.literal(false),
      data: dataSchema.optional(),
      error: errorSchema,
      warnings: warningsSchema,
    }),
  ]);
}

export const CLI_JSON_SCHEMAS = Object.freeze({
  add: commandEnvelope("add", addDataSchema),
  doctor: commandEnvelope("doctor", doctorDataSchema),
  info: commandEnvelope("info", serverDetailResponseSchema),
  list: commandEnvelope("list", listDataSchema),
  search: commandEnvelope("search", serverCollectionResponseSchema),
});

export type CliJsonSchemaName = keyof typeof CLI_JSON_SCHEMAS;

export function parseCliJsonEnvelope(command: CliJsonSchemaName, value: unknown): unknown {
  return CLI_JSON_SCHEMAS[command].parse(value);
}
