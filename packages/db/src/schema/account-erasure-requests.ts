import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./better-auth.js";

export const accountErasureRequests = pgTable(
  "account_erasure_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    status: text().notNull().default("pending"),
    currentStep: text("current_step").notNull().default("requested"),
    retryCount: integer("retry_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("account_erasure_requests_user_id_idx").on(t.userId),
    index("account_erasure_requests_status_idx").on(t.status),
    index("account_erasure_requests_next_attempt_at_idx").on(t.nextAttemptAt),
    check(
      "account_erasure_requests_status_check",
      sql`${t.status} in ('pending', 'in_progress', 'retry_scheduled', 'completed', 'failed', 'blocked')`,
    ),
  ],
);
