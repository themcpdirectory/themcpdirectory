import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registrySources,
  serverHealthChecks,
  serverAliases,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "../app.js";
import { createTempDatabase, type TempDatabase } from "./postgres-test-db.js";

let temp: TempDatabase;
let app: ReturnType<typeof createApiApp>;

async function seedServer(
  db: Database,
  registrySourceId: string,
  input: {
    slug: string;
    title: string;
    publishedAt: Date;
    listingStatus?: "active" | "deleted_upstream";
    packageIdentifier?: string;
  },
): Promise<void> {
  const observedAt = new Date("2026-09-01T12:00:00.000Z");
  const [server] = await db
    .insert(servers)
    .values({
      slug: input.slug,
      title: input.title,
      shortDescription: `${input.title} tools`,
      listingStatus: input.listingStatus ?? "active",
      moderationStatus: "normal",
      sourceAvailable: true,
      openSource: true,
      firstSeenAt: input.publishedAt,
      lastSeenAt: observedAt,
    })
    .returning({ id: servers.id });
  if (!server) throw new Error("Expected server row");

  const [version] = await db
    .insert(serverVersions)
    .values({
      serverId: server.id,
      registrySourceId,
      version: "1.2.3",
      upstreamStatus: "active",
      title: input.title,
      description: `${input.title} tools`,
      publishedAt: input.publishedAt,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      normalizedPayload: {},
    })
    .returning({ id: serverVersions.id });
  if (!version) throw new Error("Expected server version row");

  await db.update(servers).set({ currentVersionId: version.id }).where(eq(servers.id, server.id));
  if (input.packageIdentifier) {
    await db.insert(serverPackages).values({
      serverVersionId: version.id,
      registryType: "npm",
      identifier: input.packageIdentifier,
      version: "1.2.3",
      runtimeHint: "npx",
      transportType: "stdio",
      fileSha256: "a".repeat(64),
    });
  }
}

beforeAll(async () => {
  temp = await createTempDatabase("task9_api_core");
  const [source] = await temp.db
    .insert(registrySources)
    .values({
      key: "official",
      name: "Official MCP Registry",
      baseUrl: "https://registry.modelcontextprotocol.io",
      kind: "official",
    })
    .returning({ id: registrySources.id });
  if (!source) throw new Error("Expected registry source row");

  await seedServer(temp.db, source.id, {
    slug: "github",
    title: "GitHub",
    publishedAt: new Date("2026-09-01T10:00:00.000Z"),
    packageIdentifier: "@github/mcp-server",
  });
  const [github] = await temp.db
    .select({ id: servers.id, currentVersionId: servers.currentVersionId })
    .from(servers)
    .where(eq(servers.slug, "github"));
  if (!github?.currentVersionId) throw new Error("Expected GitHub server row");
  await temp.db.insert(serverAliases).values({
    serverId: github.id,
    alias: "github-server",
    kind: "manual",
  });
  const [remote] = await temp.db
    .insert(serverRemotes)
    .values({
      serverVersionId: github.currentVersionId,
      transportType: "streamable-http",
      urlTemplate: "https://api.github.example/mcp",
    })
    .returning({ id: serverRemotes.id });
  if (!remote) throw new Error("Expected GitHub remote row");
  await temp.db.insert(trustSignals).values({
    serverId: github.id,
    serverVersionId: github.currentVersionId,
    signalKey: "remote_reachable",
    status: "positive",
    source: "remote_probe",
    summary: "The endpoint responded successfully.",
    checkedAt: new Date("2026-09-01T12:30:00.000Z"),
  });
  await temp.db.insert(serverHealthChecks).values({
    serverId: github.id,
    serverVersionId: github.currentVersionId,
    remoteId: remote.id,
    checkType: "remote_probe",
    status: "healthy",
    latencyMs: 42,
    httpStatus: 200,
    finalOrigin: "https://api.github.example",
    redirectCount: 0,
    methodUsed: "HEAD",
    checkedAt: new Date("2026-09-01T12:30:00.000Z"),
  });
  await seedServer(temp.db, source.id, {
    slug: "second-server",
    title: "Second Server",
    publishedAt: new Date("2026-08-31T10:00:00.000Z"),
    packageIdentifier: "@example/second",
  });
  await seedServer(temp.db, source.id, {
    slug: "ambiguous-one",
    title: "Ambiguous One",
    publishedAt: new Date("2026-08-30T10:00:00.000Z"),
    packageIdentifier: "@shared/duplicate",
  });
  await seedServer(temp.db, source.id, {
    slug: "ambiguous-two",
    title: "Ambiguous Two",
    publishedAt: new Date("2026-08-29T10:00:00.000Z"),
    packageIdentifier: "@shared/duplicate",
  });
  await seedServer(temp.db, source.id, {
    slug: "upstream-deleted-server",
    title: "Deleted Server",
    publishedAt: new Date("2026-08-28T10:00:00.000Z"),
    listingStatus: "deleted_upstream",
    packageIdentifier: "@example/deleted",
  });
  await seedServer(temp.db, source.id, {
    slug: "install-unavailable",
    title: "Install Unavailable",
    publishedAt: new Date("2026-08-27T10:00:00.000Z"),
  });

  app = createApiApp({
    db: temp.db,
    cursorCodec: createServerSearchCursorCodec("task9-secret-task9-secret-task9-secret"),
    rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
    rateLimitKeyResolver: () => "test:core-routes",
    allowedOrigins: ["*"],
    logger: { info() {}, error() {} },
    requestIdFactory: () => "req_task9_core_routes",
  });
}, 30_000);

