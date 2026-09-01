# Phase D Public API Design

**Status:** Approved working design

**Date:** 2026-09-01

**Authorities:** `docs/ai-docs/engineering-spec.md` sections 29-38 and `docs/ai-docs/product-and-technical-spec.md`

## Goal

Expose the public directory and its installation metadata through a stable, versioned, read-only JSON API. The API must reuse the existing domain and search layers, publish only validated projections, and provide the sole remote contract consumed by the CLI.

## Scope

Phase D implements:

- `GET /api/v1/servers`
- `GET /api/v1/servers/:slug`
- `GET /api/v1/resolve/:identifier`
- `GET /api/v1/servers/:slug/install`
- `GET /api/v1/resolve/:identifier/install`
- `GET /api/v1/search`
- `GET /api/v1/categories`
- `GET /api/v1/categories/:slug`
- `GET /api/v1/publishers/:slug`
- `GET /api/v1/clients`
- `GET /api/v1/clients/:id`
- shared Zod request and response schemas
- request IDs, structured errors, logging, rate limiting, CORS, and OpenAPI generation

It does not add authentication, write endpoints, publisher management, the compatible subregistry, or CLI execution.

## Ownership And Dependencies

`packages/api-contract` owns transport-neutral Zod schemas, inferred TypeScript types, stable error codes, and OpenAPI metadata. It must not import a database or application package.

`packages/search` owns filtering, ranking, keyset pagination, and search summary projections. It may use `packages/db` and domain value types.

`packages/domain` owns detail retrieval, ambiguity-safe identifier resolution, install-manifest assembly, and category, publisher, and client resource queries.

`apps/api` owns HTTP parsing, middleware, status mapping, cache headers, and serialisation. Route handlers call package functions and contain no SQL.

Dependency flow is one-way:

```text
api-contract <- search/domain <- apps/api
```

The web application may consume `api-contract` types but remains server-rendered from the query layer until a network call is actually useful.

Route ownership is explicit:

| Routes                                                   | Owning application function                    |
| -------------------------------------------------------- | ---------------------------------------------- |
| `/servers`, `/search`                                    | `packages/search.searchServersPage`            |
| `/servers/:slug`                                         | `packages/domain.getServerDetailBySlug`        |
| `/resolve/:identifier`                                   | `packages/domain.resolveServerIdentifier`      |
| `/servers/:slug/install`, `/resolve/:identifier/install` | `packages/domain.buildInstallManifest`         |
| `/categories`, `/categories/:slug`                       | `packages/domain` category queries             |
| `/publishers/:slug`                                      | `packages/domain` public publisher query       |
| `/clients`, `/clients/:id`                               | `packages/domain` client compatibility queries |

These names define the intended boundary; the implementation plan may split files without moving SQL or business decisions into `apps/api`.

## Shared API Contract

All timestamps are RFC 3339 UTC strings. UUIDs, slugs, URLs, enums, cursor limits, and identifier lengths are validated at the boundary. Server-side output validation uses exact schemas. Client parsers accept unknown additive object fields while still rejecting invalid known fields and unsupported manifest versions. Unvalidated upstream payloads never enter responses.

Success envelopes are:

```ts
type ResourceResponse<T> = {
  data: T;
  meta: { requestId: string };
};

type CollectionResponse<T> = {
  data: T[];
  meta: { requestId: string; nextCursor: string | null };
};
```

Errors use one stable shape:

```ts
type ErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Array<{ path: string; message: string }>;
  };
};
```

Initial error codes are `VALIDATION_ERROR`, `SERVER_NOT_FOUND`, `AMBIGUOUS_SERVER`, `INSTALL_UNAVAILABLE`, `UPSTREAM_DELETED`, `CURSOR_INVALID`, `RATE_LIMITED`, and `INTERNAL_ERROR`.

Validation errors return `400`, missing resources `404`, ambiguity `409`, deleted or intentionally unavailable installation manifests `410`, rate limiting `429`, and unexpected failures `500`. Stack traces, SQL, internal identifiers not specified by the contract, and upstream response bodies are never returned.

## Request Identity And Logging

The API accepts a syntactically valid `X-Request-ID` with a bounded length or generates a UUID. It echoes the value in `X-Request-ID` and in every envelope.

Logs are structured and contain request ID, route template, method, status, duration, coarse rate-limit outcome, and a summarised error code. Query text, arbitrary identifiers, IP addresses, user agents, cookies, request bodies, and response bodies are not logged by default. Operational IP processing, if required by the deployment platform for abuse prevention, is documented separately with a short retention period.

## Pagination And Filtering

`GET /servers` supports the filters and sorts defined in the engineering specification. Query schemas reject unknown enum values and enforce a default limit of 30 and maximum of 100.

Pagination uses deterministic keyset ordering. The cursor is a versioned, base64url-encoded payload containing the sort keys, stable server ID tie-breaker, and a fingerprint of the effective filters, authenticated with a dedicated server-side signing secret. Clients treat it as opaque. A cursor used with changed filters, an unsupported version, invalid signature, or malformed values returns `400 CURSOR_INVALID`.

Every sort ends with a stable server ID tie-breaker. `relevance` is only valid when `q` is present; otherwise the default is `recent`. Sponsored status never affects order.

