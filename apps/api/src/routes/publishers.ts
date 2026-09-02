import { zValidator } from "@hono/zod-validator";
import {
  discoveryPageQuerySchema,
  publisherDetailResponseSchema,
  slugPathParamsSchema,
} from "@themcpdirectory/api-contract";
import { getPublicPublisherBySlug } from "@themcpdirectory/domain";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerPublisherRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  const slugValidator = zValidator("param", slugPathParamsSchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });
  const queryValidator = zValidator("query", discoveryPageQuerySchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });

  api.on(["GET", "HEAD"], "/publishers/:slug", slugValidator, queryValidator, async (c) => {
    const { cursor, limit } = c.req.valid("query");
    const detail = await getPublicPublisherBySlug(
      deps.db,
      {
        slug: c.req.valid("param").slug,
        limit,
        ...(cursor ? { cursor } : {}),
      },
      { cursorCodec: deps.cursorCodec },
    );
    if (!detail) throw new HttpApiError("SERVER_NOT_FOUND");

    const body = publisherDetailResponseSchema.parse({
      data: detail,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });
}
