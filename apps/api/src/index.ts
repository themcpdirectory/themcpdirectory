import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { loadEnv } from "@themcpdirectory/config";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ status: "ok" }));

export function startApi() {
  const { API_PORT } = loadEnv();
  const server = serve(
    {
      fetch: app.fetch,
      hostname: "0.0.0.0",
      port: API_PORT,
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
