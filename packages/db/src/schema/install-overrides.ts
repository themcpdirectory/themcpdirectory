import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { servers } from "./servers.js";

export const installOverrides = pgTable(
  "install_overrides",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    variantId: text("variant_id"),
    overridePayload: jsonb("override_payload").notNull(),
    reason: text().notNull(),
    source: text().notNull(),
    approvedBy: uuid("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("install_overrides_server_id_idx").on(t.serverId)],
);
