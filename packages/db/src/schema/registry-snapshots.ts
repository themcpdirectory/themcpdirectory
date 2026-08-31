import { pgTable, uuid, text, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { registrySources } from "./registry-sources.js";

export const registrySnapshots = pgTable(
  "registry_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    registrySourceId: uuid("registry_source_id")
      .notNull()
      .references(() => registrySources.id, { onDelete: "cascade" }),
    externalName: text("external_name").notNull(),
    externalVersion: text("external_version").notNull(),
    schemaUri: text("schema_uri"),
    payloadHash: text("payload_hash").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("registry_snapshots_registry_source_id_idx").on(t.registrySourceId),
    unique("registry_snapshots_identity").on(
      t.registrySourceId,
      t.externalName,
      t.externalVersion,
      t.payloadHash,
    ),
  ],
);
