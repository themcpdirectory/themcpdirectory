import { describe, expect, it } from "vitest";
import {
  HealthCheckOutcomeSchema,
  InstallAvailabilitySchema,
  RemoteHealthObservationV1ClientSchema,
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  serverCollectionQuerySchema,
  TrustProfileV1ClientSchema,
  TrustProfileV1Schema,
  TrustSignalStateSchema,
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
          publisherVerified: true,
          latestHealthOutcome: "healthy",
          installAvailability: "available",
          futureField: "preserved",
        },
      ],
      meta: { requestId: "req_phase_d_010", nextCursor: null },
    });

    expect(parsed.data[0]?.publisherVerified).toBe(true);
    expect(parsed.data[0]?.latestHealthOutcome).toBe("healthy");
    expect(parsed.data[0]?.installAvailability).toBe("available");
    expect((parsed.data[0] as Record<string, unknown>).futureField).toBe("preserved");
  });
});

describe("phase F trust and health contracts", () => {
  it("locks canonical trust and health vocabularies without aggregate scores", () => {
    expect(TrustSignalStateSchema.options).toEqual([
      "positive",
      "neutral",
      "warning",
      "negative",
      "unknown",
    ]);
    expect(HealthCheckOutcomeSchema.options).toContain("response_too_large");
    expect(InstallAvailabilitySchema.options).toEqual([
      "available",
      "install_unavailable",
      "upstream_deleted",
    ]);

    expect(
      TrustProfileV1Schema.safeParse({
        schemaVersion: 1,
        signals: [],
        aggregateScore: 98,
      }).success,
    ).toBe(false);
  });

  it("keeps standalone client trust and health parsing additive", () => {
    const trust = TrustProfileV1ClientSchema.parse({
      schemaVersion: 1,
      signals: [
        {
          key: "official_registry",
          state: "positive",
          label: "Listed in the Official MCP Registry",
          observedAt: "2026-09-01T18:00:00.000Z",
          source: "registry",
          reason: null,
          futureSignalField: { safe: true },
        },
      ],
      futureProfileField: { safe: true },
    }) as Record<string, unknown>;

    const health = RemoteHealthObservationV1ClientSchema.parse({
      schemaVersion: 1,
      outcome: "healthy",
      checkedAt: "2026-09-01T18:00:00.000Z",
      durationMs: 120,
      httpStatus: 200,
      finalOrigin: "https://api.example.com",
      redirectCount: 0,
      futureHealthField: { safe: true },
    }) as Record<string, unknown>;

    expect(trust.futureProfileField).toEqual({ safe: true });
    expect(health.futureHealthField).toEqual({ safe: true });
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
