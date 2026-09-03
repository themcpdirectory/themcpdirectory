import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const legalHolds = pgTable(
  "legal_holds",
  {
    id: uuid().primaryKey().defaultRandom(),
    scope: text().notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    reason: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_holds_lookup_idx").on(t.scope, t.subjectType, t.subjectId, t.expiresAt)],
);
