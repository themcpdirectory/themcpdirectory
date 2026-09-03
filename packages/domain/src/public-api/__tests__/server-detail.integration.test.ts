import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serverDetailResponseSchema } from "@themcpdirectory/api-contract";
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
