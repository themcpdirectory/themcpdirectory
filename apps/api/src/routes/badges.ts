import { createHash } from "node:crypto";
import { slugPathParamsSchema } from "@themcpdirectory/api-contract";
import { getServerDetailBySlug } from "@themcpdirectory/domain";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { HttpApiError } from "../http/errors.js";

const BADGE_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

function renderInstallBadge(count: number): string {
  const value = String(count);
  const valueWidth = Math.max(42, value.length * 8 + 18);
  const labelWidth = 124;
  const width = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="Anonymous, abuse-limited CLI reports; not verified unique installations: ${value}"><title>Anonymous, abuse-limited CLI reports; not verified unique installations: ${value}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-opacity=".2"/></linearGradient><clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#147d64"/><rect width="${width}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="62" y="15" fill="#010101" fill-opacity=".3">reported installs</text><text x="62" y="14">reported installs</text><text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text><text x="${labelWidth + valueWidth / 2}" y="14">${value}</text></g></svg>`;
}

async function badgeResponse(
  slug: string,
  deps: ApiDependencies,
  method: string,
): Promise<Response> {
  const parsed = slugPathParamsSchema.safeParse({ slug });
  if (!parsed.success) throw new HttpApiError("SERVER_NOT_FOUND");

  const detail = await getServerDetailBySlug(deps.db, parsed.data.slug);
  if (!detail || detail.listingStatus === "deleted_upstream") {
    throw new HttpApiError("SERVER_NOT_FOUND");
  }

  const svg = renderInstallBadge(detail.installs.total);
  return new Response(method === "HEAD" ? null : svg, {
    status: 200,
    headers: {
      "cache-control": BADGE_CACHE_CONTROL,
      "content-type": "image/svg+xml; charset=utf-8",
      etag: `"${createHash("sha256").update(svg).digest("hex")}"`,
    },
  });
}

export function registerBadgeRoutes(app: Hono<ApiEnv>, deps: ApiDependencies): void {
  app.on(["GET", "HEAD"], "/b/:badge", (c) => {
    const badge = c.req.param("badge");
    const slug = badge.endsWith(".svg") ? badge.slice(0, -4) : badge;
    return badgeResponse(slug, deps, c.req.method);
  });
}
