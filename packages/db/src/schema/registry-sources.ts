import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const registrySources = pgTable("registry_sources", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().unique().notNull(),
  name: text().notNull(),
  baseUrl: text("base_url").notNull(),
  kind: text().notNull(),
  enabled: boolean().notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