afterAll(async () => {
  await temp?.destroy();
});

describe("public API core routes", () => {
  it("returns collection, search, resolution, and install envelopes", async () => {
    const collection = await app.request("/api/v1/servers?limit=1", {
      headers: { "X-Request-ID": "req_task9_collection" },
    });
    expect(collection.status).toBe(200);
    await expect(collection.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ slug: "github" })],
      meta: { requestId: "req_task9_collection", nextCursor: expect.any(String) },
    });

    const search = await app.request("/api/v1/search?q=GitHub&sort=relevance");
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          slug: "github",
          latestHealthOutcome: "healthy",
          installAvailability: "available",
        }),
      ],
    });

    const resolved = await app.request("/api/v1/resolve/github");
    expect(resolved.status).toBe(200);
    await expect(resolved.json()).resolves.toMatchObject({
      data: { slug: "github", installAvailability: "available" },
    });

    const detail = await app.request("/api/v1/servers/github");
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      data: {
        slug: "github",
        trustProfile: {
          signals: [expect.objectContaining({ key: "remote_reachable", status: "positive" })],
        },
        latestHealth: { schemaVersion: 1, outcome: "healthy" },
        installAvailability: "available",
      },
    });

    const resolvedInstall = await app.request("/api/v1/resolve/github/install?client=cursor");
    expect(resolvedInstall.status).toBe(200);
    await expect(resolvedInstall.json()).resolves.toMatchObject({
      data: { schemaVersion: 1, server: { slug: "github" } },
      meta: { requestId: "req_task9_core_routes" },
    });
  });

  it("keeps resource ETags stable without sharing generated request metadata", async () => {
    const first = await app.request("/api/v1/servers?limit=1", {
      headers: { "X-Request-ID": "req_task9_etag_one" },
    });
    const second = await app.request("/api/v1/servers?limit=1", {
      headers: { "X-Request-ID": "req_task9_etag_two" },
    });

    expect(first.headers.get("etag")).toBe(second.headers.get("etag"));
    expect(first.headers.get("etag")).toMatch(/^W\//);
    expect(first.headers.get("cache-control")).toContain("public");
    expect(first.headers.get("vary")).toContain("X-Request-ID");

    const generated = await app.request("/api/v1/servers?limit=1");
    expect(generated.headers.get("cache-control")).toContain("private");
  });

  it("serves HEAD for collection, detail, and install routes with headers and no body", async () => {
    for (const path of [
      "/api/v1/servers?limit=1",
      "/api/v1/servers/github",
      "/api/v1/servers/github/install?client=cursor",
      "/api/v1/resolve/github/install?client=cursor",
    ]) {
      const response = await app.request(path, { method: "HEAD" });
      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toBeTruthy();
      expect(await response.text()).toBe("");
    }
  });

  it("maps cursor, missing, ambiguity, and deleted install states", async () => {
    const malformedSlug = await app.request("/api/v1/servers/Invalid!");
    expect(malformedSlug.status).toBe(400);
    await expect(malformedSlug.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const oversizedIdentifier = await app.request(`/api/v1/resolve/${"x".repeat(513)}`);
    expect(oversizedIdentifier.status).toBe(400);
    await expect(oversizedIdentifier.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidQuery = await app.request("/api/v1/servers?limit=101");
    expect(invalidQuery.status).toBe(400);
    await expect(invalidQuery.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidCursor = await app.request("/api/v1/servers?cursor=not-a-real-cursor");
    expect(invalidCursor.status).toBe(400);
    await expect(invalidCursor.json()).resolves.toMatchObject({
      error: { code: "CURSOR_INVALID" },
    });

    const missing = await app.request("/api/v1/servers/does-not-exist");
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "SERVER_NOT_FOUND" } });

    const missingInstall = await app.request("/api/v1/servers/does-not-exist/install");
    expect(missingInstall.status).toBe(404);
    await expect(missingInstall.json()).resolves.toMatchObject({
      error: { code: "SERVER_NOT_FOUND" },
    });

    const aliasInstall = await app.request("/api/v1/servers/github-server/install");
    expect(aliasInstall.status).toBe(404);

    for (const identifier of ["github-server", "%40github%2Fmcp-server"]) {
      const resolvedInstall = await app.request(`/api/v1/resolve/${identifier}/install`);
      expect(resolvedInstall.status).toBe(200);
      await expect(resolvedInstall.json()).resolves.toMatchObject({
        data: { server: { slug: "github" } },
      });
    }

    const ambiguous = await app.request("/api/v1/resolve/%40shared%2Fduplicate");
    expect(ambiguous.status).toBe(409);
    await expect(ambiguous.json()).resolves.toMatchObject({ error: { code: "AMBIGUOUS_SERVER" } });

    const deleted = await app.request("/api/v1/servers/upstream-deleted-server/install");
    expect(deleted.status).toBe(410);
    await expect(deleted.json()).resolves.toMatchObject({ error: { code: "UPSTREAM_DELETED" } });

    const unavailable = await app.request("/api/v1/servers/install-unavailable/install");
    expect(unavailable.status).toBe(410);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "INSTALL_UNAVAILABLE" },
    });
  });
});
