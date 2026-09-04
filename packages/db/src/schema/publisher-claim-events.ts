import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./better-auth.js";
import { publisherClaims } from "./publisher-claims.js";

export const publisherClaimEvents = pgTable(
  "publisher_claim_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => publisherClaims.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text(),
    evidenceSummary: jsonb("evidence_summary")
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publisher_claim_events_claim_id_idx").on(t.claimId),
    index("publisher_claim_events_actor_user_id_idx").on(t.actorUserId),
    check(
      "publisher_claim_events_to_status_check",
      sql`${t.toStatus} in ('pending', 'verifying', 'verified', 'rejected', 'withdrawn', 'superseded', 'revoked')`,
    ),
  ],
);
