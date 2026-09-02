import { zValidator } from "@hono/zod-validator";
import {
  installManifestQuerySchema,
  installManifestResponseSchema,
  identifierPathParamsSchema,
  slugPathParamsSchema,
} from "@themcpdirectory/api-contract";
import { buildInstallManifest, getServerDetailBySlug } from "@themcpdirectory/domain";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerInstallRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  const queryValidator = zValidator("query", installManifestQuerySchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });
  const slugValidator = zValidator("param", slugPathParamsSchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });
  const identifierValidator = zValidator("param", identifierPathParamsSchema, (result) => {
    if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
  });

  api.on(["GET", "HEAD"], "/servers/:slug/install", slugValidator, queryValidator, async (c) => {
    const clientId = c.req.valid("query").client;
    const server = await getServerDetailBySlug(deps.db, c.req.valid("param").slug);
    if (!server) throw new HttpApiError("SERVER_NOT_FOUND");
    const manifest = await buildInstallManifest(deps.db, {
      identifier: server.slug,
      ...(clientId ? { clientId } : {}),
    });
    const body = installManifestResponseSchema.parse({
      data: manifest,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=30, stale-while-revalidate=60",
    });
  });

  api.on(
    ["GET", "HEAD"],
    "/resolve/:identifier/install",
    identifierValidator,
    queryValidator,
    async (c) => {
      const clientId = c.req.valid("query").client;
      const manifest = await buildInstallManifest(deps.db, {
        identifier: c.req.valid("param").identifier,
        ...(clientId ? { clientId } : {}),
      });
      const body = installManifestResponseSchema.parse({
        data: manifest,
        meta: { requestId: c.get("requestId") },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=30, stale-while-revalidate=60",
      });
    },
  );
}
