import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { citext } from "./column-types.js";

export const publishers = pgTable(
  "publishers",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: citext().unique().notNull(),
    displayName: text("display_name").notNull(),
    description: text(),
    websiteUrl: text("website_url"),
    githubOrg: text("github_org"),
    githubOrgId: text("github_org_id"),
    logoUrl: text("logo_url"),
    verificationState: text("verification_state").notNull().default("unverified"),
    ownershipState: text("ownership_state").notNull().default("unlocked"),
    ownershipLockedAt: timestamp("ownership_locked_at", { withTimezone: true }),
    ownershipLockReason: text("ownership_lock_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "publishers_verification_state_check",
      sql`${t.verificationState} in ('unverified', 'pending', 'verified', 'rejected', 'revoked')`,
    ),
    check(
      "publishers_ownership_state_check",
      sql`${t.ownershipState} in ('unlocked', 'manual_review')`,
    ),
    check(
      "publishers_github_org_id_check",
      sql`${t.githubOrgId} is null or ${t.githubOrgId} ~ '^[0-9]+$'`,
    ),
  ],
);
