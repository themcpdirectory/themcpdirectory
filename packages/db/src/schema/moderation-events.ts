import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { servers } from "./servers.js";

export const moderationEvents = pgTable(
  "moderation_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    action: text().notNull(),
    reason: text(),
    metadata: jsonb(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("moderation_events_server_id_idx").on(t.serverId)],
);
