import { pgTable, uuid, text, timestamp, index, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./better-auth.js";
import { publishers } from "./publishers.js";

export const publisherMemberships = pgTable(
  "publisher_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publisher_memberships_publisher_id_idx").on(t.publisherId),
    index("publisher_memberships_user_id_idx").on(t.userId),
    uniqueIndex("publisher_memberships_publisher_user_uidx").on(t.publisherId, t.userId),
    check(
      "publisher_memberships_role_check",
      sql`${t.role} in ('owner', 'admin', 'editor', 'viewer')`,
    ),
  ],
);
