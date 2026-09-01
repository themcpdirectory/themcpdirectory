import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  clientObject,
  createResourceResponseSchema,
  errorResponseSchema,
  requestIdSchema,
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
});

describe("clientObject", () => {
  it("accepts unknown additive fields for client parsers", () => {
    const schema = clientObject({ slug: z.string(), title: z.string() });
    const parsed = schema.parse({
      slug: "github",
      title: "GitHub",
      futureField: { safe: true },
    }) as Record<string, unknown>;

    expect(parsed.futureField).toEqual({ safe: true });
  });
});
