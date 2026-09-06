import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import {
  hashInstallManifest,
  installManifestQuerySchema,
  installManifestResponseSchema,
  installManifestSnapshotPathParamsSchema,
  identifierPathParamsSchema,
  resolvedInstallManifestSnapshotPathParamsSchema,
  slugPathParamsSchema,
  type InstallManifestResponse,
  type InstallManifestV1,
} from "@themcpdirectory/api-contract";
import {
  buildInstallManifest,
  getServerDetailBySlug,
  loadInstallManifestSnapshot,
  resolveServerIdentifier,
  saveInstallManifestSnapshot,
} from "@themcpdirectory/domain";
import type { Context, Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { HttpApiError } from "../http/errors.js";

const CURRENT_INSTALL_CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";
const IMMUTABLE_INSTALL_CACHE_CONTROL = "public, max-age=31536000, immutable";

function snapshotPath(
  manifest: InstallManifestV1,
  manifestHash: string,
  clientId?: string,
): string {
  const query = clientId ? `?client=${encodeURIComponent(clientId)}` : "";
  return `/api/v1/servers/${encodeURIComponent(manifest.server.slug)}/install/${manifestHash}${query}`;
}

function buildInstallResponse(
  manifest: InstallManifestV1,
  requestId: string,
): InstallManifestResponse {
  return installManifestResponseSchema.parse({
    data: manifest,
    manifestHash: hashInstallManifest(manifest),
    meta: { requestId },
  });
}

function installJsonResponse(
  c: Context<ApiEnv>,
  body: InstallManifestResponse,
  options: {
    readonly cacheControl: string;
    readonly contentLocation: string;
    readonly etag: string;
  },
): Response {
  const payload = JSON.stringify(body);
  return new Response(c.req.method === "HEAD" ? null : payload, {
    status: 200,
    headers: {
      "cache-control": options.cacheControl,
      "content-location": options.contentLocation,
      "content-type": "application/json; charset=utf-8",
      etag: options.etag,
      "x-request-id": body.meta.requestId,
    },
  });
}

function strongPayloadEtag(body: InstallManifestResponse): string {
  return `"${createHash("sha256").update(JSON.stringify(body)).digest("hex")}"`;
}

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
  const snapshotValidator = zValidator(
    "param",
    installManifestSnapshotPathParamsSchema,
    (result) => {
      if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
    },
  );
  const resolvedSnapshotValidator = zValidator(
    "param",
    resolvedInstallManifestSnapshotPathParamsSchema,
    (result) => {
      if (!result.success) throw new HttpApiError("VALIDATION_ERROR");
    },
  );

  api.on(
    ["GET", "HEAD"],
    "/servers/:slug/install/:manifestHash",
    snapshotValidator,
    queryValidator,
    async (c) => {
      const { slug, manifestHash } = c.req.valid("param");
      const clientId = c.req.valid("query").client;
      const server = await getServerDetailBySlug(deps.db, slug);
      if (!server) throw new HttpApiError("SERVER_NOT_FOUND");
      const manifest = await loadInstallManifestSnapshot(deps.db, {
        serverId: server.id,
        manifestHash,
        ...(clientId ? { clientId } : {}),
      });
      if (!manifest) throw new HttpApiError("SERVER_NOT_FOUND");
      const contentLocation = snapshotPath(manifest, manifestHash, clientId);
      const body = buildInstallResponse(manifest, `snapshot_${manifestHash}`);
      return installJsonResponse(c, body, {
        cacheControl: IMMUTABLE_INSTALL_CACHE_CONTROL,
        contentLocation,
        etag: `"${manifestHash}"`,
      });
    },
  );

  api.on(["GET", "HEAD"], "/servers/:slug/install", slugValidator, queryValidator, async (c) => {
    const clientId = c.req.valid("query").client;
    const server = await getServerDetailBySlug(deps.db, c.req.valid("param").slug);
    if (!server) throw new HttpApiError("SERVER_NOT_FOUND");
    const manifest = await buildInstallManifest(deps.db, {
      identifier: server.slug,
      ...(clientId ? { clientId } : {}),
    });
    await saveInstallManifestSnapshot(deps.db, {
      manifest,
      ...(clientId ? { clientId } : {}),
    });
    const body = buildInstallResponse(manifest, c.get("requestId"));
    return installJsonResponse(c, body, {
      cacheControl:
        c.req.header("x-request-id") === c.get("requestId")
          ? CURRENT_INSTALL_CACHE_CONTROL
          : "private, no-store",
      contentLocation: snapshotPath(manifest, body.manifestHash, clientId),
      etag: strongPayloadEtag(body),
    });
  });

  api.on(
    ["GET", "HEAD"],
    "/resolve/:identifier/install/:manifestHash",
    resolvedSnapshotValidator,
    queryValidator,
    async (c) => {
      const { identifier, manifestHash } = c.req.valid("param");
      const clientId = c.req.valid("query").client;
      const resolved = await resolveServerIdentifier(deps.db, identifier);
      if (!resolved) throw new HttpApiError("SERVER_NOT_FOUND");
      const manifest = await loadInstallManifestSnapshot(deps.db, {
        serverId: resolved.id,
        manifestHash,
        ...(clientId ? { clientId } : {}),
      });
      if (!manifest) throw new HttpApiError("SERVER_NOT_FOUND");
      const contentLocation = snapshotPath(manifest, manifestHash, clientId);
      const body = buildInstallResponse(manifest, `snapshot_${manifestHash}`);
      return installJsonResponse(c, body, {
        cacheControl: IMMUTABLE_INSTALL_CACHE_CONTROL,
        contentLocation,
        etag: `"${manifestHash}"`,
      });
    },
  );

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
      await saveInstallManifestSnapshot(deps.db, {
        manifest,
        ...(clientId ? { clientId } : {}),
      });
      const body = buildInstallResponse(manifest, c.get("requestId"));
      return installJsonResponse(c, body, {
        cacheControl:
          c.req.header("x-request-id") === c.get("requestId")
            ? CURRENT_INSTALL_CACHE_CONTROL
            : "private, no-store",
        contentLocation: snapshotPath(manifest, body.manifestHash, clientId),
        etag: strongPayloadEtag(body),
      });
    },
  );
}
