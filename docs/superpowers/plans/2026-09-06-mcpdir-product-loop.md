# MCPDir Product Loop Implementation Plan

> Date: 2026-09-06
> Status: approved for implementation
> Primary outcome: `npx mcpdir add github`

## Goal

Deliver the complete directory-to-installation loop:

1. one search and ranking model for web and CLI;
2. privacy-minimal CLI usage telemetry;
3. install counts by server and client;
4. dynamic install-count badges;
5. immutable, hashed install snapshots;
6. safe alias, Registry identifier, and GitHub source resolution;
7. maintainer `init`, `validate`, and `publish` commands;
8. synchronized publication of `@themcpdirectory/cli` and `mcpdir`;
9. README and website distribution led by `npx mcpdir add github`.

The implementation keeps the existing package boundaries: wire contracts in
`api-contract`, persistence in `db`, business operations in `domain`, HTTP in
`apps/api`, scheduled lifecycle work in `apps/worker`, and presentation in the
CLI and web app.

## Product Decisions

- CLI telemetry is enabled by default and best-effort. It never changes a
  command result or delays command completion beyond a short timeout.
- `DO_NOT_TRACK=1` and `MCPDIR_DISABLE_TELEMETRY=1` disable telemetry before an
  event or request is constructed.
- Events contain only schema version, event name, canonical server slug when
  known, CLI version, supported target client when applicable, success,
  selected install variant when applicable, and a server-assigned timestamp.
- Events never contain queries, arguments, paths, configuration, project
  content, error text, tokens, keys, IP addresses, user agents, cookies,
  request IDs, or persistent installation/device/person identifiers.
- Raw events are retained for seven days. Daily aggregates are retained for
  thirteen months. Public output exposes total installs and client totals;
  internal success/version/variant cells are not public.
- An install counts only after a successful `add` execution. Search, remove,
  and update are collected for product health but do not increment installs.
- Install manifests are content-addressed. The API returns a canonical
  SHA-256 manifest hash and immutable cache headers for a fixed snapshot.
- CLI source resolution may use normalized identifiers and validated database
  metadata only. README text and README commands are never parsed or executed.
- npm publication order is canonical CLI first, unscoped wrapper second.
  Public copy changes only after exact-version registry smoke tests pass.

## Release Invariants

- The canonical package and wrapper have exactly the same version.
- The wrapper pins that exact canonical version in its packed manifest.
- Both tarballs pass strict file allowlists, isolated installation, version,
  help, and command smoke tests before publication.
- Database migrations are additive and deploy before API/worker code that uses
  them.
- Existing public API response schemas remain strict and versioned.
- Every behavior change follows red-green-refactor with a focused executable
  check immediately after the first production edit.
- Final verification runs with the declared Node 24 runtime.

## Phase 1: Shared Search Ranking

### Task 1.1: Write the shared ranking regression

Files:

- Modify `packages/search/src/__tests__/search-servers-page.integration.test.ts`
- Modify `packages/search/src/__tests__/ranking.snapshot.test.ts`

Steps:

1. Seed listings whose order changes only when recommendation signals are
   included.
2. Assert direct search and paginated public search return identical slug
   order for the same query.
3. Run the two focused tests and confirm the new assertion fails because the
   paginated score omits recommendation signals.

### Task 1.2: Extract one SQL ranking contract

Files:

- Add `packages/search/src/ranking.ts`
- Modify `packages/search/src/index.ts`
- Modify `packages/search/src/public-api/search-servers-page.ts`

Steps:

1. Move ranking weights, similarity threshold, recommendation score, and text
   score builders into one internal module.
2. Make both query paths consume the same score and predicate builders.
3. Preserve deterministic slug and server-ID tie breakers.
4. Run focused search tests, package typecheck, lint, and format checks.

## Phase 2: Privacy-Minimal Telemetry

### Task 2.1: Define the strict event contract

Files:

- Add `packages/api-contract/src/public-api/telemetry.ts`
- Add `packages/api-contract/src/public-api/__tests__/telemetry.test.ts`
- Modify `packages/api-contract/src/public-api/openapi.ts`
- Modify `packages/api-contract/src/index.ts`

Contract:

```ts
type CliTelemetryEventV1 = {
  schemaVersion: 1;
  event: "search" | "add" | "remove" | "update";
  slug?: string;
  cliVersion: string;
  client?: SupportedClientId;
  success: boolean;
  installVariant?: "package" | "remote";
};
```

Tests reject unknown properties, client timestamps, arbitrary client IDs,
invalid slugs, free-form errors, and oversized values.

