import { sql, type SQLWrapper } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { servers } from "./servers.js";

const telemetryDimensions = {
  event: text().notNull(),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
  cliMajorMinor: text("cli_major_minor").notNull(),
  client: text(),
  success: boolean().notNull(),
  installVariant: text("install_variant"),
};

const dimensionChecks = (table: {
  event: SQLWrapper;
  cliMajorMinor: SQLWrapper;
  client: SQLWrapper;
  installVariant: SQLWrapper;
}) =>
  [
    check(
      "cli_telemetry_event_check",
      sql`${table.event} in ('search', 'add', 'remove', 'update')`,
    ),
    check("cli_telemetry_cli_major_minor_check", sql`${table.cliMajorMinor} ~ '^[0-9]+\.[0-9]+$'`),
    check(
      "cli_telemetry_client_check",
      sql`${table.client} is null or ${table.client} in ('claude-code', 'codex', 'cursor', 'vscode')`,
    ),
    check(
      "cli_telemetry_install_variant_check",
      sql`${table.installVariant} is null or ${table.installVariant} in ('package', 'remote')`,
    ),
  ] as const;

export const cliTelemetryEvents = pgTable(
  "cli_telemetry_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    ...telemetryDimensions,
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    aggregatedAt: timestamp("aggregated_at", { withTimezone: true }),
  },
  (table) => [
    index("cli_telemetry_events_received_at_idx").on(table.receivedAt),
    index("cli_telemetry_events_event_server_received_at_idx").on(
      table.event,
      table.serverId,
      table.receivedAt,
    ),
    index("cli_telemetry_events_aggregation_idx").on(table.aggregatedAt, table.receivedAt),
    ...dimensionChecks(table),
  ],
);

export const cliTelemetryDailyCounts = pgTable(
  "cli_telemetry_daily_counts",
  {
    day: date().notNull(),
    ...telemetryDimensions,
    count: bigint({ mode: "number" }).notNull().default(0),
  },
  (table) => [
    uniqueIndex("cli_telemetry_daily_counts_dimensions_uidx").on(
      table.day,
      table.event,
      sql`coalesce(${table.serverId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.cliMajorMinor,
      sql`coalesce(${table.client}, '')`,
      table.success,
      sql`coalesce(${table.installVariant}, '')`,
    ),
    index("cli_telemetry_daily_counts_server_day_idx").on(table.serverId, table.day),
    index("cli_telemetry_daily_counts_day_idx").on(table.day),
    check("cli_telemetry_daily_counts_nonnegative_check", sql`${table.count} >= 0`),
    ...dimensionChecks(table),
  ],
);
