import { zValidator } from "@hono/zod-validator";
import {
  searchCollectionQuerySchema,
  serverCollectionResponseSchema,
} from "@themcpdirectory/api-contract";
import { searchServersPage } from "@themcpdirectory/search";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerSearchRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  api.on(
    ["GET", "HEAD"],
    "/search",
    zValidator("query", searchCollectionQuerySchema, (result) => {
      if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
    }),
    async (c) => {
      const page = await searchServersPage(deps.db, c.req.valid("query"), {
        cursorCodec: deps.cursorCodec,
      });
      const body = serverCollectionResponseSchema.parse({
        data: page.items,
        meta: { requestId: c.get("requestId"), nextCursor: page.nextCursor },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=60, stale-while-revalidate=300",
      });
    },
  );
}
