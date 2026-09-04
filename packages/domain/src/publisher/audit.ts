import { auditEvents, type Database } from "@themcpdirectory/db";

type AuditOutcome = "success" | "failure" | "blocked";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const MAX_METADATA_KEYS = 20;
const MAX_ARRAY_LENGTH = 20;
const MAX_STRING_LENGTH = 512;
const MAX_METADATA_DEPTH = 4;

type AuditWriteStore = Pick<Database, "insert">;

export interface AuditEventInput {
  readonly actorUserId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly metadata: Record<string, unknown>;
}

function clampString(value: string): string {
  return value.length <= MAX_STRING_LENGTH ? value : value.slice(0, MAX_STRING_LENGTH);
}

function normalizeMetadataValue(value: unknown, depth: number): JsonValue {
  if (value === null) return null;
  if (typeof value === "string") return clampString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return clampString(value.toString());
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (depth >= MAX_METADATA_DEPTH) return [];
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => normalizeMetadataValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= MAX_METADATA_DEPTH) return {};

    const entries = Object.entries(value)
      .slice(0, MAX_METADATA_KEYS)
      .map(([key, entryValue]) => [key, normalizeMetadataValue(entryValue, depth + 1)] as const);

    return Object.fromEntries(entries);
  }

  return null;
}

function normalizeMetadata(metadata: Record<string, unknown>): JsonObject {
  const entries = Object.entries(metadata)
    .slice(0, MAX_METADATA_KEYS)
    .map(([key, value]) => [key, normalizeMetadataValue(value, 1)] as const);

  return Object.fromEntries(entries);
}

export async function appendAuditEvent(tx: AuditWriteStore, input: AuditEventInput): Promise<void> {
  await tx.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    resourceType: clampString(input.resourceType),
    resourceId: clampString(input.resourceId),
    action: clampString(input.action),
    outcome: input.outcome,
    metadata: normalizeMetadata(input.metadata),
  });
}
