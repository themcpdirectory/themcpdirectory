import { pgTable, uuid, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { registrySources } from "./registry-sources.js";

export const registrySyncRuns = pgTable(
  "registry_sync_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    registrySourceId: uuid("registry_source_id")
      .notNull()
      .references(() => registrySources.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text().notNull(),
    cursorStart: text("cursor_start"),
    cursorEnd: text("cursor_end"),
    recordsSeen: integer("records_seen").notNull().default(0),
    recordsCreated: integer("records_created").notNull().default(0),
    recordsUpdated: integer("records_updated").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("registry_sync_runs_registry_source_id_idx").on(t.registrySourceId),
    check(
      "registry_sync_runs_status_check",
      sql`${t.status} in ('running', 'succeeded', 'partially_failed', 'failed')`,
    ),
  ],
);
