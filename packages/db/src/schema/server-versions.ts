import { pgTable, uuid, text, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { servers } from "./servers.js";
import { registrySources } from "./registry-sources.js";
import { registrySnapshots } from "./registry-snapshots.js";

export const serverVersions = pgTable(
  "server_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    registrySourceId: uuid("registry_source_id").references(() => registrySources.id, {
      onDelete: "set null",
    }),
    registrySnapshotId: uuid("registry_snapshot_id").references(() => registrySnapshots.id, {
      onDelete: "set null",
    }),
    version: text().notNull(),
    schemaUri: text("schema_uri"),
    upstreamStatus: text("upstream_status"),
    description: text(),
    title: text(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    normalizedPayload: jsonb("normalized_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("server_versions_server_id_idx").on(t.serverId),
    index("server_versions_registry_source_id_idx").on(t.registrySourceId),
    index("server_versions_registry_snapshot_id_idx").on(t.registrySnapshotId),
    unique("server_versions_identity").on(t.serverId, t.version, t.registrySourceId),
  ],
);
