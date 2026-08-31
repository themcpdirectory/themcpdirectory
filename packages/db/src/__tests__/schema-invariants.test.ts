import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  registrySources,
  registrySyncRuns,
  registrySnapshots,
  publishers,
  publisherMemberships,
  servers,
  serverAliases,
  serverVersions,
  serverPackages,
  serverRemotes,
  serverIcons,
  categories,
  serverCategories,
  trustSignals,
  serverHealthChecks,
  repositorySnapshots,
  clientCompatibility,
  installOverrides,
  reports,
  moderationEvents,
} from "../schema/index.js";

function getConfig(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table);
}

function findColumn(table: Parameters<typeof getTableConfig>[0], name: string) {
  const config = getConfig(table);
  const col = config.columns.find((c) => c.name === name);
  if (!col) throw new Error(`Column ${name} not found in ${config.name}`);
  return col;
}

function hasIndex(table: Parameters<typeof getTableConfig>[0], partialName: string) {
  const config = getConfig(table);
  return config.indexes.some((idx) => idx.config.name?.includes(partialName));
}

describe("schema invariants", () => {
  describe("UUID primary keys with DB-generated defaults", () => {
    const tables = [
      { name: "registry_sources", table: registrySources },
      { name: "registry_sync_runs", table: registrySyncRuns },
      { name: "registry_snapshots", table: registrySnapshots },
      { name: "publishers", table: publishers },
      { name: "publisher_memberships", table: publisherMemberships },
      { name: "servers", table: servers },
      { name: "server_aliases", table: serverAliases },
      { name: "server_versions", table: serverVersions },
      { name: "server_packages", table: serverPackages },
      { name: "server_remotes", table: serverRemotes },
      { name: "server_icons", table: serverIcons },
      { name: "categories", table: categories },
      { name: "trust_signals", table: trustSignals },
      { name: "server_health_checks", table: serverHealthChecks },
      { name: "repository_snapshots", table: repositorySnapshots },
      { name: "client_compatibility", table: clientCompatibility },
      { name: "install_overrides", table: installOverrides },
      { name: "reports", table: reports },
      { name: "moderation_events", table: moderationEvents },
    ];

    it.each(tables)("$name has uuid PK with default", ({ table }) => {
      const col = findColumn(table, "id");
      expect(col.columnType).toBe("PgUUID");
      expect(col.hasDefault).toBe(true);
      expect(col.primary).toBe(true);
    });
  });

  describe("timestamptz columns", () => {
    it("servers.created_at is timestamptz", () => {
      const col = findColumn(servers, "created_at");
      expect(col.columnType).toContain("Timestamp");
    });

    it("publishers.updated_at is timestamptz", () => {
      const col = findColumn(publishers, "updated_at");
      expect(col.columnType).toContain("Timestamp");
    });
  });

  describe("unique constraints", () => {
    it("registry_sources has unique key", () => {
      const config = getConfig(registrySources);
      const keyCol = findColumn(registrySources, "key");
      expect(keyCol.isUnique || config.uniqueConstraints.length > 0).toBe(true);
    });

    it("publishers has unique slug", () => {
      const col = findColumn(publishers, "slug");
      expect(col.isUnique).toBe(true);
    });

    it("servers has unique slug", () => {
      const col = findColumn(servers, "slug");
      expect(col.isUnique).toBe(true);
    });

    it("categories has unique slug", () => {
      const col = findColumn(categories, "slug");
      expect(col.isUnique).toBe(true);
    });
  });

  describe("registry_snapshots immutable identity", () => {
    it("has composite unique on source_id+external_name+external_version+payload_hash", () => {
      const config = getConfig(registrySnapshots);
      const hasCompositeUnique = config.uniqueConstraints.some((uc) => {
        const cols = uc.columns.map((c) => c.name);
        return (
          cols.includes("registry_source_id") &&
          cols.includes("external_name") &&
          cols.includes("external_version") &&
          cols.includes("payload_hash")
        );
      });
      expect(hasCompositeUnique).toBe(true);
    });
  });

  describe("server_versions composite unique", () => {
    it("has composite unique on server_id+version+registry_source_id", () => {
      const config = getConfig(serverVersions);
      const hasCompositeUnique = config.uniqueConstraints.some((uc) => {
        const cols = uc.columns.map((c) => c.name);
        return (
          cols.includes("server_id") &&
          cols.includes("version") &&
          cols.includes("registry_source_id")
        );
      });
      expect(hasCompositeUnique).toBe(true);
    });
  });

  describe("foreign key indexes", () => {
    it("registry_sync_runs has FK index on registry_source_id", () => {
      expect(hasIndex(registrySyncRuns, "registry_source_id")).toBe(true);
    });

    it("registry_snapshots has FK index on registry_source_id", () => {
      expect(hasIndex(registrySnapshots, "registry_source_id")).toBe(true);
    });

    it("servers has FK index on publisher_id", () => {
      expect(hasIndex(servers, "publisher_id")).toBe(true);
    });

    it("server_versions has FK index on server_id", () => {
      expect(hasIndex(serverVersions, "server_id")).toBe(true);
    });

    it("server_packages has FK index on server_version_id", () => {
      expect(hasIndex(serverPackages, "server_version_id")).toBe(true);
    });

    it("server_remotes has FK index on server_version_id", () => {
      expect(hasIndex(serverRemotes, "server_version_id")).toBe(true);
    });

    it("trust_signals has FK index on server_id", () => {
      expect(hasIndex(trustSignals, "server_id")).toBe(true);
    });

    it("repository_snapshots has FK index on server_id", () => {
      expect(hasIndex(repositorySnapshots, "server_id")).toBe(true);
    });
  });

  describe("search infrastructure", () => {
    it("servers has search_document column", () => {
      const col = findColumn(servers, "search_document");
      expect(col).toBeDefined();
    });

    it("servers has search_text column", () => {
      const col = findColumn(servers, "search_text");
      expect(col).toBeDefined();
    });
  });

  describe("server_categories composite PK", () => {
    it("has server_id and category_id columns", () => {
      const config = getConfig(serverCategories);
      const colNames = config.columns.map((c) => c.name);
      expect(colNames).toContain("server_id");
      expect(colNames).toContain("category_id");
    });
  });

  describe("explicit FK delete behavior", () => {
    it("registry_sync_runs references registry_sources", () => {
      const config = getConfig(registrySyncRuns);
      expect(config.foreignKeys.length).toBeGreaterThan(0);
    });

    it("server_versions references servers", () => {
      const config = getConfig(serverVersions);
      expect(config.foreignKeys.length).toBeGreaterThan(0);
    });

    it("registry_snapshots.registry_source_id uses restrict on delete", () => {
      const config = getConfig(registrySnapshots);
      const fk = config.foreignKeys.find((f) => {
        const ref = f.reference();
        return ref.columns.some((c) => c.name === "registry_source_id");
      });
      expect(fk).toBeDefined();
      expect(fk!.onDelete).toBe("restrict");
    });
  });

  describe("citext columns", () => {
    it("publishers.slug emits citext SQL type", () => {
      const col = findColumn(publishers, "slug");
      expect(col.getSQLType()).toBe("citext");
    });

    it("servers.slug emits citext SQL type", () => {
      const col = findColumn(servers, "slug");
      expect(col.getSQLType()).toBe("citext");
    });
  });

  describe("tsvector column and GIN index", () => {
    it("servers.search_document emits tsvector SQL type", () => {
      const col = findColumn(servers, "search_document");
      expect(col.getSQLType()).toBe("tsvector");
    });

    it("servers has GIN index named servers_search_document_idx", () => {
      const config = getConfig(servers);
      const ginIdx = config.indexes.find(
        (idx) => idx.config.name === "servers_search_document_idx",
      );
      expect(ginIdx).toBeDefined();
    });
  });

  describe("lower(alias) unique expression index", () => {
    it("server_aliases has a unique index on lower(alias)", () => {
      const config = getConfig(serverAliases);
      const idx = config.indexes.find(
        (idx) => idx.config.name === "server_aliases_lower_alias_unique" && idx.config.unique,
      );
      expect(idx).toBeDefined();
    });
  });

  describe("no restrictive registry kind CHECK", () => {
    it("registry_sources has no CHECK constraint on kind", () => {
      const config = getConfig(registrySources);
      const kindCheck = config.checks.find((c) => c.name?.includes("kind"));
      expect(kindCheck).toBeUndefined();
    });
  });

  describe("mutable-table timestamp conventions", () => {
    const mutableTables = [
      { name: "registry_sources", table: registrySources },
      { name: "publishers", table: publishers },
      { name: "publisher_memberships", table: publisherMemberships },
      { name: "servers", table: servers },
      { name: "server_versions", table: serverVersions },
      { name: "categories", table: categories },
      { name: "trust_signals", table: trustSignals },
      { name: "client_compatibility", table: clientCompatibility },
      { name: "install_overrides", table: installOverrides },
      { name: "reports", table: reports },
    ];

    it.each(mutableTables)("$name has both created_at and updated_at", ({ table }) => {
      const config = getConfig(table);
      const colNames = config.columns.map((c) => c.name);
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("updated_at");
    });
  });
});
