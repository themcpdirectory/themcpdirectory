import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { serverVersions } from "./server-versions.js";

export const serverRemotes = pgTable(
  "server_remotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverVersionId: uuid("server_version_id")
      .notNull()
      .references(() => serverVersions.id, { onDelete: "cascade" }),
    transportType: text("transport_type").notNull(),
    urlTemplate: text("url_template").notNull(),
    headers: jsonb().notNull().default([]),
    variables: jsonb().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("server_remotes_server_version_id_idx").on(t.serverVersionId)],
);
