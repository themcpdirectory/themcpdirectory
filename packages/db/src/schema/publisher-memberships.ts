import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { publishers } from "./publishers.js";

export const publisherMemberships = pgTable(
  "publisher_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publisher_memberships_publisher_id_idx").on(t.publisherId),
    index("publisher_memberships_user_id_idx").on(t.userId),
    check(
      "publisher_memberships_role_check",
      sql`${t.role} in ('owner', 'admin', 'editor', 'viewer')`,
    ),
  ],
);
