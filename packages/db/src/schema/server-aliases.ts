import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { servers } from "./servers.js";

export const serverAliases = pgTable(
  "server_aliases",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    alias: text().notNull(),
    kind: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("server_aliases_server_id_idx").on(t.serverId),
    check(
      "server_aliases_kind_check",
      sql`${t.kind} in ('slug', 'package', 'legacy_name', 'repository', 'manual')`,
    ),
  ],
);
