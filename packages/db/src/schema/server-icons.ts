import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { serverVersions } from "./server-versions.js";

export const serverIcons = pgTable(
  "server_icons",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverVersionId: uuid("server_version_id")
      .notNull()
      .references(() => serverVersions.id, { onDelete: "cascade" }),
    src: text().notNull(),
    mimeType: text("mime_type"),
    sizes: text(),
    theme: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("server_icons_server_version_id_idx").on(t.serverVersionId)],
);
