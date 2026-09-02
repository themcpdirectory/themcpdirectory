import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "../app.js";
import { createTempDatabase, type TempDatabase } from "./postgres-test-db.js";

let temp: TempDatabase;
let app: ReturnType<typeof createApiApp>;

beforeAll(async () => {
  temp = await createTempDatabase("task10_api_empty");
  app = createApiApp({
    db: temp.db,
    cursorCodec: createServerSearchCursorCodec("task10-empty-secret-task10-empty-secret"),
    rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
    rateLimitKeyResolver: () => "test:empty",
    allowedOrigins: ["*"],
    logger: { info() {}, error() {} },
    requestIdFactory: () => "req_task10_empty",
  });
}, 30_000);

afterAll(async () => {
  await temp?.destroy();
});

describe("empty database verification", () => {
  it("serves stable collections and missing resources after fresh migrations", async () => {
    for (const path of ["/api/v1/servers?limit=1", "/api/v1/categories"]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: [],
        meta: { requestId: "req_task10_empty", nextCursor: null },
      });
    }

    for (const path of ["/api/v1/categories/missing", "/api/v1/publishers/missing"]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "SERVER_NOT_FOUND" },
      });
    }
  });
});
