import { z } from "zod";

export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const uuidSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const rfc3339UtcSchema = z.string().datetime({ offset: true });
export const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use the HTTP or HTTPS protocol");

export function strictObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).strict();
}

export function clientObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).passthrough();
}

export function createResourceResponseSchema<TSchema extends z.ZodTypeAny>(
  dataSchema: TSchema,
) {
  return strictObject({
    data: dataSchema,
    meta: strictObject({ requestId: requestIdSchema }),
  });
}

export function createCollectionResponseSchema<TSchema extends z.ZodTypeAny>(
  itemSchema: TSchema,
) {
  return strictObject({
    data: z.array(itemSchema),
    meta: strictObject({ requestId: requestIdSchema, nextCursor: z.string().nullable() }),
  });
}