import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InvalidCursorError,
  createServerSearchCursorCodec,
  createServerSearchFiltersHash,
} from "../index.js";

const secret = "phase-d-test-secret-phase-d-test-secret";
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function createSignedCursor(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

describe("createServerSearchFiltersHash", () => {
  it("is stable across omitted defaults and ignores pagination state", () => {
    expect(createServerSearchFiltersHash({ q: "github", sort: "recent", limit: 30 })).toBe(
      createServerSearchFiltersHash({ q: "github", sort: "recent", limit: 100 }),
    );
  });

  it("changes when a result-shaping filter changes", () => {
    expect(
      createServerSearchFiltersHash({ q: "github", verified: true, sort: "recent", limit: 30 }),
    ).not.toBe(
      createServerSearchFiltersHash({ q: "github", verified: false, sort: "recent", limit: 30 }),
    );
  });
});

describe("createServerSearchCursorCodec", () => {
  it("round-trips a signed cursor and rejects filter drift", () => {
    const codec = createServerSearchCursorCodec(secret);
    const filtersHash = createServerSearchFiltersHash({
      q: "github",
      category: "developer-tools",
      sort: "relevance",
      limit: 30,
    });
    const payload = {
      version: 1 as const,
      sort: "relevance" as const,
      primary: 98.25,
      secondary: "github",
      serverId: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      filtersHash,
    };

    const cursor = codec.encode(payload);

    expect(codec.decode(cursor, filtersHash)).toEqual(payload);
    expect(() => codec.decode(cursor, "different-filters-hash")).toThrow(new InvalidCursorError());
  });

  it.each([
    "not-a-cursor",
    "too.many.segments",
    `${Buffer.from("not-json").toString("base64url")}.short`,
  ])("rejects malformed cursor %s with the public cursor error", (cursor) => {
    const codec = createServerSearchCursorCodec(secret);

    expect(() => codec.decode(cursor, "expected-filter-hash")).toThrow(new InvalidCursorError());
  });

  it("rejects a tampered body and an invalid signed payload", () => {
    const codec = createServerSearchCursorCodec(secret);
    const filtersHash = createServerSearchFiltersHash({ sort: "recent", limit: 30 });
    const validCursor = codec.encode({
      version: 1,
      sort: "recent",
      primary: "2026-09-01T12:00:00Z",
      secondary: null,
      serverId: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      filtersHash,
    });
    expect(() => codec.decode(`A${validCursor.slice(1)}`, filtersHash)).toThrow(
      new InvalidCursorError(),
    );
    expect(() =>
      codec.decode(createSignedCursor({ version: 1, filtersHash }), filtersHash),
    ).toThrow(new InvalidCursorError());
  });

  it("rejects a non-canonical encoding of a valid signature", () => {
    const codec = createServerSearchCursorCodec(secret);
    const filtersHash = createServerSearchFiltersHash({ sort: "recent", limit: 30 });
    const cursor = codec.encode({
      version: 1,
      sort: "recent",
      primary: null,
      secondary: null,
      serverId: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      filtersHash,
    });
    const [body, signature] = cursor.split(".") as [string, string];
    const finalCharacterIndex = base64UrlAlphabet.indexOf(signature.at(-1)!);
    const nonCanonicalSignature = `${signature.slice(0, -1)}${base64UrlAlphabet[finalCharacterIndex + 1]}`;

    expect(Buffer.from(nonCanonicalSignature, "base64url")).toEqual(
      Buffer.from(signature, "base64url"),
    );
    expect(() => codec.decode(`${body}.${nonCanonicalSignature}`, filtersHash)).toThrow(
      new InvalidCursorError(),
    );
  });

  it("rejects a validly signed cursor with an unsupported version", () => {
    const codec = createServerSearchCursorCodec(secret);
    const filtersHash = createServerSearchFiltersHash({ sort: "recent", limit: 30 });

    expect(() =>
      codec.decode(
        createSignedCursor({
          version: 2,
          sort: "recent",
          primary: null,
          secondary: null,
          serverId: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
          filtersHash,
        }),
        filtersHash,
      ),
    ).toThrow(new InvalidCursorError());
  });
});
