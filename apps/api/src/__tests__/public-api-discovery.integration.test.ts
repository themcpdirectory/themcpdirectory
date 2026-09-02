import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, publishers } from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "../app.js";
import { createTempDatabase, type TempDatabase } from "./postgres-test-db.js";

let temp: TempDatabase;
let app: ReturnType<typeof createApiApp>;

beforeAll(async () => {
  temp = await createTempDatabase("task10_api_discovery");
  await temp.db.insert(categories).values({
    slug: "developer-tools",
    name: "Developer Tools",
    description: "Tools for software development",
  });
  await temp.db.insert(publishers).values({
    slug: "github",
    displayName: "GitHub",
    verificationState: "verified",
    websiteUrl: "https://github.com",
  });

  app = createApiApp({
    db: temp.db,
    cursorCodec: createServerSearchCursorCodec("task10-discovery-secret-task10-discovery"),
    rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
    rateLimitKeyResolver: () => "test:discovery",
    allowedOrigins: ["*"],
    logger: { info() {}, error() {} },
    requestIdFactory: () => "req_task10_discovery",
  });
}, 30_000);

afterAll(async () => {
  await temp?.destroy();
});

describe("public API discovery routes", () => {
  it("returns category, publisher, and client resources in approved envelopes", async () => {
    const categoryCollection = await app.request("/api/v1/categories");
    expect(categoryCollection.status).toBe(200);
    await expect(categoryCollection.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ slug: "developer-tools", serverCount: 0 })],
      meta: { requestId: "req_task10_discovery", nextCursor: null },
    });

    const category = await app.request("/api/v1/categories/developer-tools?limit=1");
    expect(category.status).toBe(200);
    await expect(category.json()).resolves.toMatchObject({
      data: { category: { slug: "developer-tools" }, servers: [], nextCursor: null },
    });

    const publisher = await app.request("/api/v1/publishers/github?limit=1");
    expect(publisher.status).toBe(200);
    await expect(publisher.json()).resolves.toMatchObject({
      data: { publisher: { slug: "github", verified: true }, servers: [] },
    });

    const clientCollection = await app.request("/api/v1/clients");
    expect(clientCollection.status).toBe(200);
    await expect(clientCollection.json()).resolves.toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ id: "cursor", serverCount: 0 })]),
      meta: { nextCursor: null },
    });

    const client = await app.request("/api/v1/clients/cursor?limit=1");
    expect(client.status).toBe(200);
    await expect(client.json()).resolves.toMatchObject({
      data: { client: { id: "cursor" }, servers: [], nextCursor: null },
    });
  });

  it("serves HEAD without bodies and validates detail inputs", async () => {
    for (const path of ["/api/v1/categories", "/api/v1/clients/cursor?limit=1"]) {
      const response = await app.request(path, { method: "HEAD" });
      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toMatch(/^W\//);
      expect(await response.text()).toBe("");
    }

    for (const path of [
      "/api/v1/categories/Invalid!",
      "/api/v1/publishers/github?limit=101",
      "/api/v1/clients/unknown",
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });
});
