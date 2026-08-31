import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { servers } from "./servers.js";

export const clientCompatibility = pgTable(
  "client_compatibility",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    status: text().notNull(),
    reason: text(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("client_compatibility_server_id_idx").on(t.serverId),
    check(
      "client_compatibility_status_check",
      sql`${t.status} in ('supported', 'supported_with_configuration', 'unsupported', 'unknown')`,
    ),
  ],
);
