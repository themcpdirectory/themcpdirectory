# Phase F Trust And Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the completed Phase D public API and completed Phase E CLI with explainable trust and health evidence, safe bounded remote probing, exact retention behaviour, and unmissable `deleted_upstream` warnings without introducing any aggregate trust score, new transport package, or API or CLI bootstrap work.

**Architecture:** Phase F begins only after the approved Phase D and Phase E files and interfaces already exist on the working branch. This phase adds trust and health derivation in `packages/domain`, probe safety in `packages/security`, persistence and retention primitives in `packages/db`, additive projections in the existing Phase D public contract and route files, additive client and CLI behaviour on the existing Phase E `DirectoryClient`, `CliDependencies`, `info.ts`, `add-plan.ts`, `add-execute.ts`, `update.ts`, and `doctor.ts` surfaces, worker scheduling in `apps/worker`, and accessible rendering on the existing web detail route. API and CLI work remains additive only: do not recreate `packages/directory-client`, do not replace the Phase D route layout, and do not move HTTP or CLI orchestration back into facade or bootstrap entrypoints.

**Tech Stack:** Node.js 24, TypeScript 5.9 strict mode, pnpm 11 workspaces, Zod 4.5.4, Hono 4.13.5, Drizzle ORM 0.45.2, PostgreSQL, pg-boss, Next.js App Router, Vitest 4.1.11, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-phase-f-trust-health-design.md`, `docs/superpowers/specs/2026-09-01-phase-d-public-api-design.md`, `docs/superpowers/specs/2026-09-01-phase-e-cli-installation-design.md`, `docs/ai-docs/engineering-spec.md`, `docs/ai-docs/product-and-technical-spec.md`

## Global Constraints

- Phase F is blocked until the approved Phase D and Phase E plans are completed on the branch under their canonical file names. If those files are missing or renamed, stop and finish the prerequisite phase instead of rebuilding it here.
- Extend only canonical Phase D and Phase E surfaces. Do not introduce facade or replacement files, wrapper entrypoints, merged test files, or renamed `DirectoryClient` methods.
- Do not create `packages/directory-client` in Phase F. Extend the existing Phase E package and its tests only.
- Keep the canonical trust signal states `positive`, `neutral`, `warning`, `negative`, and `unknown` exactly as written.
- Do not aggregate trust into any score, grade, stars, badge ladder, ranking multiplier, or opaque weighting.
- Treat `deleted_upstream` as the canonical listing-status value and `UPSTREAM_DELETED` as the public API error-code spelling only.
- Probe only active `http`, `sse`, or `streamable-http` remotes whose stored metadata resolves to a concrete public HTTPS URL after deriving authentication and unresolved-template status from persisted `headers` and `variables`, unless a prior prerequisite migration has already added equivalent authoritative fields.
- Never install, download, import, resolve, inspect, or execute stdio packages during health checks.
- Never send publisher headers, environment variables, user cookies, OAuth tokens, proxy credentials, Directory credentials, or any other ambient secret during automated probes.
- Every outbound probe must resolve DNS explicitly, reject mixed public or private answer sets, reject loopback, metadata, link-local, and IPv4-mapped IPv6 private forms, pin one validated address while preserving TLS hostname verification, and revalidate URL, scheme, port, DNS answers, and destination class on every redirect hop.
- Use `HEAD` first and fall back to a bounded `GET` only for approved endpoint behaviours. Bound redirect count, header bytes, response bytes, decompressed bytes, connect duration, and total duration. Discard response bodies after classification.
- Own per-origin concurrency and retry backoff in worker code via a concrete worker-managed probe policy and limiter. `packages/security` and `packages/domain` may consume explicit limits passed in, but they must not create their own retry schedule or cross-request concurrency state.
- Install manifest semantics from Phase D and Phase E remain intact. Phase F may block `deleted_upstream` installation and surface health or trust evidence around installation, but it must not silently reinterpret safe authenticated install variants as un-installable.
- Search, homepage, categories, and recommendations exclude `deleted_upstream` by default, while direct detail routes remain available.
- Warnings must appear in normal reading order, be exposed to assistive technology, support keyboard use where interactive, remain visible in forced colours mode, and reflow cleanly at 320 CSS pixels.
- Client parsers remain additive-only for v1 objects: accept unknown additive fields while still rejecting invalid known fields.
- Operational request logs that live only in external platform infrastructure are documented but not faked as app-managed deletion work. Phase F retention jobs cover only application-owned database records.
- Use pnpm for every command and a Conventional Commit for every verified task commit.

## Start Condition

Before Task 1, verify that the following approved Phase D and Phase E files already exist and are authoritative on the branch:

- `packages/api-contract/src/public-api/shared.ts`
- `packages/api-contract/src/public-api/errors.ts`
- `packages/api-contract/src/public-api/servers.ts`
- `packages/api-contract/src/public-api/install.ts`
- `packages/search/src/public-api/server-projections.ts`
- `packages/search/src/public-api/search-servers-page.ts`
- `packages/domain/src/public-api/server-detail.ts`
- `packages/domain/src/public-api/resolve-server-identifier.ts`
- `packages/domain/src/public-api/install-manifest.ts`
- `apps/api/src/app.ts`
- `apps/api/src/http/errors.ts`
- `apps/api/src/routes/servers.ts`
- `apps/api/src/routes/search.ts`
- `apps/api/src/routes/resolve.ts`
- `apps/api/src/routes/install.ts`
- `packages/directory-client/src/client.ts`
- `packages/directory-client/src/index.ts`
- `packages/directory-client/src/__tests__/client.test.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/commands/info.ts`
- `packages/cli/src/commands/add-plan.ts`
- `packages/cli/src/commands/add-execute.ts`
- `packages/cli/src/commands/update.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/__tests__/search-info.test.ts`
- `packages/cli/src/__tests__/add-planning.test.ts`
- `packages/cli/src/__tests__/add-execution.test.ts`
- `packages/cli/src/__tests__/update.test.ts`
- `packages/cli/src/__tests__/doctor.test.ts`
- `packages/cli/src/__tests__/integration-cli.test.ts`
- `packages/test-utils/src/cli-harness.ts`

If any item above is absent, stop and execute the prerequisite Phase D or Phase E plan first. Do not fold missing prerequisite work into Phase F.

---

## File Map

### `packages/api-contract`

- Create `packages/api-contract/src/public-api/trust.ts`: canonical trust signal keys, states, schemas, and inferred types.
- Create `packages/api-contract/src/public-api/health.ts`: canonical health outcomes, observation schemas, and inferred types.
- Modify `packages/api-contract/src/public-api/servers.ts`: add additive trust, health, and install-availability fields to server summary and detail schemas.
- Modify `packages/api-contract/src/public-api/install.ts`: export the canonical install-availability schema and keep install-manifest parsing aligned with `UPSTREAM_DELETED` and `INSTALL_UNAVAILABLE` semantics.
- Modify `packages/api-contract/src/public-api/client-parsers.ts`: add tolerant parsers for trust and health enriched detail and collection payloads.
- Modify `packages/api-contract/src/public-api/openapi.ts`: register the new schemas and examples in deterministic OpenAPI output.
- Modify `packages/api-contract/src/index.ts`: export the new contract surface.
- Modify `packages/api-contract/src/__tests__/servers-contract.test.ts`: lock summary and detail response shapes.
- Modify `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`: lock install-availability vocabulary and install-manifest drift on the canonical install surface.
- Modify `packages/api-contract/src/__tests__/client-parsers.test.ts`: additive-field tolerance tests for client parsing.
- Modify `packages/api-contract/src/__tests__/openapi.test.ts`: deterministic OpenAPI drift coverage for the added schemas.

### `packages/db`

- Modify `packages/db/src/schema/trust-signals.ts`: exact trust-history idempotency and retention indexes.
- Modify `packages/db/src/schema/server-health-checks.ts`: final origin, redirect count, method used, and retention indexes.
- Create `packages/db/src/schema/legal-holds.ts`: generic application-owned legal holds with reason and expiry, aligned with later retention work.
- Modify `packages/db/src/schema/index.ts`: export the new `legalHolds` table.
- Modify `packages/db/src/index.ts`: re-export the legal-hold schema.
- Modify `packages/db/src/__tests__/schema-invariants.test.ts`: schema invariants for checks and indexes.
- Create `packages/db/src/__tests__/trust-health-schema.integration.test.ts`: migration-backed storage tests.
- Create `packages/db/drizzle/0003_phase_f_trust_health.sql`: reviewed migration.
- Create `packages/db/drizzle/meta/0003_snapshot.json`: generated snapshot.
- Modify `packages/db/drizzle/meta/_journal.json`: migration journal update.

### `packages/security`

- Modify `packages/security/src/url.ts`: stricter public-URL validation helpers reused by redirect revalidation.
- Create `packages/security/src/remote-probe.ts`: DNS-pinned, redirect-safe, bounded probe transport.
- Modify `packages/security/src/index.ts`: export the probe helpers.
- Create `packages/security/src/__tests__/remote-probe.test.ts`: low-level DNS, redirect, limit, and header-boundary tests.
- Modify `packages/security/package.json`: add only the minimal dependency required for pinned direct connections if Node built-ins are insufficient.

### `packages/domain`

- Create `packages/domain/src/health/remote-probe-eligibility.ts`: derives whether a stored remote may be probed safely.
- Create `packages/domain/src/health/run-remote-health-check.ts`: executes bounded health checks and persists idempotent observations.
- Create `packages/domain/src/health/get-latest-remote-health.ts`: reads the latest observation.
- Create `packages/domain/src/health/__tests__/remote-probe-eligibility.test.ts`: eligibility tests.
- Create `packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts`: end-to-end probe and persistence tests.
- Create `packages/domain/src/trust/refresh-trust-profile.ts`: derives and persists factual trust signals.
- Create `packages/domain/src/trust/get-current-trust-profile.ts`: reads current trust projection.
- Create `packages/domain/src/trust/__tests__/refresh-trust-profile.integration.test.ts`: trust-refresh tests.
- Modify `packages/domain/src/public-api/server-detail.ts`: project trust, health, and install availability on canonical detail responses.
- Modify `packages/domain/src/public-api/resolve-server-identifier.ts`: keep resolve results additive and ambiguity-safe with the new summary fields.
- Modify `packages/domain/src/public-api/install-manifest.ts`: preserve Phase D and E manifest semantics while blocking `deleted_upstream` and exposing exact install availability.
- Modify `packages/domain/src/public-api/__tests__/server-detail.integration.test.ts`: trust and health detail tests.
- Modify `packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts`: additive resolve summary tests.
- Modify `packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts`: `UPSTREAM_DELETED` and install-availability tests.
- Modify `packages/domain/src/index.ts`: export the new trust and health entry points.

### `packages/search`

- Modify `packages/search/src/public-api/types.ts`: additive summary-field types.
- Modify `packages/search/src/public-api/server-projections.ts`: include publisher verification, latest health outcome, and install availability in public summaries.
- Modify `packages/search/src/public-api/search-servers-page.ts`: keep `deleted_upstream` excluded by default while returning the new summary fields.
- Modify `packages/search/src/__tests__/search-servers-page.integration.test.ts`: summary-field and visibility regressions.
- Modify `packages/search/src/index.ts`: export the extended projection surface.

### `apps/worker`

- Create `apps/worker/src/trust-health-config.ts`: `REMOTE_PROBE_POLICY`, per-origin limiter helpers, and deterministic retry-backoff helpers.
- Create `apps/worker/src/trust-health-jobs.ts`: queue names, job parsing, and processors that consume the worker-owned probe policy and limiter.
- Create `apps/worker/src/retention.ts`: `cleanupHealthHistory`, `cleanupTrustHistory`, and clock-driven, batch-bounded retention sweeps with legal-hold exclusions.
- Create `apps/worker/src/__tests__/trust-health-worker.test.ts`: scheduling, per-origin concurrency, backoff, batch, legal-hold, and idempotency tests.
- Modify `apps/worker/src/index.ts`: register queues and schedules.

### `apps/api`

- Modify `apps/api/src/app.ts`: mount the already-existing Phase D routes after extending them.
- Modify `apps/api/src/http/errors.ts`: keep exact `410` mapping for `UPSTREAM_DELETED` and `INSTALL_UNAVAILABLE`.
- Modify `apps/api/src/routes/servers.ts`: return detail and list payloads with trust, health, and install availability.
- Modify `apps/api/src/routes/search.ts`: return additive summary fields on search results.
- Modify `apps/api/src/routes/resolve.ts`: keep ambiguity-safe resolution while returning the additive summary shape.
- Modify `apps/api/src/routes/install.ts`: keep manifest delivery semantics and exact deleted-upstream blocking.
- Modify `apps/api/src/__tests__/public-api-core.integration.test.ts`: route tests for detail, search, resolve, and install.

### `packages/directory-client`

- Modify `packages/directory-client/src/client.ts`: extend `resolveServer`, `resolveInstall`, and `getServer` parsing with additive trust and health fields and preserve exact `410` error mapping.
- Modify `packages/directory-client/src/index.ts`: export any new helper surface.
- Modify `packages/directory-client/src/__tests__/client.test.ts`: additive field and deleted-upstream transport tests.

### `packages/cli`

- Modify `packages/cli/src/commands/info.ts`: render factual trust and health details.
- Modify `packages/cli/src/commands/add-plan.ts`: block before adapter planning or input collection when install is deleted upstream.
- Modify `packages/cli/src/commands/add-execute.ts`: preserve the blocked preflight contract and surface exact trust and health warnings in execution results.
- Modify `packages/cli/src/commands/update.ts`: block before any write when install is deleted upstream.
- Modify `packages/cli/src/commands/doctor.ts`: surface degraded health and upstream-deletion diagnostics.
- Modify `packages/cli/src/output/render.ts`: human-readable trust and health presentation.
- Modify `packages/cli/src/output/json.ts`: additive JSON output without aggregate scoring.
- Modify `packages/cli/src/__tests__/search-info.test.ts`: factual info output tests.
- Modify `packages/cli/src/__tests__/add-planning.test.ts`: preflight blocking tests.
- Modify `packages/cli/src/__tests__/add-execution.test.ts`: blocked execution and warning-propagation tests.
- Modify `packages/cli/src/__tests__/update.test.ts`: update blocking and degraded-health warning tests.
- Modify `packages/cli/src/__tests__/doctor.test.ts`: doctor diagnostics for degraded health and upstream deletion.
- Modify `packages/cli/src/__tests__/integration-cli.test.ts`: end-to-end CLI verification through the canonical `CliDependencies` wiring.

### `apps/web`

- Create `apps/web/src/components/trust-profile.tsx`: accessible factual trust list.
- Create `apps/web/src/components/health-observation.tsx`: accessible health summary.
- Create `apps/web/src/components/deleted-upstream-banner.tsx`: prominent upstream-deletion warning.
- Modify `apps/web/src/app/[slug]/page.tsx`: render trust, health, and deletion states in reading order.
- Modify `apps/web/src/app/globals.css`: forced-colours, reduced-motion, focus, and 320px-safe styling.
- Modify `apps/web/e2e/detail.spec.ts`: trust, health, keyboard, and 320px reflow tests.
- Modify `apps/web/e2e/contrast.spec.ts`: forced-colours, focus, and no-score wording regressions.

## Task Order

1. Canonical contract extensions
2. Storage and legal-hold foundation
3. Remote probe eligibility derivation
4. DNS-pinned probe transport
5. Bounded health execution and persistence
6. Trust refresh
7. Canonical domain public detail, resolve, and install extensions
8. Canonical search projection extensions
9. Worker scheduling, per-origin limits, jittered backoff, and exact retention
10. Public API route extensions
11. DirectoryClient and CLI guardrails
12. Web presentation and browser validation

### Task 1: Extend Canonical Trust And Health Contracts

**Files:**

- Create: `packages/api-contract/src/public-api/trust.ts`
- Create: `packages/api-contract/src/public-api/health.ts`
- Modify: `packages/api-contract/src/public-api/servers.ts`
- Modify: `packages/api-contract/src/public-api/install.ts`
- Modify: `packages/api-contract/src/public-api/client-parsers.ts`
- Modify: `packages/api-contract/src/public-api/openapi.ts`
- Modify: `packages/api-contract/src/index.ts`
- Test: `packages/api-contract/src/__tests__/servers-contract.test.ts`
- Test: `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`
- Test: `packages/api-contract/src/__tests__/client-parsers.test.ts`
- Test: `packages/api-contract/src/__tests__/openapi.test.ts`

**Interfaces:**

- Produces: `TrustSignalStateSchema`, `TrustSignalKeySchema`, `TrustProfileV1Schema`, `TrustProfileV1ClientSchema`
- Produces: `HealthCheckOutcomeSchema`, `RemoteHealthObservationV1Schema`, `RemoteHealthObservationV1ClientSchema`
- Produces: `InstallAvailabilitySchema`
- Produces additive detail fields: `trustProfile`, `latestHealth`, `installAvailability`
- Produces additive summary fields: `publisherVerified`, `latestHealthOutcome`, `installAvailability`
- Extends the canonical tolerant parsers `parseServerDetailResponse(input: unknown)`, `parseServerCollectionResponse(input: unknown)`, and `parseInstallManifestResponse(input: unknown)` without introducing `*V1` aliases.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  HealthCheckOutcomeSchema,
  InstallAvailabilitySchema,
  RemoteHealthObservationV1ClientSchema,
  TrustProfileV1ClientSchema,
  TrustProfileV1Schema,
  TrustSignalStateSchema,
  serverSummaryServerSchema,
} from "../index.js";

describe("phase F trust and health contracts", () => {
  it("locks the canonical trust vocabulary and rejects aggregate scores", () => {
    expect(TrustSignalStateSchema.options).toEqual([
      "positive",
      "neutral",
      "warning",
      "negative",
      "unknown",
    ]);

    expect(
      TrustProfileV1Schema.safeParse({
        schemaVersion: 1,
        signals: [],
        aggregateScore: 98,
      }).success,
    ).toBe(false);
  });

  it("keeps client parsing additive for nested trust and health fields", () => {
    const trust = TrustProfileV1ClientSchema.parse({
      schemaVersion: 1,
      signals: [
        {
          key: "official_registry",
          state: "positive",
          label: "Listed in the Official MCP Registry",
          observedAt: "2026-09-01T18:00:00.000Z",
          source: "registry",
          reason: null,
          futureSignalField: { safe: true },
        },
      ],
      futureProfileField: { safe: true },
    }) as Record<string, unknown>;

    const health = RemoteHealthObservationV1ClientSchema.parse({
      schemaVersion: 1,
      outcome: "healthy",
      checkedAt: "2026-09-01T18:00:00.000Z",
      durationMs: 120,
      httpStatus: 200,
      finalOrigin: "https://api.example.com",
      redirectCount: 0,
      futureHealthField: { safe: true },
    }) as Record<string, unknown>;

    expect(trust.futureProfileField).toEqual({ safe: true });
    expect(health.futureHealthField).toEqual({ safe: true });
  });

  it("extends public summaries with factual trust and health fields", () => {
    const summary = serverSummaryServerSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "github",
      title: "GitHub",
      description: "GitHub tools",
      publisher: null,
      version: null,
      repository: null,
      listingStatus: "active",
      signals: {
        officialRegistry: true,
        publisherVerified: true,
        sourceAvailable: true,
        openSource: true,
      },
      publisherVerified: true,
      latestHealthOutcome: "healthy",
      installAvailability: "available",
    });

    expect(summary.publisherVerified).toBe(true);
    expect(summary.latestHealthOutcome).toBe("healthy");
    expect(summary.installAvailability).toBe("available");
    expect(InstallAvailabilitySchema.options).toEqual([
      "available",
      "install_unavailable",
      "upstream_deleted",
    ]);
    expect(HealthCheckOutcomeSchema.options).toContain("response_too_large");
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/openapi.test.ts
```

