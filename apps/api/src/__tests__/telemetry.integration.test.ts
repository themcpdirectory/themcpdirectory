import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cliTelemetryEvents, servers } from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "../app.js";
import { createTempDatabase, type TempDatabase } from "./postgres-test-db.js";

let temp: TempDatabase;

beforeAll(async () => {
  temp = await createTempDatabase("telemetry_api");
  await temp.db.insert(servers).values({
    slug: "github",
    title: "GitHub",
    shortDescription: "GitHub tools",
    listingStatus: "active",
    moderationStatus: "normal",
    firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
    lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
  });
}, 30_000);

afterAll(async () => {
  await temp?.destroy();
});

describe("POST /api/v1/telemetry/events", () => {
  it("accepts one event without echoing or logging request metadata", async () => {
    const check = vi.fn(async () => ({ allowed: true, retryAfterSeconds: null }));
    const logger = { info: vi.fn(), error: vi.fn() };
    const app = createApiApp({
      db: temp.db,
      cursorCodec: createServerSearchCursorCodec("telemetry-test-secret-telemetry-test"),
      rateLimiter: { check },
      rateLimitKeyResolver: () => "ip:203.0.113.10",
      allowedOrigins: ["*"],
      logger,
      requestIdFactory: () => "req_telemetry_private",
    });

    const response = await app.request("/api/v1/telemetry/events", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "private-agent" },
      body: JSON.stringify({
        schemaVersion: 1,
        event: "add",
        slug: "github",
        cliVersion: "1.12.3",
        client: "vscode",
        success: true,
        installVariant: "package",
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect(check).toHaveBeenCalledWith("telemetry", "ip:203.0.113.10");
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    const rows = await temp.db
      .select()
      .from(cliTelemetryEvents)
      .where(eq(cliTelemetryEvents.event, "add"));
    expect(rows).toEqual([
      expect.objectContaining({
        aggregatedAt: null,
        event: "add",
        cliMajorMinor: "1.12",
        client: "vscode",
        success: true,
        installVariant: "package",
      }),
    ]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "aggregatedAt",
      "cliMajorMinor",
      "client",
      "event",
      "id",
      "installVariant",
      "receivedAt",
      "serverId",
      "success",
    ]);
  });

  it.each([
    {
      name: "non-JSON content",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    },
    {
      name: "an unsupported client",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        event: "add",
        slug: "github",
        cliVersion: "1.2.3",
        client: "unknown-client",
        success: true,
      }),
    },
    {
      name: "an unresolved slug",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        event: "add",
        slug: "missing-server",
        cliVersion: "1.2.3",
        success: false,
      }),
    },
    {
      name: "an oversized body",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        event: "search",
        cliVersion: "1.2.3",
        success: true,
        forbidden: "x".repeat(1_024),
      }),
    },
  ])("rejects $name without persistence", async ({ headers, body }) => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const app = createApiApp({
      db: temp.db,
      cursorCodec: createServerSearchCursorCodec("telemetry-test-secret-telemetry-test"),
      rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
      rateLimitKeyResolver: () => "invalid-test",
      allowedOrigins: ["*"],
      logger,
      requestIdFactory: () => "req_telemetry_invalid",
    });
    const before = await temp.db.select().from(cliTelemetryEvents);

    const response = await app.request("/api/v1/telemetry/events", {
      method: "POST",
      headers,
      body,
    });

    expect(response.status).toBe(400);
    expect(await temp.db.select().from(cliTelemetryEvents)).toHaveLength(before.length);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("uses the dedicated anonymous write rate limit", async () => {
    const check = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 17 }));
    const app = createApiApp({
      db: temp.db,
      cursorCodec: createServerSearchCursorCodec("telemetry-test-secret-telemetry-test"),
      rateLimiter: { check },
      rateLimitKeyResolver: () => "anonymous-writer",
      allowedOrigins: ["*"],
      logger: { info: vi.fn(), error: vi.fn() },
      requestIdFactory: () => "req_telemetry_limited",
    });

    const response = await app.request("/api/v1/telemetry/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        event: "search",
        cliVersion: "1.2.3",
        success: true,
      }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(check).toHaveBeenCalledWith("telemetry", "anonymous-writer");
  });
});
