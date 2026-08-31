import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const publishers = pgTable(
  "publishers",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().unique().notNull(),
    displayName: text("display_name").notNull(),
    description: text(),
    websiteUrl: text("website_url"),
    githubOrg: text("github_org"),
    logoUrl: text("logo_url"),
    verificationState: text("verification_state").notNull().default("unverified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "publishers_verification_state_check",
      sql`${t.verificationState} in ('unverified', 'pending', 'verified', 'rejected', 'revoked')`,
    ),
  ],
);
