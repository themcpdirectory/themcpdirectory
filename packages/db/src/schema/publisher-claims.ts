import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./better-auth.js";
import { publishers } from "./publishers.js";
import { servers } from "./servers.js";

export const publisherClaims = pgTable(
  "publisher_claims",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    verificationMethod: text("verification_method").notNull(),
    githubSubjectType: text("github_subject_type").notNull(),
    githubSubjectId: text("github_subject_id").notNull(),
    status: text().notNull().default("pending"),
    evidenceSummary: jsonb("evidence_summary")
      .notNull()
      .default(sql`'{}'::jsonb`),
    failureReason: text("failure_reason"),
    conflictClaimId: uuid("conflict_claim_id"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publisher_claims_server_id_idx").on(t.serverId),
    index("publisher_claims_publisher_id_idx").on(t.publisherId),
    index("publisher_claims_requester_user_id_idx").on(t.requesterUserId),
    index("publisher_claims_github_subject_id_idx").on(t.githubSubjectId),
    uniqueIndex("publisher_claims_open_server_uidx")
      .on(t.serverId)
      .where(sql`${t.status} in ('pending', 'verifying')`),
    check(
      "publisher_claims_status_check",
      sql`${t.status} in ('pending', 'verifying', 'verified', 'rejected', 'withdrawn', 'superseded', 'revoked')`,
    ),
    check(
      "publisher_claims_verification_method_check",
      sql`${t.verificationMethod} in ('github_repository', 'github_organization')`,
    ),
    check(
      "publisher_claims_subject_type_check",
      sql`${t.githubSubjectType} in ('repository', 'organization')`,
    ),
    foreignKey({
      columns: [t.conflictClaimId],
      foreignColumns: [t.id],
      name: "publisher_claims_conflict_claim_id_fk",
    }).onDelete("set null"),
  ],
);
