import { pgTable, uuid, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { servers } from "./servers.js";
import { serverVersions } from "./server-versions.js";

export const trustSignals = pgTable(
  "trust_signals",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    serverVersionId: uuid("server_version_id").references(() => serverVersions.id, {
      onDelete: "set null",
    }),
    signalKey: text("signal_key").notNull(),
    status: text().notNull(),
    source: text(),
    summary: text(),
    details: text(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trust_signals_server_id_idx").on(t.serverId),
    index("trust_signals_server_version_id_idx").on(t.serverVersionId),
    uniqueIndex("trust_signals_server_key_checked_at_uidx").on(
      t.serverId,
      t.signalKey,
      t.checkedAt,
    ),
    index("trust_signals_checked_at_idx").on(t.checkedAt),
    index("trust_signals_unchecked_created_at_idx")
      .on(t.createdAt)
      .where(sql`${t.checkedAt} is null`),
    index("trust_signals_expires_at_idx").on(t.expiresAt),
    check(
      "trust_signals_status_check",
      sql`${t.status} in ('positive', 'neutral', 'warning', 'negative', 'unknown')`,
    ),
  ],
);
