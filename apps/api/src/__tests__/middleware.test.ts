import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { attachCors } from "../http/cors.js";
import { createErrorHandler } from "../http/errors.js";
import { attachStructuredLogging } from "../http/logging.js";
import {
  attachRateLimit,
  createInMemoryRateLimiter,
  resolveProductionRateLimitKey,
} from "../http/rate-limit.js";
import { attachRequestId } from "../http/request-id.js";

const logger = { info: vi.fn(), error: vi.fn() };

describe("HTTP middleware", () => {
  it("echoes valid request ids, applies wildcard CORS, caches JSON, and serves HEAD", async () => {
    const app = new Hono<ApiEnv>();
    app.onError(createErrorHandler(logger));
    app.use(
      "*",
      attachRequestId(() => "req_generated_phase_d"),
    );
    app.use("*", attachStructuredLogging(logger));
    app.use("/api/v1/probe", attachCors(["*"]));
    app.use(
      "/api/v1/probe",
      attachRateLimit(
        { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
        () => "dev:127.0.0.1",
        "resource",
      ),
    );
    app.get("/api/v1/probe", (c) =>
      jsonWithCache(
        c,
        { data: [], meta: { requestId: c.get("requestId"), nextCursor: null } },
        { status: 200, cacheControl: "public, max-age=60, stale-while-revalidate=300" },
      ),
    );

    const response = await app.request("/api/v1/probe", {
      headers: { Origin: "https://example.com", "X-Request-ID": "req_incoming_phase_d" },
    });

    expect(response.headers.get("x-request-id")).toBe("req_incoming_phase_d");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("etag")).toMatch(/^W\/"[A-Za-z0-9_-]{43}"$/);

    const head = await app.request("/api/v1/probe", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("https://example.com");
  });

  it("replaces malformed request ids with a generated safe value", async () => {
    const app = new Hono<ApiEnv>();
    app.use(
      "*",
      attachRequestId(() => "req_safe_generated"),
    );
    app.get("/", (c) => c.text(c.get("requestId")));

    const response = await app.request("/", {
      headers: { "X-Request-ID": "invalid request id with spaces" },
    });

    expect(response.headers.get("x-request-id")).toBe("req_safe_generated");
    await expect(response.text()).resolves.toBe("req_safe_generated");
  });

  it("rate limits by stable caller identity rather than request id", async () => {
    const app = new Hono<ApiEnv>();
    app.onError(createErrorHandler(logger));
    app.use("*", attachRequestId());
    app.use(
      "/api/v1/probe",
      attachRateLimit(
        createInMemoryRateLimiter({ windowSeconds: 60, maxReads: 1 }),
        () => "ip:203.0.113.10",
        "resource",
      ),
    );
    app.get("/api/v1/probe", (c) => c.json({ ok: true }));

    const first = await app.request("/api/v1/probe", {
      headers: {
        "X-Request-ID": "req_limited_phase_d_1",
        "CF-Connecting-IP": "203.0.113.10",
      },
    });
    expect(first.status).toBe(200);

    const limited = await app.request("/api/v1/probe", {
      headers: {
        "X-Request-ID": "req_limited_phase_d_2",
        "CF-Connecting-IP": "203.0.113.10",
      },
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", requestId: "req_limited_phase_d_2" },
    });
  });

  it("uses the socket peer instead of spoofable forwarding headers in production", () => {
    const context = {
      env: {
        incoming: {
          socket: { remoteAddress: "192.0.2.50", remotePort: 443, remoteFamily: "IPv4" },
        },
      },
      req: {
        header: (name: string) =>
          name.toLowerCase() === "cf-connecting-ip" ? "203.0.113.200" : undefined,
      },
    };

    expect(resolveProductionRateLimitKey(context as never)).toBe("ip:192.0.2.50");
  });

  it("fails closed when the in-memory caller cardinality is exhausted", async () => {
    const limiter = createInMemoryRateLimiter({
      windowSeconds: 60,
      maxReads: 10,
      maxEntries: 2,
    });

    await expect(limiter.check("resource", "caller-a")).resolves.toMatchObject({ allowed: true });
    await expect(limiter.check("resource", "caller-b")).resolves.toMatchObject({ allowed: true });
    await expect(limiter.check("resource", "caller-c")).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it("echoes an allowed origin without enabling credentials", async () => {
    const app = new Hono<ApiEnv>();
    app.use("*", attachCors(["https://allowed.example"]));
    app.get("/", (c) => c.text("ok"));

    const allowed = await app.request("/", {
      headers: { Origin: "https://allowed.example" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://allowed.example");
    expect(allowed.headers.get("vary")).toBe("Origin");
    expect(allowed.headers.get("access-control-allow-credentials")).toBeNull();

    const preflight = await app.request("/", {
      method: "OPTIONS",
      headers: {
        Origin: "https://allowed.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Request-ID",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://allowed.example");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("X-Request-ID");

    const denied = await app.request("/", {
      headers: { Origin: "https://denied.example" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(denied.headers.get("vary")).toBe("Origin");
  });
});
