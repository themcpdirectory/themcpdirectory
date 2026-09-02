import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { loadApiEnv } from "@themcpdirectory/config";
import { createDatabase } from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "./app.js";
import {
  createInMemoryRateLimiter,
  resolveDevelopmentRateLimitKey,
  resolveProductionRateLimitKey,
} from "./http/rate-limit.js";

const env = loadApiEnv();
const app = createApiApp({
  db: createDatabase(env.DATABASE_URL),
  cursorCodec: createServerSearchCursorCodec(env.API_CURSOR_SIGNING_SECRET),
  rateLimiter: createInMemoryRateLimiter({
    windowSeconds: env.API_RATE_LIMIT_WINDOW_SECONDS,
    maxReads: env.API_RATE_LIMIT_MAX_READS,
  }),
  rateLimitKeyResolver:
    process.env.NODE_ENV === "production"
      ? resolveProductionRateLimitKey
      : resolveDevelopmentRateLimitKey,
  allowedOrigins: env.API_CORS_ALLOWED_ORIGINS,
  logger: console,
});

export function startApi() {
  const server = serve(
    {
      fetch: app.fetch,
      hostname: "0.0.0.0",
      port: env.API_PORT,
    },
    ({ port }) => {
      console.info({ event: "api_started", port });
    },
  );

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error({ event: "api_shutdown_failed", error });
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return server;
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isCliEntry()) {
  startApi();
}

export default app;
