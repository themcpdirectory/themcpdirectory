import { describe, expect, it } from "vitest";
import { RegistryPageSchema } from "../schema.js";
import {
  VALID_REGISTRY_PAGE,
  VALID_EMPTY_PAGE,
  VALID_LAST_PAGE,
} from "../__fixtures__/registry-page.js";

describe("RegistryPageSchema", () => {
  it("accepts a full valid page with all fields", () => {
    const result = RegistryPageSchema.safeParse(VALID_REGISTRY_PAGE);
    expect(result.success).toBe(true);
  });

  it("accepts an empty page", () => {
    const result = RegistryPageSchema.safeParse(VALID_EMPTY_PAGE);
    expect(result.success).toBe(true);
  });

  it("accepts a last page without nextCursor", () => {
    const result = RegistryPageSchema.safeParse(VALID_LAST_PAGE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.nextCursor).toBeUndefined();
    }
  });

  it("preserves unknown fields in server via passthrough", () => {
    const page = structuredClone(VALID_REGISTRY_PAGE);
    // @ts-expect-error – simulating future upstream field
    page.servers[0]!.server.futureField = "preserved";
    const result = RegistryPageSchema.safeParse(page);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.servers[0]!.server as Record<string, unknown>)["futureField"]).toBe(
        "preserved",
      );
    }
  });

  it("preserves unknown fields in _meta extensions", () => {
    const page = structuredClone(VALID_REGISTRY_PAGE);
    // @ts-expect-error – simulating future registry meta field
    page.servers[0]!._meta["io.custom/extension"] = { score: 42 };
    const result = RegistryPageSchema.safeParse(page);
    expect(result.success).toBe(true);
  });

  it("rejects missing servers array", () => {
    const result = RegistryPageSchema.safeParse({ metadata: { count: 0 } });
    expect(result.success).toBe(false);
  });

  it("rejects missing metadata", () => {
    const result = RegistryPageSchema.safeParse({ servers: [] });
    expect(result.success).toBe(false);
  });

  it("rejects server missing required name", () => {
    const page = {
      servers: [
        {
          server: { $schema: "https://example.com/schema", description: "x", version: "1.0.0" },
          _meta: {},
        },
      ],
      metadata: { count: 1 },
    };
    const result = RegistryPageSchema.safeParse(page);
    expect(result.success).toBe(false);
  });

  it("rejects server missing required description", () => {
    const page = {
      servers: [
        {
          server: { $schema: "https://example.com/schema", name: "a/b", version: "1.0.0" },
          _meta: {},
        },
      ],
      metadata: { count: 1 },
    };
    const result = RegistryPageSchema.safeParse(page);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer count", () => {
    const result = RegistryPageSchema.safeParse({
      servers: [],
      metadata: { count: "two" },
    });
    expect(result.success).toBe(false);
  });
});
