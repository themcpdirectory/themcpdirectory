import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import {
  registrySources,
  registrySyncRuns,
  serverPackages,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import {
  RegistryPageSchema,
  VALID_REGISTRY_PAGE,
  type RegistryPage,
} from "@themcpdirectory/registry-client";
import {
  RegistrySyncTerminalError,
  processRegistrySyncJob,
  runRegistrySync,
} from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";

function makePage(mutate?: (page: RegistryPage) => void): RegistryPage {
  const page = RegistryPageSchema.parse(structuredClone(VALID_REGISTRY_PAGE));
  mutate?.(page);
  return page;
}

async function* fromPages(...pages: RegistryPage[]): AsyncGenerator<RegistryPage> {
  for (const page of pages) {
    yield page;
  }
}

async function latestRun(db: Database, sourceId: string) {
  const [run] = await db
    .select()
    .from(registrySyncRuns)
    .where(eq(registrySyncRuns.registrySourceId, sourceId))
    .orderBy(desc(registrySyncRuns.startedAt))
    .limit(1);

  if (!run) {
    throw new Error("Expected sync run");
  }

  return run;
}

describe("registry sync worker", () => {
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

  it("persists a partially_failed run summary before rejecting on record failures", async () => {
    const safe = makePage((page) => {
      page.servers = [page.servers[0]!];
      page.servers[0]!.server.name = "io.github.example/safe-success";
      page.servers[0]!.server.repository = undefined;
      page.servers[0]!.server.packages = [
        {
          registryType: "npm",
          identifier: "@example/safe-success",
          transport: { type: "stdio" },
        },
      ];
    });

    const conflictOne = await db
      .insert(servers)
      .values({
        slug: "worker-ambiguous-one",
        title: "Worker Ambiguous One",
        shortDescription: "one",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: new Date("2026-09-01T12:30:00.000Z"),
        lastSeenAt: new Date("2026-09-01T12:30:00.000Z"),
      })
      .returning();

    const conflictTwo = await db
      .insert(servers)
      .values({
        slug: "worker-ambiguous-two",
        title: "Worker Ambiguous Two",
        shortDescription: "two",
        listingStatus: "active",
        moderationStatus: "normal",
        firstSeenAt: new Date("2026-09-01T12:30:00.000Z"),
        lastSeenAt: new Date("2026-09-01T12:30:00.000Z"),
      })
      .returning();

    const sourceRows = await db
      .insert(registrySources)
      .values({
        key: "official",
        name: "Official Registry",
        baseUrl: "https://registry.modelcontextprotocol.io",
        kind: "official",
      })
      .returning();
    const source = sourceRows[0]!;

    for (const server of [conflictOne[0]!, conflictTwo[0]!]) {
      const versions = await db
        .insert(serverVersions)
        .values({
          serverId: server.id,
          registrySourceId: source.id,
          version: "1.0.0",
          firstSeenAt: new Date("2026-09-01T12:30:00.000Z"),
          lastSeenAt: new Date("2026-09-01T12:30:00.000Z"),
          normalizedPayload: { server: { version: "1.0.0" } },
        })
        .returning();

      await db.insert(serverPackages).values({
        serverVersionId: versions[0]!.id,
        registryType: "npm",
        identifier: "@collision/worker-ambiguous",
        transportType: "stdio",
      });
    }

    const ambiguous = makePage((page) => {
      page.servers = [page.servers[0]!];
      page.servers[0]!.server.name = "io.github.example/worker-ambiguous";
      page.servers[0]!.server.repository = undefined;
      page.servers[0]!.server.packages = [
        {
          registryType: "npm",
          identifier: "@collision/worker-ambiguous",
          transport: { type: "stdio" },
        },
      ];
    });

    const mixed: RegistryPage = {
      metadata: { count: 2 },
      servers: [safe.servers[0]!, ambiguous.servers[0]!],
    };

    await expect(
      runRegistrySync({
        db,
        sourceKey: "official",
        baseUrl: "https://registry.modelcontextprotocol.io",
        pages: fromPages(mixed),
      }),
    ).rejects.toBeInstanceOf(RegistrySyncTerminalError);

    const run = await latestRun(db, source.id);
    expect(run.status).toBe("partially_failed");
    expect(run.recordsSeen).toBe(2);
    expect(run.recordsFailed).toBe(1);
    expect(run.recordsCreated).toBeGreaterThan(0);

    const created = await db
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.canonicalRegistryName, "io.github.example/safe-success"));
    expect(created).toHaveLength(1);
  });

  it("handler rejects after failed run is persisted", async () => {
    const brokenPages = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<RegistryPage>> {
            throw new Error("upstream unavailable");
          },
        };
      },
    };

    await expect(
      processRegistrySyncJob({
        db,
        jobData: { sourceKey: "official" },
        baseUrl: "https://registry.modelcontextprotocol.io",
        pages: brokenPages,
      }),
    ).rejects.toBeInstanceOf(RegistrySyncTerminalError);

    const [source] = await db
      .select()
      .from(registrySources)
      .where(eq(registrySources.key, "official"));
    expect(source).toBeDefined();

    const run = await latestRun(db, source!.id);
    expect(run.status).toBe("failed");
    expect(run.recordsSeen).toBe(0);
    expect(run.recordsFailed).toBe(0);
    expect(run.errorSummary).toContain("upstream unavailable");
  });
});
