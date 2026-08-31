import { pgTable, uuid, text, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const registrySources = pgTable(
  "registry_sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().unique().notNull(),
    name: text().notNull(),
    baseUrl: text("base_url").notNull(),
    kind: text().notNull(),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("registry_sources_kind_check", sql`${t.kind} in ('mcp-registry')`)],
);
