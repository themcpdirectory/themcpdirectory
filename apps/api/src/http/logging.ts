import type { MiddlewareHandler } from "hono";
import type { ApiEnv, ApiLogger } from "../app.js";

export function attachStructuredLogging(logger: ApiLogger): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    logger.info({
      event: "http_request",
      requestId: c.get("requestId"),
      route: c.req.routePath,
      method: c.req.method,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
      rateLimitBucket: c.get("rateLimitBucket") ?? null,
      rateLimitAllowed: c.get("rateLimitAllowed") ?? null,
    });
  };
}
