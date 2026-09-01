# Phase D Public API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase D read-only public JSON API under `/api/v1`, with stable Zod-backed contracts, deterministic OpenAPI output, signed keyset pagination, safe install manifests, and clean database-backed Hono handlers.

**Architecture:** `packages/api-contract` becomes the single source of truth for strict server-side response validation, stable error codes, tolerant client parser entry points, and OpenAPI metadata. The route-specific contract modules under `packages/api-contract/src/public-api/*.ts` own only strict server schemas; `packages/api-contract/src/public-api/client-parsers.ts` owns the tolerant route parse helpers and `UnsupportedManifestVersionError`. `packages/search` owns public collection filtering, ranking, and signed keyset cursors; `packages/domain` owns detail, resolution, install, category, publisher, and client projections; `apps/api` owns only HTTP parsing, middleware, status mapping, caching, and serialisation.

**Tech Stack:** Node.js 24, TypeScript 5.9.3, pnpm 11.17.0, Hono 4.13.5, Drizzle ORM 0.45.2, PostgreSQL, and Vitest 4.1.11. The repository currently pins Zod 3.25.76 in `packages/api-contract` and `packages/config`, and Zod 4.5.4 in `packages/domain`; Task 1 reconciles `packages/api-contract` onto Zod 4.5.4, and Tasks 1 and 8 must verify the exact `@asteasolutions/zod-to-openapi` and `@hono/zod-validator` versions against current peer-dependency metadata before pinning them in package manifests.

**Spec:** `docs/superpowers/specs/2026-09-01-phase-d-public-api-design.md`

## Global Constraints

- Keep Phase D read-only: implement only the approved `/api/v1` GET and HEAD routes and their shared middleware.
- Preserve the approved one-way dependency flow: `api-contract <- search/domain <- apps/api`.
- `packages/api-contract` must not import a database package or an application package.
- Validate UUIDs, slugs, URLs, enums, cursor limits, identifier lengths, and every server response at the runtime boundary.
- Use strict server-side response schemas and separate client parsers that accept unknown additive object fields while still rejecting invalid known fields.
- Keep the approved initial error-code set unchanged: `VALIDATION_ERROR`, `SERVER_NOT_FOUND`, `AMBIGUOUS_SERVER`, `INSTALL_UNAVAILABLE`, `UPSTREAM_DELETED`, `CURSOR_INVALID`, `RATE_LIMITED`, and `INTERNAL_ERROR`.
- Default collection limit is `30`; maximum collection limit is `100`.
- Pagination must use deterministic keyset ordering with a versioned base64url cursor payload, a stable server ID tie-breaker, a filter fingerprint, and an HMAC signature from a dedicated secret.
- `relevance` is valid only when `q` is present; otherwise the default sort is `recent`.
- `deleted_upstream` is the canonical public listing-status value and remains directly retrievable by slug.
- `GET /servers/:slug/install` and `GET /resolve/:identifier/install` must return `InstallManifestV1` with `schemaVersion: 1` and no shell command strings, scripts, expressions, callback hooks, postinstall actions, secret values, mutable tags, version ranges, or unsupported registries.
- Public read routes may use wildcard CORS only because they are credential-free; never combine wildcard origins with credentials.
- Production scaling requires a shared rate limiter; Phase D may use an in-memory limiter only for development and single-instance runtime.
- Generate deterministic OpenAPI 3.1 output from the same Zod schemas used at runtime, and drift-check it in tests.
- Phase D closes only after focused package tests, full monorepo lint/typecheck/test gates, and empty-database migration verification pass.
- Use pnpm for every command and Conventional Commits for every verified task commit.

## File Map

### `packages/api-contract`

- Modify `packages/api-contract/package.json`: upgrade the package from its current Zod 3.25.76 pin to Zod 4.5.4 and add deterministic OpenAPI generation support with a peer-compatible `@asteasolutions/zod-to-openapi` release verified during implementation.
- Modify `packages/api-contract/src/index.ts`: export the Phase D shared primitives, route schemas, parser helpers, and OpenAPI document builder.
- Create `packages/api-contract/src/public-api/errors.ts`: stable public error codes and error-envelope schemas only.
- Create `packages/api-contract/src/public-api/shared.ts`: request ID, slug, UUID, timestamp, URL, envelope, and strict-vs-client object helpers.
- Create `packages/api-contract/src/public-api/client-parsers.ts`: tolerant response schemas, route parse helpers, and `UnsupportedManifestVersionError`.
- Create `packages/api-contract/src/public-api/servers.ts`: `/servers`, `/servers/:slug`, `/resolve/:identifier`, and `/search` query and response schemas.
- Create `packages/api-contract/src/public-api/install.ts`: install-manifest query and response schemas, variable/header/argument schemas, and compatibility schemas.
- Create `packages/api-contract/src/public-api/discovery.ts`: `/categories`, `/categories/:slug`, `/publishers/:slug`, `/clients`, and `/clients/:id` schemas.
- Create `packages/api-contract/src/public-api/openapi.ts`: deterministic OpenAPI 3.1 registry and document builder using the route schemas.
- Create `packages/api-contract/src/__tests__/shared-contract.test.ts`: strict envelope and bounded request-ID tests.
- Create `packages/api-contract/src/__tests__/client-parsers.test.ts`: unknown additive field and unsupported manifest version tests.
- Create `packages/api-contract/src/__tests__/servers-contract.test.ts`: `/servers`, `/search`, `/servers/:slug`, and `/resolve/:identifier` schema tests.
- Create `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`: install, category, publisher, and client schema tests.
- Create `packages/api-contract/src/__tests__/openapi.test.ts`: deterministic path ordering, validated examples, and drift snapshot tests.

### `packages/search`

- Modify `packages/search/package.json`: depend on `@themcpdirectory/api-contract` so the query layer returns contract-shaped data instead of ad hoc structures.
- Modify `packages/search/src/index.ts`: re-export the new public API search types, cursor codec, `InvalidCursorError`, and `searchServersPage`.
- Create `packages/search/src/public-api/types.ts`: page inputs, page outputs, sort definitions, and cursor payload types.
- Create `packages/search/src/public-api/query-fingerprint.ts`: canonical filter fingerprinting for cursor reuse validation.
- Create `packages/search/src/public-api/cursor.ts`: base64url + HMAC cursor encoding/decoding and `InvalidCursorError`.
- Create `packages/search/src/public-api/server-projections.ts`: summary projection mapping from SQL rows to contract-shaped server summary records.
- Create `packages/search/src/public-api/search-servers-page.ts`: keyset-backed `/servers` and `/search` query execution with all approved filters and sorts.
- Create `packages/search/src/__tests__/cursor.test.ts`: round-trip, signature, version, and filter-drift tests.
- Create `packages/search/src/__tests__/search-servers-page.integration.test.ts`: PostgreSQL-backed page, sort, filter, and non-duplication tests.

### `packages/domain`

- Modify `packages/domain/package.json`: add `@themcpdirectory/api-contract` and `@themcpdirectory/client-adapters` dependencies for public projection types and supported client metadata.
- Modify `packages/domain/src/index.ts`: export the new Phase D detail, resolution, install, category, publisher, and client query functions plus `AmbiguousServerIdentifierError`, `ServerNotFoundError`, `InstallManifestUnavailableError`, and `UpstreamDeletedError` from their file of origin.
- Create `packages/domain/src/public-api/server-detail.ts`: public detail retrieval by canonical slug, including aliases, categories, packages, remotes, repository metadata, trust profile, compatibility, and timestamps.
- Create `packages/domain/src/public-api/resolve-server-identifier.ts`: ambiguity-safe identifier resolution with bounded candidate summaries and canonical/alias metadata.
- Create `packages/domain/src/public-api/install-manifest.ts`: safe `InstallManifestV1` assembly and install-availability error handling.
- Create `packages/domain/src/public-api/categories.ts`: public category summaries and detail pages with paginated visible listings.
- Create `packages/domain/src/public-api/publishers.ts`: public publisher detail pages with paginated visible listings and no membership data.
- Create `packages/domain/src/public-api/clients.ts`: public client summaries and detail pages using factual capability metadata and paginated compatible listings.
- Create `packages/domain/src/public-api/__tests__/server-detail.integration.test.ts`: slug-detail projection tests, including `deleted_upstream` retrieval.
- Create `packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts`: precedence, ambiguity, and hidden-listing exclusion tests.
- Create `packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts`: install safety, client filtering, upstream deletion, and unavailable-manifest tests.
- Create `packages/domain/src/public-api/__tests__/discovery.integration.test.ts`: categories, publishers, and clients projection tests.

### `packages/client-adapters`

- Modify `packages/client-adapters/package.json`: depend on `@themcpdirectory/api-contract` so supported client IDs match the API contract exactly.
- Create `packages/client-adapters/src/catalog.ts`: static supported-client catalogue and factual capability metadata for `claude-code`, `codex`, and `cursor`.
- Modify `packages/client-adapters/src/index.ts`: export the client catalogue and lookup helpers.
- Create `packages/client-adapters/src/__tests__/catalog.test.ts`: supported-client identity and capability-shape tests.

### `packages/config`

- Modify `packages/config/src/env.ts`: add API base URL, public origin list, cursor signing secret, and rate-limit configuration.
- Modify `packages/config/src/env.test.ts`: validate the new API env variables and defaults.

### `apps/api`

- Modify `apps/api/package.json`: add workspace dependencies on `api-contract`, `db`, `domain`, `search`, `security`, and `test-utils` for the reused PostgreSQL admin-candidate helper, plus a Hono- and Zod-compatible `@hono/zod-validator` release verified during implementation.
- Modify `apps/api/src/index.ts`: create the database connection, cursor codec, limiter, and Hono app, then keep the process bootstrap thin.
- Create `apps/api/src/app.ts`: central app builder and route registration.
- Create `apps/api/src/http/request-id.ts`: request ID parsing, generation, echoing, and context storage.
- Create `apps/api/src/http/errors.ts`: HTTP-safe error classes plus mapping from domain/search failures to the approved error codes and statuses.
- Create `apps/api/src/http/logging.ts`: structured request logging with the approved redaction rules.
- Create `apps/api/src/http/rate-limit.ts`: in-memory limiter, bucket mapping, `Retry-After`, and middleware integration.
- Create `apps/api/src/http/cors.ts`: wildcard-or-allowlist GET/HEAD CORS policy with no credentials.
- Create `apps/api/src/http/cache.ts`: deterministic JSON ETags and cache-control helpers for stable vs short-lived responses.
- Create `apps/api/src/routes/servers.ts`: `/api/v1/servers` and `/api/v1/servers/:slug`.
- Create `apps/api/src/routes/search.ts`: `/api/v1/search`.
- Create `apps/api/src/routes/resolve.ts`: `/api/v1/resolve/:identifier`.
- Create `apps/api/src/routes/install.ts`: `/api/v1/servers/:slug/install` and `/api/v1/resolve/:identifier/install`.
- Create `apps/api/src/routes/categories.ts`: `/api/v1/categories` and `/api/v1/categories/:slug`.
- Create `apps/api/src/routes/publishers.ts`: `/api/v1/publishers/:slug`.
- Create `apps/api/src/routes/clients.ts`: `/api/v1/clients` and `/api/v1/clients/:id`.
- Create `apps/api/src/__tests__/middleware.test.ts`: request ID, CORS, rate-limit, logging, and cache helper tests.
- Create `apps/api/src/__tests__/public-api-core.integration.test.ts`: `/servers`, `/search`, `/resolve`, and install route tests.
- Create `apps/api/src/__tests__/public-api-discovery.integration.test.ts`: categories, publishers, and clients route tests.
- Create `apps/api/src/__tests__/postgres-test-db.ts`: isolated migrated PostgreSQL helper for API integration tests, reusing the established temporary-database pattern from `packages/search` and `packages/domain`.
- Create `apps/api/src/__tests__/empty-database.integration.test.ts`: freshly migrated empty-database route tests built on an injected `emptyApp` bootstrapped from the API temporary-database helper.
- Modify `apps/api/src/index.test.ts`: keep the spawned-process boot smoke test health-only; if it must touch `/api/v1`, bootstrap a temporary database with the same helper first and keep the empty-database route assertions in the injected integration tests.

### No Phase D Changes

- `packages/install-engine` stays untouched in Phase D; it will consume `InstallManifestV1` in Phase E.
- `packages/cli` stays untouched in Phase D; it will consume the tolerant client parsers exported by `packages/api-contract` in Phase E.

---

### Task 1: Shared API Contract Foundation

**Files:**

- Modify: `packages/api-contract/package.json`
- Modify: `packages/api-contract/src/index.ts`
- Create: `packages/api-contract/src/public-api/errors.ts`
- Create: `packages/api-contract/src/public-api/shared.ts`
- Create: `packages/api-contract/src/public-api/client-parsers.ts`
- Test: `packages/api-contract/src/__tests__/shared-contract.test.ts`
- Test: `packages/api-contract/src/__tests__/client-parsers.test.ts`

**Interfaces:**

- Consumes: none.
- Produces: `export type ApiErrorCode = "VALIDATION_ERROR" | "SERVER_NOT_FOUND" | "AMBIGUOUS_SERVER" | "INSTALL_UNAVAILABLE" | "UPSTREAM_DELETED" | "CURSOR_INVALID" | "RATE_LIMITED" | "INTERNAL_ERROR"`.
- Produces: `export const requestIdSchema: z.ZodString` with a hard `max(128)` bound.
- Produces: `export function strictObject<TShape extends z.ZodRawShape>(shape: TShape): z.ZodObject<TShape>`.
- Produces: `export function clientObject<TShape extends z.ZodRawShape>(shape: TShape): z.ZodObject<TShape>`.
- Produces: `export function createResourceResponseSchema<TSchema extends z.ZodTypeAny>(dataSchema: TSchema): z.ZodType<{ data: z.infer<TSchema>; meta: { requestId: string } }>`.
- Produces: `export function createCollectionResponseSchema<TSchema extends z.ZodTypeAny>(itemSchema: TSchema): z.ZodType<{ data: Array<z.infer<TSchema>>; meta: { requestId: string; nextCursor: string | null } }>`.
- Produces: `export class UnsupportedManifestVersionError extends Error`.

- [ ] **Step 0: Verify the dependency versions before touching `package.json`**

Run: `pnpm info zod version && pnpm info @asteasolutions/zod-to-openapi peerDependencies`

Expected: confirm the repo is upgrading `packages/api-contract` from Zod `3.25.76` to the same Zod `4.5.4` already used in `packages/domain`, and capture a `@asteasolutions/zod-to-openapi` release whose peer range includes Zod 4 before editing `packages/api-contract/package.json`.

- [ ] **Step 1: Write the failing shared-contract tests**

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  clientObject,
  createResourceResponseSchema,
  errorResponseSchema,
  requestIdSchema,
} from "../index.js";

describe("shared public-api contracts", () => {
  it("enforces strict server envelopes and bounded request ids", () => {
    const schema = createResourceResponseSchema(
      z.object({ slug: z.string(), title: z.string() }).strict(),
    );

    expect(
      schema.parse({
        data: { slug: "github", title: "GitHub" },
        meta: { requestId: "req_phase_d_001" },
      }),
    ).toEqual({
      data: { slug: "github", title: "GitHub" },
      meta: { requestId: "req_phase_d_001" },
    });

    expect(() => requestIdSchema.parse("x".repeat(129))).toThrow(/128/);
    expect(() =>
      schema.parse({
        data: { slug: "github", title: "GitHub", extra: true },
        meta: { requestId: "req_phase_d_001" },
      }),
    ).toThrow(/unrecognized key/i);
  });

  it("keeps the approved error envelope shape stable", () => {
    expect(
      errorResponseSchema.parse({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          requestId: "req_phase_d_002",
          details: [{ path: "query.limit", message: "Must be <= 100" }],
        },
      }),
    ).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        requestId: "req_phase_d_002",
        details: [{ path: "query.limit", message: "Must be <= 100" }],
      },
    });
  });
});

describe("clientObject", () => {
  it("accepts unknown additive fields for client parsers", () => {
    const schema = clientObject({ slug: z.string(), title: z.string() });
    const parsed = schema.parse({
      slug: "github",
      title: "GitHub",
      futureField: { safe: true },
    }) as Record<string, unknown>;

    expect(parsed.futureField).toEqual({ safe: true });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/shared-contract.test.ts src/__tests__/client-parsers.test.ts`

Expected: FAIL with an export error such as `The requested module '../index.js' does not provide an export named 'createResourceResponseSchema'`.

- [ ] **Step 3: Implement the shared schemas and parser split**

```ts
// packages/api-contract/src/public-api/shared.ts
import { z } from "zod";

export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const uuidSchema = z.string().uuid();
export const slugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const rfc3339UtcSchema = z.string().datetime({ offset: true });
export const httpUrlSchema = z.string().url();

export function strictObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).strict();
}

export function clientObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).passthrough();
}

