import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { servers } from "./servers.js";

export const installManifestSnapshots = pgTable(
  "install_manifest_snapshots",
  {
    manifestHash: text("manifest_hash").notNull(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    manifest: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.clientId, table.manifestHash] }),
    index("install_manifest_snapshots_server_hash_idx").on(table.serverId, table.manifestHash),
    check("install_manifest_snapshots_hash_check", sql`${table.manifestHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "install_manifest_snapshots_client_check",
      sql`${table.clientId} in ('', 'claude-code', 'codex', 'cursor', 'vscode')`,
    ),
  ],
);
