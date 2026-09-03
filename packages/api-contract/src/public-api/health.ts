import { z } from "zod";
import { clientObject, rfc3339UtcSchema, strictObject } from "./shared.js";

export const HealthCheckOutcomeSchema = z.enum([
  "healthy",
  "degraded",
  "unreachable",
  "timed_out",
  "unsafe_destination",
  "response_too_large",
  "unsupported",
  "unknown",
]);

const RemoteHealthObservationShape = {
  schemaVersion: z.literal(1),
  outcome: HealthCheckOutcomeSchema,
  checkedAt: rfc3339UtcSchema,
  durationMs: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  finalOrigin: z.string().url().nullable(),
  redirectCount: z.number().int().nonnegative(),
};

export const RemoteHealthObservationV1Schema = strictObject(RemoteHealthObservationShape);
export const RemoteHealthObservationV1ClientSchema = clientObject(RemoteHealthObservationShape);