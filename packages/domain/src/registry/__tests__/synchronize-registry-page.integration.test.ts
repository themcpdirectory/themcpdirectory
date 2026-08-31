import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  registrySnapshots,
  registrySources,
  serverAliases,
  serverIcons,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
} from "@themcpdirectory/db";
import type { Database } from "@themcpdirectory/db";
import {
  RegistryPageSchema,
  VALID_REGISTRY_PAGE,
  type RegistryPage,
} from "@themcpdirectory/registry-client";
import {
  AmbiguousIdentityError,
  synchronizeRegistryPage,
} from "../synchronize-registry-page.js";
import { createTempDatabase } from "./postgres-test-db.js";

interface TableCounts {
  servers: number;
  snapshots: number;
  versions: number;
  packages: number;
  remotes: number;
  icons: number;
}

function makePage(mutate?: (page: RegistryPage) => void): RegistryPage {
  const page = RegistryPageSchema.parse(structuredClone(VALID_REGISTRY_PAGE));
  mutate?.(page);
  return page;
}

async function createSource(db: Database, key = "official") {
  const [source] = await db
    .insert(registrySources)
    .values({
      key,
      name: "Official Registry",
      baseUrl: "https://registry.modelcontextprotocol.io",
      kind: "official",
    })
    .returning();

  if (!source) {
    throw new Error("Expected registry source");
  }

  return source;
}

async function countRows(db: Database): Promise<TableCounts> {
  const [counts] = await db
    .select({
      servers: sql<number>`(select count(*) from ${servers})`,
      snapshots: sql<number>`(select count(*) from ${registrySnapshots})`,
      versions: sql<number>`(select count(*) from ${serverVersions})`,
      packages: sql<number>`(select count(*) from ${serverPackages})`,
      remotes: sql<number>`(select count(*) from ${serverRemotes})`,
      icons: sql<number>`(select count(*) from ${serverIcons})`,
    })
    .from(servers)
    .limit(1);

  return (
    counts ?? {
      servers: 0,
      snapshots: 0,
      versions: 0,
      packages: 0,
      remotes: 0,
      icons: 0,
    }
  );
}

