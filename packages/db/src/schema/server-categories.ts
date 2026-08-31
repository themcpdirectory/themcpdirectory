import {
  pgTable,
  uuid,
  text,
  real,
  timestamp,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { servers } from "./servers.js";
import { categories } from "./categories.js";

export const serverCategories = pgTable(
  "server_categories",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    source: text().notNull(),
    confidence: real(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serverId, t.categoryId] }),
    index("server_categories_category_id_idx").on(t.categoryId),
    check(
      "server_categories_source_check",
      sql`${t.source} in ('manual', 'publisher', 'classifier', 'import')`,
    ),
  ],
);
