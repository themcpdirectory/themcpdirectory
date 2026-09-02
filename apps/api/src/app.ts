import type { Database } from "@themcpdirectory/db";
import type { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { Hono, type Context } from "hono";
import { attachCors } from "./http/cors.js";
import { createErrorHandler } from "./http/errors.js";
import { attachStructuredLogging } from "./http/logging.js";
import { attachRateLimit } from "./http/rate-limit.js";
import { attachRequestId } from "./http/request-id.js";

export type RateLimitBucket = "resource" | "search" | "install";

export interface ApiVariables {
  requestId: string;
  rateLimitKey?: string;
  rateLimitBucket?: RateLimitBucket;
  rateLimitAllowed?: boolean;
  rateLimitRetryAfter?: number;
}

export interface ApiEnv {
  Variables: ApiVariables;
}

export interface ApiLogger {
  info(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

export type RateLimitKeyResolver = (c: Context<ApiEnv>) => string;

export interface RateLimiter {
  check(
    bucket: RateLimitBucket,
    callerKey: string,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number | null }>;
}

export interface ApiDependencies {
  db: Database;
  cursorCodec: ReturnType<typeof createServerSearchCursorCodec>;
  rateLimiter: RateLimiter;
  rateLimitKeyResolver: RateLimitKeyResolver;
  allowedOrigins: readonly string[];
  logger: ApiLogger;
  requestIdFactory?: () => string;
}

export function createApiApp(deps: ApiDependencies): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const apiV1 = new Hono<ApiEnv>();
  const withRateLimit = (bucket: RateLimitBucket) =>
    attachRateLimit(deps.rateLimiter, deps.rateLimitKeyResolver, bucket);

  app.onError(createErrorHandler(deps.logger));
  app.use("*", attachRequestId(deps.requestIdFactory));
  app.use("*", attachStructuredLogging(deps.logger));
  app.get("/", (c) => c.json({ status: "ok" }));

  apiV1.use("*", attachCors(deps.allowedOrigins));
  apiV1.use("/servers", withRateLimit("resource"));
  apiV1.use("/servers/:slug", withRateLimit("resource"));
  apiV1.use("/search", withRateLimit("search"));
  apiV1.use("/resolve/:identifier", withRateLimit("resource"));
  apiV1.use("/resolve/:identifier/install", withRateLimit("install"));
  apiV1.use("/servers/:slug/install", withRateLimit("install"));
  apiV1.use("/categories", withRateLimit("resource"));
  apiV1.use("/categories/:slug", withRateLimit("resource"));
  apiV1.use("/publishers/:slug", withRateLimit("resource"));
  apiV1.use("/clients", withRateLimit("resource"));
  apiV1.use("/clients/:id", withRateLimit("resource"));

  app.route("/api/v1", apiV1);

  return app;
}