export function createResourceResponseSchema<TSchema extends z.ZodTypeAny>(dataSchema: TSchema) {
  return strictObject({
    data: dataSchema,
    meta: strictObject({ requestId: requestIdSchema }),
  });
}

export function createCollectionResponseSchema<TSchema extends z.ZodTypeAny>(itemSchema: TSchema) {
  return strictObject({
    data: z.array(itemSchema),
    meta: strictObject({ requestId: requestIdSchema, nextCursor: z.string().nullable() }),
  });
}
```

- [ ] **Step 4: Export the stable error codes and keep unsupported-manifest failures in `client-parsers.ts`**

```ts
// packages/api-contract/src/public-api/errors.ts
import { z } from "zod";
import { requestIdSchema, strictObject } from "./shared.js";

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "SERVER_NOT_FOUND",
  "AMBIGUOUS_SERVER",
  "INSTALL_UNAVAILABLE",
  "UPSTREAM_DELETED",
  "CURSOR_INVALID",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const errorResponseSchema = strictObject({
  error: strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: requestIdSchema,
    details: z.array(strictObject({ path: z.string(), message: z.string() })).optional(),
  }),
});
```

```ts
// packages/api-contract/src/public-api/client-parsers.ts
export class UnsupportedManifestVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Unsupported install manifest schema version: ${schemaVersion}`);
    this.name = "UnsupportedManifestVersionError";
  }
}
```

- [ ] **Step 5: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/shared-contract.test.ts src/__tests__/client-parsers.test.ts && pnpm --filter @themcpdirectory/api-contract typecheck`

Expected: PASS for both tests and zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/package.json packages/api-contract/src/index.ts packages/api-contract/src/public-api/errors.ts packages/api-contract/src/public-api/shared.ts packages/api-contract/src/public-api/client-parsers.ts packages/api-contract/src/__tests__/shared-contract.test.ts packages/api-contract/src/__tests__/client-parsers.test.ts
git commit -m "feat(api-contract): add shared public api schemas"
```

### Task 2: `/servers`, `/search`, and Resolution Contract Schemas

**Files:**

- Modify: `packages/api-contract/src/index.ts`
- Modify: `packages/api-contract/src/public-api/client-parsers.ts`
- Create: `packages/api-contract/src/public-api/servers.ts`
- Test: `packages/api-contract/src/__tests__/servers-contract.test.ts`

**Interfaces:**

- Consumes: `ApiErrorCode`, `clientObject`, `createCollectionResponseSchema`, `createResourceResponseSchema`, `httpUrlSchema`, `requestIdSchema`, `rfc3339UtcSchema`, `slugSchema`, and `uuidSchema` from Task 1.
- Produces: `export type SupportedClientId = z.infer<typeof supportedClientIdSchema>`.
- Produces: `export type PublicServerSort = z.infer<typeof serverSortSchema>`.
- Produces: `export type PublicPublisherSummary = { readonly slug: string; readonly name: string; readonly verified: boolean }`.
- Produces: `export type PublicRepositorySummary = { readonly url: string }`.
- Produces: `export type PublicServerSignals = { readonly officialRegistry: boolean; readonly publisherVerified: boolean; readonly sourceAvailable: boolean | null; readonly openSource: boolean | null }`.
- Produces: `export type PublicServerSummary = z.infer<typeof serverCollectionResponseSchema>["data"][number]`.
- Produces: `export type PublicServerCategory = z.infer<typeof serverCategorySchema>`.
- Produces: `export type PublicTrustProfile = { readonly officialRegistry: boolean; readonly publisherVerified: boolean; readonly sourceAvailable: boolean | null; readonly openSource: boolean | null; readonly signals: readonly Array<{ readonly key: string; readonly status: "positive" | "neutral" | "warning" | "negative" | "unknown"; readonly summary: string | null; readonly checkedAt: string | null }> }`.
- Produces: `export type PublicServerTimestamps = { readonly firstSeenAt: string; readonly lastSeenAt: string; readonly publishedAt: string | null; readonly updatedAt: string | null }`.
- Produces: `export const serverSummaryServerSchema` for reuse by sibling public-api schema modules.
- Produces: `export const serverCollectionQuerySchema`.
- Produces: `export const searchCollectionQuerySchema`.
- Produces: `export const serverCollectionResponseSchema`.
- Produces: `export type ServerCollectionResponse = z.infer<typeof serverCollectionResponseSchema>`.
- Produces: `export const serverDetailResponseSchema`.
- Produces: `export type ServerDetailResponse = z.infer<typeof serverDetailResponseSchema>`.
- Produces: `export type PublicServerDetail = z.infer<typeof serverDetailResponseSchema>["data"]`.
- Produces: `export const resolveServerIdentifierResponseSchema`.
- Produces: `export type ResolvedServerResponse = z.infer<typeof resolveServerIdentifierResponseSchema>`.
- Produces: `export type ResolvedServerIdentifier = z.infer<typeof resolveServerIdentifierResponseSchema>["data"]`.
- Produces: `export function parseServerCollectionResponse(input: unknown): ServerCollectionResponse`.
- Produces: `export function parseServerDetailResponse(input: unknown): ServerDetailResponse`.
- Produces: `export function parseResolvedServerResponse(input: unknown): ResolvedServerResponse`.

Implement the `parseServerCollectionResponse`, `parseServerDetailResponse`, and `parseResolvedServerResponse` helpers in `packages/api-contract/src/public-api/client-parsers.ts`, importing the strict response schemas from `servers.ts` and re-exporting them through `packages/api-contract/src/index.ts`.

- [ ] **Step 1: Write the failing contract tests for server collections and resolution**

```ts
import { describe, expect, it } from "vitest";
import {
  parseResolvedServerResponse,
  parseServerCollectionResponse,
  serverCollectionQuerySchema,
} from "../index.js";

describe("serverCollectionQuerySchema", () => {
  it("rejects relevance without q and clamps limit semantics to the contract", () => {
    expect(() => serverCollectionQuerySchema.parse({ sort: "relevance", limit: "30" })).toThrow(
      /q is required when sort is relevance/i,
    );
    expect(() => serverCollectionQuerySchema.parse({ limit: "101" })).toThrow(/100/);
  });
});

describe("parseServerCollectionResponse", () => {
  it("keeps unknown additive fields in client mode while validating known fields", () => {
    const parsed = parseServerCollectionResponse({
      data: [
        {
          id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
          slug: "github",
          title: "GitHub",
          description: "Access GitHub repositories.",
          publisher: { slug: "github", name: "GitHub", verified: true, futurePublisherField: 1 },
          version: "1.2.3",
          repository: { url: "https://github.com/modelcontextprotocol/servers" },
          listingStatus: "active",
          signals: {
            officialRegistry: true,
            publisherVerified: true,
            sourceAvailable: true,
            openSource: true,
          },
          futureField: "preserved",
        },
      ],
      meta: { requestId: "req_phase_d_010", nextCursor: null },
    });

    expect((parsed.data[0] as Record<string, unknown>).futureField).toBe("preserved");
  });
});

describe("parseResolvedServerResponse", () => {
  it("preserves canonical-vs-alias metadata for callers", () => {
    const parsed = parseResolvedServerResponse({
      data: {
        id: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
        slug: "github",
        title: "GitHub",
        version: "1.2.3",
        canonicalUrl: "https://themcpdirectory.org/github",
        matchedBy: "alias",
        matchedValue: "github-server",
        needsRedirect: true,
      },
      meta: { requestId: "req_phase_d_011" },
    });

    expect(parsed.data.matchedBy).toBe("alias");
    expect(parsed.data.needsRedirect).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts`

Expected: FAIL with an export error such as `does not provide an export named 'serverCollectionQuerySchema'`.

- [ ] **Step 3: Implement the shared `/servers` and `/search` query schema**

```ts
// packages/api-contract/src/public-api/servers.ts
import { z } from "zod";
import {
  clientObject,
  createCollectionResponseSchema,
  createResourceResponseSchema,
  httpUrlSchema,
  rfc3339UtcSchema,
  slugSchema,
  strictObject,
  uuidSchema,
} from "./shared.js";

export const supportedClientIdSchema = z.enum(["claude-code", "codex", "cursor"]);
export const listingStatusSchema = z.enum([
  "active",
  "deprecated",
  "deleted_upstream",
  "unavailable",
]);
export const compatibilityStatusSchema = z.enum([
  "supported",
  "supported_with_configuration",
  "unsupported",
  "unknown",
]);
export const serverSortSchema = z.enum(["relevance", "recent", "updated", "popular", "name"]);
export type PublicServerSort = z.infer<typeof serverSortSchema>;

const baseServerCollectionQuery = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    category: slugSchema.optional(),
    publisher: slugSchema.optional(),
    client: supportedClientIdSchema.optional(),
    transport: z.string().trim().min(1).max(64).optional(),
    registryType: z.string().trim().min(1).max(64).optional(),
    verified: z.coerce.boolean().optional(),
    openSource: z.coerce.boolean().optional(),
    status: listingStatusSchema.optional(),
    sort: serverSortSchema.default("recent"),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sort === "relevance" && !value.q) {
      ctx.addIssue({
        code: "custom",
        path: ["sort"],
        message: "q is required when sort is relevance",
      });
    }
  });

export const serverCollectionQuerySchema = baseServerCollectionQuery;
export const searchCollectionQuerySchema = baseServerCollectionQuery;

const publisherSummaryServerSchema = strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  verified: z.boolean(),
});

const serverSignalsServerSchema = strictObject({
  officialRegistry: z.boolean(),
  publisherVerified: z.boolean(),
  sourceAvailable: z.boolean().nullable(),
  openSource: z.boolean().nullable(),
});

export const serverCategorySchema = strictObject({
  slug: slugSchema,
  name: z.string().min(1),
});
```

- [ ] **Step 4: Implement the response schemas and client parser functions**

```ts
export const serverSummaryServerSchema = strictObject({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  publisher: publisherSummaryServerSchema.nullable(),
  version: z.string().min(1).nullable(),
  repository: strictObject({ url: httpUrlSchema }).nullable(),
  listingStatus: listingStatusSchema,
  signals: serverSignalsServerSchema,
});

export const serverCollectionResponseSchema =
  createCollectionResponseSchema(serverSummaryServerSchema);

const serverPackageDetailSchema = strictObject({
  id: uuidSchema,
  registryType: z.string().min(1),
  identifier: z.string().min(1),
  version: z.string().min(1).nullable(),
  runtimeHint: z.string().min(1).nullable(),
  transport: z.string().min(1),
  runtimeArguments: z.array(
    strictObject({
      type: z.enum(["positional", "named"]),
      name: z.string().min(1).nullable().optional(),
      valueHint: z.string().min(1).nullable().optional(),
      description: z.string().min(1).nullable().optional(),
      required: z.boolean().optional(),
    }),
  ),
  packageArguments: z.array(
    strictObject({
      type: z.enum(["positional", "named"]),
      name: z.string().min(1).nullable().optional(),
      valueHint: z.string().min(1).nullable().optional(),
      description: z.string().min(1).nullable().optional(),
      required: z.boolean().optional(),
    }),
  ),
  environmentVariables: z.array(
    strictObject({
      name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
      valueSource: z.literal("environment"),
    }),
  ),
});

const serverRemoteDetailSchema = strictObject({
  id: uuidSchema,
  transport: z.string().min(1),
  urlTemplate: httpUrlSchema,
  headers: z.array(strictObject({ name: z.string().min(1), value: z.string().min(1) })),
  variables: z.array(
    strictObject({
      name: z.string().min(1),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
    }),
  ),
});

const serverDetailServerSchema = strictObject({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  longDescription: z.string().nullable(),
  listingStatus: listingStatusSchema,
  aliases: z.array(z.string().min(1)),
  publisher: publisherSummaryServerSchema.nullable(),
  repository: strictObject({ url: httpUrlSchema }).nullable(),
  version: z.string().min(1).nullable(),
  categories: z.array(serverCategorySchema),
  packages: z.array(serverPackageDetailSchema),
  remotes: z.array(serverRemoteDetailSchema),
  compatibility: strictObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
  }),
  trustProfile: strictObject({
    officialRegistry: z.boolean(),
    publisherVerified: z.boolean(),
    sourceAvailable: z.boolean().nullable(),
    openSource: z.boolean().nullable(),
    signals: z.array(
      strictObject({
        key: z.string().min(1),
        status: z.enum(["positive", "neutral", "warning", "negative", "unknown"]),
        summary: z.string().nullable(),
        checkedAt: rfc3339UtcSchema.nullable(),
      }),
    ),
  }),
  timestamps: strictObject({
    firstSeenAt: rfc3339UtcSchema,
    lastSeenAt: rfc3339UtcSchema,
    publishedAt: rfc3339UtcSchema.nullable(),
    updatedAt: rfc3339UtcSchema.nullable(),
  }),
});

export const serverDetailResponseSchema = createResourceResponseSchema(serverDetailServerSchema);

export const resolveServerIdentifierResponseSchema = createResourceResponseSchema(
  strictObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    version: z.string().min(1).nullable(),
    canonicalUrl: httpUrlSchema,
    matchedBy: z.enum(["slug", "alias", "canonical_registry_name", "package_identifier"]),
    matchedValue: z.string().min(1),
    needsRedirect: z.boolean(),
  }),
);
```

Keep the tolerant `publisherSummaryClientSchema`, `serverSignalsClientSchema`, `serverSummaryClientSchema`, `serverCollectionClientResponseSchema`, `serverDetailClientResponseSchema`, `resolveServerIdentifierClientResponseSchema`, and the `parseServer*Response` helpers in `packages/api-contract/src/public-api/client-parsers.ts`. `servers.ts` owns only the strict server schemas and strict response envelopes above.

- [ ] **Step 5: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts && pnpm --filter @themcpdirectory/api-contract typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/index.ts packages/api-contract/src/public-api/servers.ts packages/api-contract/src/__tests__/servers-contract.test.ts
git commit -m "feat(api-contract): add server and search contracts"
```

### Task 3: Install, Discovery, and Deterministic OpenAPI Contracts

**Files:**

- Modify: `packages/api-contract/src/index.ts`
- Modify: `packages/api-contract/src/public-api/client-parsers.ts`
- Create: `packages/api-contract/src/public-api/install.ts`
- Create: `packages/api-contract/src/public-api/discovery.ts`
- Create: `packages/api-contract/src/public-api/openapi.ts`
- Test: `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`
- Test: `packages/api-contract/src/__tests__/openapi.test.ts`

**Interfaces:**

- Consumes: `compatibilityStatusSchema`, `listingStatusSchema`, `serverSummaryServerSchema`, `supportedClientIdSchema`, `ApiErrorCode`, and the shared schema helpers from Tasks 1 and 2.
- Produces: `export const installManifestQuerySchema`.
- Produces: `export const installManifestResponseSchema`.
- Produces: `export type InstallManifestV1 = z.infer<typeof installManifestResponseSchema>["data"]`.
- Produces: `export type InstallManifestResponse = z.infer<typeof installManifestResponseSchema>`.
- Produces: `export const categoriesCollectionResponseSchema`.
- Produces: `export type PublicCategorySummary = z.infer<typeof categoriesCollectionResponseSchema>["data"][number]`.
- Produces: `export const categoryDetailResponseSchema`.
- Produces: `export type PublicCategoryDetail = z.infer<typeof categoryDetailResponseSchema>["data"]`.
- Produces: `export const publisherDetailResponseSchema`.
- Produces: `export type PublicPublisherDetail = z.infer<typeof publisherDetailResponseSchema>["data"]`.
- Produces: `export const clientsCollectionResponseSchema`.
- Produces: `export type PublicClientSummary = z.infer<typeof clientsCollectionResponseSchema>["data"][number]`.
- Produces: `export const clientDetailResponseSchema`.
- Produces: `export type PublicClientDetail = z.infer<typeof clientDetailResponseSchema>["data"]`.
- Produces: `export function parseInstallManifestResponse(input: unknown): InstallManifestResponse`.
- Produces: `export function createPublicApiOpenApiDocument(baseUrl: string): OpenAPIObject`.

Implement `parseInstallManifestResponse` in `packages/api-contract/src/public-api/client-parsers.ts`, alongside the tolerant client mirrors for the install-manifest and discovery response schemas.

- [ ] **Step 1: Write the failing install/discovery/OpenAPI tests**

```ts
import { describe, expect, it } from "vitest";
import {
  UnsupportedManifestVersionError,
  createPublicApiOpenApiDocument,
  parseInstallManifestResponse,
} from "../index.js";

