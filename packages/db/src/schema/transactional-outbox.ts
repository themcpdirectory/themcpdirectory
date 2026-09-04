import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const transactionalOutbox = pgTable(
  "transactional_outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    eventKey: text("event_key").notNull(),
    payload: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transactional_outbox_event_key_uidx").on(t.eventKey),
    index("transactional_outbox_delivery_idx").on(t.deliveredAt, t.availableAt),
    index("transactional_outbox_event_type_idx").on(t.eventType),
  ],
);
