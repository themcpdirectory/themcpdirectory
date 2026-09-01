import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { servers } from "./servers.js";

export const repositorySnapshots = pgTable(
  "repository_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    externalRepositoryId: text("external_repository_id").notNull(),
    owner: text().notNull(),
    name: text().notNull(),
    url: text().notNull(),
    defaultBranch: text("default_branch"),
    isArchived: boolean("is_archived"),
    isFork: boolean("is_fork"),
    stars: integer(),
    forks: integer(),
    openIssues: integer("open_issues"),
    licenseSpdx: text("license_spdx"),
    lastPushAt: timestamp("last_push_at", { withTimezone: true }),
    lastReleaseAt: timestamp("last_release_at", { withTimezone: true }),
    payload: jsonb(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("repository_snapshots_server_id_idx").on(t.serverId),
    index("repository_snapshots_external_repo_id_idx").on(t.externalRepositoryId),
    uniqueIndex("repository_snapshots_check_uidx").on(t.serverId, t.provider, t.checkedAt),
  ],
);
