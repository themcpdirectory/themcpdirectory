import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiErrorCodeSchema,
  clientObject,
  createCollectionResponseSchema,
  createResourceResponseSchema,
  errorResponseSchema,
  identifierPathParamsSchema,
  PUBLIC_API_DOCUMENTATION,
  PUBLIC_API_ERROR_DEFINITIONS,
  PUBLIC_API_HTTP_URL_PROTOCOLS,
  PUBLIC_API_INSTALL_SAFETY,
  PUBLIC_API_RATE_LIMIT_RESPONSE,
  PUBLIC_API_SUCCESS_EXAMPLES,
  requestIdSchema,
  resolveServerIdentifierResponseSchema,
  serverCollectionResponseSchema,
  slugPathParamsSchema,
  installManifestResponseSchema,
} from "../index.js";

describe("shared public-api contracts", () => {
  it("enforces strict server envelopes and bounded request ids", () => {
    const schema = createResourceResponseSchema(
      z.object({ slug: z.string(), title: z.string() }).strict(),
    );

    expect(
      schema.parse({
        data: { slug: "github", title: "GitHub" },
        meta: { requestId: "req_phase_d_001" },
      }),
    ).toEqual({
      data: { slug: "github", title: "GitHub" },
      meta: { requestId: "req_phase_d_001" },
    });

    expect(() => requestIdSchema.parse("x".repeat(129))).toThrow(/128/);
    expect(() =>
      schema.parse({
        data: { slug: "github", title: "GitHub", extra: true },
        meta: { requestId: "req_phase_d_001" },
      }),
    ).toThrow(/unrecognized key/i);
  });

  it("bounds path parameters and rejects blank identifiers", () => {
    expect(slugPathParamsSchema.safeParse({ slug: "a".repeat(128) }).success).toBe(true);
    expect(slugPathParamsSchema.safeParse({ slug: "a".repeat(129) }).success).toBe(false);
    expect(identifierPathParamsSchema.safeParse({ identifier: "@scope/package" }).success).toBe(
      true,
    );
    expect(identifierPathParamsSchema.safeParse({ identifier: " ".repeat(8) }).success).toBe(false);
    expect(identifierPathParamsSchema.safeParse({ identifier: "x".repeat(513) }).success).toBe(
      false,
    );
  });

  it("keeps the approved error envelope shape stable", () => {
    expect(
      errorResponseSchema.parse({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          requestId: "req_phase_d_002",
          details: [{ path: "query.limit", message: "Must be <= 100" }],
        },
      }),
    ).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        requestId: "req_phase_d_002",
        details: [{ path: "query.limit", message: "Must be <= 100" }],
      },
    });
  });

  it("enforces collection envelopes and exact approved error codes", () => {
    const collectionSchema = createCollectionResponseSchema(
      z.object({ slug: z.string(), title: z.string() }).strict(),
    );

    expect(
      collectionSchema.parse({
        data: [{ slug: "github", title: "GitHub" }],
        meta: { requestId: "req_phase_d_003", nextCursor: null },
      }),
    ).toEqual({
      data: [{ slug: "github", title: "GitHub" }],
      meta: { requestId: "req_phase_d_003", nextCursor: null },
    });

    expect(() =>
      collectionSchema.parse({
        data: [{ slug: "github", title: "GitHub" }],
        meta: { requestId: "req_phase_d_003" },
      }),
    ).toThrow(/nextCursor/i);

    expect(() =>
      collectionSchema.parse({
        data: [{ slug: "github", title: "GitHub" }],
        meta: { requestId: "req_phase_d_003", nextCursor: null, extra: true },
      }),
    ).toThrow(/unrecognized key/i);

    expect(apiErrorCodeSchema.options).toEqual([
      "VALIDATION_ERROR",
      "SERVER_NOT_FOUND",
      "AMBIGUOUS_SERVER",
      "INSTALL_UNAVAILABLE",
      "UPSTREAM_DELETED",
      "CURSOR_INVALID",
      "RATE_LIMITED",
      "INTERNAL_ERROR",
    ]);

    for (const code of apiErrorCodeSchema.options) {
      expect(apiErrorCodeSchema.parse(code)).toBe(code);
    }

    expect(() => apiErrorCodeSchema.parse("NOT_AN_APPROVED_CODE")).toThrow();
  });

  it("publishes complete error definitions and schema-derived documentation facts", () => {
    expect(PUBLIC_API_ERROR_DEFINITIONS).toEqual({
      VALIDATION_ERROR: { status: 400, message: "Validation failed" },
      SERVER_NOT_FOUND: { status: 404, message: "Server not found" },
      AMBIGUOUS_SERVER: { status: 409, message: "Identifier matches multiple servers" },
      INSTALL_UNAVAILABLE: { status: 410, message: "Install manifest is unavailable" },
      UPSTREAM_DELETED: { status: 410, message: "Listing was deleted upstream" },
      CURSOR_INVALID: { status: 400, message: "Cursor is invalid" },
      RATE_LIMITED: { status: 429, message: "Too many requests" },
      INTERNAL_ERROR: { status: 500, message: "Internal server error" },
    });
    expect(Object.keys(PUBLIC_API_ERROR_DEFINITIONS)).toEqual(apiErrorCodeSchema.options);
    expect(PUBLIC_API_DOCUMENTATION).toMatchObject({
      envelopes: {
        resource: ["data", "meta.requestId"],
        collection: ["data[]", "meta.requestId", "meta.nextCursor"],
        error: ["error.code", "error.message", "error.requestId", "error.details[]?"],
      },
      pagination: {
        defaultLimit: 30,
        minimumLimit: 1,
        maximumLimit: 100,
        maximumCursorLength: 2048,
      },
      rateLimit: {
        status: 429,
        code: "RATE_LIMITED",
        header: {
          name: "Retry-After",
          description: "Seconds until the caller may retry.",
          minimum: 1,
        },
        quota: "configuration-dependent",
      },
      upstreamDeletion: {
        listingStatus: "deleted_upstream",
        installError: {
          code: "UPSTREAM_DELETED",
          status: 410,
          message: "Listing was deleted upstream",
        },
      },
      installSafety: {
        urlProtocols: ["http", "https"],
        packageVersions: "exact immutable versions only",
        environmentValues: "references only; secret values are never returned",
      },
    });
    expect(PUBLIC_API_DOCUMENTATION.rateLimit).toBe(PUBLIC_API_RATE_LIMIT_RESPONSE);
    expect(PUBLIC_API_DOCUMENTATION.installSafety).toBe(PUBLIC_API_INSTALL_SAFETY);
    expect(PUBLIC_API_INSTALL_SAFETY.urlProtocols).toBe(PUBLIC_API_HTTP_URL_PROTOCOLS);
    expect(errorResponseSchema.parse(PUBLIC_API_DOCUMENTATION.example)).toEqual(
      PUBLIC_API_DOCUMENTATION.example,
    );
  });

  it("publishes concise successful examples validated by their response schemas", () => {
    expect(serverCollectionResponseSchema.parse(PUBLIC_API_SUCCESS_EXAMPLES.collection)).toEqual(
      PUBLIC_API_SUCCESS_EXAMPLES.collection,
    );
    expect(
      resolveServerIdentifierResponseSchema.parse(PUBLIC_API_SUCCESS_EXAMPLES.resource),
    ).toEqual(PUBLIC_API_SUCCESS_EXAMPLES.resource);
    expect(installManifestResponseSchema.parse(PUBLIC_API_SUCCESS_EXAMPLES.install)).toEqual(
      PUBLIC_API_SUCCESS_EXAMPLES.install,
    );
  });
});

describe("clientObject", () => {
  it("accepts additive fields but rejects invalid declared field types", () => {
    const schema = clientObject({ slug: z.string(), title: z.string() });
    const parsed = schema.parse({
      slug: "github",
      title: "GitHub",
      futureField: { safe: true },
    }) as Record<string, unknown>;

    expect(parsed.futureField).toEqual({ safe: true });

    expect(() =>
      schema.parse({
        slug: 123,
        title: "GitHub",
        futureField: { safe: true },
      }),
    ).toThrow(/slug/i);
  });
});