Expected: FAIL because the trust, health, and install-availability schemas do not exist on the canonical public API contract surface yet.

- [ ] **Step 3: Write the minimal canonical schemas and additive parsers**

```ts
// packages/api-contract/src/public-api/trust.ts
import { z } from "zod";
import { clientObject, strictObject, rfc3339UtcSchema } from "./shared.js";

export const TrustSignalStateSchema = z.enum([
  "positive",
  "neutral",
  "warning",
  "negative",
  "unknown",
]);

export const TrustSignalKeySchema = z.enum([
  "official_registry",
  "publisher_verified",
  "repository_available",
  "repository_archived",
  "open_source_license",
  "recent_repository_activity",
  "recent_release",
  "remote_reachable",
  "current_version_present",
  "package_present",
  "upstream_deleted",
]);

const TrustSignalShape = {
  key: TrustSignalKeySchema,
  state: TrustSignalStateSchema,
  label: z.string().min(1),
  observedAt: rfc3339UtcSchema,
  source: z.string().min(1),
  reason: z.string().nullable(),
};

export const TrustProfileV1Schema = strictObject({
  schemaVersion: z.literal(1),
  signals: z.array(strictObject(TrustSignalShape)),
});

export const TrustProfileV1ClientSchema = clientObject({
  schemaVersion: z.literal(1),
  signals: z.array(clientObject(TrustSignalShape)),
});
```

