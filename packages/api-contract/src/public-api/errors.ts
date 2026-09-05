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

export const PUBLIC_API_ERROR_DEFINITIONS = {
  VALIDATION_ERROR: { status: 400, message: "Validation failed" },
  SERVER_NOT_FOUND: { status: 404, message: "Server not found" },
  AMBIGUOUS_SERVER: { status: 409, message: "Identifier matches multiple servers" },
  INSTALL_UNAVAILABLE: { status: 410, message: "Install manifest is unavailable" },
  UPSTREAM_DELETED: { status: 410, message: "Listing was deleted upstream" },
  CURSOR_INVALID: { status: 400, message: "Cursor is invalid" },
  RATE_LIMITED: { status: 429, message: "Too many requests" },
  INTERNAL_ERROR: { status: 500, message: "Internal server error" },
} as const satisfies Record<ApiErrorCode, Readonly<{ status: number; message: string }>>;

export type ApiErrorStatus = (typeof PUBLIC_API_ERROR_DEFINITIONS)[ApiErrorCode]["status"];

export const errorResponseSchema = strictObject({
  error: strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: requestIdSchema,
    details: z.array(strictObject({ path: z.string(), message: z.string() })).optional(),
  }),
});
