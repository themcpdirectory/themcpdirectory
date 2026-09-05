import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AmbiguousServerIdentifierError,
  InstallManifestUnavailableError,
  ServerNotFoundError,
  UpstreamDeletedError,
} from "@themcpdirectory/domain";
import { PUBLIC_API_RATE_LIMIT_RESPONSE } from "@themcpdirectory/api-contract";
import { InvalidCursorError } from "@themcpdirectory/search";
import type { ApiEnv } from "../app.js";
import { createErrorHandler, HttpApiError } from "../http/errors.js";
import { attachRequestId } from "../http/request-id.js";

const errors = {
  validation: () => new HttpApiError("VALIDATION_ERROR"),
  cursor: () => new InvalidCursorError(),
  ambiguous: () =>
    new AmbiguousServerIdentifierError("shared", "alias", [
      {
        id: crypto.randomUUID(),
        slug: "server-a",
        title: "Server A",
        version: "1.0.0",
        matchedValue: "shared",
        listingStatus: "active",
      },
      {
        id: crypto.randomUUID(),
        slug: "server-b",
        title: "Server B",
        version: "1.0.0",
        matchedValue: "shared",
        listingStatus: "active",
      },
    ]),
  missing: () => new ServerNotFoundError("missing-server"),
  install: () => new InstallManifestUnavailableError("missing-install"),
  deleted: () => new UpstreamDeletedError("deleted-server"),
  unexpected: () => new Error("stack trace should stay private"),
} as const;

describe("createErrorHandler", () => {
  it("maps approved domain and infrastructure errors without leaking internals", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const app = new Hono<ApiEnv>();
    app.use(
      "*",
      attachRequestId(() => "req_phase_d_error"),
    );
    app.onError(createErrorHandler(logger));

    for (const [path, createError] of Object.entries(errors)) {
      app.get(`/${path}`, () => {
        throw createError();
      });
    }

    const expectations = [
      ["validation", 400, "VALIDATION_ERROR"],
      ["cursor", 400, "CURSOR_INVALID"],
      ["ambiguous", 409, "AMBIGUOUS_SERVER"],
      ["missing", 404, "SERVER_NOT_FOUND"],
      ["install", 410, "INSTALL_UNAVAILABLE"],
      ["deleted", 410, "UPSTREAM_DELETED"],
      ["unexpected", 500, "INTERNAL_ERROR"],
    ] as const;

    for (const [path, status, code] of expectations) {
      const response = await app.request(`/${path}`);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        error: { code, requestId: "req_phase_d_error" },
      });
    }

    const unexpected = await app.request("/unexpected");
    await expect(unexpected.text()).resolves.not.toContain("stack trace");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("stack trace");
  });

  it("does not publish caller-provided HttpApiError text or invalid code/status pairs", async () => {
    const internalError = new HttpApiError("INTERNAL_ERROR");
    expect(internalError.status).toBe(500);
    expect(internalError.message).toBe("Internal server error");

    const app = new Hono<ApiEnv>();
    app.use(
      "*",
      attachRequestId(() => "req_safe_error"),
    );
    app.onError(createErrorHandler({ info() {}, error() {} }));
    app.get("/", () => {
      throw new HttpApiError("SERVER_NOT_FOUND");
    });

    const response = await app.request("/");
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toContain("private identifier");
  });

  it("treats server-side response schema failures as internal errors", async () => {
    const app = new Hono<ApiEnv>();
    app.use(
      "*",
      attachRequestId(() => "req_response_schema_failure"),
    );
    app.onError(createErrorHandler({ info() {}, error() {} }));
    app.get("/", (c) => c.json(z.object({ title: z.string() }).parse({ title: 42 })));

    const response = await app.request("/");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR", requestId: "req_response_schema_failure" },
    });
  });

  it("uses the shared rate-limit response header", async () => {
    const app = new Hono<ApiEnv>();
    app.use("*", async (c, next) => {
      c.set("rateLimitRetryAfter", 12);
      await next();
    });
    app.onError(createErrorHandler({ info() {}, error() {} }));
    app.get("/", () => {
      throw new HttpApiError("RATE_LIMITED");
    });

    const response = await app.request("/");

    expect(response.status).toBe(PUBLIC_API_RATE_LIMIT_RESPONSE.status);
    expect(response.headers.get(PUBLIC_API_RATE_LIMIT_RESPONSE.header.name)).toBe("12");
  });
});