describe("parseInstallManifestResponse", () => {
  it("fails fast on unsupported schema versions", () => {
    expect(() =>
      parseInstallManifestResponse({
        data: { schemaVersion: 2, server: { slug: "github" } },
        meta: { requestId: "req_phase_d_020" },
      }),
    ).toThrow(UnsupportedManifestVersionError);
  });
});

describe("createPublicApiOpenApiDocument", () => {
  it("emits deterministic Phase D paths from runtime schemas", () => {
    const document = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toEqual([
      "/api/v1/categories",
      "/api/v1/categories/{slug}",
      "/api/v1/clients",
      "/api/v1/clients/{id}",
      "/api/v1/publishers/{slug}",
      "/api/v1/resolve/{identifier}",
      "/api/v1/resolve/{identifier}/install",
      "/api/v1/search",
      "/api/v1/servers",
      "/api/v1/servers/{slug}",
      "/api/v1/servers/{slug}/install",
    ]);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts`

Expected: FAIL with an export error such as `does not provide an export named 'parseInstallManifestResponse'`.

- [ ] **Step 3: Implement the install-manifest schema in `install.ts` and the category/publisher/client schemas in `discovery.ts`**

```ts
// packages/api-contract/src/public-api/install.ts
import { z } from "zod";
import {
  createResourceResponseSchema,
  httpUrlSchema,
  rfc3339UtcSchema,
  slugSchema,
  strictObject,
  uuidSchema,
} from "./shared.js";
import { compatibilityStatusSchema, supportedClientIdSchema } from "./servers.js";

const argumentSchema = strictObject({
  type: z.enum(["positional", "named"]),
  valueHint: z.string().min(1).nullable().optional(),
  name: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  required: z.boolean().optional(),
});

const environmentVariableSchema = strictObject({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string().min(1).nullable(),
  required: z.boolean(),
  defaultValue: z.string().min(1).nullable(),
  valueSource: z.literal("environment"),
});

const headerSchema = strictObject({ name: z.string().min(1), value: z.string().min(1) });
const remoteVariableSchema = strictObject({
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  required: z.boolean(),
  defaultValue: z.string().min(1).nullable(),
});

export const installManifestQuerySchema = strictObject({
  client: supportedClientIdSchema.optional(),
});

const installManifestServerSchema = strictObject({
  schemaVersion: z.literal(1),
  server: strictObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    version: z.string().min(1).nullable(),
  }),
  provenance: strictObject({
    registry: z.string().min(1),
    registryName: z.string().min(1),
    observedAt: rfc3339UtcSchema,
  }),
  variants: z.array(
    z.discriminatedUnion("kind", [
      strictObject({
        id: uuidSchema,
        kind: z.literal("package"),
        registryType: z.string().min(1),
        identifier: z.string().min(1),
        version: z.string().min(1),
        runtimeHint: z.string().min(1),
        transport: z.string().min(1),
        runtimeArguments: z.array(argumentSchema),
        packageArguments: z.array(argumentSchema),
        environmentVariables: z.array(environmentVariableSchema),
        integrity: strictObject({
          algorithm: z.literal("sha256"),
          digest: z.string().regex(/^[a-f0-9]{64}$/i),
        }).nullable(),
      }),
      strictObject({
        id: uuidSchema,
        kind: z.literal("remote"),
        transport: z.string().min(1),
        urlTemplate: httpUrlSchema,
        headers: z.array(headerSchema),
        variables: z.array(remoteVariableSchema),
      }),
    ]),
  ),
  compatibility: strictObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
  }),
});

const packageVariantClientSchema = clientObject({
  id: uuidSchema,
  kind: z.literal("package"),
  registryType: z.string().min(1),
  identifier: z.string().min(1),
  version: z.string().min(1),
  runtimeHint: z.string().min(1),
  transport: z.string().min(1),
  runtimeArguments: z.array(clientObject({ type: z.enum(["positional", "named"]) })),
  packageArguments: z.array(clientObject({ type: z.enum(["positional", "named"]) })),
  environmentVariables: z.array(
    clientObject({
      name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
      valueSource: z.literal("environment"),
    }),
  ),
  integrity: clientObject({
    algorithm: z.literal("sha256"),
    digest: z.string().regex(/^[a-f0-9]{64}$/i),
  }).nullable(),
});

const remoteVariantClientSchema = clientObject({
  id: uuidSchema,
  kind: z.literal("remote"),
  transport: z.string().min(1),
  urlTemplate: httpUrlSchema,
  headers: z.array(clientObject({ name: z.string().min(1), value: z.string().min(1) })),
  variables: z.array(
    clientObject({
      name: z.string().min(1),
      description: z.string().min(1).nullable(),
      required: z.boolean(),
      defaultValue: z.string().min(1).nullable(),
    }),
  ),
});

const installManifestClientSchema = clientObject({
  schemaVersion: z.literal(1),
  server: clientObject({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1),
    version: z.string().min(1).nullable(),
  }),
  provenance: clientObject({
    registry: z.string().min(1),
    registryName: z.string().min(1),
    observedAt: rfc3339UtcSchema,
  }),
  variants: z.array(
    z.discriminatedUnion("kind", [packageVariantClientSchema, remoteVariantClientSchema]),
  ),
  compatibility: clientObject({
    "claude-code": compatibilityStatusSchema.optional(),
    codex: compatibilityStatusSchema.optional(),
    cursor: compatibilityStatusSchema.optional(),
  }),
});

export const installManifestResponseSchema = createResourceResponseSchema(
  installManifestServerSchema,
);
```

Keep the tolerant `packageVariantClientSchema`, `remoteVariantClientSchema`, `installManifestClientSchema`, `installManifestClientResponseSchema`, `parseInstallManifestResponse`, and `UnsupportedManifestVersionError` in `packages/api-contract/src/public-api/client-parsers.ts`. `install.ts` and `discovery.ts` stay strict-only so all runtime server validation comes from one strict schema surface.

```ts
// packages/api-contract/src/public-api/discovery.ts
import { z } from "zod";
import {
  createCollectionResponseSchema,
  createResourceResponseSchema,
  httpUrlSchema,
  slugSchema,
  strictObject,
} from "./shared.js";
import { serverSummaryServerSchema, supportedClientIdSchema } from "./servers.js";

const categorySummarySchema = strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  serverCount: z.number().int().nonnegative(),
});
export const categoriesCollectionResponseSchema =
  createCollectionResponseSchema(categorySummarySchema);

export const categoryDetailResponseSchema = createResourceResponseSchema(
  strictObject({
    category: strictObject({
      slug: slugSchema,
      name: z.string().min(1),
      description: z.string().nullable(),
    }),
    servers: z.array(serverSummaryServerSchema),
    nextCursor: z.string().nullable(),
  }),
);

export const publisherDetailResponseSchema = createResourceResponseSchema(
  strictObject({
    publisher: strictObject({
      slug: slugSchema,
      name: z.string().min(1),
      verified: z.boolean(),
      websiteUrl: httpUrlSchema.nullable(),
    }),
    servers: z.array(serverSummaryServerSchema),
    nextCursor: z.string().nullable(),
  }),
);

const clientSummarySchema = strictObject({
  id: supportedClientIdSchema,
  name: z.string().min(1),
  capabilities: strictObject({
    deeplink: z.boolean(),
    stdio: z.boolean(),
    streamableHttp: z.boolean(),
    headers: z.boolean(),
    environmentVariables: z.boolean(),
    remoteVariables: z.boolean(),
  }),
  serverCount: z.number().int().nonnegative(),
});

export const clientsCollectionResponseSchema = createCollectionResponseSchema(clientSummarySchema);
export const clientDetailResponseSchema = createResourceResponseSchema(
  strictObject({
    client: clientSummarySchema.omit({ serverCount: true }),
    servers: z.array(serverSummaryServerSchema),
    nextCursor: z.string().nullable(),
  }),
);
```

Also update `packages/api-contract/src/index.ts` to re-export install, discovery, and OpenAPI symbols from their file of origin, and to re-export the tolerant parse helpers and `UnsupportedManifestVersionError` from `client-parsers.ts` rather than redefining cross-file schemas.

```ts
// packages/api-contract/src/public-api/openapi.ts
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  categoryDetailResponseSchema,
  categoriesCollectionResponseSchema,
  clientDetailResponseSchema,
  clientsCollectionResponseSchema,
  publisherDetailResponseSchema,
} from "./discovery.js";
import { installManifestQuerySchema, installManifestResponseSchema } from "./install.js";
import {
  resolveServerIdentifierResponseSchema,
  searchCollectionQuerySchema,
  serverCollectionQuerySchema,
  serverCollectionResponseSchema,
  serverDetailResponseSchema,
} from "./servers.js";

extendZodWithOpenApi(z);