## Server Projections

The summary projection contains canonical slug, title, plain-text description, publisher summary, current version, canonical repository URL where known, listing status, and factual signal booleans.

The detail projection adds aliases, categories, packages, remotes, compatibility, repository metadata, provenance timestamps, and the factual trust profile available at the current phase. It excludes raw Registry and GitHub payloads, secret values, moderation-only data, internal job state, and personal publisher membership data.

Listings deleted upstream remain directly retrievable and clearly expose `listingStatus: "deleted_upstream"`. Collection defaults exclude them unless the caller explicitly requests that status.

`deleted_upstream` is the canonical public and persisted listing-status value. Moderation status remains an independent concern. `UPSTREAM_DELETED` is only the API error-code spelling.

## Discovery Resources

`GET /search` is the dedicated search projection and accepts the same query, filter, sort, and cursor rules as `GET /servers`; both call the same search implementation. `GET /categories` and `GET /categories/:slug` expose curated category summaries and paginated visible listings. `GET /publishers/:slug` exposes public publisher identity, verification state, and paginated visible listings without membership data. `GET /clients` and `GET /clients/:id` expose the supported client identifiers and factual compatibility capabilities used by the website and CLI.

These routes complete the initial product API inventory. The four roadmap routes remain the Phase D critical path, but Phase D does not close until every route above has a validated contract and handler.

## Identifier Resolution

Resolution precedence is:

1. exact canonical slug
2. exact approved alias
3. exact Registry name
4. exact known package identifier

A unique canonical slug match wins because slugs are globally controlled by the Directory. At every lower precedence, more than one candidate returns `409 AMBIGUOUS_SERVER` with bounded match summaries; the API never silently selects by rank. Resolution preserves whether the identifier was canonical or an alias so callers can display or redirect accurately.

## InstallManifestV1

`GET /servers/:slug/install` returns `InstallManifestV1`, the binding contract between Phases D and E. `schemaVersion` is the literal `1`. `GET /resolve/:identifier/install` performs the same ambiguity-safe resolution and then returns that canonical manifest; it never redirects or silently chooses a candidate.

The manifest contains only:

- canonical server identity and current version
- Registry provenance and observation time
- declarative package or remote variants
- transport and client compatibility
- variable names, descriptions, requirements, defaults that are not secrets, and environment-reference hints
- an exact immutable package version for every package variant
- integrity metadata whenever the source Registry supplies a verifiable digest

Arguments remain arrays. Headers and variables remain structured entries. A manifest never contains a shell command string, script, expression, callback, postinstall action, arbitrary executable URL, or a secret value.

Mutable versions, tags such as `latest`, ranges, missing versions, and unsupported package registries make a package variant non-installable and exclude it from the manifest. A runtime hint is a closed informational enum only; it cannot select an executable. The Phase E adapter maps a supported registry and transport to its own trusted executable descriptor. Missing integrity metadata is exposed as unavailable evidence but does not weaken exact version pinning; a malformed supplied digest excludes the variant. If no safe variant remains, the endpoint returns `410 INSTALL_UNAVAILABLE`.

The optional `client` query filters or annotates compatible variants but does not change their meaning. An unsupported client returns a validation error. No compatible variant returns `410 INSTALL_UNAVAILABLE`. An upstream-deleted listing returns `410 UPSTREAM_DELETED` unless a future explicit unsafe override contract is separately designed.

## Caching, CORS, And Rate Limits

Read responses use public cache headers and ETags where the projection has a stable freshness boundary. Errors, resolution ambiguity, and install manifests for changing/deleted state are not cached beyond a short defensive interval.

CORS is explicit. Public read routes allow `GET` and `HEAD` from configured first-party origins and may use `*` only because they carry no credentials. Authenticated Phase G routes use a separate credentials-aware policy and never combine wildcard origins with credentials.

Rate limits are route-class based and return `Retry-After`. The first implementation may use an in-process limiter only for local development; production requires a deployment-supported shared limiter before horizontal scaling.

## OpenAPI

OpenAPI 3.1 output is generated from the same Zod schemas used at runtime. Generated output is deterministic and checked for drift. Examples are non-authoritative fixtures validated against the schemas.

## Compatibility Policy

Additive fields may be added to v1 objects. Fields cannot be removed, renamed, narrowed, or given new meaning in v1. CLI and other generated client parsers tolerate unknown additive fields while validating all known fields. Manifest schema versions are discriminated explicitly, and an unsupported future version produces an upgrade error before planning. Breaking changes require `/api/v2` or a new manifest schema version.

## Testing And Verification

Tests cover schema rejection, all status mappings, request ID propagation, error redaction, every filter and sort, cursor continuation and tampering, deterministic tie-breaking, identifier precedence and ambiguity, deleted listings, manifest safety, CORS, rate-limit headers, and OpenAPI drift.

PostgreSQL integration tests prove that collection pages neither duplicate nor skip records under stable data. Contract tests parse every real handler response with `api-contract`. Phase D closes only after package lint/typecheck, focused unit and integration tests, full monorepo gates, and clean empty-database migration verification pass.

## Decisions Deferred

Write APIs, API keys, authenticated rate-limit tiers, provenance payload endpoints, GraphQL, and the MCP compatible subregistry are outside Phase D.
