import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiErrorCodeSchema,
  clientObject,
  createCollectionResponseSchema,
  createResourceResponseSchema,
  errorResponseSchema,
  identifierPathParamsSchema,
  requestIdSchema,
  slugPathParamsSchema,
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
