import { describe, expect, it } from "vitest";
import {
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  serverCollectionQuerySchema,
  supportedClientIdSchema,
} from "../index.js";

describe("supportedClientIdSchema", () => {
  it("accepts VS Code as a supported client", () => {
    expect(supportedClientIdSchema.parse("vscode")).toBe("vscode");
  });
});

describe("serverCollectionQuerySchema", () => {
  it("rejects relevance without q and clamps limit semantics to the contract", () => {
    expect(() =>
      serverCollectionQuerySchema.parse({ sort: "relevance", limit: "30" }),
    ).toThrow(/q is required when sort is relevance/i);
    expect(() => serverCollectionQuerySchema.parse({ limit: "101" })).toThrow(/100/);
  });

  it("accepts boolean wire values for verified and openSource", () => {
    const parsedBooleanInput = serverCollectionQuerySchema.parse({
      verified: true,
      openSource: false,
    });

    expect(parsedBooleanInput.verified).toBe(true);
    expect(parsedBooleanInput.openSource).toBe(false);

    const parsedStringInput = serverCollectionQuerySchema.parse({
      verified: "true",
      openSource: "false",
    });

    expect(parsedStringInput.verified).toBe(true);
    expect(parsedStringInput.openSource).toBe(false);
  });

  it("rejects invalid wire values for verified and openSource", () => {
    expect(() => serverCollectionQuerySchema.parse({ verified: "banana" })).toThrow();
    expect(() => serverCollectionQuerySchema.parse({ verified: 0 })).toThrow();
    expect(() => serverCollectionQuerySchema.parse({ openSource: "0" })).toThrow();
    expect(() => serverCollectionQuerySchema.parse({ openSource: 1 })).toThrow();
  });
});

describe("parseServerCollectionResponse", () => {
  it("keeps unknown additive fields in client mode while validating known fields", () => {
    const parsed = parseServerCollectionResponse({
      data: [
        {
          id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
          slug: "github",
          title: "GitHub",
          description: "Access GitHub repositories.",
          publisher: {
            slug: "github",
            name: "GitHub",
            verified: true,
            futurePublisherField: 1,
          },
          version: "1.2.3",
          repository: { url: "https://github.com/modelcontextprotocol/servers" },
          listingStatus: "active",
          signals: {
            officialRegistry: true,
            publisherVerified: true,
            sourceAvailable: true,
            openSource: true,
          },
          futureField: "preserved",
        },
      ],
      meta: { requestId: "req_phase_d_010", nextCursor: null },
    });

    expect((parsed.data[0] as Record<string, unknown>).futureField).toBe("preserved");
  });
});

describe("parseResolvedServerResponse", () => {
  it("preserves canonical-vs-alias metadata for callers", () => {
    const parsed = parseResolvedServerResponse({
      data: {
        id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
        slug: "github",
        title: "GitHub",
        version: "1.2.3",
        canonicalUrl: "https://themcpdirectory.org/github",
        matchedBy: "alias",
        matchedValue: "github-server",
        needsRedirect: true,
      },
      meta: { requestId: "req_phase_d_011" },
    });

    expect(parsed.data.matchedBy).toBe("alias");
    expect(parsed.data.needsRedirect).toBe(true);
  });
});
