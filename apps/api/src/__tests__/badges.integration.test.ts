import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cliTelemetryDailyCounts,
  registrySources,
  servers,
  serverVersions,
} from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { eq } from "drizzle-orm";
import { createApiApp } from "../app.js";
import { createTempDatabase, type TempDatabase } from "./postgres-test-db.js";

let temp: TempDatabase;
let app: ReturnType<typeof createApiApp>;

beforeAll(async () => {
  temp = await createTempDatabase("badge_api");
  const [source] = await temp.db
    .insert(registrySources)
    .values({
      key: "badge-source",
      name: "Badge source",
      baseUrl: "https://example.test",
      kind: "official",
    })
    .returning({ id: registrySources.id });
  const [server] = await temp.db
    .insert(servers)
    .values({
      slug: "badge-server",
      title: "Badge <Server>",
      shortDescription: "Badge fixture",
      listingStatus: "active",
      moderationStatus: "normal",
      firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
    })
    .returning({ id: servers.id });
  const [version] = await temp.db
    .insert(serverVersions)
    .values({
      serverId: server!.id,
      registrySourceId: source!.id,
      version: "1.0.0",
      upstreamStatus: "active",
      title: "Badge <Server>",
      description: "Badge fixture",
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
      normalizedPayload: {},
    })
    .returning({ id: serverVersions.id });
  await temp.db
    .update(servers)
    .set({ currentVersionId: version!.id })
    .where(eq(servers.id, server!.id));
  await temp.db.insert(cliTelemetryDailyCounts).values({
    day: "2026-09-05",
    event: "add",
    serverId: server!.id,
    cliMajorMinor: "1.2",
    client: "cursor",
    success: true,
    installVariant: "package",
    count: 42,
  });

  app = createApiApp({
    db: temp.db,
    cursorCodec: createServerSearchCursorCodec("badge-test-secret-badge-test-secret"),
    rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
    rateLimitKeyResolver: () => "badge-test",
    allowedOrigins: ["*"],
    logger: { info() {}, error() {} },
    requestIdFactory: () => "req_badge_test",
  });
}, 30_000);

afterAll(async () => {
  await temp?.destroy();
});

describe("install count badges", () => {
  it("serves deterministic cached SVG from both badge routes", async () => {
    const plain = await app.request("/b/badge-server");
    const suffixed = await app.request("/b/badge-server.svg");

    expect(plain.status).toBe(200);
    expect(plain.headers.get("content-type")).toContain("image/svg+xml");
    expect(plain.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(plain.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(await plain.text()).toBe(await suffixed.text());
    expect(plain.headers.get("etag")).toBe(suffixed.headers.get("etag"));
    const svg = await (await app.request("/b/badge-server")).text();
    expect(svg).toContain(">42<");
    expect(svg).toContain(
      "Anonymous, abuse-limited CLI reports; not verified unique installations: 42",
    );
  });

  it("returns 404 for unknown and deleted listings", async () => {
    expect((await app.request("/b/missing-server.svg")).status).toBe(404);

    await temp.db
      .update(servers)
      .set({ listingStatus: "deleted_upstream" })
      .where(eq(servers.slug, "badge-server"));

    expect((await app.request("/b/badge-server")).status).toBe(404);
  });
});