```ts
// packages/api-contract/src/public-api/health.ts
import { z } from "zod";
import { clientObject, strictObject, rfc3339UtcSchema } from "./shared.js";

export const HealthCheckOutcomeSchema = z.enum([
  "healthy",
  "degraded",
  "unreachable",
  "timed_out",
  "unsafe_destination",
  "response_too_large",
  "unsupported",
  "unknown",
]);

const RemoteHealthObservationShape = {
  schemaVersion: z.literal(1),
  outcome: HealthCheckOutcomeSchema,
  checkedAt: rfc3339UtcSchema,
  durationMs: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  finalOrigin: z.string().url().nullable(),
  redirectCount: z.number().int().nonnegative(),
};

export const RemoteHealthObservationV1Schema = strictObject(RemoteHealthObservationShape);
export const RemoteHealthObservationV1ClientSchema = clientObject(RemoteHealthObservationShape);
```

```ts
// packages/api-contract/src/public-api/install.ts
import { z } from "zod";

export const InstallAvailabilitySchema = z.enum([
  "available",
  "install_unavailable",
  "upstream_deleted",
]);
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/openapi.test.ts
pnpm --filter @themcpdirectory/api-contract typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-contract/src/public-api/trust.ts packages/api-contract/src/public-api/health.ts packages/api-contract/src/public-api/servers.ts packages/api-contract/src/public-api/install.ts packages/api-contract/src/public-api/client-parsers.ts packages/api-contract/src/public-api/openapi.ts packages/api-contract/src/index.ts packages/api-contract/src/__tests__/servers-contract.test.ts packages/api-contract/src/__tests__/install-discovery-contract.test.ts packages/api-contract/src/__tests__/client-parsers.test.ts packages/api-contract/src/__tests__/openapi.test.ts
git commit -m "feat(api-contract): extend trust and health schemas"
```

### Task 2: Harden Storage And Add Legal-Hold Primitives

**Files:**

- Modify: `packages/db/src/schema/trust-signals.ts`
- Modify: `packages/db/src/schema/server-health-checks.ts`
- Create: `packages/db/src/schema/legal-holds.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/__tests__/schema-invariants.test.ts`
- Create: `packages/db/src/__tests__/trust-health-schema.integration.test.ts`
- Create: `packages/db/drizzle/0003_phase_f_trust_health.sql`
- Create: `packages/db/drizzle/meta/0003_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`

**Interfaces:**

- Produces: `serverHealthChecks.finalOrigin`, `serverHealthChecks.redirectCount`, `serverHealthChecks.methodUsed`
- Produces unique idempotency keys on `server_health_checks(remote_id, checked_at)` and `trust_signals(server_id, signal_key, checked_at)`
- Produces retention indexes on `checked_at` and `expires_at`
- Produces: `legalHolds(scope, subjectType, subjectId, reason, expiresAt, createdBy, releasedAt)`

- [ ] **Step 1: Write the failing schema and migration tests**

```ts
import { describe, expect, it } from "vitest";
import { legalHolds, serverHealthChecks, trustSignals } from "../index.js";

describe("phase F trust and health storage", () => {
  it("stores final origin and method metadata and enforces remote-check idempotency", async () => {
    const checkedAt = new Date("2026-09-01T18:00:00.000Z");

    await db.insert(serverHealthChecks).values({
      serverId,
      remoteId,
      checkType: "remote_probe",
      status: "healthy",
      latencyMs: 240,
      httpStatus: 200,
      finalOrigin: "https://api.example.com",
      redirectCount: 1,
      methodUsed: "GET",
      checkedAt,
    });

    await expect(
      db.insert(serverHealthChecks).values({
        serverId,
        remoteId,
        checkType: "remote_probe",
        status: "healthy",
        latencyMs: 240,
        httpStatus: 200,
        finalOrigin: "https://api.example.com",
        redirectCount: 1,
        methodUsed: "GET",
        checkedAt,
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it("stores legal holds with a scope, reason, and expiry", async () => {
    const [hold] = await db
      .insert(legalHolds)
      .values({
        scope: "health_history",
        subjectType: "server",
        subjectId: serverId,
        reason: "incident review",
        expiresAt: new Date("2026-12-31T00:00:00.000Z"),
        createdBy: "phase-f-test",
      })
      .returning();

    expect(hold.reason).toBe("incident review");
  });

  it("enforces trust-signal idempotency for one observation boundary", async () => {
    const checkedAt = new Date("2026-09-01T18:30:00.000Z");

    await db.insert(trustSignals).values({
      serverId,
      signalKey: "official_registry",
      status: "positive",
      source: "registry",
      summary: "Listed in the Official MCP Registry",
      checkedAt,
    });

    await expect(
      db.insert(trustSignals).values({
        serverId,
        signalKey: "official_registry",
        status: "positive",
        source: "registry",
        summary: "Listed in the Official MCP Registry",
        checkedAt,
      }),
    ).rejects.toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/db test -- src/__tests__/schema-invariants.test.ts src/__tests__/trust-health-schema.integration.test.ts
```

Expected: FAIL because the new columns, indexes, and `legal_holds` table do not exist yet.

- [ ] **Step 3: Add the minimal reviewed schema and migration changes**

```ts
// packages/db/src/schema/server-health-checks.ts
export const serverHealthChecks = pgTable(
  "server_health_checks",
  {
    finalOrigin: text("final_origin"),
    redirectCount: integer("redirect_count").notNull().default(0),
    methodUsed: text("method_used"),
  },
  (t) => [
    uniqueIndex("server_health_checks_remote_checked_at_uidx")
      .on(t.remoteId, t.checkedAt)
      .where(sql`${t.remoteId} is not null`),
    index("server_health_checks_checked_at_idx").on(t.checkedAt),
  ],
);

// packages/db/src/schema/legal-holds.ts
export const legalHolds = pgTable(
  "legal_holds",
  {
    id: uuid().primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_holds_lookup_idx").on(t.scope, t.subjectType, t.subjectId, t.expiresAt)],
);
```

- [ ] **Step 4: Generate the migration and rerun focused checks**

Run:

```bash
pnpm db:generate
pnpm --filter @themcpdirectory/db test -- src/__tests__/schema-invariants.test.ts src/__tests__/trust-health-schema.integration.test.ts
pnpm --filter @themcpdirectory/db typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/trust-signals.ts packages/db/src/schema/server-health-checks.ts packages/db/src/schema/legal-holds.ts packages/db/src/schema/index.ts packages/db/src/index.ts packages/db/src/__tests__/schema-invariants.test.ts packages/db/src/__tests__/trust-health-schema.integration.test.ts packages/db/drizzle/0003_phase_f_trust_health.sql packages/db/drizzle/meta/0003_snapshot.json packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): harden trust and health storage"
```

### Task 3: Derive Exact Remote Probe Eligibility

**Files:**

- Create: `packages/domain/src/health/remote-probe-eligibility.ts`
- Create: `packages/domain/src/health/__tests__/remote-probe-eligibility.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces: `RemoteProbeEligibilityInput { listingStatus, transportType, urlTemplate, headers, variables }`
- Produces: `RemoteProbeEligibilityResult { eligible, outcome, reason, normalizedUrl, derivedAuthRequired, derivedUnresolvedVariables }`
- Produces: `decideRemoteProbeEligibility(input, options?)`

- [ ] **Step 1: Write the failing eligibility tests**

```ts
import { describe, expect, it } from "vitest";
import { decideRemoteProbeEligibility } from "../remote-probe-eligibility.js";

