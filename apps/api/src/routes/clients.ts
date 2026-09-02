import { zValidator } from "@hono/zod-validator";
import {
  clientDetailResponseSchema,
  clientPathParamsSchema,
  clientsCollectionResponseSchema,
  discoveryPageQuerySchema,
} from "@themcpdirectory/api-contract";
import { getPublicClientById, listPublicClients } from "@themcpdirectory/domain";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerClientRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  const clientValidator = zValidator("param", clientPathParamsSchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });
  const queryValidator = zValidator("query", discoveryPageQuerySchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });

  api.on(["GET", "HEAD"], "/clients", async (c) => {
    const clients = await listPublicClients(deps.db);
    const body = clientsCollectionResponseSchema.parse({
      data: clients,
      meta: { requestId: c.get("requestId"), nextCursor: null },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });

  api.on(["GET", "HEAD"], "/clients/:id", clientValidator, queryValidator, async (c) => {
    const { cursor, limit } = c.req.valid("query");
    const detail = await getPublicClientById(
      deps.db,
      {
        id: c.req.valid("param").id,
        limit,
        ...(cursor ? { cursor } : {}),
      },
      { cursorCodec: deps.cursorCodec },
    );
    if (!detail) throw new HttpApiError("SERVER_NOT_FOUND");

    const body = clientDetailResponseSchema.parse({
      data: detail,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });
}
