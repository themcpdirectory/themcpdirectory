import { z } from "zod";
import { clientObject, rfc3339UtcSchema, strictObject } from "./shared.js";

const remoteHealthObservationExample = {
  schemaVersion: 1,
  outcome: "healthy",
  checkedAt: "2026-09-01T12:00:00Z",
  durationMs: 120,
  httpStatus: 200,
  finalOrigin: "https://api.example.com",
  redirectCount: 0,
} as const;

export const HealthCheckOutcomeSchema = z
  .enum([
    "healthy",
    "degraded",
    "unreachable",
    "timed_out",
    "unsafe_destination",
    "response_too_large",
    "unsupported",
    "unknown",
  ])
  .meta({
    id: "HealthCheckOutcome",
    example: remoteHealthObservationExample.outcome,
  });
export type HealthCheckOutcome = z.infer<typeof HealthCheckOutcomeSchema>;

const RemoteHealthObservationShape = {
  schemaVersion: z.literal(1),
  outcome: HealthCheckOutcomeSchema,
  checkedAt: rfc3339UtcSchema,
  durationMs: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  finalOrigin: z.string().url().nullable(),
  redirectCount: z.number().int().nonnegative(),
};

export const RemoteHealthObservationV1Schema = strictObject(RemoteHealthObservationShape).meta({
  id: "RemoteHealthObservationV1",
  example: remoteHealthObservationExample,
});
export type RemoteHealthObservationV1 = z.infer<typeof RemoteHealthObservationV1Schema>;
export const RemoteHealthObservationV1ClientSchema = clientObject(RemoteHealthObservationShape);
export type RemoteHealthObservationV1Client = z.infer<typeof RemoteHealthObservationV1ClientSchema>;