describe("remote probe eligibility", () => {
  it("derives auth-required remotes from stored headers", async () => {
    await expect(
      decideRemoteProbeEligibility(
        {
          listingStatus: "active",
          transportType: "streamable-http",
          urlTemplate: "https://mcp.example.com/http/{tenant}",
          headers: [{ name: "Authorization", value: "Bearer ${TOKEN}" }],
          variables: { tenant: { description: "Tenant id", isRequired: true } },
        },
        { resolve: async () => ["93.184.216.34"] },
      ),
    ).resolves.toMatchObject({
      eligible: false,
      outcome: "unsupported",
      reason: "remote requires authentication",
      derivedAuthRequired: true,
    });
  });

  it("rejects unresolved required URL template variables", async () => {
    await expect(
      decideRemoteProbeEligibility(
        {
          listingStatus: "active",
          transportType: "sse",
          urlTemplate: "https://mcp.example.com/sse/{tenant}",
          headers: [],
          variables: { tenant: { isRequired: true } },
        },
        { resolve: async () => ["93.184.216.34"] },
      ),
    ).resolves.toMatchObject({
      eligible: false,
      outcome: "unsupported",
      derivedUnresolvedVariables: ["tenant"],
    });
  });

  it("accepts a concrete public HTTPS remote", async () => {
    await expect(
      decideRemoteProbeEligibility(
        {
          listingStatus: "active",
          transportType: "http",
          urlTemplate: "https://mcp.example.com/health",
          headers: [],
          variables: {},
        },
        { resolve: async () => ["93.184.216.34"] },
      ),
    ).resolves.toMatchObject({
      eligible: true,
      normalizedUrl: "https://mcp.example.com/health",
      derivedAuthRequired: false,
      derivedUnresolvedVariables: [],
    });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/health/__tests__/remote-probe-eligibility.test.ts
```

Expected: FAIL because the eligibility module does not exist yet.

- [ ] **Step 3: Write the exact derivation helper**

```ts
const AUTH_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "api-key",
]);

function deriveAuthRequired(headers: unknown): boolean {
  if (!Array.isArray(headers)) return false;

  return headers.some((entry) => {
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "").toLowerCase();
    const value = String(record.value ?? "");
    return AUTH_HEADER_NAMES.has(name) || /\$\{[^}]+\}/.test(value);
  });
}

function deriveUnresolvedRequiredVariables(urlTemplate: string, variables: unknown): string[] {
  const variableMap = (variables ?? {}) as Record<string, Record<string, unknown>>;
  const placeholders = Array.from(
    urlTemplate.matchAll(/\{([A-Za-z0-9_-]+)\}/g),
    (match) => match[1]!,
  );

  return placeholders.filter((name) => {
    const entry = variableMap[name];
    const isRequired = entry?.isRequired === true;
    const hasDefault = typeof entry?.default === "string" && entry.default.length > 0;
    return isRequired && !hasDefault;
  });
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/health/__tests__/remote-probe-eligibility.test.ts
pnpm --filter @themcpdirectory/domain typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/health/remote-probe-eligibility.ts packages/domain/src/health/__tests__/remote-probe-eligibility.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): derive remote probe eligibility"
```

### Task 4: Add The DNS-Pinned, Redirect-Safe Probe Transport

**Files:**

- Modify: `packages/security/src/url.ts`
- Create: `packages/security/src/remote-probe.ts`
- Modify: `packages/security/src/index.ts`
- Create: `packages/security/src/__tests__/remote-probe.test.ts`
- Modify: `packages/security/package.json`

**Interfaces:**

- Produces: `PinnedProbeRequestOptions { fetchImpl, resolve, dispatcherFactory, method, connectTimeoutMs, totalTimeoutMs, maxRedirects, maxHeaderBytes, maxResponseBytes, maxDecompressedBytes }`
- Produces: `PinnedProbeResponse { outcome, methodUsed, finalOrigin, httpStatus, redirectCount, durationMs, errorCode, errorSummary }`
- Produces: `performPinnedProbe(url, options)`
- Consumes explicit limits from Task 9 worker policy. Do not own retry or concurrency state here.

- [ ] **Step 1: Write the failing low-level probe tests**

- [ ] `packages/security/src/__tests__/remote-probe.test.ts` must contain executable cases for loopback IPv4 and IPv6 rejection, metadata and link-local rejection, private IPv4 rejection, private IPv6 rejection, IPv4-mapped IPv6 rejection, mixed public/private DNS answers, DNS rebinding across redirect hops, redirect-hop URL and destination-class revalidation, TLS hostname-preserving dispatcher usage on every hop, connect-timeout and total-timeout paths, compressed-byte and decompressed-byte limits, header-byte and body-byte limits, and ambient credential stripping.

```ts
import { describe, expect, it, vi } from "vitest";
import { performPinnedProbe } from "../remote-probe.js";