export function createPublicApiOpenApiDocument(baseUrl: string) {
  const registry = new OpenAPIRegistry();
```

- [ ] **Step 4: Implement deterministic OpenAPI generation from the runtime schemas**
      registry.registerPath({
      method: "get",
      path: "/api/v1/servers",
      request: { query: serverCollectionQuerySchema },
      responses: {
      200: {
      description: "Server collection",
      content: { "application/json": { schema: serverCollectionResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/search",
      request: { query: searchCollectionQuerySchema },
      responses: {
      200: {
      description: "Search projection",
      content: { "application/json": { schema: serverCollectionResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/servers/{slug}",
      responses: {
      200: {
      description: "Server detail",
      content: { "application/json": { schema: serverDetailResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/resolve/{identifier}",
      responses: {
      200: {
      description: "Resolved server",
      content: { "application/json": { schema: resolveServerIdentifierResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/servers/{slug}/install",
      request: { query: installManifestQuerySchema },
      responses: {
      200: {
      description: "Install manifest",
      content: { "application/json": { schema: installManifestResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/resolve/{identifier}/install",
      request: { query: installManifestQuerySchema },
      responses: {
      200: {
      description: "Install manifest via resolution",
      content: { "application/json": { schema: installManifestResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/categories",
      responses: {
      200: {
      description: "Category collection",
      content: { "application/json": { schema: categoriesCollectionResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/categories/{slug}",
      responses: {
      200: {
      description: "Category detail",
      content: { "application/json": { schema: categoryDetailResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/publishers/{slug}",
      responses: {
      200: {
      description: "Publisher detail",
      content: { "application/json": { schema: publisherDetailResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/clients",
      responses: {
      200: {
      description: "Client collection",
      content: { "application/json": { schema: clientsCollectionResponseSchema } },
      },
      },
      });
      registry.registerPath({
      method: "get",
      path: "/api/v1/clients/{id}",
      responses: {
      200: {
      description: "Client detail",
      content: { "application/json": { schema: clientDetailResponseSchema } },
      },
      },
      });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
  openapi: "3.1.0",
  info: { title: "The MCP Directory Public API", version: "1.0.0" },
  servers: [{ url: baseUrl }],
  });
  }

````

- [ ] **Step 5: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts && pnpm --filter @themcpdirectory/api-contract typecheck`

Expected: PASS with deterministic OpenAPI output and zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/index.ts packages/api-contract/src/public-api/install.ts packages/api-contract/src/public-api/discovery.ts packages/api-contract/src/public-api/openapi.ts packages/api-contract/src/__tests__/install-discovery-contract.test.ts packages/api-contract/src/__tests__/openapi.test.ts
git commit -m "feat(api-contract): add install and discovery contracts"
````

### Task 4: Signed Keyset Cursor Codec and Filter Fingerprints

**Files:**

- Modify: `packages/search/package.json`
- Modify: `packages/search/src/index.ts`
- Create: `packages/search/src/public-api/types.ts`
- Create: `packages/search/src/public-api/query-fingerprint.ts`
- Create: `packages/search/src/public-api/cursor.ts`
- Test: `packages/search/src/__tests__/cursor.test.ts`

**Interfaces:**

- Consumes: `serverCollectionQuerySchema` and `serverSortSchema` from `@themcpdirectory/api-contract`.
- Produces: `export interface ServerSearchCursorPayload { readonly version: 1; readonly sort: PublicServerSort; readonly primary: string | number | null; readonly secondary: string | number | null; readonly serverId: string; readonly filtersHash: string; }`.
- Produces: `export class InvalidCursorError extends Error`.
- Produces: `export function createServerSearchFiltersHash(input: SearchServersPageInput): string`.
- Produces: `export function createServerSearchCursorCodec(secret: string): { encode(payload: ServerSearchCursorPayload): string; decode(cursor: string, expectedFiltersHash: string): ServerSearchCursorPayload }`.

- [ ] **Step 1: Write the failing cursor tests**

```ts
import { describe, expect, it } from "vitest";
import { createServerSearchCursorCodec, createServerSearchFiltersHash } from "../index.js";

describe("createServerSearchCursorCodec", () => {
  it("round-trips a signed cursor and rejects filter drift", () => {
    const codec = createServerSearchCursorCodec("phase-d-test-secret-phase-d-test-secret");
    const filtersHash = createServerSearchFiltersHash({
      q: "github",
      category: "developer-tools",
      sort: "relevance",
      limit: 30,
    });

    const cursor = codec.encode({
      version: 1,
      sort: "relevance",
      primary: 98.25,
      secondary: "github",
      serverId: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      filtersHash,
    });

    expect(codec.decode(cursor, filtersHash)).toEqual({
      version: 1,
      sort: "relevance",
      primary: 98.25,
      secondary: "github",
      serverId: "4d5d0cfe-7c48-4df8-9c18-3f5af777d2bb",
      filtersHash,
    });

    expect(() => codec.decode(cursor, "different-filters-hash")).toThrow(/CURSOR_INVALID/);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/search test -- src/__tests__/cursor.test.ts`

Expected: FAIL with an export error such as `does not provide an export named 'createServerSearchCursorCodec'`.

- [ ] **Step 3: Implement canonical filter fingerprinting**

```ts
// packages/search/src/public-api/query-fingerprint.ts
import { createHash } from "node:crypto";
import type { SearchServersPageInput } from "./types.js";

export function createServerSearchFiltersHash(input: SearchServersPageInput): string {
  const canonical = JSON.stringify({
    q: input.q ?? null,
    category: input.category ?? null,
    publisher: input.publisher ?? null,
    client: input.client ?? null,
    transport: input.transport ?? null,
    registryType: input.registryType ?? null,
    verified: input.verified ?? null,
    openSource: input.openSource ?? null,
    status: input.status ?? null,
    sort: input.sort ?? "recent",
  });

  return createHash("sha256").update(canonical).digest("base64url");
}
```

- [ ] **Step 4: Implement the HMAC cursor codec**

```ts
// packages/search/src/public-api/cursor.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ServerSearchCursorPayload } from "./types.js";

export class InvalidCursorError extends Error {
  constructor(message = "CURSOR_INVALID") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createServerSearchCursorCodec(secret: string) {
  return {
    encode(payload: ServerSearchCursorPayload): string {
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = sign(secret, body);
      return `${body}.${signature}`;
    },

    decode(cursor: string, expectedFiltersHash: string): ServerSearchCursorPayload {
      const [body, signature] = cursor.split(".");
      if (!body || !signature) throw new InvalidCursorError();

      const expectedSignature = sign(secret, body);
      if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        throw new InvalidCursorError();
      }

      const parsed = JSON.parse(
        Buffer.from(body, "base64url").toString("utf8"),
      ) as ServerSearchCursorPayload;
      if (parsed.version !== 1 || parsed.filtersHash !== expectedFiltersHash) {
        throw new InvalidCursorError();
      }

      return parsed;
    },
  };
}
```

- [ ] **Step 5: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/search test -- src/__tests__/cursor.test.ts && pnpm --filter @themcpdirectory/search typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/search/package.json packages/search/src/index.ts packages/search/src/public-api/types.ts packages/search/src/public-api/query-fingerprint.ts packages/search/src/public-api/cursor.ts packages/search/src/__tests__/cursor.test.ts
git commit -m "feat(search): add signed public api cursors"
```

### Task 5: Public Server Collection Queries with Deterministic Keyset Pagination

**Files:**

- Modify: `packages/search/src/index.ts`
- Create: `packages/search/src/public-api/server-projections.ts`
- Create: `packages/search/src/public-api/search-servers-page.ts`
- Test: `packages/search/src/__tests__/search-servers-page.integration.test.ts`

**Interfaces:**

- Consumes: `createServerSearchCursorCodec`, `createServerSearchFiltersHash`, `InvalidCursorError`, `PublicServerSort`, `PublicServerSummary`, and `serverCollectionQuerySchema` from `@themcpdirectory/api-contract`, plus `categories`, `clientCompatibility`, `publishers`, `registrySources`, `repositorySnapshots`, `serverAliases`, `serverCategories`, `serverPackages`, `serverRemotes`, `serverVersions`, `servers`, and `Database` from `@themcpdirectory/db`.
- Produces: `export type PublicServerSummary = import("@themcpdirectory/api-contract").PublicServerSummary`.
- Produces: `export interface SearchServersPageInput extends z.infer<typeof serverCollectionQuerySchema> {}`.
- Produces: `export interface SearchServersPageOptions { readonly cursorCodec: ReturnType<typeof createServerSearchCursorCodec> }`.
- Produces: `export interface SearchServersPageRow { readonly id: string; readonly slug: string; readonly title: string; readonly shortDescription: string; readonly currentVersion: string | null; readonly listingStatus: "active" | "deprecated" | "deleted_upstream" | "unavailable"; readonly repositoryUrl: string | null; readonly publisherSlug: string | null; readonly publisherDisplayName: string | null; readonly publisherVerified: boolean; readonly officialRegistry: boolean; readonly sourceAvailable: boolean | null; readonly openSource: boolean | null; readonly firstSeenAt: string; readonly sortUpdatedAt: string | null; readonly repositoryStars: number | null; readonly relevanceScore: number | null }`.
- Produces: `export interface SearchServersPageResult { readonly items: readonly PublicServerSummary[]; readonly nextCursor: string | null; }`.
- Produces: `export function buildPrimarySortValue(sort: PublicServerSort, row: SearchServersPageRow): string | number | null`.
- Produces: `export function buildCursorPredicate(sort: PublicServerSort, cursor: ServerSearchCursorPayload, score: SQL<number>): SQL`.
- Produces: `export async function runSearchServersPageQuery(db: Database, input: SearchServersPageInput, cursor: ServerSearchCursorPayload | null, fetchLimit: number): Promise<readonly SearchServersPageRow[]>`.
- Produces: `export async function searchServersPage(db: Database, input: SearchServersPageInput, options: { cursorCodec: ReturnType<typeof createServerSearchCursorCodec> }): Promise<SearchServersPageResult>`.

- [ ] **Step 1: Write the failing PostgreSQL integration tests for page queries**

Start this file by copying the existing `seedServer` helper from `packages/search/src/__tests__/search.integration.test.ts`, renaming it to `seedSearchPageServer`, and extending it with optional inserts for `client_compatibility`, `repository_snapshots`, `server_packages.registryType`, and `server_remotes.transportType`. Then add these tests:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServerSearchCursorCodec, searchServersPage } from "../index.js";
import { createTempDatabase } from "./postgres-test-db.js";

describe("searchServersPage", () => {
  const cursorCodec = createServerSearchCursorCodec("phase-d-test-secret-phase-d-test-secret");

  it("returns deterministic keyset pages without duplicates for recent sort", async () => {
    const firstPage = await searchServersPage(db, { sort: "recent", limit: 2 }, { cursorCodec });
    const secondPage = await searchServersPage(
      db,
      { sort: "recent", limit: 2, cursor: firstPage.nextCursor! },
      { cursorCodec },
    );

    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.slug)).size).toBe(
      3,
    );
  });

  it("filters by category and publisher through the real join tables", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "github",
      title: "GitHub",
      shortDescription: "GitHub tools",
      category: { slug: "developer-tools", name: "Developer Tools" },
      publisher: { slug: "github", displayName: "GitHub", verified: true },
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "noise",
      title: "Noise",
      shortDescription: "Noise",
      category: { slug: "automation", name: "Automation" },
      publisher: { slug: "acme", displayName: "Acme", verified: false },
      officialSource: true,
    });

    const page = await searchServersPage(
      db,
      { category: "developer-tools", publisher: "github", sort: "recent", limit: 10 },
      { cursorCodec },
    );

    expect(page.items.map((item) => item.slug)).toEqual(["github"]);
  });

  it("filters by client, transport, and registryType via compatibility, package, and remote data", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "cursor-remote",
      title: "Cursor Remote",
      shortDescription: "Remote install target",
      packageIdentifier: "@acme/cursor-remote",
      packageRegistryType: "npm",
      packageTransportType: "stdio",
      remoteTransportType: "streamable-http",
      compatibility: [{ clientId: "cursor", status: "supported" }],
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "claude-only",
      title: "Claude Only",
      shortDescription: "Claude Code target",
      packageIdentifier: "@acme/claude-only",
      packageRegistryType: "pypi",
      packageTransportType: "stdio",
      compatibility: [{ clientId: "claude-code", status: "supported" }],
      officialSource: true,
    });

    const page = await searchServersPage(
      db,
      {
        client: "cursor",
        transport: "streamable-http",
        registryType: "npm",
        sort: "recent",
        limit: 10,
      },
      { cursorCodec },
    );

    expect(page.items.map((item) => item.slug)).toEqual(["cursor-remote"]);
  });

  it("excludes deleted_upstream by default and only returns it when status is requested", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "upstream-deleted",
      title: "Deleted Upstream",
      shortDescription: "Removed upstream",
      listingStatus: "deleted_upstream",
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "still-active",
      title: "Still Active",
      shortDescription: "Visible listing",
      listingStatus: "active",
      officialSource: true,
    });

    const defaultPage = await searchServersPage(db, { sort: "recent", limit: 10 }, { cursorCodec });
    expect(defaultPage.items.map((item) => item.slug)).toEqual(["still-active"]);

    const deletedOnly = await searchServersPage(
      db,
      { status: "deleted_upstream", sort: "recent", limit: 10 },
      { cursorCodec },
    );
    expect(deletedOnly.items.map((item) => item.slug)).toEqual(["upstream-deleted"]);
  });

  it("supports popular, updated, and name sorts with stable keyset continuation", async () => {
    await seedSearchPageServer(db, sourceIds, {
      slug: "alpha-tool",
      title: "Alpha Tool",
      shortDescription: "Alpha",
      repositorySnapshot: { stars: 10, lastPushAt: "2026-08-31T00:00:00.000Z" },
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "alpha-toolkit",
      title: "Alpha Toolkit",
      shortDescription: "Alpha Toolkit",
      repositorySnapshot: { stars: 50, lastPushAt: "2026-09-01T00:00:00.000Z" },
      officialSource: true,
    });
    await seedSearchPageServer(db, sourceIds, {
      slug: "beta-tool",
      title: "Beta Tool",
      shortDescription: "Beta",
      repositorySnapshot: { stars: 5, lastPushAt: "2026-08-15T00:00:00.000Z" },
      officialSource: true,
    });

    const popular = await searchServersPage(db, { sort: "popular", limit: 2 }, { cursorCodec });
    expect(popular.items.map((item) => item.slug)).toEqual(["alpha-toolkit", "alpha-tool"]);
    const popularNext = await searchServersPage(
      db,
      { sort: "popular", limit: 2, cursor: popular.nextCursor! },
      { cursorCodec },
    );
    expect(popularNext.items.map((item) => item.slug)).toEqual(["beta-tool"]);

    const updated = await searchServersPage(db, { sort: "updated", limit: 3 }, { cursorCodec });
    expect(updated.items.map((item) => item.slug)).toEqual([
      "alpha-toolkit",
      "alpha-tool",
      "beta-tool",
    ]);

    const name = await searchServersPage(db, { sort: "name", limit: 3 }, { cursorCodec });
    expect(name.items.map((item) => item.slug)).toEqual([
      "alpha-tool",
      "alpha-toolkit",
      "beta-tool",
    ]);
  });

  it("rejects a reused cursor when the effective filters change", async () => {
    const firstPage = await searchServersPage(
      db,
      { q: "github", sort: "relevance", limit: 1 },
      { cursorCodec },
    );

    await expect(
      searchServersPage(
        db,
        { q: "supabase", sort: "relevance", limit: 1, cursor: firstPage.nextCursor! },
        { cursorCodec },
      ),
    ).rejects.toMatchObject({ name: "InvalidCursorError" });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/search test -- src/__tests__/search-servers-page.integration.test.ts`

Expected: FAIL with an export error such as `does not provide an export named 'searchServersPage'`.

- [ ] **Step 3: Implement the public summary projection mapper**

```ts
// packages/search/src/public-api/server-projections.ts
import type { PublicServerSummary } from "@themcpdirectory/api-contract";
import type { SearchServersPageRow } from "./types.js";

export function mapServerSummaryRow(row: SearchServersPageRow): PublicServerSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.shortDescription,
    publisher:
      row.publisherSlug && row.publisherDisplayName
        ? {
            slug: row.publisherSlug,
            name: row.publisherDisplayName,
            verified: row.publisherVerified,
          }
        : null,
    version: row.currentVersion,
    repository: row.repositoryUrl ? { url: row.repositoryUrl } : null,
    listingStatus: row.listingStatus,
    signals: {
      officialRegistry: row.officialRegistry,
      publisherVerified: row.publisherVerified,
      sourceAvailable: row.sourceAvailable,
      openSource: row.openSource,
    },
  };
}
```

- [ ] **Step 4: Implement the keyset-backed `/servers` and `/search` query function**

```ts
// packages/search/src/public-api/search-servers-page.ts
export async function searchServersPage(
  db: Database,
  input: SearchServersPageInput,
  options: SearchServersPageOptions,
): Promise<SearchServersPageResult> {
  const parsed = serverCollectionQuerySchema.parse(input);
  const filtersHash = createServerSearchFiltersHash(parsed);
  const cursor = parsed.cursor ? options.cursorCodec.decode(parsed.cursor, filtersHash) : null;
  const rows = await runSearchServersPageQuery(db, parsed, cursor, parsed.limit + 1);

  const pageRows = rows.slice(0, parsed.limit);
  const items = pageRows.map(mapServerSummaryRow);
  const lastRow = pageRows.at(-1);

  const nextCursor =
    rows.length > parsed.limit && lastRow
      ? options.cursorCodec.encode({
          version: 1,
          sort: parsed.sort,
          primary: buildPrimarySortValue(parsed.sort, lastRow),
          secondary: lastRow.slug.toLowerCase(),
          serverId: lastRow.id,
          filtersHash,
        })
      : null;

  return { items, nextCursor };
}
```

- [ ] **Step 5: Extend the SQL to cover every approved filter and sort**

```ts
// packages/search/src/public-api/search-servers-page.ts
import { and, sql, type SQL } from "drizzle-orm";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  repositorySnapshots,
  serverAliases,
  serverCategories,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { serverCollectionQuerySchema, type PublicServerSort } from "@themcpdirectory/api-contract";

const SEARCH_SIMILARITY_THRESHOLD = 0.12;
const CLIENT_SUPPORTED_STATUSES = ["supported", "supported_with_configuration"] as const;

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function latestRepositoryStarsSql() {
  return sql<number | null>`(
    select rs.stars
    from ${repositorySnapshots} rs
    where rs.server_id = ${servers.id}
    order by rs.checked_at desc
    limit 1
  )`;
}

function latestRepositoryLastPushAtSql() {
  return sql<string | null>`(
    select rs.last_push_at::text
    from ${repositorySnapshots} rs
    where rs.server_id = ${servers.id}
    order by rs.checked_at desc
    limit 1
  )`;
}

function searchScoreSql(normalizedQuery: string) {
  const exactSlug = sql<number>`case when lower(${servers.slug}::text) = ${normalizedQuery} then 120 else 0 end`;
  const exactTitle = sql<number>`case when lower(${servers.title}) = ${normalizedQuery} then 100 else 0 end`;
  const aliasExact = sql<number>`case when exists (
    select 1
    from ${serverAliases} sa
    where sa.server_id = ${servers.id}
      and lower(sa.alias) = ${normalizedQuery}
  ) then 90 else 0 end`;
  const fts = sql<number>`coalesce(
    ts_rank_cd(${servers.searchDocument}, websearch_to_tsquery('simple', ${normalizedQuery})),
    0
  ) * 40`;
  const trigram = sql<number>`greatest(
    similarity(lower(${servers.slug}::text), ${normalizedQuery}),
    similarity(lower(${servers.title}), ${normalizedQuery}),
    similarity(lower(coalesce(${servers.searchText}, '')), ${normalizedQuery}),
    coalesce((
      select max(similarity(lower(sa.alias), ${normalizedQuery}))
      from ${serverAliases} sa
      where sa.server_id = ${servers.id}
    ), 0)
  ) * 25`;

  return sql<number>`(${fts} + ${exactSlug} + ${exactTitle} + ${aliasExact} + ${trigram})`;
}

function searchPredicate(normalizedQuery: string): SQL {
  return sql`(
    ${servers.searchDocument} @@ websearch_to_tsquery('simple', ${normalizedQuery})
    or similarity(lower(coalesce(${servers.searchText}, '')), ${normalizedQuery}) > ${SEARCH_SIMILARITY_THRESHOLD}
    or lower(${servers.slug}::text) % ${normalizedQuery}
    or lower(${servers.title}) % ${normalizedQuery}
    or exists (
      select 1
      from ${serverAliases} sa
      where sa.server_id = ${servers.id}
        and lower(sa.alias) % ${normalizedQuery}
    )
  )`;
}

function buildOrderBy(sort: PublicServerSort, score: SQL<number>) {
  switch (sort) {
    case "relevance":
      return [
        sql`${score} desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "recent":
      return [
        sql`${servers.firstSeenAt} desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "updated":
      return [
        sql`coalesce(${latestRepositoryLastPushAtSql()}, ${servers.lastSeenAt}::text) desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "popular":
      return [
        sql`coalesce(${latestRepositoryStarsSql()}, 0) desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "name":
      return [
        sql`lower(${servers.title}) asc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
  }
}

export function buildCursorPredicate(
  sort: PublicServerSort,
  cursor: ServerSearchCursorPayload,
  score: SQL<number>,
): SQL {
  switch (sort) {
    case "relevance":
      return sql`(
        ${score} < ${cursor.primary}
        or (${score} = ${cursor.primary} and lower(${servers.slug}::text) > ${cursor.secondary})
        or (${score} = ${cursor.primary} and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "recent":
      return sql`(
        ${servers.firstSeenAt} < ${cursor.primary}::timestamptz
        or (${servers.firstSeenAt} = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) > ${cursor.secondary})
        or (${servers.firstSeenAt} = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "updated":
      return sql`(
        coalesce(${latestRepositoryLastPushAtSql()}::timestamptz, ${servers.lastSeenAt}) < ${cursor.primary}::timestamptz
        or (coalesce(${latestRepositoryLastPushAtSql()}::timestamptz, ${servers.lastSeenAt}) = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) > ${cursor.secondary})
        or (coalesce(${latestRepositoryLastPushAtSql()}::timestamptz, ${servers.lastSeenAt}) = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "popular":
      return sql`(
        coalesce(${latestRepositoryStarsSql()}, 0) < ${cursor.primary}
        or (coalesce(${latestRepositoryStarsSql()}, 0) = ${cursor.primary} and lower(${servers.slug}::text) > ${cursor.secondary})
        or (coalesce(${latestRepositoryStarsSql()}, 0) = ${cursor.primary} and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "name":
      return sql`(
        lower(${servers.title}) > ${cursor.primary}
        or (lower(${servers.title}) = ${cursor.primary} and lower(${servers.slug}::text) > ${cursor.secondary})
        or (lower(${servers.title}) = ${cursor.primary} and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
  }
}

export function buildPrimarySortValue(
  sort: PublicServerSort,
  row: SearchServersPageRow,
): string | number | null {
  switch (sort) {
    case "relevance":
      return row.relevanceScore;
    case "recent":
      return row.firstSeenAt;
    case "updated":
      return row.sortUpdatedAt ?? row.firstSeenAt;
    case "popular":
      return row.repositoryStars ?? 0;
    case "name":
      return row.title.toLowerCase();
  }
}

export async function runSearchServersPageQuery(
  db: Database,
  input: SearchServersPageInput,
  cursor: ServerSearchCursorPayload | null,
  fetchLimit: number,
): Promise<readonly SearchServersPageRow[]> {
  const normalizedQuery = input.q ? normalized(input.q) : null;
  const score = normalizedQuery ? searchScoreSql(normalizedQuery) : sql<number>`0`;
  const where: SQL[] = [sql`${servers.moderationStatus} = 'normal'`];

  if (input.status) {
    where.push(sql`${servers.listingStatus} = ${input.status}`);
  } else {
    where.push(sql`${servers.listingStatus} <> 'deleted_upstream'`);
  }
  if (normalizedQuery) where.push(searchPredicate(normalizedQuery));
  if (input.category) {
    const categorySlug = normalized(input.category);
    where.push(sql`exists (
      select 1
      from ${serverCategories} sc
      inner join ${categories} c on c.id = sc.category_id
      where sc.server_id = ${servers.id}
        and lower(c.slug) = ${categorySlug}
    )`);
  }
  if (input.publisher) {
    where.push(sql`lower(${publishers.slug}::text) = ${normalized(input.publisher)}`);
  }
  if (input.client) {
    where.push(sql`exists (
      select 1
      from ${clientCompatibility} cc
      where cc.server_id = ${servers.id}
        and lower(cc.client_id) = ${normalized(input.client)}
        and cc.status in (${sql.join(
          CLIENT_SUPPORTED_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )})
    )`);
  }
  if (input.transport) {
    const transport = normalized(input.transport);
    where.push(sql`exists (
      select 1
      from ${serverVersions} sv
      left join ${serverPackages} sp on sp.server_version_id = sv.id
      left join ${serverRemotes} sr on sr.server_version_id = sv.id
      where sv.id = ${servers.currentVersionId}
        and (lower(sp.transport_type) = ${transport} or lower(sr.transport_type) = ${transport})
    )`);
  }
  if (input.registryType) {
    const registryType = normalized(input.registryType);
    where.push(sql`exists (
      select 1
      from ${serverVersions} sv
      inner join ${serverPackages} sp on sp.server_version_id = sv.id
      where sv.id = ${servers.currentVersionId}
        and lower(sp.registry_type) = ${registryType}
    )`);
  }
  if (input.verified !== undefined) {
    where.push(
      input.verified
        ? sql`${publishers.verificationState} = 'verified'`
        : sql`coalesce(${publishers.verificationState} = 'verified', false) = false`,
    );
  }
  if (input.openSource !== undefined) {
    where.push(
      input.openSource ? sql`${servers.openSource} is true` : sql`${servers.openSource} is false`,
    );
  }
  if (cursor) {
    where.push(buildCursorPredicate(input.sort, cursor, score));
  }

  return db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      currentVersion: serverVersions.version,
      listingStatus: servers.listingStatus,
      repositoryUrl: servers.repositoryUrl,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherDisplayName: publishers.displayName,
      publisherVerified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      officialRegistry: sql<boolean>`coalesce(${registrySources.key} = 'official', false)`,
      sourceAvailable: servers.sourceAvailable,
      openSource: servers.openSource,
      firstSeenAt: sql<string>`${servers.firstSeenAt}::text`,
      sortUpdatedAt: latestRepositoryLastPushAtSql(),
      repositoryStars: latestRepositoryStarsSql(),
      relevanceScore: normalizedQuery ? score : sql<number | null>`null`,
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .leftJoin(serverVersions, sql`${serverVersions.id} = ${servers.currentVersionId}`)
    .leftJoin(registrySources, sql`${registrySources.id} = ${serverVersions.registrySourceId}`)
    .where(and(...where))
    .orderBy(...buildOrderBy(input.sort, score))
    .limit(fetchLimit);
}
```

- [ ] **Step 6: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/search test -- src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/search typecheck`

Expected: PASS with stable ordering, no duplicate records across pages, and zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/search/src/index.ts packages/search/src/public-api/server-projections.ts packages/search/src/public-api/search-servers-page.ts packages/search/src/__tests__/search-servers-page.integration.test.ts
git commit -m "feat(search): add public server collection queries"
```

### Task 6: Server Detail, Identifier Resolution, and Safe Install Manifest Assembly

**Files:**

- Modify: `packages/domain/package.json`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/src/public-api/server-detail.ts`
- Create: `packages/domain/src/public-api/resolve-server-identifier.ts`
- Create: `packages/domain/src/public-api/install-manifest.ts`
- Test: `packages/domain/src/public-api/__tests__/server-detail.integration.test.ts`
- Test: `packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts`
- Test: `packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts`

**Interfaces:**

- Consumes: `PublicServerCategory`, `PublicServerDetail`, `ResolvedServerIdentifier`, `InstallManifestV1`, and `SupportedClientId` types from `@themcpdirectory/api-contract`, the existing database schema exports from `@themcpdirectory/db`, and the existing `createTempDatabase` test harness under `packages/domain/src/registry/__tests__/postgres-test-db.ts`.
- Produces: `export async function getServerDetailBySlug(db: Database, slug: string): Promise<PublicServerDetail | null>`.
- Produces: `export interface ServerDetailRow { readonly id: string; readonly slug: string; readonly title: string; readonly shortDescription: string; readonly longDescription: string | null; readonly listingStatus: "active" | "deprecated" | "deleted_upstream" | "unavailable"; readonly aliases: readonly string[]; readonly publisher: PublicPublisherSummary | null; readonly repository: PublicRepositorySummary | null; readonly currentVersion: string | null; readonly categories: readonly PublicServerCategory[]; readonly packages: readonly ServerPackageRow[]; readonly remotes: readonly ServerRemoteRow[]; readonly compatibility: InstallManifestCompatibility; readonly trustProfile: PublicTrustProfile; readonly timestamps: PublicServerTimestamps; readonly provenance: InstallManifestV1["provenance"] | null }`.
- Produces: `export async function loadServerDetailRow(db: Database, slug: string): Promise<ServerDetailRow | null>`.
- Produces: `export interface AmbiguousServerMatchSummary { readonly slug: string; readonly title: string; readonly matchedBy: "alias" | "canonical_registry_name" | "package_identifier"; readonly matchedValue: string; }`.
- Produces: `export class AmbiguousServerIdentifierError extends Error { readonly matches: readonly AmbiguousServerMatchSummary[] }`.
- Produces: `export interface IdentifierMatchRow { readonly id: string; readonly slug: string; readonly title: string; readonly version: string | null; readonly matchedValue: string }`.
- Produces: `export async function lookupIdentifierMatches(db: Database, matchedBy: "slug" | "alias" | "canonical_registry_name" | "package_identifier", identifier: string, limit: number): Promise<readonly IdentifierMatchRow[]>`.
- Produces: `export async function resolveServerIdentifier(db: Database, identifier: string): Promise<ResolvedServerIdentifier | null>`.
- Produces: `export class ServerNotFoundError extends Error`.
- Produces: `export class InstallManifestUnavailableError extends Error`.
- Produces: `export class UpstreamDeletedError extends Error`.
- Produces: `export interface ServerPackageRow { readonly id: string; readonly registryType: string; readonly identifier: string; readonly version: string | null; readonly fileSha256: string | null; readonly runtimeHint: string | null; readonly transportType: string; readonly runtimeArguments: readonly Record<string, unknown>[]; readonly packageArguments: readonly Record<string, unknown>[]; readonly environmentVariables: readonly Record<string, unknown>[] }`.
- Produces: `export interface ServerRemoteRow { readonly id: string; readonly transportType: string; readonly urlTemplate: string; readonly headers: readonly Record<string, unknown>[]; readonly variables: Record<string, unknown> }`.
- Produces: `export type InstallManifestCompatibility = { readonly "claude-code"?: "supported" | "supported_with_configuration" | "unsupported" | "unknown"; readonly codex?: "supported" | "supported_with_configuration" | "unsupported" | "unknown"; readonly cursor?: "supported" | "supported_with_configuration" | "unsupported" | "unknown" }`.
- Produces: `export type InstallManifestPackageVariant = InstallManifestV1["variants"][number] & { readonly kind: "package" }`.
- Produces: `export type InstallManifestRemoteVariant = InstallManifestV1["variants"][number] & { readonly kind: "remote" }`.
- Produces: `export type InstallManifestVariant = InstallManifestPackageVariant | InstallManifestRemoteVariant`.
- Produces: `async function loadAliases(db: Database, serverId: string): Promise<readonly string[]>`.
- Produces: `async function loadPublicServerCategories(db: Database, serverId: string): Promise<readonly PublicServerCategory[]>`.
- Produces: `async function loadServerPackages(db: Database, currentVersionId: string | null): Promise<readonly ServerPackageRow[]>`.
- Produces: `async function loadServerRemotes(db: Database, currentVersionId: string | null): Promise<readonly ServerRemoteRow[]>`.
- Produces: `async function loadCompatibilityMap(db: Database, serverId: string): Promise<InstallManifestCompatibility>`.
- Produces: `async function loadTrustProfile(db: Database, serverId: string, currentVersionId: string | null): Promise<PublicTrustProfile>`.
- Produces: `export function projectPackageVariant(row: ServerPackageRow): InstallManifestPackageVariant`.
- Produces: `export function projectRemoteVariant(row: ServerRemoteRow): InstallManifestRemoteVariant`.
- Produces: `export function filterVariantsForClient(variants: readonly InstallManifestVariant[], clientId: SupportedClientId, compatibility: InstallManifestCompatibility): readonly InstallManifestVariant[]`.
- Produces: `export async function buildInstallManifest(db: Database, input: { identifier: string; clientId?: SupportedClientId }): Promise<InstallManifestV1>`.

Re-export `AmbiguousServerIdentifierError`, `ServerNotFoundError`, `InstallManifestUnavailableError`, and `UpstreamDeletedError` from `packages/domain/src/index.ts`, and keep `InvalidCursorError` re-exported from `packages/search/src/index.ts`, so `apps/api/src/http/errors.ts` imports both boundary failures from stable package roots.

- [ ] **Step 1: Write the failing integration tests for detail, resolution, and install safety**

```ts
import { describe, expect, it } from "vitest";
import { buildInstallManifest, getServerDetailBySlug, resolveServerIdentifier } from "../index.js";

describe("resolveServerIdentifier", () => {
  it("returns alias metadata and bounded ambiguity summaries", async () => {
    const resolved = await resolveServerIdentifier(db, "github-server");

    expect(resolved).toMatchObject({
      slug: "github",
      matchedBy: "alias",
      matchedValue: "github-server",
      needsRedirect: true,
    });

    await expect(resolveServerIdentifier(db, "@shared/duplicate")).rejects.toMatchObject({
      name: "AmbiguousServerIdentifierError",
      matches: [
        expect.objectContaining({ slug: "ambiguous-one", matchedBy: "package_identifier" }),
        expect.objectContaining({ slug: "ambiguous-two", matchedBy: "package_identifier" }),
      ],
    });
  });
});

describe("buildInstallManifest", () => {
  it("builds a declarative manifest and never returns a shell command string", async () => {
    const manifest = await buildInstallManifest(db, { identifier: "github" });

    expect(manifest.schemaVersion).toBe(1);
    expect(JSON.stringify(manifest)).not.toContain("postinstall");
    expect(JSON.stringify(manifest)).not.toContain("bash -c");
    expect(JSON.stringify(manifest)).not.toContain("powershell");
  });

  it("raises server-not-found separately from install-unavailable", async () => {
    await expect(buildInstallManifest(db, { identifier: "does-not-exist" })).rejects.toMatchObject({
      name: "ServerNotFoundError",
    });
  });
});

describe("getServerDetailBySlug", () => {
  it("returns deleted_upstream listings directly by slug", async () => {
    const detail = await getServerDetailBySlug(db, "upstream-deleted-server");
    expect(detail?.listingStatus).toBe("deleted_upstream");
  });

  it("returns the public detail shape without leaking install-only provenance", async () => {
    const detail = await getServerDetailBySlug(db, "github");

    expect(detail?.categories[0]).toEqual(
      expect.objectContaining({ slug: expect.any(String), name: expect.any(String) }),
    );
    expect(detail).not.toHaveProperty("provenance");
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts`

Expected: FAIL with an export error such as `does not provide an export named 'getServerDetailBySlug'`.

- [ ] **Step 3: Implement public slug detail retrieval without leaking raw upstream payloads**

```ts
// packages/domain/src/public-api/server-detail.ts
export async function loadServerDetailRow(
  db: Database,
  slug: string,
): Promise<ServerDetailRow | null> {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const [server] = await db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      longDescription: servers.longDescription,
      listingStatus: servers.listingStatus,
      currentVersion: serverVersions.version,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherName: publishers.displayName,
      publisherVerified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      repositoryUrl: servers.repositoryUrl,
      firstSeenAt: sql<string>`${servers.firstSeenAt}::text`,
      lastSeenAt: sql<string>`${servers.lastSeenAt}::text`,
      publishedAt: sql<string | null>`${serverVersions.publishedAt}::text`,
      updatedAt: sql<string>`${servers.updatedAt}::text`,
      registryKey: registrySources.key,
      registryName: registrySources.name,
      observedAt: sql<string>`${serverVersions.lastSeenAt}::text`,
      currentVersionId: servers.currentVersionId,
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .leftJoin(serverVersions, sql`${serverVersions.id} = ${servers.currentVersionId}`)
    .leftJoin(registrySources, sql`${registrySources.id} = ${serverVersions.registrySourceId}`)
    .where(
      sql`lower(${servers.slug}::text) = ${normalized} and ${servers.moderationStatus} not in ('hidden', 'blocked')`,
    )
    .limit(1);

  if (!server) return null;

  return {
    id: server.id,
    slug: server.slug,
    title: server.title,
    shortDescription: server.shortDescription,
    longDescription: server.longDescription,
    listingStatus: server.listingStatus,
    aliases: await loadAliases(db, server.id),
    publisher:
      server.publisherSlug && server.publisherName
        ? {
            slug: server.publisherSlug,
            name: server.publisherName,
            verified: server.publisherVerified,
          }
        : null,
    repository: server.repositoryUrl ? { url: server.repositoryUrl } : null,
    currentVersion: server.currentVersion,
    categories: await loadPublicServerCategories(db, server.id),
    packages: await loadServerPackages(db, server.currentVersionId),
    remotes: await loadServerRemotes(db, server.currentVersionId),
    compatibility: await loadCompatibilityMap(db, server.id),
    trustProfile: await loadTrustProfile(db, server.id, server.currentVersionId),
    timestamps: {
      firstSeenAt: server.firstSeenAt,
      lastSeenAt: server.lastSeenAt,
      publishedAt: server.publishedAt,
      updatedAt: server.updatedAt,
    },
    provenance:
      server.registryKey && server.registryName && server.observedAt
        ? {
            registry: server.registryKey,
            registryName: server.registryName,
            observedAt: server.observedAt,
          }
        : null,
  };
}

export async function getServerDetailBySlug(
  db: Database,
  slug: string,
): Promise<PublicServerDetail | null> {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const server = await loadServerDetailRow(db, normalized);
  if (!server) return null;

  return {
    id: server.id,
    slug: server.slug,
    title: server.title,
    shortDescription: server.shortDescription,
    longDescription: server.longDescription,
    listingStatus: server.listingStatus,
    aliases: server.aliases,
    publisher: server.publisher,
    repository: server.repository,
    version: server.currentVersion,
    categories: server.categories,
    packages: server.packages,
    remotes: server.remotes,
    compatibility: server.compatibility,
    trustProfile: server.trustProfile,
    timestamps: server.timestamps,
  };
}
```

- [ ] **Step 4: Implement ambiguity-safe identifier resolution with bounded summaries**

```ts
// packages/domain/src/public-api/resolve-server-identifier.ts
const IDENTIFIER_PRECEDENCE = [
  "slug",
  "alias",
  "canonical_registry_name",
  "package_identifier",
] as const;

export async function resolveServerIdentifier(
  db: Database,
  identifier: string,
): Promise<ResolvedServerIdentifier | null> {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.length === 0) return null;

  for (const matchedBy of IDENTIFIER_PRECEDENCE) {
    const matches = await lookupIdentifierMatches(db, matchedBy, normalized, 3);
    if (matches.length === 0) continue;
    if (matches.length > 1 && matchedBy !== "slug") {
      throw new AmbiguousServerIdentifierError(normalized, matchedBy, matches.slice(0, 3));
    }

    const match = matches[0]!;
    return {
      id: match.id,
      slug: match.slug,
      title: match.title,
      version: match.version,
      canonicalUrl: `https://themcpdirectory.org/${match.slug}`,
      matchedBy,
      matchedValue: match.matchedValue,
      needsRedirect: matchedBy !== "slug",
    };
  }

  return null;
}
```

- [ ] **Step 5: Implement safe install-manifest assembly and variant filtering**

```ts
// packages/domain/src/public-api/install-manifest.ts
const EXACT_VERSION_PATTERN = /^(?!latest$)(?!.*[\s~^*<>])[0-9A-Za-z][0-9A-Za-z.+-]*$/;

function isSupportedRegistryType(registryType: string): boolean {
  return registryType === "npm" || registryType === "pypi";
}

function projectEnvironmentVariable(input: Record<string, unknown>) {
  return {
    name: String(input.name),
    description: typeof input.description === "string" ? input.description : null,
    required: input.isRequired === true,
    defaultValue:
      input.isSecret === true
        ? null
        : typeof input.defaultValue === "string"
          ? input.defaultValue
          : null,
    valueSource: "environment" as const,
  };
}

function isSafePackageVariant(row: ServerPackageRow): boolean {
  return (
    row.version !== null &&
    EXACT_VERSION_PATTERN.test(row.version) &&
    isSupportedRegistryType(row.registryType) &&
    (row.fileSha256 === null || /^[a-f0-9]{64}$/i.test(row.fileSha256))
  );
}

export async function buildInstallManifest(
  db: Database,
  input: { identifier: string; clientId?: SupportedClientId },
): Promise<InstallManifestV1> {
  const resolved = await resolveServerIdentifier(db, input.identifier);
  if (!resolved) throw new ServerNotFoundError(input.identifier);

  const detailRow = await loadServerDetailRow(db, resolved.slug);
  if (!detailRow) throw new ServerNotFoundError(resolved.slug);
  if (detailRow.listingStatus === "deleted_upstream") {
    throw new UpstreamDeletedError(resolved.slug);
  }
  if (!detailRow.provenance) {
    throw new InstallManifestUnavailableError("INSTALL_UNAVAILABLE");
  }

  const variants = detailRow.packages
    .filter(isSafePackageVariant)
    .map(projectPackageVariant)
    .concat(detailRow.remotes.map(projectRemoteVariant));

  const filteredVariants = input.clientId
    ? filterVariantsForClient(variants, input.clientId, detailRow.compatibility)
    : variants;
  if (filteredVariants.length === 0)
    throw new InstallManifestUnavailableError("INSTALL_UNAVAILABLE");

  return {
    schemaVersion: 1,
    server: {
      id: detailRow.id,
      slug: detailRow.slug,
      title: detailRow.title,
      version: detailRow.currentVersion,
    },
    provenance: detailRow.provenance,
    variants: filteredVariants,
    compatibility: detailRow.compatibility,
  };
}
```

- [ ] **Step 6: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts && pnpm --filter @themcpdirectory/domain typecheck`

Expected: PASS with safe manifests, bounded ambiguity summaries, and zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/package.json packages/domain/src/index.ts packages/domain/src/public-api/server-detail.ts packages/domain/src/public-api/resolve-server-identifier.ts packages/domain/src/public-api/install-manifest.ts packages/domain/src/public-api/__tests__/server-detail.integration.test.ts packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts
git commit -m "feat(domain): add public server detail and install queries"
```

### Task 7: Category, Publisher, and Client Discovery Queries

**Files:**

- Modify: `packages/client-adapters/package.json`
- Modify: `packages/client-adapters/src/index.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/client-adapters/src/catalog.ts`
- Create: `packages/client-adapters/src/__tests__/catalog.test.ts`
- Create: `packages/domain/src/public-api/categories.ts`
- Create: `packages/domain/src/public-api/publishers.ts`
- Create: `packages/domain/src/public-api/clients.ts`
- Test: `packages/domain/src/public-api/__tests__/discovery.integration.test.ts`

**Interfaces:**

- Consumes: `searchServersPage` from Task 5, `supportedClientIdSchema` and response types from `@themcpdirectory/api-contract`, and the domain detail helpers from Task 6.
- Produces: `export interface ClientDescriptor { readonly id: SupportedClientId; readonly name: string; readonly capabilities: { readonly deeplink: boolean; readonly stdio: boolean; readonly streamableHttp: boolean; readonly headers: boolean; readonly environmentVariables: boolean; readonly remoteVariables: boolean } }`.
- Produces: `export const SUPPORTED_CLIENTS: readonly ClientDescriptor[]`.
- Produces: `export async function listPublicCategories(db: Database): Promise<readonly PublicCategorySummary[]>`.
- Produces: `export async function getPublicCategoryBySlug(db: Database, input: { slug: string; cursor?: string; limit?: number }, options: SearchServersPageOptions): Promise<PublicCategoryDetail | null>`.
- Produces: `export async function getPublicPublisherBySlug(db: Database, input: { slug: string; cursor?: string; limit?: number }, options: SearchServersPageOptions): Promise<PublicPublisherDetail | null>`.
- Produces: `export async function loadClientCompatibilityCounts(db: Database): Promise<Map<SupportedClientId, number>>`.
- Produces: `export async function listPublicClients(db: Database): Promise<readonly PublicClientSummary[]>`.
- Produces: `export async function getPublicClientById(db: Database, input: { id: SupportedClientId; cursor?: string; limit?: number }, options: SearchServersPageOptions): Promise<PublicClientDetail | null>`.

- [ ] **Step 1: Write the failing client catalogue and discovery integration tests**

```ts
import { describe, expect, it } from "vitest";
import { SUPPORTED_CLIENTS } from "@themcpdirectory/client-adapters";
import {
  getPublicCategoryBySlug,
  getPublicClientById,
  getPublicPublisherBySlug,
  listPublicClients,
} from "../index.js";

describe("SUPPORTED_CLIENTS", () => {
  it("pins the approved Phase D client identifiers", () => {
    expect(SUPPORTED_CLIENTS.map((client) => client.id)).toEqual([
      "claude-code",
      "codex",
      "cursor",
    ]);
  });
});

describe("discovery queries", () => {
  it("returns category detail with paginated visible listings", async () => {
    const category = await getPublicCategoryBySlug(
      db,
      { slug: "developer-tools", limit: 1 },
      { cursorCodec },
    );

    expect(category?.category.slug).toBe("developer-tools");
    expect(category?.servers).toHaveLength(1);
  });

  it("returns publisher detail without membership data and with paginated listings", async () => {
    const publisher = await getPublicPublisherBySlug(
      db,
      { slug: "github", limit: 1 },
      { cursorCodec },
    );
    expect(publisher?.publisher.slug).toBe("github");
    expect(publisher?.servers).toHaveLength(1);
    expect(JSON.stringify(publisher)).not.toContain("approvedBy");
  });

  it("returns supported clients with factual capability metadata", async () => {
    const clients = await listPublicClients(db);
    expect(clients).toContainEqual(
      expect.objectContaining({
        id: "cursor",
        capabilities: expect.objectContaining({
          deeplink: true,
          headers: true,
          environmentVariables: true,
        }),
      }),
    );
  });

  it("returns a client detail page backed by the shared search query layer", async () => {
    const detail = await getPublicClientById(db, { id: "cursor", limit: 10 }, { cursorCodec });
    expect(detail?.client.id).toBe("cursor");
    expect(Array.isArray(detail?.servers)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/client-adapters test -- src/__tests__/catalog.test.ts && pnpm --filter @themcpdirectory/domain test:integration -- src/public-api/__tests__/discovery.integration.test.ts`

Expected: FAIL with an export error such as `Cannot find module '@themcpdirectory/client-adapters'` or `does not provide an export named 'listPublicClients'`.

- [ ] **Step 3: Implement the supported-client catalogue**

```ts
// packages/client-adapters/src/catalog.ts
export const SUPPORTED_CLIENTS = [
  {
    id: "claude-code",
    name: "Claude Code",
    capabilities: {
      deeplink: false,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
  {
    id: "codex",
    name: "Codex",
    capabilities: {
      deeplink: false,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
  {
    id: "cursor",
    name: "Cursor",
    capabilities: {
      deeplink: true,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
] as const;

export function getSupportedClientById(id: string) {
  return SUPPORTED_CLIENTS.find((client) => client.id === id) ?? null;
}
```

- [ ] **Step 4: Implement the category, publisher, and client domain queries**

```ts
// packages/domain/src/public-api/categories.ts
export async function listPublicCategories(
  db: Database,
): Promise<readonly PublicCategorySummary[]> {
  return db
    .select({
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      serverCount: sql<number>`count(${servers.id})`,
    })
    .from(categories)
    .leftJoin(serverCategories, sql`${serverCategories.categoryId} = ${categories.id}`)
    .leftJoin(
      servers,
      sql`${servers.id} = ${serverCategories.serverId} and ${servers.moderationStatus} = 'normal' and ${servers.listingStatus} <> 'deleted_upstream'`,
    )
    .groupBy(categories.id)
    .orderBy(sql`${categories.sortOrder} asc`, sql`${categories.slug} asc`);
}

export async function getPublicCategoryBySlug(
  db: Database,
  input: { slug: string; cursor?: string; limit?: number },
  options: SearchServersPageOptions,
): Promise<PublicCategoryDetail | null> {
  const [category] = await db
    .select({ slug: categories.slug, name: categories.name, description: categories.description })
    .from(categories)
    .where(sql`lower(${categories.slug}) = ${input.slug.trim().toLowerCase()}`)
    .limit(1);
  if (!category) return null;

  const page = await searchServersPage(
    db,
    { category: category.slug, sort: "recent", limit: input.limit ?? 30, cursor: input.cursor },
    options,
  );

  return {
    category,
    servers: page.items,
    nextCursor: page.nextCursor,
  };
}

// packages/domain/src/public-api/publishers.ts
export async function getPublicPublisherBySlug(
  db: Database,
  input: { slug: string; cursor?: string; limit?: number },
  options: SearchServersPageOptions,
): Promise<PublicPublisherDetail | null> {
  const [publisher] = await db
    .select({
      slug: sql<string>`${publishers.slug}::text`,
      name: publishers.displayName,
      description: publishers.description,
      websiteUrl: publishers.websiteUrl,
      verified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
    })
    .from(publishers)
    .where(sql`lower(${publishers.slug}::text) = ${input.slug.trim().toLowerCase()}`)
    .limit(1);
  if (!publisher) return null;

  const page = await searchServersPage(
    db,
    { publisher: publisher.slug, sort: "recent", limit: input.limit ?? 30, cursor: input.cursor },
    options,
  );

  return {
    publisher,
    servers: page.items,
    nextCursor: page.nextCursor,
  };
}

// packages/domain/src/public-api/clients.ts
export async function loadClientCompatibilityCounts(
  db: Database,
): Promise<Map<SupportedClientId, number>> {
  const rows = await db
    .select({ clientId: clientCompatibility.clientId, serverCount: sql<number>`count(*)` })
    .from(clientCompatibility)
    .where(sql`${clientCompatibility.status} in ('supported', 'supported_with_configuration')`)
    .groupBy(clientCompatibility.clientId);

  return new Map(rows.map((row) => [row.clientId as SupportedClientId, Number(row.serverCount)]));
}

export async function listPublicClients(db: Database): Promise<readonly PublicClientSummary[]> {
  const counts = await loadClientCompatibilityCounts(db);

  return SUPPORTED_CLIENTS.map((client) => ({
    id: client.id,
    name: client.name,
    capabilities: client.capabilities,
    serverCount: counts.get(client.id) ?? 0,
  }));
}

export async function getPublicClientById(
  db: Database,
  input: { id: SupportedClientId; cursor?: string; limit?: number },
  options: SearchServersPageOptions,
): Promise<PublicClientDetail | null> {
  const client = getSupportedClientById(input.id);
  if (!client) return null;

  const page = await searchServersPage(
    db,
    { client: input.id, limit: input.limit ?? 30, cursor: input.cursor, sort: "recent" },
    options,
  );

  return {
    client: { id: client.id, name: client.name, capabilities: client.capabilities },
    servers: page.items,
    nextCursor: page.nextCursor,
  };
}
```

- [ ] **Step 5: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/client-adapters test -- src/__tests__/catalog.test.ts && pnpm --filter @themcpdirectory/domain test:integration -- src/public-api/__tests__/discovery.integration.test.ts && pnpm --filter @themcpdirectory/client-adapters typecheck && pnpm --filter @themcpdirectory/domain typecheck`

Expected: PASS for both packages with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client-adapters/package.json packages/client-adapters/src/index.ts packages/client-adapters/src/catalog.ts packages/client-adapters/src/__tests__/catalog.test.ts packages/domain/src/index.ts packages/domain/src/public-api/categories.ts packages/domain/src/public-api/publishers.ts packages/domain/src/public-api/clients.ts packages/domain/src/public-api/__tests__/discovery.integration.test.ts
git commit -m "feat(domain): add public discovery resource queries"
```

### Task 8: API Bootstrap, Request Identity, CORS, Rate Limits, Logging, and Cache Helpers

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/index.ts`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/http/request-id.ts`
- Create: `apps/api/src/http/errors.ts`
- Create: `apps/api/src/http/logging.ts`
- Create: `apps/api/src/http/rate-limit.ts`
- Create: `apps/api/src/http/cors.ts`
- Create: `apps/api/src/http/cache.ts`
- Test: `apps/api/src/__tests__/middleware.test.ts`
- Test: `apps/api/src/__tests__/error-boundary.test.ts`

**Interfaces:**

- Consumes: `loadEnv`, `createDatabase`, `createServerSearchCursorCodec`, `ApiErrorCode`, and Hono.
- Produces: `export interface ApiLogger { info(entry: Record<string, unknown>): void; error(entry: Record<string, unknown>): void }`.
- Produces: `export type RateLimitKeyResolver = (c: Context) => string`.
- Produces: `export interface ApiDependencies { db: Database; cursorCodec: ReturnType<typeof createServerSearchCursorCodec>; rateLimiter: RateLimiter; rateLimitKeyResolver: RateLimitKeyResolver; allowedOrigins: readonly string[]; logger: ApiLogger; requestIdFactory?: () => string; }`.
- Produces: `export function createApiApp(deps: ApiDependencies): Hono`.
- Produces: `export function attachRequestId(requestIdFactory?: () => string): MiddlewareHandler`.
- Produces: `export function attachCors(allowedOrigins: readonly string[]): MiddlewareHandler`.
- Produces: `export function resolveDevelopmentRateLimitKey(c: Context): string`.
- Produces: `export function resolveProductionRateLimitKey(c: Context): string`.
- Produces: `export function attachRateLimit(rateLimiter: RateLimiter, rateLimitKeyResolver: RateLimitKeyResolver, bucket: "resource" | "search" | "install"): MiddlewareHandler`.
- Produces: `export function attachStructuredLogging(logger: ApiLogger): MiddlewareHandler`.
- Produces: `export class HttpApiError extends Error { readonly code: ApiErrorCode; readonly status: 400 | 404 | 409 | 410 | 429 | 500; readonly details?: Array<{ path: string; message: string }> }`.
- Produces: `export function createErrorHandler(logger: ApiLogger): ErrorHandler`.
- Produces: `export interface RateLimiter { check(bucket: "resource" | "search" | "install", callerKey: string): Promise<{ allowed: boolean; retryAfterSeconds: number | null }> }`.
- Produces: `export function createInMemoryRateLimiter(config: { windowSeconds: number; maxReads: number }): RateLimiter`.
- Produces: `export function jsonWithCache(c: Context, body: unknown, init: { status: number; cacheControl: string }): Response`.
- Produces: env variables `API_BASE_URL`, `API_CORS_ALLOWED_ORIGINS`, `API_CURSOR_SIGNING_SECRET`, `API_RATE_LIMIT_WINDOW_SECONDS`, and `API_RATE_LIMIT_MAX_READS`.

- [ ] **Step 0: Verify the `@hono/zod-validator` version before touching `apps/api/package.json`**

Run: `pnpm info @hono/zod-validator peerDependencies`

Expected: record a release whose peer ranges cover the repo’s `hono@4.13.5` pin and the Zod version selected by Tasks 1 to 3 before editing `apps/api/package.json`.

- [ ] **Step 1: Write the failing middleware and env tests**

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { loadEnv } from "@themcpdirectory/config";
import { InvalidCursorError } from "@themcpdirectory/search";
import {
  AmbiguousServerIdentifierError,
  InstallManifestUnavailableError,
  ServerNotFoundError,
  UpstreamDeletedError,
} from "@themcpdirectory/domain";
import { jsonWithCache } from "../http/cache.js";
import { attachCors } from "../http/cors.js";
import { createErrorHandler, HttpApiError } from "../http/errors.js";
import { attachStructuredLogging } from "../http/logging.js";
import {
  attachRateLimit,
  createInMemoryRateLimiter,
  resolveProductionRateLimitKey,
} from "../http/rate-limit.js";
import { attachRequestId } from "../http/request-id.js";

describe("loadEnv", () => {
  it("parses the Phase D API env defaults", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
      API_CURSOR_SIGNING_SECRET: "phase-d-secret-phase-d-secret-phase-d-secret",
    });

    expect(env.API_BASE_URL).toBe("http://127.0.0.1:3001");
    expect(env.API_CORS_ALLOWED_ORIGINS).toEqual(["*"]);
    expect(env.API_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });
});

describe("HTTP middleware", () => {
  it("echoes request ids, applies wildcard CORS, and serves HEAD without a body", async () => {
    const entries: unknown[] = [];
    const app = new Hono();
    app.onError(createErrorHandler({ info() {}, error() {} }));
    app.use(
      "*",
      attachRequestId(() => "req_generated_phase_d"),
    );
    app.use(
      "*",
      attachStructuredLogging({
        info: (entry) => entries.push(entry),
        error: (entry) => entries.push(entry),
      }),
    );
    app.use("/api/v1/probe", attachCors(["*"]));
    app.use(
      "/api/v1/probe",
      attachRateLimit(
        { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
        () => "dev:127.0.0.1",
        "resource",
      ),
    );
    app.on(["GET", "HEAD"], "/api/v1/probe", (c) =>
      jsonWithCache(
        c,
        { data: [], meta: { requestId: c.get("requestId"), nextCursor: null } },
        { status: 200, cacheControl: "public, max-age=60, stale-while-revalidate=300" },
      ),
    );

    const response = await app.request("/api/v1/probe", {
      headers: { Origin: "https://example.com", "X-Request-ID": "req_incoming_phase_d" },
    });

    expect(response.headers.get("x-request-id")).toBe("req_incoming_phase_d");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("etag")).toBeTruthy();

    const head = await app.request("/api/v1/probe", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    expect(JSON.stringify(entries)).not.toContain("https://example.com");
  });

  it("rate limits by stable caller identity rather than request id", async () => {
    const deniedApp = new Hono();
    deniedApp.onError(createErrorHandler({ info() {}, error() {} }));
    deniedApp.use("*", attachRequestId());
    deniedApp.use(
      "/api/v1/probe",
      attachRateLimit(
        createInMemoryRateLimiter({ windowSeconds: 60, maxReads: 1 }),
        resolveProductionRateLimitKey,
        "resource",
      ),
    );
    deniedApp.get("/api/v1/probe", (c) => c.json({ ok: true }));

    const first = await deniedApp.request("/api/v1/probe", {
      headers: {
        "X-Request-ID": "req_limited_phase_d_1",
        "CF-Connecting-IP": "203.0.113.10",
      },
    });
    expect(first.status).toBe(200);

    const limited = await deniedApp.request("/api/v1/probe", {
      headers: {
        "X-Request-ID": "req_limited_phase_d_2",
        "CF-Connecting-IP": "203.0.113.10",
      },
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
  });
});

describe("createErrorHandler", () => {
  it("maps validation, cursor, ambiguity, install, upstream deletion, and unexpected failures", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("requestId", "req_phase_d_error");
      await next();
    });
    app.onError(createErrorHandler({ info() {}, error() {} }));

    app.get("/validation", () => {
      throw new HttpApiError("VALIDATION_ERROR", 400, "Invalid query", [
        { path: "query.limit", message: "Must be <= 100" },
      ]);
    });
    app.get("/cursor", () => {
      throw new InvalidCursorError();
    });
    app.get("/ambiguous", () => {
      throw new AmbiguousServerIdentifierError("shared", "alias", [
        { slug: "server-a", title: "Server A", matchedBy: "alias", matchedValue: "shared" },
        { slug: "server-b", title: "Server B", matchedBy: "alias", matchedValue: "shared" },
      ]);
    });
    app.get("/missing", () => {
      throw new ServerNotFoundError("missing-server");
    });
    app.get("/install", () => {
      throw new InstallManifestUnavailableError("INSTALL_UNAVAILABLE");
    });
    app.get("/deleted", () => {
      throw new UpstreamDeletedError("deleted-server");
    });
    app.get("/unexpected", () => {
      throw new Error("stack trace should stay private");
    });

    await expect((await app.request("/validation")).json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", requestId: "req_phase_d_error" },
    });
    expect((await app.request("/cursor")).status).toBe(400);
    expect((await app.request("/ambiguous")).status).toBe(409);
    expect((await app.request("/missing")).status).toBe(404);
    expect((await app.request("/install")).status).toBe(410);
    expect((await app.request("/deleted")).status).toBe(410);

    const unexpected = await app.request("/unexpected");
    expect(unexpected.status).toBe(500);
    await expect(unexpected.text()).resolves.not.toContain("stack trace");
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/api test -- src/__tests__/middleware.test.ts src/__tests__/error-boundary.test.ts && pnpm --filter @themcpdirectory/config test -- src/env.test.ts`

Expected: FAIL with missing exports such as `attachRequestId`, `createErrorHandler`, or env parsing mismatches such as `API_CORS_ALLOWED_ORIGINS` still being a raw string.

- [ ] **Step 3: Extend the shared env loader for Phase D API settings**

```ts
// packages/config/src/env.ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  MCP_REGISTRY_BASE_URL: z.string().url(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default("http://127.0.0.1:3001"),
  API_CORS_ALLOWED_ORIGINS: z
    .string()
    .default("*")
    .transform((value) =>
      value === "*"
        ? ["*"]
        : value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
    ),
  API_CURSOR_SIGNING_SECRET: z.string().min(32),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_MAX_READS: z.coerce.number().int().positive().default(120),
  GITHUB_TOKEN: z.string().optional(),
});
```

- [ ] **Step 4: Implement request identity, log redaction, rate limiting, and cache helpers**

```ts
// apps/api/src/http/request-id.ts
import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { requestIdSchema } from "@themcpdirectory/api-contract";

export function attachRequestId(requestIdFactory: () => string = randomUUID): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const requestId =
      incoming && requestIdSchema.safeParse(incoming).success ? incoming : requestIdFactory();
    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);
    await next();
  };
}

// apps/api/src/http/errors.ts
import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { errorResponseSchema, type ApiErrorCode } from "@themcpdirectory/api-contract";
import { InvalidCursorError } from "@themcpdirectory/search";
import {
  AmbiguousServerIdentifierError,
  InstallManifestUnavailableError,
  ServerNotFoundError,
  UpstreamDeletedError,
} from "@themcpdirectory/domain";
import type { ApiLogger } from "../app.js";

export class HttpApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: 400 | 404 | 409 | 410 | 429 | 500,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "HttpApiError";
  }
}

function toHttpApiError(error: unknown): HttpApiError {
  if (error instanceof HttpApiError) return error;
  if (error instanceof ZodError) {
    return new HttpApiError(
      "VALIDATION_ERROR",
      400,
      "Validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  if (error instanceof InvalidCursorError) {
    return new HttpApiError("CURSOR_INVALID", 400, "Cursor is invalid");
  }
  if (error instanceof AmbiguousServerIdentifierError) {
    return new HttpApiError("AMBIGUOUS_SERVER", 409, "Identifier matches multiple servers");
  }
  if (error instanceof ServerNotFoundError) {
    return new HttpApiError("SERVER_NOT_FOUND", 404, "Server not found");
  }
  if (error instanceof UpstreamDeletedError) {
    return new HttpApiError("UPSTREAM_DELETED", 410, "Listing was deleted upstream");
  }
  if (error instanceof InstallManifestUnavailableError) {
    return new HttpApiError("INSTALL_UNAVAILABLE", 410, "Install manifest is unavailable");
  }
  return new HttpApiError("INTERNAL_ERROR", 500, "Internal server error");
}

export function createErrorHandler(logger: ApiLogger): ErrorHandler {
  return (error, c) => {
    const httpError = toHttpApiError(error);
    logger.error({
      event: "api_error",
      requestId: c.get("requestId"),
      route: c.req.routePath,
      status: httpError.status,
      code: httpError.code,
    });

    const body = errorResponseSchema.parse({
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId: c.get("requestId"),
        details: httpError.details,
      },
    });

    return new Response(JSON.stringify(body), {
      status: httpError.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-request-id": c.get("requestId"),
      },
    });
  };
}

// apps/api/src/http/logging.ts
import type { MiddlewareHandler } from "hono";
import type { ApiLogger } from "../app.js";

export function attachStructuredLogging(logger: ApiLogger): MiddlewareHandler {
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

// apps/api/src/http/rate-limit.ts
import type { Context, MiddlewareHandler } from "hono";
import type { RateLimiter } from "../app.js";
import { HttpApiError } from "./errors.js";

function firstForwardedFor(value: string | undefined): string | null {
  const candidate = value?.split(",")[0]?.trim();
  return candidate && candidate.length > 0 ? candidate : null;
}

export function resolveDevelopmentRateLimitKey(c: Context): string {
  return `dev:${firstForwardedFor(c.req.header("x-forwarded-for")) ?? c.req.header("x-real-ip") ?? "127.0.0.1"}`;
}

export function resolveProductionRateLimitKey(c: Context): string {
  return `ip:${c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? firstForwardedFor(c.req.header("x-forwarded-for")) ?? "unknown"}`;
}

export function createInMemoryRateLimiter(config: {
  windowSeconds: number;
  maxReads: number;
}): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    async check(bucket, callerKey) {
      const key = `${bucket}:${callerKey}`;
      const now = Date.now();
      const resetAt = now + config.windowSeconds * 1000;
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt });
        return { allowed: true, retryAfterSeconds: null };
      }
      if (current.count >= config.maxReads) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
      }

      current.count += 1;
      return { allowed: true, retryAfterSeconds: null };
    },
  };
}

export function attachRateLimit(
  rateLimiter: RateLimiter,
  rateLimitKeyResolver: (c: Context) => string,
  bucket: "resource" | "search" | "install",
): MiddlewareHandler {
  return async (c, next) => {
    const callerKey = rateLimitKeyResolver(c);
    const result = await rateLimiter.check(bucket, callerKey);
    c.set("rateLimitKey", callerKey);
    c.set("rateLimitBucket", bucket);
    c.set("rateLimitAllowed", result.allowed);
    if (!result.allowed) {
      if (result.retryAfterSeconds !== null) {
        c.header("Retry-After", String(result.retryAfterSeconds));
      }
      throw new HttpApiError("RATE_LIMITED", 429, "Too many requests");
    }
    await next();
  };
}

// apps/api/src/http/cors.ts
import type { MiddlewareHandler } from "hono";

export function attachCors(allowedOrigins: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (allowedOrigins.includes("*")) {
      c.header("Access-Control-Allow-Origin", "*");
    } else if (origin && allowedOrigins.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
    }
    c.header("Access-Control-Allow-Methods", "GET, HEAD");
    await next();
  };
}

// apps/api/src/http/cache.ts
import { createHash } from "node:crypto";
import type { Context } from "hono";

export function createJsonEtag(body: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url")}"`;
}

export function jsonWithCache(
  c: Context,
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
```

- [ ] **Step 5: Build `createApiApp` around thin injectable dependencies**

```ts
// apps/api/src/app.ts
import { Hono } from "hono";
import type { Context } from "hono";
import type { Database } from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { attachCors } from "./http/cors.js";
import { createErrorHandler } from "./http/errors.js";
import { attachStructuredLogging } from "./http/logging.js";
import { attachRateLimit } from "./http/rate-limit.js";
import { attachRequestId } from "./http/request-id.js";

export interface ApiLogger {
  info(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

export type RateLimitKeyResolver = (c: Context) => string;

export interface RateLimiter {
  check(
    bucket: "resource" | "search" | "install",
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

export function createApiApp(deps: ApiDependencies) {
  const app = new Hono();
  const apiV1 = new Hono();
  const withRateLimit = (bucket: "resource" | "search" | "install") =>
    attachRateLimit(deps.rateLimiter, deps.rateLimitKeyResolver, bucket);

  app.onError(createErrorHandler(deps.logger));
  app.get("/", (c) => c.json({ status: "ok" }));
  app.use("*", attachRequestId(deps.requestIdFactory));
  app.use("*", attachStructuredLogging(deps.logger));

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

// apps/api/src/index.ts
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { loadEnv } from "@themcpdirectory/config";
import { createDatabase } from "@themcpdirectory/db";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "./app.js";
import {
  createInMemoryRateLimiter,
  resolveDevelopmentRateLimitKey,
  resolveProductionRateLimitKey,
} from "./http/rate-limit.js";

const env = loadEnv();
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
  const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port: env.API_PORT });
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
```

- [ ] **Step 6: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/api test -- src/__tests__/middleware.test.ts src/__tests__/error-boundary.test.ts && pnpm --filter @themcpdirectory/api typecheck && pnpm --filter @themcpdirectory/config test -- src/env.test.ts`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/index.ts apps/api/src/app.ts apps/api/src/http/request-id.ts apps/api/src/http/errors.ts apps/api/src/http/logging.ts apps/api/src/http/rate-limit.ts apps/api/src/http/cors.ts apps/api/src/http/cache.ts apps/api/src/__tests__/middleware.test.ts apps/api/src/__tests__/error-boundary.test.ts packages/config/src/env.ts packages/config/src/env.test.ts
git commit -m "feat(api): add public api middleware foundation"
```

### Task 9: `/servers`, `/search`, `/resolve`, and Install Route Handlers

**Files:**

- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/routes/servers.ts`
- Create: `apps/api/src/routes/search.ts`
- Create: `apps/api/src/routes/resolve.ts`
- Create: `apps/api/src/routes/install.ts`
- Test: `apps/api/src/__tests__/public-api-core.integration.test.ts`

**Interfaces:**

- Consumes: `createApiApp` from Task 8, `searchServersPage` from Task 5, `getServerDetailBySlug`, `resolveServerIdentifier`, and `buildInstallManifest` from Task 6, plus the strict response schemas and query schemas from `@themcpdirectory/api-contract`.
- Produces: route registration for `GET|HEAD /api/v1/servers`.
- Produces: route registration for `GET|HEAD /api/v1/search`.
- Produces: route registration for `GET|HEAD /api/v1/servers/:slug`.
- Produces: route registration for `GET|HEAD /api/v1/resolve/:identifier`.
- Produces: route registration for `GET|HEAD /api/v1/servers/:slug/install` and `GET|HEAD /api/v1/resolve/:identifier/install`.

- [ ] **Step 1: Write the failing core route integration tests**

```ts
import { describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";

describe("public API core routes", () => {
  it("returns the server collection envelope with request ids and nextCursor", async () => {
    const response = await app.request("/api/v1/servers?limit=1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ slug: "github" })],
      meta: { requestId: expect.any(String), nextCursor: expect.anything() },
    });

    const resolvedInstall = await app.request("/api/v1/resolve/github/install?client=cursor");
    expect(resolvedInstall.status).toBe(200);
    await expect(resolvedInstall.json()).resolves.toMatchObject({
      data: { schemaVersion: 1, server: { slug: "github" } },
      meta: { requestId: expect.any(String) },
    });
  });

  it("serves HEAD for collection, detail, and install routes with headers and no body", async () => {
    const collection = await app.request("/api/v1/servers?limit=1", { method: "HEAD" });
    expect(collection.status).toBe(200);
    expect(collection.headers.get("cache-control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    expect(collection.headers.get("etag")).toBeTruthy();
    expect(await collection.text()).toBe("");

    const detail = await app.request("/api/v1/servers/github", { method: "HEAD" });
    expect(detail.status).toBe(200);
    expect(await detail.text()).toBe("");

    const install = await app.request("/api/v1/servers/github/install?client=cursor", {
      method: "HEAD",
    });
    expect(install.status).toBe(200);
    expect(await install.text()).toBe("");

    const resolvedInstall = await app.request("/api/v1/resolve/github/install?client=cursor", {
      method: "HEAD",
    });
    expect(resolvedInstall.status).toBe(200);
    expect(await resolvedInstall.text()).toBe("");
  });

  it("maps cursor, missing detail, missing install, ambiguity, and deleted install states to the approved statuses", async () => {
    const invalidCursor = await app.request("/api/v1/servers?cursor=not-a-real-cursor");
    expect(invalidCursor.status).toBe(400);
    await expect(invalidCursor.json()).resolves.toMatchObject({
      error: { code: "CURSOR_INVALID" },
    });

    const missing = await app.request("/api/v1/servers/does-not-exist");
    expect(missing.status).toBe(404);

    const missingInstall = await app.request("/api/v1/servers/does-not-exist/install");
    expect(missingInstall.status).toBe(404);
    await expect(missingInstall.json()).resolves.toMatchObject({
      error: { code: "SERVER_NOT_FOUND" },
    });

    const ambiguous = await app.request("/api/v1/resolve/%40shared%2Fduplicate");
    expect(ambiguous.status).toBe(409);

    const deleted = await app.request("/api/v1/servers/upstream-deleted-server/install");
    expect(deleted.status).toBe(410);
    await expect(deleted.json()).resolves.toMatchObject({ error: { code: "UPSTREAM_DELETED" } });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/api test -- src/__tests__/public-api-core.integration.test.ts`

Expected: FAIL with `404 Not Found` for `/api/v1/servers` or route-module import errors.

- [ ] **Step 3: Implement the collection and detail routes with strict output validation**

```ts
// apps/api/src/routes/servers.ts
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  serverCollectionQuerySchema,
  serverCollectionResponseSchema,
  serverDetailResponseSchema,
} from "@themcpdirectory/api-contract";
import { getServerDetailBySlug } from "@themcpdirectory/domain";
import { searchServersPage } from "@themcpdirectory/search";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerServerRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(
    ["GET", "HEAD"],
    "/servers",
    zValidator("query", serverCollectionQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const page = await searchServersPage(deps.db, query, { cursorCodec: deps.cursorCodec });
      const body = serverCollectionResponseSchema.parse({
        data: page.items,
        meta: { requestId: c.get("requestId"), nextCursor: page.nextCursor },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=60, stale-while-revalidate=300",
      });
    },
  );

  api.on(["GET", "HEAD"], "/servers/:slug", async (c) => {
    const detail = await getServerDetailBySlug(deps.db, c.req.param("slug"));
    if (!detail) throw new HttpApiError("SERVER_NOT_FOUND", 404, "Server not found");

    const body = serverDetailResponseSchema.parse({
      data: detail,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });
}

// apps/api/src/routes/search.ts
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  searchCollectionQuerySchema,
  serverCollectionResponseSchema,
} from "@themcpdirectory/api-contract";
import { searchServersPage } from "@themcpdirectory/search";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";

export function registerSearchRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(
    ["GET", "HEAD"],
    "/search",
    zValidator("query", searchCollectionQuerySchema),
    async (c) => {
      const page = await searchServersPage(deps.db, c.req.valid("query"), {
        cursorCodec: deps.cursorCodec,
      });
      const body = serverCollectionResponseSchema.parse({
        data: page.items,
        meta: { requestId: c.get("requestId"), nextCursor: page.nextCursor },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=60, stale-while-revalidate=300",
      });
    },
  );
}
```

- [ ] **Step 4: Implement resolution and install routes with approved status mapping**

```ts
// apps/api/src/routes/resolve.ts
import type { Hono } from "hono";
import { resolveServerIdentifierResponseSchema } from "@themcpdirectory/api-contract";
import { resolveServerIdentifier } from "@themcpdirectory/domain";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerResolveRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(["GET", "HEAD"], "/resolve/:identifier", async (c) => {
    const resolved = await resolveServerIdentifier(deps.db, c.req.param("identifier"));
    if (!resolved) throw new HttpApiError("SERVER_NOT_FOUND", 404, "Server not found");

    const body = resolveServerIdentifierResponseSchema.parse({
      data: resolved,
      meta: { requestId: c.get("requestId") },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=60, stale-while-revalidate=300",
    });
  });
}

// apps/api/src/routes/install.ts
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  installManifestQuerySchema,
  installManifestResponseSchema,
} from "@themcpdirectory/api-contract";
import { buildInstallManifest } from "@themcpdirectory/domain";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";

export function registerInstallRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(
    ["GET", "HEAD"],
    "/servers/:slug/install",
    zValidator("query", installManifestQuerySchema),
    async (c) => {
      const manifest = await buildInstallManifest(deps.db, {
        identifier: c.req.param("slug"),
        clientId: c.req.valid("query").client,
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

  api.on(
    ["GET", "HEAD"],
    "/resolve/:identifier/install",
    zValidator("query", installManifestQuerySchema),
    async (c) => {
      const manifest = await buildInstallManifest(deps.db, {
        identifier: c.req.param("identifier"),
        clientId: c.req.valid("query").client,
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
```

- [ ] **Step 5: Mount the core route registrars under `/api/v1`**

```ts
// apps/api/src/app.ts
import { registerInstallRoutes } from "./routes/install.js";
import { registerResolveRoutes } from "./routes/resolve.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerServerRoutes } from "./routes/servers.js";

export function createApiApp(deps: ApiDependencies) {
  const app = new Hono();
  const apiV1 = new Hono();
  const withRateLimit = (bucket: "resource" | "search" | "install") =>
    attachRateLimit(deps.rateLimiter, deps.rateLimitKeyResolver, bucket);

  app.onError(createErrorHandler(deps.logger));
  app.get("/", (c) => c.json({ status: "ok" }));
  app.use("*", attachRequestId(deps.requestIdFactory));
  app.use("*", attachStructuredLogging(deps.logger));

  apiV1.use("*", attachCors(deps.allowedOrigins));
  apiV1.use("/servers", withRateLimit("resource"));
  apiV1.use("/servers/:slug", withRateLimit("resource"));
  apiV1.use("/search", withRateLimit("search"));
  apiV1.use("/resolve/:identifier", withRateLimit("resource"));
  apiV1.use("/resolve/:identifier/install", withRateLimit("install"));
  apiV1.use("/servers/:slug/install", withRateLimit("install"));

  registerServerRoutes(apiV1, deps);
  registerSearchRoutes(apiV1, deps);
  registerResolveRoutes(apiV1, deps);
  registerInstallRoutes(apiV1, deps);

  app.route("/api/v1", apiV1);
  return app;
}
```

- [ ] **Step 6: Run the focused tests and package typecheck**

Run: `pnpm --filter @themcpdirectory/api test -- src/__tests__/public-api-core.integration.test.ts && pnpm --filter @themcpdirectory/api typecheck`

Expected: PASS with the approved `400`, `404`, `409`, and `410` mappings and zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/servers.ts apps/api/src/routes/search.ts apps/api/src/routes/resolve.ts apps/api/src/routes/install.ts apps/api/src/__tests__/public-api-core.integration.test.ts
git commit -m "feat(api): add server resolution and install routes"
```

### Task 10: Category, Publisher, and Client Routes Plus Final Phase D Verification

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.test.ts`
- Create: `apps/api/src/__tests__/postgres-test-db.ts`
- Create: `apps/api/src/routes/categories.ts`
- Create: `apps/api/src/routes/publishers.ts`
- Create: `apps/api/src/routes/clients.ts`
- Create: `apps/api/src/__tests__/public-api-discovery.integration.test.ts`
- Create: `apps/api/src/__tests__/empty-database.integration.test.ts`

**Interfaces:**

- Consumes: `listPublicCategories`, `getPublicCategoryBySlug`, `getPublicPublisherBySlug`, `listPublicClients`, and `getPublicClientById` from Task 7, plus the discovery response schemas from `@themcpdirectory/api-contract`.
- Produces: route registration for `GET|HEAD /api/v1/categories` and `GET|HEAD /api/v1/categories/:slug`.
- Produces: route registration for `GET|HEAD /api/v1/publishers/:slug`.
- Produces: route registration for `GET|HEAD /api/v1/clients` and `GET|HEAD /api/v1/clients/:id`.
- Produces: `export interface TempDatabase { readonly databaseUrl: string; readonly databaseName: string; readonly db: Database; destroy(): Promise<void>; }` in `apps/api/src/__tests__/postgres-test-db.ts`.
- Produces: `export async function createTempDatabase(prefix?: string): Promise<TempDatabase>` in `apps/api/src/__tests__/postgres-test-db.ts`, reusing the established choose-admin -> create database -> migrate -> `createDatabase(...)` -> terminate backends -> drop database helper pattern already used in `packages/search` and `packages/domain`.
- Produces: `emptyApp` bootstrapped in test setup from `createApiApp({ db: temp.db, ... })`, never from process-global bootstrap state.
- Produces: empty-database migration verification through API integration tests.

- [ ] **Step 1: Write the failing discovery and empty-database integration tests**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServerSearchCursorCodec } from "@themcpdirectory/search";
import { createApiApp } from "../app.js";
import { createTempDatabase } from "./postgres-test-db.js";

let emptyDb: Awaited<ReturnType<typeof createTempDatabase>>;
let emptyApp: ReturnType<typeof createApiApp>;

beforeAll(async () => {
  emptyDb = await createTempDatabase("task10_api_empty");
  emptyApp = createApiApp({
    db: emptyDb.db,
    cursorCodec: createServerSearchCursorCodec("phase-d-test-secret-phase-d-test-secret"),
    rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: null }) },
    rateLimitKeyResolver: () => "test:127.0.0.1",
    allowedOrigins: ["*"],
    logger: { info() {}, error() {} },
    requestIdFactory: () => "req_phase_d_empty",
  });
});

afterAll(async () => {
  await emptyDb.destroy();
});

describe("public API discovery routes", () => {
  it("returns category, publisher, and client resources with the approved envelopes", async () => {
    const categories = await app.request("/api/v1/categories");
    expect(categories.status).toBe(200);
    await expect(categories.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ slug: "developer-tools" })],
      meta: { requestId: expect.any(String), nextCursor: null },
    });

    const publisher = await app.request("/api/v1/publishers/github");
    expect(publisher.status).toBe(200);

    const client = await app.request("/api/v1/clients/cursor");
    expect(client.status).toBe(200);
  });

  it("serves HEAD for category collection and client detail routes without a body", async () => {
    const categories = await app.request("/api/v1/categories", { method: "HEAD" });
    expect(categories.status).toBe(200);
    expect(categories.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=900",
    );
    expect(await categories.text()).toBe("");

    const client = await app.request("/api/v1/clients/cursor?limit=1", { method: "HEAD" });
    expect(client.status).toBe(200);
    expect(await client.text()).toBe("");
  });
});

describe("empty database verification", () => {
  it("serves stable empty collections after fresh migrations on an injected app", async () => {
    const servers = await emptyApp.request("/api/v1/servers?limit=1");
    expect(servers.status).toBe(200);
    await expect(servers.json()).resolves.toEqual({
      data: [],
      meta: { requestId: expect.any(String), nextCursor: null },
    });

    const categories = await emptyApp.request("/api/v1/categories");
    expect(categories.status).toBe(200);
    await expect(categories.json()).resolves.toEqual({
      data: [],
      meta: { requestId: expect.any(String), nextCursor: null },
    });

    const missingPublisher = await emptyApp.request("/api/v1/publishers/github");
    expect(missingPublisher.status).toBe(404);
    await expect(missingPublisher.json()).resolves.toMatchObject({
      error: { code: "SERVER_NOT_FOUND" },
    });
  });
});
```

Create `apps/api/src/__tests__/postgres-test-db.ts` by copying the established helper shape from `packages/search/src/__tests__/postgres-test-db.ts`: import `migrate` from `drizzle-orm/postgres-js/migrator`, `createDatabase` from `@themcpdirectory/db`, and `postgresAdminCandidates` from `@themcpdirectory/test-utils`; create an isolated database, run migrations from `packages/db/drizzle`, build `emptyApp` in `beforeAll`, and make `destroy()` terminate active backends before `drop database` in `afterAll`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/api test -- src/__tests__/public-api-discovery.integration.test.ts src/__tests__/empty-database.integration.test.ts`

Expected: FAIL with `404 Not Found` for `/api/v1/categories` and `/api/v1/clients/cursor`.

- [ ] **Step 3: Implement the discovery routes with strict output validation**

```ts
// apps/api/src/routes/categories.ts
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  categoriesCollectionResponseSchema,
  categoryDetailResponseSchema,
  serverCollectionQuerySchema,
} from "@themcpdirectory/api-contract";
import { getPublicCategoryBySlug, listPublicCategories } from "@themcpdirectory/domain";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerCategoryRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(["GET", "HEAD"], "/categories", async (c) => {
    const categories = await listPublicCategories(deps.db);
    const body = categoriesCollectionResponseSchema.parse({
      data: categories,
      meta: { requestId: c.get("requestId"), nextCursor: null },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });

  api.on(
    ["GET", "HEAD"],
    "/categories/:slug",
    zValidator("query", serverCollectionQuerySchema.pick({ cursor: true, limit: true })),
    async (c) => {
      const detail = await getPublicCategoryBySlug(
        deps.db,
        { slug: c.req.param("slug"), ...c.req.valid("query") },
        { cursorCodec: deps.cursorCodec },
      );
      if (!detail) throw new HttpApiError("SERVER_NOT_FOUND", 404, "Server not found");

      const body = categoryDetailResponseSchema.parse({
        data: detail,
        meta: { requestId: c.get("requestId") },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=300, stale-while-revalidate=900",
      });
    },
  );
}

// apps/api/src/routes/publishers.ts
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  publisherDetailResponseSchema,
  serverCollectionQuerySchema,
} from "@themcpdirectory/api-contract";
import { getPublicPublisherBySlug } from "@themcpdirectory/domain";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerPublisherRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(
    ["GET", "HEAD"],
    "/publishers/:slug",
    zValidator("query", serverCollectionQuerySchema.pick({ cursor: true, limit: true })),
    async (c) => {
      const detail = await getPublicPublisherBySlug(
        deps.db,
        { slug: c.req.param("slug"), ...c.req.valid("query") },
        { cursorCodec: deps.cursorCodec },
      );
      if (!detail) throw new HttpApiError("SERVER_NOT_FOUND", 404, "Server not found");

      const body = publisherDetailResponseSchema.parse({
        data: detail,
        meta: { requestId: c.get("requestId") },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=300, stale-while-revalidate=900",
      });
    },
  );
}

// apps/api/src/routes/clients.ts
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  clientDetailResponseSchema,
  clientsCollectionResponseSchema,
  serverCollectionQuerySchema,
  supportedClientIdSchema,
} from "@themcpdirectory/api-contract";
import { getPublicClientById, listPublicClients } from "@themcpdirectory/domain";
import type { ApiDependencies } from "../app.js";
import { jsonWithCache } from "../http/cache.js";
import { HttpApiError } from "../http/errors.js";

export function registerClientRoutes(api: Hono, deps: ApiDependencies): void {
  api.on(["GET", "HEAD"], "/clients", async (c) => {
    const clients = await listPublicClients(deps.db);
    const body = clientsCollectionResponseSchema.parse({
      data: clients,
      meta: { requestId: c.get("requestId"), nextCursor: null },
    });

    return jsonWithCache(c, body, {
      status: 200,
      cacheControl: "public, max-age=300, stale-while-revalidate=900",
    });
  });

  api.on(
    ["GET", "HEAD"],
    "/clients/:id",
    zValidator("query", serverCollectionQuerySchema.pick({ cursor: true, limit: true })),
    async (c) => {
      const detail = await getPublicClientById(
        deps.db,
        { id: supportedClientIdSchema.parse(c.req.param("id")), ...c.req.valid("query") },
        { cursorCodec: deps.cursorCodec },
      );
      if (!detail) throw new HttpApiError("SERVER_NOT_FOUND", 404, "Server not found");

      const body = clientDetailResponseSchema.parse({
        data: detail,
        meta: { requestId: c.get("requestId") },
      });

      return jsonWithCache(c, body, {
        status: 200,
        cacheControl: "public, max-age=300, stale-while-revalidate=900",
      });
    },
  );
}
```

- [ ] **Step 4: Mount the discovery route registrars and extend the process smoke test**

```ts
// apps/api/src/app.ts
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerClientRoutes } from "./routes/clients.js";
import { registerPublisherRoutes } from "./routes/publishers.js";

registerCategoryRoutes(apiV1, deps);
registerPublisherRoutes(apiV1, deps);
registerClientRoutes(apiV1, deps);

// apps/api/src/index.test.ts
it("listens on API_PORT and serves the health response", async () => {
  const response = await waitForResponse(child, `http://127.0.0.1:${port}/`);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
```

- [ ] **Step 5: Run the focused tests, then the full Phase D gates**

Run: `pnpm --filter @themcpdirectory/api test -- src/__tests__/public-api-discovery.integration.test.ts src/__tests__/empty-database.integration.test.ts src/index.test.ts && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm --filter @themcpdirectory/api build`

Expected: PASS with zero lint errors, zero type errors, zero failing unit tests, zero failing integration tests, and a successful API build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/categories.ts apps/api/src/routes/publishers.ts apps/api/src/routes/clients.ts apps/api/src/__tests__/public-api-discovery.integration.test.ts apps/api/src/__tests__/empty-database.integration.test.ts apps/api/src/index.test.ts
git commit -m "feat(api): add discovery routes and phase d verification"
```
