import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./better-auth.js";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    action: text().notNull(),
    outcome: text().notNull(),
    metadata: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_actor_user_id_idx").on(t.actorUserId),
    index("audit_events_resource_lookup_idx").on(t.resourceType, t.resourceId),
    index("audit_events_created_at_idx").on(t.createdAt),
  ],
);