### Task 2.2: Add raw and aggregate persistence

Files:

- Add `packages/db/src/schema/telemetry.ts`
- Add `packages/db/drizzle/0007_cli_telemetry.sql`
- Modify `packages/db/src/schema/index.ts`
- Modify `packages/db/src/__tests__/schema.test.ts`
- Modify `packages/db/drizzle/meta/_journal.json`

Schema:

- `cli_telemetry_events`: UUID primary key, constrained event dimensions,
  nullable server foreign key resolved from canonical slug, server-generated
  `received_at`, and no request metadata.
- `cli_telemetry_daily_counts`: UTC day plus event/server/CLI-major-minor/client/
  success/variant composite uniqueness and non-negative count.
- Index raw rows by `received_at` and `(event, server_id, received_at)`.
- Index aggregates by `(server_id, day)` and `day`.

### Task 2.3: Ingest events safely

Files:

- Add `packages/domain/src/telemetry.ts`
- Add `packages/domain/src/__tests__/telemetry.test.ts`
- Modify `packages/domain/src/index.ts`
- Add `apps/api/src/routes/telemetry.ts`
- Add `apps/api/src/__tests__/telemetry.integration.test.ts`
- Modify `apps/api/src/app.ts`
- Modify `apps/api/src/http/rate-limit.ts`

Steps:

1. Accept one small JSON event per request.
2. Apply a dedicated anonymous-write limiter before database work.
3. Resolve the supplied canonical slug to a server ID or reject it.
4. Persist only validated dimensions and database time.
5. Return `202` without echoing stored data.
6. Verify body-size, content-type, unknown-field, rate-limit, and no-request-
   metadata behavior with a disposable PostgreSQL database.

### Task 2.4: Emit events from the CLI

Files:

- Add `packages/cli/src/telemetry.ts`
- Add `packages/cli/src/__tests__/telemetry.test.ts`
- Modify `packages/cli/src/config/runtime.ts`
- Modify `packages/cli/src/dependencies.ts`
- Modify command result/context types and `packages/cli/src/command-dispatch.ts`
- Modify search, add, remove, and update commands and their focused tests

Steps:

1. Add an injected, short-timeout reporter.
2. Check both opt-out variables before constructing an event.
3. Emit one event per attempted client target where applicable.
4. Use only canonical slug and normalized enum context produced by commands.
5. Swallow network, timeout, and collector errors silently.
6. Assert exact payloads, zero calls for each opt-out, no forbidden fields,
   target cardinality, and unchanged CLI exit behavior.

### Task 2.5: Aggregate and retain

Files:

- Add `apps/worker/src/telemetry-retention.ts`
- Add `apps/worker/src/__tests__/telemetry-retention.test.ts`
- Modify `apps/worker/src/index.ts`

Steps:

1. Upsert completed UTC-day cells idempotently.
2. Delete raw rows only after aggregate commit.
3. Prune raw rows older than seven days and aggregates older than thirteen
   months in bounded batches.
4. Register the job using existing worker scheduling conventions.
5. Test replay idempotency, transaction rollback, and batch bounds.

## Phase 3: Install Counts and Badges

### Task 3.1: Expose install totals

Files:

- Extend server detail schemas in `packages/api-contract`
- Add aggregate queries in `packages/domain`
- Modify `apps/api/src/routes/servers.ts`
- Modify server detail integration tests

The public projection returns lifetime successful-add count and supported
client totals. Empty counts are zero; no low-cardinality success/version/
variant dimensions are exposed.

### Task 3.2: Render counts on the website

Files:

- Modify `apps/web/src/components/server-detail-header.tsx`
- Modify its component tests and server-detail Playwright coverage

Render a compact, readable install count with client breakdown where present.
Use semantic text and existing design-system patterns; preserve keyboard,
contrast, forced-colors, and 320px reflow behavior.

### Task 3.3: Add deterministic badges

Files:

- Add `apps/api/src/routes/badges.ts`
- Add `apps/api/src/__tests__/badges.integration.test.ts`
- Modify `apps/api/src/app.ts`

Support `/b/:slug` and `/b/:slug.svg`. Return deterministic escaped SVG,
`image/svg+xml`, ETag, and bounded shared-cache headers. Return JSON-style 404
semantics for unknown/deleted listings without reflecting untrusted markup.

## Phase 4: Immutable Install Snapshots and Resolution

### Task 4.1: Canonicalize manifest hashing

Files:

