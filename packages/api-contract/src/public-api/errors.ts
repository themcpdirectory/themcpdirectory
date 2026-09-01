import { z } from "zod";
import { requestIdSchema, strictObject } from "./shared.js";

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "SERVER_NOT_FOUND",
  "AMBIGUOUS_SERVER",
  "INSTALL_UNAVAILABLE",
  "UPSTREAM_DELETED",
  "CURSOR_INVALID",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const errorResponseSchema = strictObject({
  error: strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: requestIdSchema,
    details: z.array(strictObject({ path: z.string(), message: z.string() })).optional(),
  }),
});