import { z } from "zod";

export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const uuidSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .max(128)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const slugPathParamsSchema = z.object({ slug: slugSchema });
export const identifierPathParamsSchema = z.object({
  identifier: z
    .string()
    .max(512)
    .refine((value) => value.trim().length > 0),
});
export const rfc3339UtcSchema = z.string().datetime({ offset: true });
export const PUBLIC_API_HTTP_URL_PROTOCOLS = ["http", "https"] as const;
const HTTP_URL_PATTERN = new RegExp(
  `^(?:${PUBLIC_API_HTTP_URL_PROTOCOLS.map((protocol) =>
    [...protocol]
      .map((character) => `[${character.toLowerCase()}${character.toUpperCase()}]`)
      .join(""),
  ).join("|")}):\\/\\/`,
);
export const httpUrlSchema = z
  .string()
  .regex(
    HTTP_URL_PATTERN,
    `URL must use the ${PUBLIC_API_HTTP_URL_PROTOCOLS.map((protocol) => protocol.toUpperCase()).join(" or ")} protocol`,
  )
  .url();

export const PUBLIC_API_PAGINATION = {
  defaultLimit: 30,
  minimumLimit: 1,
  maximumLimit: 100,
  maximumCursorLength: 2048,
} as const;

export const publicApiCursorSchema = z
  .string()
  .min(1)
  .max(PUBLIC_API_PAGINATION.maximumCursorLength);
export const publicApiLimitSchema = z.coerce
  .number()
  .int()
  .min(PUBLIC_API_PAGINATION.minimumLimit)
  .max(PUBLIC_API_PAGINATION.maximumLimit)
  .default(PUBLIC_API_PAGINATION.defaultLimit);

export function strictObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).strict();
}

export function clientObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).passthrough();
}

export function createResourceResponseSchema<TSchema extends z.ZodTypeAny>(dataSchema: TSchema) {
  return strictObject({
    data: dataSchema,
    meta: strictObject({ requestId: requestIdSchema }),
  });
}

export function createCollectionResponseSchema<TSchema extends z.ZodTypeAny>(itemSchema: TSchema) {
  return strictObject({
    data: z.array(itemSchema),
    meta: strictObject({ requestId: requestIdSchema, nextCursor: z.string().nullable() }),
  });
}
