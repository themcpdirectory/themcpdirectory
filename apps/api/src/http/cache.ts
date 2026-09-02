import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { ApiEnv } from "../app.js";

export function createJsonEtag(body: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url")}"`;
}

export function jsonWithCache(
  c: Context<ApiEnv>,
  body: unknown,
  init: { status: number; cacheControl: string },
): Response {
  const payload = JSON.stringify(body);
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": init.cacheControl,
    etag: createJsonEtag(body),
    "x-request-id": c.get("requestId"),
  });

  return new Response(c.req.method === "HEAD" ? null : payload, {
    status: init.status,
    headers,
  });
}
