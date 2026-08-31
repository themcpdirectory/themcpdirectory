import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { servers } from "./servers.js";

export const reports = pgTable(
  "reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id"),
    reporterEmail: text("reporter_email"),
    category: text().notNull(),
    message: text().notNull(),
    status: text().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reports_server_id_idx").on(t.serverId),
    check(
      "reports_category_check",
      sql`${t.category} in ('malware', 'impersonation', 'incorrect_metadata', 'broken', 'abandoned', 'security', 'spam', 'other')`,
    ),
  ],
);
