import { zValidator } from "@hono/zod-validator";
import {
  identifierPathParamsSchema,
  resolveServerIdentifierResponseSchema,
} from "@themcpdirectory/api-contract";
import { resolveServerIdentifier } from "@themcpdirectory/domain";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerResolveRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  const identifierValidator = zValidator("param", identifierPathParamsSchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });

  api.on(["GET", "HEAD"], "/resolve/:identifier", identifierValidator, async (c) => {
    const resolved = await resolveServerIdentifier(deps.db, c.req.valid("param").identifier);
    if (!resolved) throw new HttpApiError("SERVER_NOT_FOUND");

    const body = resolveServerIdentifierResponseSchema.parse({
      data: resolved,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=60, stale-while-revalidate=300",
    });
  });
}