- Move the canonical hash contract to a dependency-safe shared package
- Extend `installManifestResponseSchema` with `manifestHash`
- Modify domain manifest building, API install route, and CLI add planning
- Add contract, API, install-engine, and CLI regression tests

The hash covers the validated install data and excludes response metadata. The
CLI verifies the server-provided hash before building a plan. Fixed snapshots
return immutable cache headers and strong ETags.

### Task 4.2: Resolve validated GitHub sources

Files:

- Modify `packages/domain/src/public-api/resolve-server-identifier.ts`
- Modify `apps/api/src/routes/resolve.ts`
- Extend domain/API/CLI identifier tests

Normalize accepted GitHub HTTPS and `owner/repository` forms, compare only
against validated repository metadata, preserve explicit identifier
precedence, and return ambiguity errors rather than guessing. Add a hostile
README fixture proving README content cannot affect the generated plan.

## Phase 5: Maintainer Workflow

### Task 5.1: Define a local maintainer manifest

Files:

- Add the strict schema and examples under `packages/registry-normalizer`
- Add unit tests for package and remote variants

Use one versioned JSON file, `mcpdir.json`, compatible with existing normalized
Registry fields. Reject secrets, floating versions, unsupported transports,
unknown fields, unsafe URLs, and malformed environment declarations.

### Task 5.2: Implement `mcpdir init`

Files:

- Add `packages/cli/src/commands/init.ts`
- Add focused tests
- Modify command metadata, dispatch, help, and public exports

Generate a minimal valid file interactively or from flags. Never overwrite an
existing file without an explicit force option.

### Task 5.3: Implement `mcpdir validate`

Files:

- Add `packages/cli/src/commands/validate.ts`
- Add focused tests
- Modify command metadata and dispatch

Validate locally, print field-specific remediation, and support stable JSON
output for CI.

### Task 5.4: Implement `mcpdir publish`

Files:

- Add a small Registry submission client package or existing-package module
- Add `packages/cli/src/commands/publish.ts`
- Add mock-server tests
- Modify command metadata and dispatch

Validate before network access, read credentials only from the documented
environment variable, submit the validated artifact to the configured
Official Registry endpoint, and never log or persist credentials.

## Phase 6: Distribution Copy and Privacy Documentation

Files:

- Modify `README.md`
- Modify `packages/cli/README.md`
- Modify `packages/mcpdir/README.md`
- Modify `apps/web/src/content/docs-cli.ts`
- Modify `apps/web/src/content/legal.ts`
- Modify `apps/web/PRODUCT.md`
- Modify authoritative engineering/product specs and release assertions

Steps:

1. Document exact telemetry fields, purpose, retention, default state, both
   opt-outs, and absence of identifiers/content.
2. Document maintainers' init/validate/publish flow.
3. After publication smoke, make `npx mcpdir add github` the primary command
   in shared command metadata, README, and website.
4. Keep global installation and canonical scoped-package commands as
   secondary alternatives.

## Phase 7: Verification and Publication

### Task 7.1: Repository gates

1. Run focused tests after each task.
2. Run package typecheck, lint, and formatting after each phase.
3. Run database integration suites and migration checks.
4. Run API contract/OpenAPI checks.
5. Run web unit tests and Playwright accessibility/responsive checks.
6. Reconcile stale docs-consistency assertions with the approved copy.
7. Run `pnpm verify:release` and both CLI tarball verifiers.
8. Repeat the full release gate under Node `>=24.10 <25`.

### Task 7.2: Publish synchronized packages

1. Confirm npm authentication and package-name ownership.
2. Select one new synchronized release version for the completed product.
3. Publish `@themcpdirectory/cli` first.
4. Verify its exact registry metadata and tarball.
5. Publish `mcpdir` second.
6. Run `npx mcpdir@<version> --version`.
7. Run `npx mcpdir@<version> add github --dry-run` against production.
8. Verify install telemetry, aggregate, server detail, and badge behavior.
9. Activate the prepared public-copy changes and run final website smoke.

## Completion Evidence

The release is complete only when all of the following are captured:

- identical web/API ranking fixture order;
- opt-out tests showing zero telemetry requests;
- minimized collector rows and idempotent aggregates;
- exact API/web install totals and deterministic badge responses;
- stable manifest hash and immutable response behavior;
- identical safe plans for alias, Registry, and GitHub inputs;
- successful mock Registry init/validate/publish workflow;
- green Node 24 release gate;
- npm registry metadata for both synchronized packages;
- successful exact-version `npx` version and GitHub add dry-run smokes;
- README and rendered website showing the same primary command.
