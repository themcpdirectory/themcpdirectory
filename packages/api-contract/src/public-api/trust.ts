import { z } from "zod";
import { clientObject, rfc3339UtcSchema, strictObject } from "./shared.js";

export const TrustSignalStateSchema = z
  .enum(["positive", "neutral", "warning", "negative", "unknown"])
  .meta({ id: "TrustSignalState", example: "positive" });
export type TrustSignalState = z.infer<typeof TrustSignalStateSchema>;

export const TrustSignalKeySchema = z
  .enum([
    "official_registry",
    "publisher_verified",
    "repository_available",
    "repository_archived",
    "open_source_license",
    "recent_repository_activity",
    "recent_release",
    "remote_reachable",
    "current_version_present",
    "package_present",
    "upstream_deleted",
  ])
  .meta({ id: "TrustSignalKey", example: "official_registry" });
export type TrustSignalKey = z.infer<typeof TrustSignalKeySchema>;

const trustSignalExample = {
  key: "official_registry",
  state: "positive",
  label: "Listed in the Official MCP Registry",
  observedAt: "2026-09-01T12:00:00Z",
  source: "registry",
  reason: null,
} as const;

const TrustSignalShape = {
  key: TrustSignalKeySchema,
  state: TrustSignalStateSchema,
  label: z.string().min(1),
  observedAt: rfc3339UtcSchema,
  source: z.string().min(1),
  reason: z.string().nullable(),
};

export const TrustProfileV1Schema = strictObject({
  schemaVersion: z.literal(1),
  signals: z.array(strictObject(TrustSignalShape)),
}).meta({
  id: "TrustProfileV1",
  example: {
    schemaVersion: 1,
    signals: [trustSignalExample],
  },
});
export type TrustProfileV1 = z.infer<typeof TrustProfileV1Schema>;

export const TrustProfileV1ClientSchema = clientObject({
  schemaVersion: z.literal(1),
  signals: z.array(clientObject(TrustSignalShape)),
});
export type TrustProfileV1Client = z.infer<typeof TrustProfileV1ClientSchema>;

const legacyTrustSignalShape = {
  key: z.string().min(1),
  status: TrustSignalStateSchema,
  summary: z.string().nullable(),
  checkedAt: rfc3339UtcSchema.nullable(),
};

export const legacyTrustProfileServerSchema = strictObject({
  officialRegistry: z.boolean(),
  publisherVerified: z.boolean(),
  sourceAvailable: z.boolean().nullable(),
  openSource: z.boolean().nullable(),
  signals: z.array(strictObject(legacyTrustSignalShape)),
});

export const legacyTrustProfileClientSchema = clientObject({
  officialRegistry: z.boolean(),
  publisherVerified: z.boolean(),
  sourceAvailable: z.boolean().nullable(),
  openSource: z.boolean().nullable(),
  signals: z.array(clientObject(legacyTrustSignalShape)),
});