describe("synchronizeRegistryPage integration", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase();
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    if (destroy) {
      await destroy();
      destroy = undefined;
    }
  });

  it("is idempotent for duplicate imports and keeps counts stable", async () => {
    const source = await createSource(db);
    const page = makePage();

    await synchronizeRegistryPage(db, source, page, {
      observedAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    const firstCounts = await countRows(db);

    await synchronizeRegistryPage(db, source, page, {
      observedAt: new Date("2026-09-01T10:05:00.000Z"),
    });
    const secondCounts = await countRows(db);

    expect(secondCounts).toEqual(firstCounts);
  });

  it("creates a new immutable snapshot when payload changes for same source/name/version", async () => {
    const source = await createSource(db);
    const firstPage = makePage();

    await synchronizeRegistryPage(db, source, firstPage, {
      observedAt: new Date("2026-09-01T10:00:00.000Z"),
    });

    const changedPage = makePage((page) => {
      const server = page.servers[0]?.server;
      if (!server) throw new Error("Expected fixture server");
      server.description = "Description changed while version remains equal";
    });

    await synchronizeRegistryPage(db, source, changedPage, {
      observedAt: new Date("2026-09-01T10:10:00.000Z"),
    });

    const snapshots = await db
      .select()
      .from(registrySnapshots)
      .orderBy(registrySnapshots.createdAt);

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]?.rawPayload).toEqual(firstPage.servers[0]);
    expect(snapshots[2]?.rawPayload).toEqual(changedPage.servers[0]);

    const [version] = await db
      .select()
      .from(serverVersions)
      .where(eq(serverVersions.version, firstPage.servers[0]!.server.version));
    expect(version?.registrySnapshotId).toBe(snapshots[2]?.id);
  });

  it("selects newest active current version and preserves child metadata idempotently", async () => {
    const source = await createSource(db);

    const pageV1 = makePage((page) => {
      const server = page.servers[0]?.server;
      if (!server) throw new Error("Expected fixture server");
      server.version = "1.0.0";
      if (page.servers[0]?._meta?.["io.modelcontextprotocol.registry/official"]) {
        page.servers[0]._meta["io.modelcontextprotocol.registry/official"].publishedAt =
          "2025-05-01T00:00:00Z";
        page.servers[0]._meta["io.modelcontextprotocol.registry/official"].status = "active";
      }
    });

    const pageV2 = makePage((page) => {
      const server = page.servers[0]?.server;
      if (!server) throw new Error("Expected fixture server");
      server.version = "2.0.0";
      server.packages = [
        {
          registryType: "npm",
          identifier: "@example/test-server",
          version: "2.0.0",
          transport: { type: "stdio" },
        },
      ];
      server.remotes = [
        {
          type: "streamable-http",
          url: "https://example.com/stream",
        },
      ];
      server.icons = [
        {
          src: "https://example.com/icon-light.png",
          theme: "light",
        },
      ];

      if (page.servers[0]?._meta?.["io.modelcontextprotocol.registry/official"]) {
        page.servers[0]._meta["io.modelcontextprotocol.registry/official"].publishedAt =
          "2025-06-01T00:00:00Z";
        page.servers[0]._meta["io.modelcontextprotocol.registry/official"].status = "active";
      }
    });

    await synchronizeRegistryPage(db, source, pageV1, {
      observedAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    await synchronizeRegistryPage(db, source, pageV2, {
      observedAt: new Date("2026-09-01T10:10:00.000Z"),
    });
    await synchronizeRegistryPage(db, source, pageV2, {
      observedAt: new Date("2026-09-01T10:20:00.000Z"),
    });

    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.canonicalRegistryName, "io.github.example/test-server"));
    expect(server).toBeDefined();

    const [currentVersion] = await db
      .select()
      .from(serverVersions)
      .where(eq(serverVersions.id, server!.currentVersionId!));
    expect(currentVersion?.version).toBe("2.0.0");

    const [versionTwo] = await db
      .select()
      .from(serverVersions)
      .where(and(eq(serverVersions.serverId, server!.id), eq(serverVersions.version, "2.0.0")));

    const packageRows = await db
      .select()
      .from(serverPackages)
      .where(eq(serverPackages.serverVersionId, versionTwo!.id));
    const remoteRows = await db
      .select()
      .from(serverRemotes)
      .where(eq(serverRemotes.serverVersionId, versionTwo!.id));
    const iconRows = await db
      .select()
      .from(serverIcons)
      .where(eq(serverIcons.serverVersionId, versionTwo!.id));

    expect(packageRows).toHaveLength(1);
    expect(remoteRows).toHaveLength(1);
    expect(iconRows).toHaveLength(1);
  });

  it("resolves identity precedence in order: upstream mapping, repository id, package id, alias", async () => {
    const source = await createSource(db);
    const observedAt = new Date("2026-09-01T10:00:00.000Z");

    const [serverByUpstream] = await db
      .insert(servers)
      .values({
        slug: "upstream-server",
        title: "Upstream Server",
        shortDescription: "upstream",
        canonicalRegistryName: "io.github.example/test-server",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning();

    const [serverByRepo] = await db
      .insert(servers)
      .values({
        slug: "repo-server",
        title: "Repo Server",
        shortDescription: "repo",
        repositorySource: "github",
        repositoryExternalId: "abc123",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning();

    const [serverByPackage] = await db
      .insert(servers)
      .values({
        slug: "package-server",
        title: "Package Server",
        shortDescription: "package",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning();

    await db.insert(serverVersions).values({
      serverId: serverByPackage!.id,
      registrySourceId: source.id,
      version: "9.9.9",
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      normalizedPayload: { server: { version: "9.9.9" } },
    });

    const [packageVersion] = await db
      .select()
      .from(serverVersions)
      .where(and(eq(serverVersions.serverId, serverByPackage!.id), eq(serverVersions.version, "9.9.9")));

    await db.insert(serverPackages).values({
      serverVersionId: packageVersion!.id,
      registryType: "npm",
      identifier: "@example/test-server",
      transportType: "stdio",
    });

    const [serverByAlias] = await db
      .insert(servers)
      .values({
        slug: "alias-server",
        title: "Alias Server",
        shortDescription: "alias",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning();

    await db.insert(serverAliases).values({
      serverId: serverByAlias!.id,
      alias: "io.github.example/minimal-server",
      kind: "manual",
    });

    const page = makePage();
    await synchronizeRegistryPage(db, source, page, { observedAt });

    const upstreamVersion = await db
      .select()
      .from(serverVersions)
      .where(and(eq(serverVersions.serverId, serverByUpstream!.id), eq(serverVersions.version, "1.2.0")));
    expect(upstreamVersion).toHaveLength(1);

    const aliasVersion = await db
      .select()
      .from(serverVersions)
      .where(and(eq(serverVersions.serverId, serverByAlias!.id), eq(serverVersions.version, "0.1.0")));
    expect(aliasVersion).toHaveLength(1);

    const repoVersion = await db
      .select()
      .from(serverVersions)
      .where(and(eq(serverVersions.serverId, serverByRepo!.id), eq(serverVersions.version, "1.2.0")));
    expect(repoVersion).toHaveLength(0);
  });

  it("fails safely on ambiguous identity instead of selecting silently", async () => {
    const source = await createSource(db);
    const observedAt = new Date("2026-09-01T10:00:00.000Z");

    const [one] = await db
      .insert(servers)
      .values({
        slug: "ambiguous-one",
        title: "Ambiguous One",
        shortDescription: "one",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning();

    const [two] = await db
      .insert(servers)
      .values({
        slug: "ambiguous-two",
        title: "Ambiguous Two",
        shortDescription: "two",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .returning();

    for (const serverId of [one!.id, two!.id]) {
      const [version] = await db
        .insert(serverVersions)
        .values({
          serverId,
          registrySourceId: source.id,
          version: "1.0.0",
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
          normalizedPayload: { server: { version: "1.0.0" } },
        })
        .returning();

      await db.insert(serverPackages).values({
        serverVersionId: version!.id,
        registryType: "npm",
        identifier: "@example/test-server",
        transportType: "stdio",
      });
    }

    const page = makePage((entry) => {
      const first = entry.servers[0]?.server;
      if (!first) throw new Error("Expected fixture server");
      first.name = "io.github.example/completely-new-identity";
      first.repository = undefined;
    });

    await expect(
      synchronizeRegistryPage(db, source, page, {
        observedAt,
      }),
    ).rejects.toBeInstanceOf(AmbiguousIdentityError);

    const [created] = await db
      .select({ count: sql<number>`count(*)` })
      .from(servers)
      .where(and(eq(servers.canonicalRegistryName, "io.github.example/completely-new-identity")));
    expect(Number(created?.count ?? 0)).toBe(0);
  });

  it("preserves deleted upstream history and marks listing as deleted_upstream", async () => {
    const source = await createSource(db);

    const activePage = makePage();
    await synchronizeRegistryPage(db, source, activePage, {
      observedAt: new Date("2026-09-01T10:00:00.000Z"),
    });

    const deletedPage = makePage((page) => {
      const upstream = page.servers[0]?._meta?.["io.modelcontextprotocol.registry/official"];
      if (!upstream) throw new Error("Expected upstream metadata");
      upstream.status = "deleted";
    });

    await synchronizeRegistryPage(db, source, deletedPage, {
      observedAt: new Date("2026-09-01T10:10:00.000Z"),
    });

    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.canonicalRegistryName, "io.github.example/test-server"));

    expect(server?.listingStatus).toBe("deleted_upstream");

    const versions = await db
      .select()
      .from(serverVersions)
      .where(eq(serverVersions.serverId, server!.id));
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.some((version) => version.upstreamStatus === "deleted")).toBe(true);

    const activeCurrentVersion = await db
      .select()
      .from(serverVersions)
      .where(and(eq(serverVersions.id, server!.currentVersionId!), eq(serverVersions.upstreamStatus, "active")));
    expect(activeCurrentVersion).toHaveLength(0);

    const nullCurrentOnDeleted = await db
      .select()
      .from(servers)
      .where(and(eq(servers.id, server!.id), isNull(servers.currentVersionId)));
    expect(nullCurrentOnDeleted).toHaveLength(1);
  });
});
