import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { servers } from "./servers.js";
import { serverVersions } from "./server-versions.js";
import { serverRemotes } from "./server-remotes.js";

export const serverHealthChecks = pgTable(
  "server_health_checks",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    serverVersionId: uuid("server_version_id").references(() => serverVersions.id, {
      onDelete: "set null",
    }),
    remoteId: uuid("remote_id").references(() => serverRemotes.id, {
      onDelete: "set null",
    }),
    checkType: text("check_type").notNull(),
    status: text().notNull(),
    latencyMs: integer("latency_ms"),
    httpStatus: integer("http_status"),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("server_health_checks_server_id_idx").on(t.serverId),
    index("server_health_checks_server_version_id_idx").on(t.serverVersionId),
  ],
);
