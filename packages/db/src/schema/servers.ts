import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { publishers } from "./publishers.js";
import { serverVersions } from "./server-versions.js";
import { citext, tsvector } from "./column-types.js";

export const servers = pgTable(
  "servers",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: citext().unique().notNull(),
    title: text().notNull(),
    shortDescription: text("short_description").notNull(),
    longDescription: text("long_description"),

    canonicalRegistryName: text("canonical_registry_name"),
    publisherId: uuid("publisher_id").references(() => publishers.id, {
      onDelete: "set null",
    }),

    listingStatus: text("listing_status").notNull(),
    moderationStatus: text("moderation_status").notNull(),

    currentVersionId: uuid("current_version_id").references((): AnyPgColumn => serverVersions.id, {
      onDelete: "set null",
    }),

    repositoryUrl: text("repository_url"),
    repositorySource: text("repository_source"),
    repositoryExternalId: text("repository_external_id"),
    repositorySubfolder: text("repository_subfolder"),

    homepageUrl: text("homepage_url"),
    documentationUrl: text("documentation_url"),
    licenseSpdx: text("license_spdx"),

    sourceAvailable: boolean("source_available"),
    openSource: boolean("open_source"),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),

    searchDocument: tsvector("search_document"),
    searchText: text("search_text"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("servers_publisher_id_idx").on(t.publisherId),
    index("servers_listing_status_idx").on(t.listingStatus),
    index("servers_moderation_status_idx").on(t.moderationStatus),
    index("servers_search_document_idx").using("gin", t.searchDocument),
    index("servers_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    index("servers_slug_trgm_idx").using("gin", sql`${t.slug} gin_trgm_ops`),
    uniqueIndex("servers_repository_identity_uidx")
      .on(t.repositorySource, t.repositoryExternalId)
      .where(sql`${t.repositorySource} is not null and ${t.repositoryExternalId} is not null`),
    check(
      "servers_listing_status_check",
      sql`${t.listingStatus} in ('active', 'deprecated', 'deleted_upstream', 'unavailable')`,
    ),
    check(
      "servers_moderation_status_check",
      sql`${t.moderationStatus} in ('normal', 'under_review', 'hidden', 'blocked')`,
    ),
  ],
);
