import type { MiddlewareHandler } from "hono";
import type { ApiEnv } from "../app.js";

export function attachCors(allowedOrigins: readonly string[]): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const origin = c.req.header("origin");
    const applyHeaders = () => {
      if (allowedOrigins.includes("*")) {
        c.res.headers.set("Access-Control-Allow-Origin", "*");
      } else {
        c.res.headers.append("Vary", "Origin");
        if (origin && allowedOrigins.includes(origin)) {
          c.res.headers.set("Access-Control-Allow-Origin", origin);
        }
      }
      c.res.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Request-ID");
    };

    if (c.req.method === "OPTIONS") {
      c.res = c.body(null, 204);
      applyHeaders();
      return c.res;
    }
    await next();
    applyHeaders();
  };
}