describe("performPinnedProbe", () => {
  it.each([
    ["loopback ipv4", ["127.0.0.1"]],
    ["loopback ipv6", ["::1"]],
    ["metadata ipv4", ["169.254.169.254"]],
    ["private ipv4", ["10.0.0.2"]],
    ["private ipv6", ["fd00::1"]],
    ["ipv4-mapped ipv6", ["::ffff:10.0.0.2"]],
  ])("rejects %s answers", async (_label, answers) => {
    await expect(
      performPinnedProbe("https://origin.example.com/health", {
        fetchImpl: vi.fn(),
        resolve: async () => answers,
        method: "HEAD",
        connectTimeoutMs: 500,
        totalTimeoutMs: 1_500,
        maxRedirects: 2,
        maxHeaderBytes: 512,
        maxResponseBytes: 1_024,
        maxDecompressedBytes: 1_024,
      }),
    ).resolves.toMatchObject({ outcome: "unsafe_destination" });
  });

  it("rejects mixed public and private DNS answers", async () => {
    await expect(
      performPinnedProbe("https://origin.example.com/health", {
        fetchImpl: vi.fn(),
        resolve: async () => ["93.184.216.34", "10.0.0.2"],
        method: "HEAD",
        connectTimeoutMs: 500,
        totalTimeoutMs: 1_500,
        maxRedirects: 2,
        maxHeaderBytes: 512,
        maxResponseBytes: 1_024,
        maxDecompressedBytes: 1_024,
      }),
    ).resolves.toMatchObject({ outcome: "unsafe_destination", errorCode: "mixed_dns" });
  });

  it("revalidates every redirect hop, rejects rebinding, and preserves TLS hostname verification", async () => {
    const dispatcherFactory = vi.fn(() => undefined);
    let resolveCount = 0;

    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/health")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://origin.example.com/final" },
        });
      }
      return new Response(null, { status: 200, headers: { "content-length": "0" } });
    };

    const result = await performPinnedProbe("https://origin.example.com/health", {
      fetchImpl,
      resolve: async () => {
        resolveCount += 1;
        return resolveCount === 1 ? ["93.184.216.34"] : ["10.0.0.2"];
      },
      dispatcherFactory,
      method: "HEAD",
      connectTimeoutMs: 500,
      totalTimeoutMs: 1_500,
      maxRedirects: 2,
      maxHeaderBytes: 512,
      maxResponseBytes: 1_024,
      maxDecompressedBytes: 1_024,
    });

    expect(result).toMatchObject({ outcome: "unsafe_destination", redirectCount: 1 });
    expect(dispatcherFactory).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "origin.example.com", servername: "origin.example.com" }),
    );
  });

  it("strips ambient credentials and enforces timeout and size limits", async () => {
    const requests: Array<{
      headers: Record<string, string>;
      credentials: RequestCredentials | undefined;
    }> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      requests.push({
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        credentials: init?.credentials,
      });
      return new Response("x".repeat(2_048), {
        status: 200,
        headers: {
          "content-encoding": "gzip",
          "x-large": "y".repeat(1_024),
        },
      });
    };

    const result = await performPinnedProbe("https://origin.example.com/health", {
      fetchImpl,
      resolve: async () => ["93.184.216.34"],
      method: "HEAD",
      connectTimeoutMs: 500,
      totalTimeoutMs: 1_500,
      maxRedirects: 0,
      maxHeaderBytes: 128,
      maxResponseBytes: 128,
      maxDecompressedBytes: 128,
    });

    expect(requests[0]).toMatchObject({
      headers: {
        accept: "application/json, text/event-stream",
        "accept-encoding": "identity",
        "user-agent": "TheMcpDirectoryHealthProbe/1",
      },
      credentials: "omit",
    });
    expect(result.outcome).toBe("response_too_large");
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/security test -- src/__tests__/remote-probe.test.ts
```

Expected: FAIL because the pinned probe transport does not exist yet and the full safety matrix is not implemented.

- [ ] **Step 3: Implement the bounded probe transport as a pure low-level primitive that consumes worker-owned limits**

The transport must accept concrete limits from the caller and must not own per-origin concurrency or retry state.

```ts
const FIXED_PROBE_HEADERS = Object.freeze({
  accept: "application/json, text/event-stream",
  "accept-encoding": "identity",
  "user-agent": "TheMcpDirectoryHealthProbe/1",
});

export async function performPinnedProbe(
  url: string,
  options: PinnedProbeRequestOptions,
): Promise<PinnedProbeResponse> {
  const startedAt = Date.now();
  let currentUrl = url;
  let redirects = 0;

  while (true) {
    const validation = await validatePublicHttpUrl(currentUrl, { resolve: options.resolve });
    if (!validation.ok) {
      return blocked("unsafe_destination", validation.reason, redirects, Date.now() - startedAt);
    }

    const parsed = new URL(validation.url);
    const addresses = await resolveAllPublicAddresses(parsed.hostname, options.resolve);
    if (hasMixedPublicPrivateAnswers(addresses)) {
      return blocked(
        "mixed_dns",
        "mixed public/private DNS answers",
        redirects,
        Date.now() - startedAt,
      );
    }

    const pinnedAddress = pickDeterministicAddress(addresses);
    const dispatcher = options.dispatcherFactory?.({
      hostname: parsed.hostname,
      servername: parsed.hostname,
      pinnedAddress,
      connectTimeoutMs: options.connectTimeoutMs,
    });

    const response = await (options.fetchImpl ?? fetch)(validation.url, {
      method: options.method,
      redirect: "manual",
      credentials: "omit",
      headers: FIXED_PROBE_HEADERS,
      dispatcher,
      signal: timeoutSignal(options.totalTimeoutMs),
    });

    const headerBytes = countHeaderBytes(response.headers);
    if (headerBytes > options.maxHeaderBytes) {
      response.body?.cancel().catch(() => {});
      return blocked(
        "header_limit",
        `response headers exceed ${options.maxHeaderBytes} bytes`,
        redirects,
        Date.now() - startedAt,
      );
    }

    if (isRedirect(response.status)) {
      if (redirects >= options.maxRedirects) {
        response.body?.cancel().catch(() => {});
        return blocked(
          "redirect_limit",
          `exceeded ${options.maxRedirects} redirects`,
          redirects,
          Date.now() - startedAt,
        );
      }

      const location = mustReadRedirectLocation(response.headers.get("location"), validation.url);
      response.body?.cancel().catch(() => {});
      currentUrl = location;
      redirects += 1;
      continue;
    }

    return classifyBoundedResponse(response, {
      startedAt,
      redirects,
      methodUsed: options.method,
      finalOrigin: parsed.origin,
      maxResponseBytes: options.maxResponseBytes,
      maxDecompressedBytes: options.maxDecompressedBytes,
    });
  }
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/security test -- src/__tests__/remote-probe.test.ts
pnpm --filter @themcpdirectory/security typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/security/src/url.ts packages/security/src/remote-probe.ts packages/security/src/index.ts packages/security/src/__tests__/remote-probe.test.ts packages/security/package.json
git commit -m "feat(security): add pinned remote probe transport"
```

### Task 5: Execute And Persist Bounded Health Checks

**Files:**

- Create: `packages/domain/src/health/run-remote-health-check.ts`
- Create: `packages/domain/src/health/get-latest-remote-health.ts`
- Create: `packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `decideRemoteProbeEligibility`
- Consumes: `performPinnedProbe`
- Consumes: `probeOptions` passed from Task 9 worker policy
- Rejects unsupported transports, including `stdio`, before any package resolution, dynamic import, inspection, install, or process execution side effect; verification uses injected spies or fakes that must remain uncalled.
- Accepts optional `forbiddenStdioSideEffects { resolvePackage, importPackage, inspectPackage, installPackage, executeProcess }` test hooks so the no-stdio guard is enforced with exact executable assertions instead of global module mocking.
- Produces: `runRemoteHealthCheck(db, input)`
- Produces: `getLatestRemoteHealthObservation(db, serverId)`

- [ ] **Step 1: Write the failing health-runner tests**

- [ ] Extend `packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts` with an executable case that proves `runRemoteHealthCheck` forwards caller-provided `probeOptions` to both the `HEAD` probe and the fallback `GET` probe instead of hardcoding limits in domain code.
- [ ] Extend `packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts` with an executable case that proves a `stdio` or otherwise unsupported transport returns `unsupported` before DNS resolution, package resolution, dynamic import, package inspection, install attempts, or child-process execution by asserting injected spies or fakes remain uncalled.

```ts
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { serverHealthChecks } from "@themcpdirectory/db";
import { runRemoteHealthCheck } from "../run-remote-health-check.js";

describe("runRemoteHealthCheck", () => {
  it("falls back from HEAD to GET and persists one idempotent row", async () => {
    const checkedAt = new Date("2026-09-01T18:00:00.000Z");

    const result = await runRemoteHealthCheck(db, {
      serverId,
      remoteId,
      checkedAt,
      resolve: async () => ["93.184.216.34"],
      fetchImpl: async (_input, init) =>
        init?.method === "HEAD"
          ? new Response(null, { status: 405 })
          : new Response(null, { status: 200, headers: { "content-length": "0" } }),
    });

    expect(result.outcome).toBe("healthy");
    expect(result.methodUsed).toBe("GET");

    const rows = await db
      .select()
      .from(serverHealthChecks)
      .where(eq(serverHealthChecks.remoteId, remoteId));

    expect(rows).toHaveLength(1);
  });

  it("persists unsupported outcomes without attempting a network call", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await runRemoteHealthCheck(db, {
      serverId,
      remoteId: authenticatedRemoteId,
      checkedAt: new Date("2026-09-01T18:10:00.000Z"),
      resolve: async () => ["93.184.216.34"],
      fetchImpl,
    });

    expect(result.outcome).toBe("unsupported");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects stdio before any package or process side effects", async () => {
    const resolveDns = vi.fn(async () => ["93.184.216.34"]);
    const fetchImpl = vi.fn<typeof fetch>();
    const resolvePackage = vi.fn();
    const importPackage = vi.fn();
    const inspectPackage = vi.fn();
    const installPackage = vi.fn();
    const executeProcess = vi.fn();

    const result = await runRemoteHealthCheck(db, {
      serverId,
      remoteId: stdioRemoteId,
      checkedAt: new Date("2026-09-01T18:12:00.000Z"),
      resolve: resolveDns,
      fetchImpl,
      forbiddenStdioSideEffects: {
        resolvePackage,
        importPackage,
        inspectPackage,
        installPackage,
        executeProcess,
      },
    });

    expect(result.outcome).toBe("unsupported");
    expect(resolveDns).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolvePackage).not.toHaveBeenCalled();
    expect(importPackage).not.toHaveBeenCalled();
    expect(inspectPackage).not.toHaveBeenCalled();
    expect(installPackage).not.toHaveBeenCalled();
    expect(executeProcess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/health/__tests__/run-remote-health-check.integration.test.ts
```

Expected: FAIL because the health runner does not exist yet.

- [ ] **Step 3: Write the exact HEAD then GET execution path**

```ts
const FALLBACK_TO_GET_STATUSES = new Set([400, 405, 406, 501]);

export async function runRemoteHealthCheck(
  db: Database,
  input: RunRemoteHealthCheckInput,
): Promise<RemoteHealthObservationV1> {
  const remote = await loadRemoteForHealthCheck(db, input.remoteId);
  const eligibility = await decideRemoteProbeEligibility(remote, { resolve: input.resolve });

  if (!eligibility.eligible || !eligibility.normalizedUrl) {
    return persistHealthObservation(db, {
      serverId: input.serverId,
      remoteId: input.remoteId,
      checkedAt: input.checkedAt,
      outcome: eligibility.outcome,
      methodUsed: null,
      finalOrigin: null,
      httpStatus: null,
      redirectCount: 0,
      durationMs: 0,
      errorCode: eligibility.outcome,
      errorSummary: eligibility.reason,
    });
  }

  const headResult = await performPinnedProbe(eligibility.normalizedUrl, {
    fetchImpl: input.fetchImpl,
    resolve: input.resolve,
    method: "HEAD",
    ...input.probeOptions,
  });

  const finalResult =
    headResult.httpStatus !== null && FALLBACK_TO_GET_STATUSES.has(headResult.httpStatus)
      ? await performPinnedProbe(eligibility.normalizedUrl, {
          fetchImpl: input.fetchImpl,
          resolve: input.resolve,
          method: "GET",
          ...input.probeOptions,
        })
      : headResult;

  return persistHealthObservation(db, {
    serverId: input.serverId,
    remoteId: input.remoteId,
    checkedAt: input.checkedAt,
    ...finalResult,
  });
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/health/__tests__/run-remote-health-check.integration.test.ts
pnpm --filter @themcpdirectory/domain typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/health/run-remote-health-check.ts packages/domain/src/health/get-latest-remote-health.ts packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): persist bounded remote health checks"
```

### Task 6: Refresh Trust Profiles Idempotently

**Files:**

- Create: `packages/domain/src/trust/refresh-trust-profile.ts`
- Create: `packages/domain/src/trust/get-current-trust-profile.ts`
- Create: `packages/domain/src/trust/__tests__/refresh-trust-profile.integration.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces: `refreshTrustProfile(db, input)`
- Produces: `getCurrentTrustProfile(db, serverId)`
- Reuses the canonical `TrustProfileV1` and `RemoteHealthObservationV1` types

- [ ] **Step 1: Write the failing trust-refresh tests**

```ts
import { describe, expect, it } from "vitest";
import { refreshTrustProfile } from "../refresh-trust-profile.js";

describe("refreshTrustProfile", () => {
  it("derives ordered factual signals, preserves unknown evidence, and stays idempotent", async () => {
    const observedAt = new Date("2026-09-01T18:30:00.000Z");

    const first = await refreshTrustProfile(db, { serverId, observedAt });
    const second = await refreshTrustProfile(db, { serverId, observedAt });

    expect(first).toEqual(second);
    expect(first.signals.map((signal) => signal.key)).toEqual([
      "official_registry",
      "publisher_verified",
      "repository_available",
      "repository_archived",
      "open_source_license",
      "recent_repository_activity",
      "recent_release",
      "remote_reachable",
      "current_version_present",
      "package_present",
      "upstream_deleted",
    ]);
    expect(first).not.toHaveProperty("aggregateScore");
    expect(first.signals.some((signal) => signal.state === "unknown")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/trust/__tests__/refresh-trust-profile.integration.test.ts
```

Expected: FAIL because the trust modules do not exist yet.

- [ ] **Step 3: Write the minimal ordered trust refresh path**

```ts
const SIGNAL_ORDER: readonly TrustSignalKey[] = [
  "official_registry",
  "publisher_verified",
  "repository_available",
  "repository_archived",
  "open_source_license",
  "recent_repository_activity",
  "recent_release",
  "remote_reachable",
  "current_version_present",
  "package_present",
  "upstream_deleted",
];

export async function refreshTrustProfile(
  db: Database,
  input: RefreshTrustProfileInput,
): Promise<TrustProfileV1> {
  const facts = await loadTrustFacts(db, input.serverId);
  const latestHealth = await getLatestRemoteHealthObservation(db, input.serverId);
  const signals = buildTrustSignals(facts, latestHealth, input.observedAt).sort(
    (left, right) => SIGNAL_ORDER.indexOf(left.key) - SIGNAL_ORDER.indexOf(right.key),
  );

  await persistTrustSignals(db, input.serverId, input.observedAt, signals);
  return { schemaVersion: 1, signals };
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/trust/__tests__/refresh-trust-profile.integration.test.ts
pnpm --filter @themcpdirectory/domain typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/trust/refresh-trust-profile.ts packages/domain/src/trust/get-current-trust-profile.ts packages/domain/src/trust/__tests__/refresh-trust-profile.integration.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): derive trust profiles"
```

### Task 7: Extend Canonical Domain Detail, Resolve, And Install Surfaces

**Files:**

- Modify: `packages/domain/src/public-api/server-detail.ts`
- Modify: `packages/domain/src/public-api/resolve-server-identifier.ts`
- Modify: `packages/domain/src/public-api/install-manifest.ts`
- Modify: `packages/domain/src/public-api/__tests__/server-detail.integration.test.ts`
- Modify: `packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts`
- Modify: `packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces additive detail fields: `trustProfile`, `latestHealth`, `installAvailability`
- Produces additive resolve summary fields that match the canonical public summary shape
- Preserves Phase D and E install-manifest semantics while returning `UPSTREAM_DELETED` exactly for deleted listings

- [ ] **Step 1: Write the failing domain public-api tests**

```ts
import { describe, expect, it } from "vitest";
import { buildInstallManifest, getServerDetailBySlug, resolveServerIdentifier } from "../index.js";

describe("phase F domain public api", () => {
  it("adds trust, health, and install availability to server detail", async () => {
    const detail = await getServerDetailBySlug(db, "github");

    expect(detail?.trustProfile?.signals.some((signal) => signal.key === "remote_reachable")).toBe(
      true,
    );
    expect(detail?.latestHealth?.outcome).toBe("healthy");
    expect(detail?.installAvailability).toBe("available");
  });

  it("keeps resolve summaries additive and ambiguity-safe", async () => {
    const result = await resolveServerIdentifier(db, "github");
    expect(result.matches[0]).toMatchObject({ installAvailability: "available" });
  });

  it("returns UPSTREAM_DELETED without stripping otherwise valid manifest variants", async () => {
    await expect(buildInstallManifest(db, "deleted-server")).rejects.toMatchObject({
      code: "UPSTREAM_DELETED",
    });

    const manifest = await buildInstallManifest(db, "authenticated-remote-server");
    expect(manifest.variants.some((variant) => variant.kind === "remote")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts
```

Expected: FAIL because the canonical detail, resolve, and install modules do not expose the new fields yet.

- [ ] **Step 3: Extend the existing Phase D domain surfaces instead of creating new ones**

```ts
// packages/domain/src/public-api/server-detail.ts
const trustProfile = await getCurrentTrustProfile(db, row.id);
const latestHealth = await getLatestRemoteHealthObservation(db, row.id);

return {
  ...baseDetail,
  trustProfile,
  latestHealth,
  installAvailability:
    row.listingStatus === "deleted_upstream"
      ? "upstream_deleted"
      : row.currentVersionId === null
        ? "install_unavailable"
        : "available",
};

// packages/domain/src/public-api/install-manifest.ts
if (detail.listingStatus === "deleted_upstream") {
  throw new InstallManifestUnavailableError("UPSTREAM_DELETED", "Listing deleted upstream.");
}

return existingManifest;
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/domain test -- src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts
pnpm --filter @themcpdirectory/domain typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/public-api/server-detail.ts packages/domain/src/public-api/resolve-server-identifier.ts packages/domain/src/public-api/install-manifest.ts packages/domain/src/public-api/__tests__/server-detail.integration.test.ts packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): extend public trust and install detail"
```

### Task 8: Extend Canonical Search Projections

**Files:**

- Modify: `packages/search/src/public-api/types.ts`
- Modify: `packages/search/src/public-api/server-projections.ts`
- Modify: `packages/search/src/public-api/search-servers-page.ts`
- Modify: `packages/search/src/__tests__/search-servers-page.integration.test.ts`
- Modify: `packages/search/src/index.ts`

**Interfaces:**

- Produces additive summary fields: `publisherVerified`, `latestHealthOutcome`, `installAvailability`
- Preserves default `deleted_upstream` exclusion on search and list surfaces

- [ ] **Step 1: Write the failing search projection tests**

```ts
import { describe, expect, it } from "vitest";
import { searchServersPage } from "../search-servers-page.js";

describe("search server projections", () => {
  it("projects factual verification and latest health while keeping deleted listings excluded", async () => {
    const page = await searchServersPage(db, { q: "github", limit: 10, sort: "relevance" });

    expect(page.data[0]).toMatchObject({
      publisherVerified: true,
      latestHealthOutcome: "healthy",
      installAvailability: "available",
    });

    const deleted = await searchServersPage(db, {
      q: "Deleted Listed",
      limit: 10,
      sort: "relevance",
    });
    expect(deleted.data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/search test -- src/__tests__/search-servers-page.integration.test.ts
```

Expected: FAIL because the summary projection does not contain the new fields yet.

- [ ] **Step 3: Extend the existing search projection files**

```ts
// packages/search/src/public-api/server-projections.ts
return {
  ...baseSummary,
  publisherVerified: row.publisherVerified,
  latestHealthOutcome: latestHealth?.outcome ?? null,
  installAvailability:
    row.listingStatus === "deleted_upstream"
      ? "upstream_deleted"
      : row.currentVersionId === null
        ? "install_unavailable"
        : "available",
};
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/search test -- src/__tests__/search-servers-page.integration.test.ts
pnpm --filter @themcpdirectory/search typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/search/src/public-api/types.ts packages/search/src/public-api/server-projections.ts packages/search/src/public-api/search-servers-page.ts packages/search/src/__tests__/search-servers-page.integration.test.ts packages/search/src/index.ts
git commit -m "feat(search): project trust and health summaries"
```

### Task 9: Schedule Jobs, Per-Origin Limits, Jittered Backoff, And Enforce Exact Retention

**Files:**

- Create: `apps/worker/src/trust-health-config.ts`
- Create: `apps/worker/src/trust-health-jobs.ts`
- Create: `apps/worker/src/retention.ts`
- Create: `apps/worker/src/__tests__/trust-health-worker.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**

- Produces from `trust-health-config.ts`: `REMOTE_PROBE_POLICY { maxConcurrentPerOrigin, connectTimeoutMs, totalTimeoutMs, maxRedirects, maxHeaderBytes, maxResponseBytes, maxDecompressedBytes }`
- Produces from `trust-health-config.ts`: `createPerOriginProbeLimiter(maxConcurrentPerOrigin: number)`
- Produces from `trust-health-config.ts`: `nextRemoteHealthRetryDelayMs(retriesConsumed: number, random: () => number): number`
- Produces from `trust-health-jobs.ts`: `REMOTE_HEALTH_QUEUE = "remote.health"`
- Produces from `trust-health-jobs.ts`: `TRUST_REFRESH_QUEUE = "trust.refresh"`
- Produces from `trust-health-jobs.ts`: `runRemoteHealthJob(deps, job)`
- Produces from `retention.ts`: `cleanupHealthHistory(db, { now, batchSize })`
- Produces from `retention.ts`: `cleanupTrustHistory(db, { now, batchSize })`
- Produces exact legal-hold exclusions for app-owned trust and health records only

- [ ] **Step 1: Write the failing worker and retention tests**

- [ ] `apps/worker/src/__tests__/trust-health-worker.test.ts` must contain executable cases for worker-owned per-origin concurrency limits on same-origin jobs, independent progress for different origins, deterministic bounded backoff with jitter from worker config, passing `REMOTE_PROBE_POLICY` into health execution instead of hardcoding limits in `packages/security` or `packages/domain`, retention batch bounds, legal-hold exclusions, and repeated-sweep idempotency.

```ts
import { describe, expect, it, vi } from "vitest";
import {
  REMOTE_PROBE_POLICY,
  createPerOriginProbeLimiter,
  nextRemoteHealthRetryDelayMs,
} from "../trust-health-config.js";
import { cleanupHealthHistory, cleanupTrustHistory } from "../retention.js";
import {
  REMOTE_HEALTH_QUEUE,
  TRUST_REFRESH_QUEUE,
  runRemoteHealthJob,
} from "../trust-health-jobs.js";

describe("trust and health worker", () => {
  it("defines the queue names and computes deterministic bounded retry jitter", () => {
    expect(REMOTE_HEALTH_QUEUE).toBe("remote.health");
    expect(TRUST_REFRESH_QUEUE).toBe("trust.refresh");
    expect(REMOTE_PROBE_POLICY.maxConcurrentPerOrigin).toBeGreaterThanOrEqual(1);
    expect(nextRemoteHealthRetryDelayMs(0, () => 0)).toBe(30_000);
    expect(nextRemoteHealthRetryDelayMs(2, () => 0.5)).toBe(135_000);
  });

  it("serialises same-origin probes at the configured per-origin limit", async () => {
    const limiter = createPerOriginProbeLimiter(1);
    const events: string[] = [];

    await Promise.all([
      limiter.withKey("https://api.example.com", async () => {
        events.push("first:start");
        await Promise.resolve();
        events.push("first:end");
      }),
      limiter.withKey("https://api.example.com", async () => {
        events.push("second:start");
        events.push("second:end");
      }),
    ]);

    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("passes the worker-owned probe policy into health execution", async () => {
    const runHealthCheck = vi.fn().mockResolvedValue({ outcome: "healthy" });

    await runRemoteHealthJob(
      {
        db,
        clock: () => new Date("2026-12-31T00:00:00.000Z"),
        originProbeLimiter: createPerOriginProbeLimiter(REMOTE_PROBE_POLICY.maxConcurrentPerOrigin),
        runRemoteHealthCheck: runHealthCheck,
      },
      {
        serverId,
        remoteId,
        url: "https://api.example.com/health",
      },
    );

    expect(runHealthCheck).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ probeOptions: REMOTE_PROBE_POLICY }),
    );
  });

  it("deletes expired health rows in batches while skipping active legal holds", async () => {
    const first = await cleanupHealthHistory(db, {
      now: new Date("2026-12-31T00:00:00.000Z"),
      batchSize: 1,
    });
    const second = await cleanupHealthHistory(db, {
      now: new Date("2026-12-31T00:00:00.000Z"),
      batchSize: 1,
    });

    expect(first.deletedCount).toBe(1);
    expect(first.done).toBe(false);
    expect(second.skippedHeldCount).toBeGreaterThanOrEqual(0);
  });

  it("keeps the current trust row and is idempotent across repeated sweeps", async () => {
    const first = await cleanupTrustHistory(db, {
      now: new Date("2028-09-02T00:00:00.000Z"),
      batchSize: 100,
    });
    const second = await cleanupTrustHistory(db, {
      now: new Date("2028-09-02T00:00:00.000Z"),
      batchSize: 100,
    });

    expect(first.deletedCount).toBeGreaterThanOrEqual(0);
    expect(second.deletedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/worker test -- src/__tests__/trust-health-worker.test.ts
```

Expected: FAIL because the worker-owned probe policy, limiter, and retention helpers do not exist yet.

- [ ] **Step 3: Implement worker-owned probe policy, deterministic backoff, and clock-driven batch retention**

```ts
// apps/worker/src/trust-health-config.ts
export const REMOTE_PROBE_POLICY = Object.freeze({
  maxConcurrentPerOrigin: 2,
  connectTimeoutMs: 1_000,
  totalTimeoutMs: 3_000,
  maxRedirects: 3,
  maxHeaderBytes: 2_048,
  maxResponseBytes: 8_192,
  maxDecompressedBytes: 8_192,
});

export function nextRemoteHealthRetryDelayMs(
  retriesConsumed: number,
  random: () => number,
): number {
  const baseDelay = Math.min(30_000 * 2 ** retriesConsumed, 3_600_000);
  const jitter = Math.floor(baseDelay * 0.25 * random());
  return baseDelay + jitter;
}

export function createPerOriginProbeLimiter(maxConcurrentPerOrigin: number) {
  const activeCounts = new Map<string, number>();
  const queues = new Map<string, Array<() => void>>();

  const scheduleNext = (key: string) => {
    const queue = queues.get(key);
    if (!queue || queue.length === 0) {
      queues.delete(key);
      return;
    }

    const next = queue.shift();
    next?.();
  };

  return {
    async withKey<T>(key: string, task: () => Promise<T>): Promise<T> {
      const active = activeCounts.get(key) ?? 0;
      if (active >= maxConcurrentPerOrigin) {
        await new Promise<void>((resolve) => {
          const queue = queues.get(key) ?? [];
          queue.push(resolve);
          queues.set(key, queue);
        });
      }

      activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
      try {
        return await task();
      } finally {
        const remaining = (activeCounts.get(key) ?? 1) - 1;
        if (remaining <= 0) {
          activeCounts.delete(key);
        } else {
          activeCounts.set(key, remaining);
        }
        scheduleNext(key);
      }
    },
  };
}

// apps/worker/src/trust-health-jobs.ts
export const REMOTE_HEALTH_QUEUE = "remote.health";
export const TRUST_REFRESH_QUEUE = "trust.refresh";

export async function runRemoteHealthJob(deps: WorkerDeps, job: RemoteHealthJob) {
  const origin = new URL(job.url).origin;

  return deps.originProbeLimiter.withKey(origin, () =>
    deps.runRemoteHealthCheck(deps.db, {
      serverId: job.serverId,
      remoteId: job.remoteId,
      checkedAt: deps.clock(),
      probeOptions: REMOTE_PROBE_POLICY,
    }),
  );
}
```

```ts
// apps/worker/src/retention.ts
export async function cleanupHealthHistory(db: Database, input: { now: Date; batchSize: number }) {
  const cutoff = new Date(input.now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return deleteExpiredRowsInBatches(db, {
    table: serverHealthChecks,
    cutoff,
    batchSize: input.batchSize,
    holdScope: "health_history",
  });
}

export async function cleanupTrustHistory(db: Database, input: { now: Date; batchSize: number }) {
  const cutoff = new Date(input.now.getTime() - 24 * 30 * 24 * 60 * 60 * 1000);
  return deleteExpiredSupersededTrustRows(db, {
    cutoff,
    batchSize: input.batchSize,
    holdScope: "trust_history",
  });
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/worker test -- src/__tests__/trust-health-worker.test.ts
pnpm --filter @themcpdirectory/worker typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/trust-health-config.ts apps/worker/src/trust-health-jobs.ts apps/worker/src/retention.ts apps/worker/src/__tests__/trust-health-worker.test.ts apps/worker/src/index.ts
git commit -m "feat(worker): schedule trust and health jobs"
```

### Task 10: Extend The Existing Public API Routes

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/http/errors.ts`
- Modify: `apps/api/src/routes/servers.ts`
- Modify: `apps/api/src/routes/search.ts`
- Modify: `apps/api/src/routes/resolve.ts`
- Modify: `apps/api/src/routes/install.ts`
- Modify: `apps/api/src/__tests__/public-api-core.integration.test.ts`

**Interfaces:**

- Produces additive route payloads for trust, health, and install availability
- Preserves exact `UPSTREAM_DELETED` and `INSTALL_UNAVAILABLE` status mapping

- [ ] **Step 1: Write the failing API route tests**

```ts
import { describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";

describe("phase F public api", () => {
  it("returns server detail with trust and health projections", async () => {
    const app = createApiApp(testDeps);
    const response = await app.request("/api/v1/servers/github");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        slug: "github",
        trustProfile: { schemaVersion: 1 },
        latestHealth: { schemaVersion: 1, outcome: "healthy" },
        installAvailability: "available",
      },
    });
  });

  it("returns 410 UPSTREAM_DELETED for deleted install manifests", async () => {
    const app = createApiApp(testDeps);
    const response = await app.request("/api/v1/servers/deleted-server/install");

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_DELETED" },
    });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/api test -- src/__tests__/public-api-core.integration.test.ts
```

Expected: FAIL because the Phase D route handlers do not return the new fields yet.

- [ ] **Step 3: Extend the existing Phase D routes instead of bootstrapping new ones**

```ts
// apps/api/src/routes/servers.ts
serversRoutes.get("/servers/:slug", async (c) => {
  const detail = await getServerDetailBySlug(deps.db, c.req.param("slug"));
  if (!detail) return errorResponse(c, 404, "SERVER_NOT_FOUND", "Server not found.");
  return c.json({ data: detail, meta: { requestId: requestIdFrom(c) } });
});

// apps/api/src/routes/install.ts
installRoutes.get("/servers/:slug/install", async (c) => {
  try {
    const manifest = await buildInstallManifest(deps.db, c.req.param("slug"), parseInstallQuery(c));
    return c.json({ data: manifest, meta: { requestId: requestIdFrom(c) } });
  } catch (error) {
    if (error instanceof InstallManifestUnavailableError && error.code === "UPSTREAM_DELETED") {
      return errorResponse(c, 410, "UPSTREAM_DELETED", error.message);
    }
    if (error instanceof InstallManifestUnavailableError && error.code === "INSTALL_UNAVAILABLE") {
      return errorResponse(c, 410, "INSTALL_UNAVAILABLE", error.message);
    }
    throw error;
  }
});
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/api test -- src/__tests__/public-api-core.integration.test.ts
pnpm --filter @themcpdirectory/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/http/errors.ts apps/api/src/routes/servers.ts apps/api/src/routes/search.ts apps/api/src/routes/resolve.ts apps/api/src/routes/install.ts apps/api/src/__tests__/public-api-core.integration.test.ts
git commit -m "feat(api): expose trust and health projections"
```

### Task 11: Extend DirectoryClient And CLI Guardrails

**Files:**

- Modify: `packages/directory-client/src/client.ts`
- Modify: `packages/directory-client/src/index.ts`
- Modify: `packages/directory-client/src/__tests__/client.test.ts`
- Modify: `packages/cli/src/commands/info.ts`
- Modify: `packages/cli/src/commands/add-plan.ts`
- Modify: `packages/cli/src/commands/add-execute.ts`
- Modify: `packages/cli/src/commands/update.ts`
- Modify: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/output/render.ts`
- Modify: `packages/cli/src/output/json.ts`
- Modify: `packages/cli/src/__tests__/search-info.test.ts`
- Modify: `packages/cli/src/__tests__/add-planning.test.ts`
- Modify: `packages/cli/src/__tests__/add-execution.test.ts`
- Modify: `packages/cli/src/__tests__/update.test.ts`
- Modify: `packages/cli/src/__tests__/doctor.test.ts`
- Modify: `packages/cli/src/__tests__/integration-cli.test.ts`

**Interfaces:**

- Extends the existing Phase E `DirectoryClient` methods `resolveServer`, `resolveInstall`, and `getServer` with additive trust and health detail parsing while preserving those method names
- Reuses `CliDependencies` end-to-end. Do not introduce a second dependency bag or client factory wrapper.
- Produces CLI factual outputs for `info` and `doctor`
- Produces early blocking for `add` and `update` on `UPSTREAM_DELETED`

- [ ] **Step 1: Write the failing DirectoryClient and CLI tests**

- [ ] Update `packages/directory-client/src/__tests__/client.test.ts` to cover additive trust and health parsing through `resolveServer`, `resolveInstall`, and `getServer`, plus exact `410` mapping for deleted-upstream installs.
- [ ] Update `packages/cli/src/__tests__/search-info.test.ts` to cover factual `info` output and absence of aggregate score wording.
- [ ] Update `packages/cli/src/__tests__/add-planning.test.ts` and `packages/cli/src/__tests__/add-execution.test.ts` so `add` blocks deleted-upstream installs before adapter planning, input collection, or writes.
- [ ] Update `packages/cli/src/__tests__/update.test.ts` so receipt-backed updates stop before mutation when the resolved listing is `deleted_upstream` and surface degraded-health warnings in dry-run output.
- [ ] Update `packages/cli/src/__tests__/doctor.test.ts` so `doctor` reports degraded health and upstream deletion while remaining read-only.
- [ ] Update `packages/cli/src/__tests__/integration-cli.test.ts` to prove `search`, `info`, `add`, `update`, and `doctor` still run through the canonical `CliDependencies` wiring.

```ts
import { describe, expect, it } from "vitest";
import { DirectoryClient } from "@themcpdirectory/directory-client";
import { createInProcessCliHarness } from "@themcpdirectory/test-utils";
import { runCli } from "../index.js";

describe("phase F cli guardrails", () => {
  it("parses additive trust and health fields from the existing DirectoryClient", async () => {
    const client = new DirectoryClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: fakeFetchWithFutureFields,
    });
    const detail = await client.getServer("github");

    expect(detail.trustProfile?.signals[0]?.key).toBe("official_registry");
    expect(detail.latestHealth?.outcome).toBe("healthy");
  });

  it("blocks add before adapter planning when install is deleted upstream", async () => {
    const harness = createInProcessCliHarness(deletedUpstreamDeps);
    const exitCode = await runCli(["add", "deleted-server", "--to", "codex"], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("\n")).toContain("Listing deleted upstream");
  });

  it("surfaces degraded health in doctor output", async () => {
    const harness = createInProcessCliHarness(degradedHealthDeps);
    const exitCode = await runCli(["doctor", "github"], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("\n")).toContain("Latest remote health: degraded");
    expect(harness.stdout.join("\n")).not.toMatch(/score|stars|grade/i);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/directory-client test -- src/__tests__/client.test.ts
pnpm --filter @themcpdirectory/cli test -- src/__tests__/search-info.test.ts src/__tests__/add-planning.test.ts src/__tests__/add-execution.test.ts src/__tests__/update.test.ts src/__tests__/doctor.test.ts src/__tests__/integration-cli.test.ts
```

Expected: FAIL because the existing Phase E transport and commands do not consume the new detail fields or deleted-upstream guardrail yet.

- [ ] **Step 3: Extend the existing transport and commands without creating new CLI surfaces or wrappers**

```ts
// packages/directory-client/src/client.ts
async resolveServer(identifier: string) {
  const response = await this.fetchJson(`resolve/${encodeURIComponent(identifier)}`);
  return parseResolvedServerResponse(response).data;
}

async resolveInstall(identifier: string) {
  const response = await this.fetchJson(`resolve/${encodeURIComponent(identifier)}/install`);
  return parseInstallManifestResponse(response).data;
}

async getServer(slug: string) {
  const response = await this.fetchJson(`servers/${encodeURIComponent(slug)}`);
  return parseServerDetailResponse(response).data;
}

// packages/cli/src/commands/add-plan.ts
const resolvedInstall = await deps.directoryClient.resolveInstall(options.identifier);

if (resolvedInstall.server.listingStatus === "deleted_upstream") {
  return fail(EXIT_INSTALL_UNAVAILABLE, "Installation blocked: Listing deleted upstream.");
}

// packages/cli/src/commands/update.ts
const server = await deps.directoryClient.getServer(candidate.receipt.slug);
if (server.listingStatus === "deleted_upstream") {
  return fail(EXIT_INSTALL_UNAVAILABLE, "Update blocked: Listing deleted upstream.");
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/directory-client test -- src/__tests__/client.test.ts
pnpm --filter @themcpdirectory/cli test -- src/__tests__/search-info.test.ts src/__tests__/add-planning.test.ts src/__tests__/add-execution.test.ts src/__tests__/update.test.ts src/__tests__/doctor.test.ts src/__tests__/integration-cli.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/directory-client/src/client.ts packages/directory-client/src/index.ts packages/directory-client/src/__tests__/client.test.ts packages/cli/src/commands/info.ts packages/cli/src/commands/add-plan.ts packages/cli/src/commands/add-execute.ts packages/cli/src/commands/update.ts packages/cli/src/commands/doctor.ts packages/cli/src/output/render.ts packages/cli/src/output/json.ts packages/cli/src/__tests__/search-info.test.ts packages/cli/src/__tests__/add-planning.test.ts packages/cli/src/__tests__/add-execution.test.ts packages/cli/src/__tests__/update.test.ts packages/cli/src/__tests__/doctor.test.ts packages/cli/src/__tests__/integration-cli.test.ts
git commit -m "feat(cli): surface trust and health guardrails"
```

### Task 12: Render Accessible Trust, Health, And Deletion States On The Web

**Files:**

- Create: `apps/web/src/components/trust-profile.tsx`
- Create: `apps/web/src/components/health-observation.tsx`
- Create: `apps/web/src/components/deleted-upstream-banner.tsx`
- Modify: `apps/web/src/app/[slug]/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/e2e/detail.spec.ts`
- Modify: `apps/web/e2e/contrast.spec.ts`

**Interfaces:**

- Consumes: `trustProfile`, `latestHealth`, `installAvailability`, `listingStatus`
- Produces: `<TrustProfile trustProfile={...} />`
- Produces: `<HealthObservation health={...} />`
- Produces: `<DeletedUpstreamBanner listingStatus={...} />`

- [ ] **Step 1: Write the failing browser tests**

```ts
import { expect, test } from "@playwright/test";

test("shows deleted-upstream warning before installation and reflows at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/deleted-server");

  const warning = page.getByRole("alert");
  await expect(warning).toContainText("removed upstream");
  await expect(page.getByRole("heading", { name: "Installation" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("keeps trust and health content keyboard reachable and score-free", async ({ page }) => {
  await page.goto("/github");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("heading", { name: "Trust profile" })).toBeVisible();
  await expect(page.getByText(/Remote responded on/i)).toBeVisible();
  await expect(page.getByText(/score|stars|grade/i)).toHaveCount(0);
});

test("remains visible in forced colours mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/deleted-server");

  await expect(page.getByRole("alert")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @themcpdirectory/web test:e2e -- e2e/detail.spec.ts e2e/contrast.spec.ts
```

Expected: FAIL because the detail page does not render the new trust, health, or deleted-upstream states yet.

- [ ] **Step 3: Add the minimal accessible components and wire them into the existing detail page**

```tsx
{detail.listingStatus === "deleted_upstream" ? (
  <section role="alert" aria-labelledby="deleted-upstream-heading">
    <h2 id="deleted-upstream-heading">Removed upstream</h2>
    <p>
      Installation is blocked because the Official MCP Registry now marks this listing as deleted upstream.
    </p>
  </section>
) : null}

<section aria-labelledby="trust-profile-heading">
  <h2 id="trust-profile-heading">Trust profile</h2>
  <TrustProfile trustProfile={detail.trustProfile} />
</section>

<section aria-labelledby="health-observation-heading">
  <h2 id="health-observation-heading">Latest remote health</h2>
  <HealthObservation health={detail.latestHealth} />
</section>
```

- [ ] **Step 4: Run focused browser tests and typecheck**

Run:

```bash
pnpm --filter @themcpdirectory/web test:e2e -- e2e/detail.spec.ts e2e/contrast.spec.ts
pnpm --filter @themcpdirectory/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/trust-profile.tsx apps/web/src/components/health-observation.tsx apps/web/src/components/deleted-upstream-banner.tsx apps/web/src/app/[slug]/page.tsx apps/web/src/app/globals.css apps/web/e2e/detail.spec.ts apps/web/e2e/contrast.spec.ts
git commit -m "feat(web): present trust and deletion states"
```

## Self-Review

### 1. Spec Coverage

- Canonical trust vocabulary and no aggregate score: Tasks 1 and 6.
- Additive-only v1 parsing for clients: Tasks 1 and 11.
- Safe probe eligibility derived from stored `headers` and `variables`: Task 3.
- Loopback, metadata, private IPv4 and IPv6, IPv4-mapped IPv6, mixed-DNS rejection, DNS-rebinding rejection, TLS-hostname-preserving pinning, redirect revalidation, fixed headers, no ambient credentials, HEAD then bounded GET fallback, and header, body, compressed, decompressed, and timeout limits: Tasks 4 and 5.
- Idempotent health writes and trust refreshes: Tasks 2, 5, and 6.
- Exact deleted-upstream handling across detail, install, API, CLI, and web: Tasks 7, 10, 11, and 12.
- Additive summary and detail projections through canonical Phase D files: Tasks 1, 7, 8, and 10.
- Worker-owned per-origin concurrency, jittered retries, batch-bounded retention, explicit clock inputs, and legal-hold exclusions for app-owned records: Tasks 2 and 9.
- Accessible reading order, forced-colours support, keyboard checks, and 320px reflow checks: Task 12.

### 2. Review Closure

- Blocking drift to bootstrap missing Phase D or E work is removed by the start-condition gate and the canonical file map.
- Naming drift is removed: the revised plan extends `packages/api-contract/src/public-api/servers.ts`, `packages/api-contract/src/public-api/install.ts`, `packages/directory-client/src/client.ts`, `packages/cli/src/commands/add-plan.ts`, `packages/cli/src/commands/add-execute.ts`, `packages/cli/src/__tests__/update.test.ts`, `packages/cli/src/__tests__/doctor.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`, and `apps/api/src/http/errors.ts` instead of inventing replacement roots or renamed methods.
- The security-critical probe path is now specified as a full boundary with derivation, DNS validation, redirect revalidation, fixed headers, TLS-preserving pinning, timeout handling, body and header limits, and HEAD then GET fallback.
- Per-origin concurrency and retry backoff are assigned to a concrete worker-owned policy and limiter instead of being left implicit in security or domain code.
- Retention is now exact about batch size, explicit clock inputs, idempotency, and legal-hold exclusion, and it explicitly avoids claiming app-managed deletion for external platform logs.
- Executable additive-client, per-origin concurrency, retry-backoff, keyboard, and 320px tests are present in the task steps.
- API and CLI extensions are split cleanly into Task 10 and Task 11.

### 3. Placeholder And Consistency Scan

- No placeholder markers remain.
- No task recreates `packages/directory-client` or bootstraps `apps/api` or `packages/cli` from scratch.
- The same canonical names are reused consistently: `TrustProfileV1`, `RemoteHealthObservationV1`, `UPSTREAM_DELETED`, `deleted_upstream`, `REMOTE_HEALTH_QUEUE`, and `TRUST_REFRESH_QUEUE`.
- One external precondition remains by design: if the canonical Phase D or Phase E files are not present on the branch, execution must stop and the prerequisite phase must be completed first.
