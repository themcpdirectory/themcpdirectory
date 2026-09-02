import { zValidator } from "@hono/zod-validator";
import {
  serverCollectionQuerySchema,
  serverCollectionResponseSchema,
  serverDetailResponseSchema,
  slugPathParamsSchema,
} from "@themcpdirectory/api-contract";
import { getServerDetailBySlug } from "@themcpdirectory/domain";
import { searchServersPage } from "@themcpdirectory/search";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerServerRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  const slugValidator = zValidator("param", slugPathParamsSchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });

  api.on(
    ["GET", "HEAD"],
    "/servers",
    zValidator("query", serverCollectionQuerySchema, (result) => {
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

  api.on(["GET", "HEAD"], "/servers/:slug", slugValidator, async (c) => {
    const detail = await getServerDetailBySlug(deps.db, c.req.valid("param").slug);
    if (!detail) throw new HttpApiError("SERVER_NOT_FOUND");

    const body = serverDetailResponseSchema.parse({
      data: detail,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });
}
