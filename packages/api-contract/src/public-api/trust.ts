import { z } from "zod";
import { clientObject, rfc3339UtcSchema, strictObject } from "./shared.js";

export const TrustSignalStateSchema = z.enum([
  "positive",
  "neutral",
  "warning",
  "negative",
  "unknown",
]);

export const TrustSignalKeySchema = z.enum([
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
]);

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
});

export const TrustProfileV1ClientSchema = clientObject({
  schemaVersion: z.literal(1),
  signals: z.array(clientObject(TrustSignalShape)),
});

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