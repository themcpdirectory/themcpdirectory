import { describe, expect, it } from "vitest";
import { parseServerDetailResponse, UnsupportedManifestVersionError } from "../index.js";

describe("UnsupportedManifestVersionError", () => {
  it("exposes the expected name, schemaVersion, and message", () => {
    const error = new UnsupportedManifestVersionError(0);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsupportedManifestVersionError");
    expect(error.schemaVersion).toBe(0);
    expect(error.message).toBe(
      "Unsupported install manifest schema version: 0. Upgrade the MCP Directory client or CLI to a version that supports this schema version.",
    );
  });

  it("parses additive trust and health detail fields without dropping future keys", () => {
    const parsed = parseServerDetailResponse({
      data: {
        id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
        slug: "github",
        title: "GitHub",
        shortDescription: "Access GitHub repositories.",
        longDescription: null,
        listingStatus: "active",
        aliases: ["github-server"],
        publisher: {
          slug: "github",
          name: "GitHub",
          verified: true,
          futurePublisherField: 1,
        },
        repository: { url: "https://github.com/modelcontextprotocol/servers" },
        version: "1.2.3",
        categories: [{ slug: "developer-tools", name: "Developer Tools" }],
        packages: [],
        remotes: [],
        compatibility: { cursor: "unknown" },
        trustProfile: {
          officialRegistry: true,
          publisherVerified: true,
          sourceAvailable: true,
          openSource: true,
          signals: [
            {
              key: "official_registry",
              status: "positive",
              summary: "Listed in the Official MCP Registry",
              checkedAt: "2026-09-01T18:00:00.000Z",
              futureSignalField: { safe: true },
            },
          ],
          futureTrustField: { safe: true },
        },
        latestHealth: {
          schemaVersion: 1,
          outcome: "healthy",
          checkedAt: "2026-09-01T18:00:00.000Z",
          durationMs: 120,
          httpStatus: 200,
          finalOrigin: "https://api.example.com",
          redirectCount: 0,
          futureHealthField: { safe: true },
        },
        installAvailability: "available",
        timestamps: {
          firstSeenAt: "2026-09-01T12:00:00.000Z",
          lastSeenAt: "2026-09-01T18:00:00.000Z",
          publishedAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T18:00:00.000Z",
        },
        futureDetailField: "preserved",
      },
      meta: { requestId: "req_phase_f_001" },
    });

    expect(parsed.data.installAvailability).toBe("available");
    expect(parsed.data.latestHealth?.outcome).toBe("healthy");
    expect(
      (
        (parsed.data.latestHealth as Record<string, unknown> | undefined)?.futureHealthField as
          Record<string, unknown> | undefined
      )?.safe,
    ).toBe(true);
    expect(
      (
        (parsed.data.trustProfile as Record<string, unknown>).futureTrustField as
          Record<string, unknown> | undefined
      )?.safe,
    ).toBe(true);
    expect((parsed.data as Record<string, unknown>).futureDetailField).toBe("preserved");
  });
});
