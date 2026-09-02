import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { ApiEnv } from "../app.js";

export function createJsonEtag(body: unknown): string {
  let representation = body;
  if (body && typeof body === "object" && "meta" in body) {
    const meta = body.meta;
    if (meta && typeof meta === "object" && "requestId" in meta) {
      const stableMeta = Object.fromEntries(
        Object.entries(meta).filter(([key]) => key !== "requestId"),
      );
      representation = { ...body, meta: stableMeta };
    }
  }

  return `W/"${createHash("sha256").update(JSON.stringify(representation)).digest("base64url")}"`;
}

export function jsonWithCache(
  c: Context<ApiEnv>,
  body: unknown,
  init: { status: number; cacheControl: string },
): Response {
  const payload = JSON.stringify(body);
  const requestId = c.get("requestId");
  const suppliedRequestId = c.req.header("x-request-id");
  const cacheControl = suppliedRequestId === requestId ? init.cacheControl : "private, no-store";
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
    etag: createJsonEtag(body),
    vary: "X-Request-ID",
    "x-request-id": requestId,
  });

  return new Response(c.req.method === "HEAD" ? null : payload, {
    status: init.status,
    headers,
  });
}
