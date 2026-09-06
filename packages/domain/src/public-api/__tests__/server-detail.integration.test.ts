import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serverDetailResponseSchema } from "@themcpdirectory/api-contract";
import { cliTelemetryDailyCounts, cliTelemetryEvents, servers } from "@themcpdirectory/db";
import { eq } from "drizzle-orm";
import type { PublicApiTestContext } from "./public-api-test-context.js";
import { createPublicApiTestContext } from "./public-api-test-context.js";
import { getServerDetailBySlug } from "../../index.js";

let context: PublicApiTestContext;

beforeAll(async () => {
  context = await createPublicApiTestContext();
}, 30_000);

afterAll(async () => {
  await context.destroy();
});

describe("getServerDetailBySlug", () => {
  it("exposes lifetime successful-add totals by supported client only", async () => {
    const [server] = await context.db
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.slug, "github"));
    await context.db.insert(cliTelemetryDailyCounts).values([
      {
        day: "2026-09-04",
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.2",
        client: "vscode",
        success: true,
        installVariant: "package",
        count: 3,
      },
      {
        day: "2026-09-05",
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.3",
        client: "cursor",
        success: true,
        installVariant: "remote",
        count: 2,
      },
      {
        day: "2026-09-05",
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.3",
        client: "cursor",
        success: false,
        installVariant: "remote",
        count: 50,
      },
      {
        day: "2026-09-05",
        event: "search",
        serverId: server!.id,
        cliMajorMinor: "1.3",
        success: true,
        count: 100,
      },
    ]);
    await context.db.insert(cliTelemetryEvents).values([
      {
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.4",
        client: "cursor",
        success: true,
        installVariant: "package",
        receivedAt: new Date("2026-09-06T10:00:00.000Z"),
      },
      {
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.3",
        client: "cursor",
        success: true,
        installVariant: "remote",
        receivedAt: new Date("2026-09-05T10:00:00.000Z"),
        aggregatedAt: new Date("2026-09-06T00:00:00.000Z"),
      },
      {
        event: "add",
        serverId: server!.id,
        cliMajorMinor: "1.4",
        client: "vscode",
        success: false,
        installVariant: "package",
        receivedAt: new Date("2026-09-06T10:00:00.000Z"),
      },
      {
        event: "search",
        serverId: server!.id,
        cliMajorMinor: "1.4",
        client: "vscode",
        success: true,
        receivedAt: new Date("2026-09-06T10:00:00.000Z"),
      },
    ]);

    const detail = await getServerDetailBySlug(context.db, "github");

    expect(detail?.installs).toEqual({
      total: 6,
      clients: { "claude-code": 0, codex: 0, cursor: 3, vscode: 3 },
    });
    expect(
      serverDetailResponseSchema.safeParse({
        data: detail,
        meta: { requestId: crypto.randomUUID() },
      }).success,
    ).toBe(true);
    expect(JSON.stringify(detail?.installs)).not.toContain("cliMajorMinor");
    expect(JSON.stringify(detail?.installs)).not.toContain("success");
    expect(JSON.stringify(detail?.installs)).not.toContain("installVariant");
  });

  it("returns deleted_upstream listings directly by slug", async () => {
    const detail = await getServerDetailBySlug(context.db, "upstream-deleted-server");

    expect(detail?.listingStatus).toBe("deleted_upstream");
  });

  it("returns curated public detail without install provenance or upstream payloads", async () => {
    const detail = await getServerDetailBySlug(context.db, " GitHub ");

    expect(detail).toMatchObject({
      slug: "github",
      version: "1.2.3",
      publisher: { slug: "github", name: "GitHub", verified: true },
      repository: { url: "https://github.com/github/github-mcp-server" },
      categories: [{ slug: "developer-tools", name: "Developer Tools" }],
      compatibility: {
        cursor: "supported",
        "claude-code": "unsupported",
        vscode: "unsupported",
      },
      trustProfile: {
        officialRegistry: true,
        publisherVerified: true,
        sourceAvailable: true,
        openSource: true,
        signals: [
          {
            key: "maintained",
            status: "positive",
            summary: "Recently maintained",
            checkedAt: "2026-09-01T10:00:00.000Z",
          },
        ],
      },
      latestHealth: {
        schemaVersion: 1,
        outcome: "healthy",
      },
      installAvailability: "available",
    });
    expect(detail).not.toHaveProperty("provenance");
    expect(
      serverDetailResponseSchema.safeParse({
        data: detail,
        meta: { requestId: crypto.randomUUID() },
      }).success,
    ).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("normalizedPayload");
    expect(JSON.stringify(detail)).not.toContain("bash -c");
    expect(JSON.stringify(detail)).not.toContain("literal-secret");
    expect(JSON.stringify(detail)).not.toContain("javascript:");
  });

  it("does not follow a current version owned by another server", async () => {
    const detail = await getServerDetailBySlug(context.db, "mismatched-current-version");

    expect(detail).toMatchObject({ version: null, packages: [], remotes: [] });
  });

  it("does not expose moderated servers", async () => {
    expect(await getServerDetailBySlug(context.db, "missing-server")).toBeNull();
  });
});
