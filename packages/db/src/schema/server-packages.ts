import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { serverVersions } from "./server-versions.js";

export const serverPackages = pgTable(
  "server_packages",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverVersionId: uuid("server_version_id")
      .notNull()
      .references(() => serverVersions.id, { onDelete: "cascade" }),
    registryType: text("registry_type").notNull(),
    registryBaseUrl: text("registry_base_url"),
    identifier: text().notNull(),
    version: text(),
    fileSha256: text("file_sha256"),
    runtimeHint: text("runtime_hint"),
    transportType: text("transport_type").notNull(),
    runtimeArguments: jsonb("runtime_arguments").notNull().default([]),
    packageArguments: jsonb("package_arguments").notNull().default([]),
    environmentVariables: jsonb("environment_variables").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("server_packages_server_version_id_idx").on(t.serverVersionId)],
);
