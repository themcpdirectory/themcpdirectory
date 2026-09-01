# Phase H Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the implemented directory, public API, CLI, trust system, and publisher platform into a truthful, documented, accessible, secure, performant, and reproducible release candidate. Phase H is a launch gate. It does not backfill Phase D, Phase E, Phase F, or Phase G feature work.

**Architecture:** Fail closed. Task 1 verifies that approved Phase D-G artefacts, routes, commands, fixtures, and tests already exist and pass. Every later task consumes those verified contracts and route surfaces. If Task 1 fails, stop Phase H immediately and reopen the missing earlier phase. Do not implement missing D-G behaviour inside this plan.

**Tech Stack:** Node.js `>=24 <25`, pnpm `11.17.0`, TypeScript strict mode, Next.js 16 App Router, Hono, PostgreSQL 17, Drizzle ORM, Better Auth, Zod, pg-boss, Vitest, Playwright, `@axe-core/playwright`, Lighthouse, GHCR, Portainer Business Edition, Nginx Proxy Manager.

**Authorities:** `docs/superpowers/specs/2026-09-01-phase-h-launch-design.md`, `docs/superpowers/specs/2026-09-01-phase-d-public-api-design.md`, `docs/superpowers/specs/2026-09-01-phase-e-cli-installation-design.md`, `docs/superpowers/specs/2026-09-01-phase-f-trust-health-design.md`, `docs/superpowers/specs/2026-09-01-phase-g-publisher-platform-design.md`, `docs/ai-docs/engineering-spec.md`, `docs/ai-docs/product-and-technical-spec.md`, `README.md`, `docs/development.md`, `docs/deployment.md`, `SECURITY.md`, `CONTRIBUTING.md`, and the reviewed findings in `/Users/timohaseloff/Library/Application Support/Code/User/workspaceStorage/5669660f6066ba48fda746f0c894a67a/GitHub.copilot-chat/chat-session-resources/32faae66-68f7-406d-8ce1-a60cdedc39ff/call_xAfoKYv5xIktUMkQ1AH8jcmG__vscode-1788291491109/content.json`.

## Phase Boundary And Fail-Closed Rule

- Phase H assumes Phase D public API, Phase E CLI and adapters, Phase F trust and health, and Phase G publisher authentication and dashboard are already merged and green.
- The current repository may still reflect only the Phase A-C foundation. That is expected to fail Task 1 until the earlier phases land.
- Later tasks may add release-only documentation projections, metadata helpers, verification harnesses, and operator runbooks over verified Phase D-G behaviour.
- If a later task discovers the underlying Phase D-G behaviour is absent, misnamed, or untested, stop and move the defect back to the owning phase rather than patching it in Phase H.

## Global Constraints

- Use `pnpm` for install, build, test, pack, and release commands.
- Keep Node pinned to `>=24 <25` and pnpm pinned to `11.17.0`.
- Keep anonymous browsing possible at launch and keep analytics off.
- Do not add advertising, billing, behavioural analytics, fingerprinting, session replay, marketing pixels, or cross-site tracking.
- Privacy and Terms content must remain visibly marked as drafts requiring qualified legal review.
- Legal drafts may identify only:

```text
Estopia Engineering Ltd
3 Braemount
Cowdenbeath
Fife
KY4 9RB
Scotland
United Kingdom
```

- Do not invent a support, privacy, legal, or responsible-disclosure email address.
- Keep the existing disclosure truth from `SECURITY.md`: GitHub private vulnerability reporting is the only direct private reporting channel today when available.
- Keep the current licence and contribution truth until it changes in the repository itself: no open-source licence has been selected yet, and external code contributions are paused.
- Public docs must describe only implemented and test-backed behaviour derived from verified contracts, route metadata, or command metadata.
- `deleted_upstream` remains the canonical listing-status value, and installation remains blocked for deleted upstream listings by default.
- `pnpm verify:release` is the named root release gate.
- Lighthouse release gating runs against a seeded production build, uses pinned Chromium and Lighthouse versions, runs each route three times per profile, and evaluates the median.
- Required Lighthouse medians are `>=95` for performance, accessibility, best practices, and SEO.
- Accessibility target is WCAG 2.2 AA with both automated and manual release gates.
- Dependency audit is triaged release evidence with owner and expiry. Raw `pnpm audit` output alone is not release truth.
- CLI tarball verification starts with `npm pack --dry-run`, then uses `pnpm pack` for the real tarball.
- `README.md`, `docs/development.md`, and `docs/deployment.md` must be extended rather than rewritten from scratch, and must preserve current Portainer, GHCR, npm, backup, pull-and-redeploy, and rollback facts unless those facts change in code or infrastructure.
- Do not publish to npm, create tags, cut GitHub releases, deploy, change DNS, or configure production secrets from Phase H automation.

## Launch Surfaces

- `apps/web/src/components/*`: shared document shell, banners, navigation extensions, and page presentation.
- `apps/web/src/content/*`: typed route, docs, legal, trust, and publisher content assembled from verified contracts.
- `apps/web/src/app/docs/*`, `/security`, `/privacy`, `/terms`, `/about`, `/open-source`, `/publish`, `/advertise`: public launch routes.
- `apps/web/src/lib/metadata.ts` and `apps/web/src/lib/structured-data.ts`: canonical metadata and JSON-LD helpers.
- `apps/web/src/app/robots.ts` and `apps/web/src/app/sitemap.ts`: canonical search-engine exposure.
- `packages/test-utils/src/release-route-matrix.ts`: shared route matrices for accessibility, Lighthouse, and security checks.
- `apps/web/e2e/*.release.spec.ts`: release-facing browser assertions.
- `tooling/release/src/*`: prerequisite checks, Lighthouse harness, security and database release checks, tarball verification, and the composed release gate.
- `docs/release-runbook.md` and `docs/production-authorisation-blockers.md`: operator execution guide and explicit external blockers.

### Task 1: Verify Phase D-G Prerequisites And Fail Closed

**Files:**

- Create: `tooling/release/package.json`
- Create: `tooling/release/src/phase-prerequisites.ts`
- Create: `tooling/release/src/verify-phase-prerequisites.ts`
- Create: `tooling/release/src/__tests__/phase-prerequisites.test.ts`

**Interfaces:**

- Produces: `PHASE_PREREQUISITE_MATRIX`
- Produces: `verifyPhasePrerequisites()`
- Produces: `PhasePrerequisiteFailure`
- Produces: release-tools script `verify:prerequisites`

**Fail-Closed Prerequisite Matrix:**

| Phase | Capability                                                    | Required artefacts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Required route or command probes                                                                                                                                                                                             | Required gate command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D     | Contract schemas and deterministic OpenAPI                    | `packages/api-contract/src/public-api/shared.ts`, `packages/api-contract/src/public-api/errors.ts`, `packages/api-contract/src/public-api/servers.ts`, `packages/api-contract/src/public-api/install.ts`, `packages/api-contract/src/public-api/discovery.ts`, `packages/api-contract/src/public-api/openapi.ts`, `packages/api-contract/src/index.ts`, `packages/api-contract/src/__tests__/shared-contract.test.ts`, `packages/api-contract/src/__tests__/client-parsers.test.ts`, `packages/api-contract/src/__tests__/servers-contract.test.ts`, `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`, `packages/api-contract/src/__tests__/openapi.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `GET /api/v1/openapi.json`, `GET /api/v1/servers/github`, `GET /api/v1/resolve/github/install`, `GET /api/v1/clients/codex`                                                                                                  | `pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/shared-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts && pnpm --filter @themcpdirectory/api-contract typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D     | Search pagination and ranking                                 | `packages/search/src/public-api/types.ts`, `packages/search/src/public-api/query-fingerprint.ts`, `packages/search/src/public-api/cursor.ts`, `packages/search/src/public-api/server-projections.ts`, `packages/search/src/public-api/search-servers-page.ts`, `packages/search/src/__tests__/cursor.test.ts`, `packages/search/src/__tests__/search-servers-page.integration.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `GET /api/v1/servers?limit=30`, `GET /api/v1/search?q=github`, `GET /api/v1/servers?sort=recent`                                                                                                                             | `pnpm --filter @themcpdirectory/search test -- src/__tests__/cursor.test.ts src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/search typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D     | Public detail, resolve, install, and discovery projections    | `packages/domain/src/public-api/server-detail.ts`, `packages/domain/src/public-api/resolve-server-identifier.ts`, `packages/domain/src/public-api/install-manifest.ts`, `packages/domain/src/public-api/categories.ts`, `packages/domain/src/public-api/publishers.ts`, `packages/domain/src/public-api/clients.ts`, `packages/domain/src/public-api/__tests__/server-detail.integration.test.ts`, `packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts`, `packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts`, `packages/domain/src/public-api/__tests__/discovery.integration.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `GET /api/v1/servers/github`, `GET /api/v1/resolve/github-server`, `GET /api/v1/resolve/github/install`, `GET /api/v1/categories`, `GET /api/v1/publishers/github`, `GET /api/v1/clients`                                    | `pnpm --filter @themcpdirectory/domain test:integration -- src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts src/public-api/__tests__/discovery.integration.test.ts && pnpm --filter @themcpdirectory/domain typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D     | API middleware, routes, and empty-database behaviour          | `apps/api/src/app.ts`, `apps/api/src/http/request-id.ts`, `apps/api/src/http/errors.ts`, `apps/api/src/http/logging.ts`, `apps/api/src/http/rate-limit.ts`, `apps/api/src/http/cors.ts`, `apps/api/src/http/cache.ts`, `apps/api/src/routes/servers.ts`, `apps/api/src/routes/search.ts`, `apps/api/src/routes/resolve.ts`, `apps/api/src/routes/install.ts`, `apps/api/src/routes/categories.ts`, `apps/api/src/routes/publishers.ts`, `apps/api/src/routes/clients.ts`, `apps/api/src/__tests__/middleware.test.ts`, `apps/api/src/__tests__/error-boundary.test.ts`, `apps/api/src/__tests__/public-api-core.integration.test.ts`, `apps/api/src/__tests__/public-api-discovery.integration.test.ts`, `apps/api/src/__tests__/empty-database.integration.test.ts`, `apps/api/src/index.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `GET /api/v1/servers`, `GET /api/v1/search?q=github`, `GET /api/v1/resolve/github-server`, `GET /api/v1/servers/github/install`, `GET /api/v1/categories`, `GET /api/v1/clients`, freshly migrated empty-database boot smoke | `pnpm --filter @themcpdirectory/api test -- src/__tests__/middleware.test.ts src/__tests__/error-boundary.test.ts src/__tests__/public-api-core.integration.test.ts src/__tests__/public-api-discovery.integration.test.ts src/__tests__/empty-database.integration.test.ts src/index.test.ts && pnpm --filter @themcpdirectory/api typecheck && pnpm --filter @themcpdirectory/api build && pnpm --filter @themcpdirectory/config test -- src/env.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E     | Directory transport layer                                     | `packages/directory-client/src/errors.ts`, `packages/directory-client/src/client.ts`, `packages/directory-client/src/fixtures.ts`, `packages/directory-client/src/index.ts`, `packages/directory-client/src/__tests__/client.test.ts`, `packages/test-utils/src/directory-api-server.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `GET /api/v1/resolve/github-server`, `GET /api/v1/resolve/github/install`, `GET /api/v1/search?q=github-server`, `GET /api/v1/clients`                                                                                       | `pnpm --filter @themcpdirectory/directory-client exec vitest run src/__tests__/client.test.ts && pnpm --filter @themcpdirectory/directory-client typecheck && pnpm --filter @themcpdirectory/test-utils typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E     | Install intent resolution and plan validation                 | `packages/install-engine/src/semver.ts`, `packages/install-engine/src/errors.ts`, `packages/install-engine/src/types.ts`, `packages/install-engine/src/select-variant.ts`, `packages/install-engine/src/input-resolution.ts`, `packages/install-engine/src/intent.ts`, `packages/install-engine/src/hash.ts`, `packages/install-engine/src/validate-plan.ts`, `packages/install-engine/src/__tests__/semver.test.ts`, `packages/install-engine/src/__tests__/select-variant.test.ts`, `packages/install-engine/src/__tests__/input-resolution.test.ts`, `packages/install-engine/src/__tests__/intent.test.ts`, `packages/install-engine/src/__tests__/validate-plan.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `mcpdir add github-server --dry-run --json`, `mcpdir add github-server --to codex --dry-run --json`                                                                                                                          | `pnpm --filter @themcpdirectory/install-engine exec vitest run src/__tests__/semver.test.ts src/__tests__/select-variant.test.ts src/__tests__/input-resolution.test.ts src/__tests__/intent.test.ts src/__tests__/validate-plan.test.ts && pnpm --filter @themcpdirectory/install-engine typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E     | Client adapters                                               | `packages/client-adapters/src/catalog.ts`, `packages/client-adapters/src/types.ts`, `packages/client-adapters/src/runtime.ts`, `packages/client-adapters/src/registry.ts`, `packages/client-adapters/src/codex.ts`, `packages/client-adapters/src/claude-code.ts`, `packages/client-adapters/src/cursor-json.ts`, `packages/client-adapters/src/cursor-deeplink.ts`, `packages/client-adapters/src/cursor.ts`, `packages/client-adapters/src/index.ts`, `packages/client-adapters/src/__tests__/catalog.test.ts`, `packages/client-adapters/src/__tests__/registry.test.ts`, `packages/client-adapters/src/__tests__/codex.test.ts`, `packages/client-adapters/src/__tests__/claude-code.test.ts`, `packages/client-adapters/src/__tests__/cursor.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `mcpdir add github-server --to codex --dry-run --json`, `mcpdir add github-server --to claude-code --dry-run --json`, `mcpdir add github-server --to cursor --dry-run --json`, `mcpdir doctor --json`                        | `pnpm --filter @themcpdirectory/client-adapters test -- src/__tests__/catalog.test.ts src/__tests__/registry.test.ts src/__tests__/codex.test.ts src/__tests__/claude-code.test.ts src/__tests__/cursor.test.ts && pnpm --filter @themcpdirectory/client-adapters typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E     | CLI command surface, receipts, and built binary smoke         | `packages/cli/tsconfig.build.json`, `packages/cli/src/config/runtime.ts`, `packages/cli/src/config/state-paths.ts`, `packages/cli/src/config/file-lock.ts`, `packages/cli/src/config/receipt-store.ts`, `packages/cli/src/output/redaction.ts`, `packages/cli/src/output/render.ts`, `packages/cli/src/output/json.ts`, `packages/cli/src/commands/result.ts`, `packages/cli/src/commands/search.ts`, `packages/cli/src/commands/info.ts`, `packages/cli/src/commands/add-plan.ts`, `packages/cli/src/commands/add-execute.ts`, `packages/cli/src/commands/list.ts`, `packages/cli/src/commands/remove.ts`, `packages/cli/src/commands/update.ts`, `packages/cli/src/commands/doctor.ts`, `packages/cli/src/cli.ts`, `packages/cli/src/index.ts`, `packages/cli/src/__tests__/state-paths.test.ts`, `packages/cli/src/__tests__/receipt-store.test.ts`, `packages/cli/src/__tests__/search-info.test.ts`, `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/list-remove.test.ts`, `packages/cli/src/__tests__/update.test.ts`, `packages/cli/src/__tests__/doctor.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`, `packages/cli/src/__tests__/binary-smoke.test.ts`                                                                                                                       | `mcpdir search github-server --json`, `mcpdir info github-server --json`, `mcpdir add github-server --dry-run --json`, `mcpdir list --json`, `mcpdir doctor --json`, built `mcpdir --help` smoke                             | `pnpm test:cli && pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/integration-cli.test.ts src/__tests__/binary-smoke.test.ts && pnpm --filter @themcpdirectory/cli typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F     | Remote probe transport hardening                              | `packages/security/src/url.ts`, `packages/security/src/remote-probe.ts`, `packages/security/src/index.ts`, `packages/security/src/__tests__/remote-probe.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | bounded HTTPS probe classification, redirect revalidation, DNS pinning, private-address rejection                                                                                                                            | `pnpm --filter @themcpdirectory/security test -- src/__tests__/remote-probe.test.ts && pnpm --filter @themcpdirectory/security typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F     | Trust, health, public projection, and worker retention        | `packages/domain/src/health/remote-probe-eligibility.ts`, `packages/domain/src/health/run-remote-health-check.ts`, `packages/domain/src/health/get-latest-remote-health.ts`, `packages/domain/src/trust/refresh-trust-profile.ts`, `packages/domain/src/trust/get-current-trust-profile.ts`, `packages/domain/src/public-api/server-detail.ts`, `packages/domain/src/public-api/resolve-server-identifier.ts`, `packages/domain/src/public-api/install-manifest.ts`, `packages/search/src/public-api/types.ts`, `packages/search/src/public-api/server-projections.ts`, `packages/search/src/public-api/search-servers-page.ts`, `apps/worker/src/trust-health-config.ts`, `apps/worker/src/trust-health-jobs.ts`, `apps/worker/src/retention.ts`, `apps/worker/src/__tests__/trust-health-worker.test.ts`, `packages/domain/src/health/__tests__/remote-probe-eligibility.test.ts`, `packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts`, `packages/domain/src/trust/__tests__/refresh-trust-profile.integration.test.ts`, `packages/domain/src/public-api/__tests__/server-detail.integration.test.ts`, `packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts`, `packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts`, `packages/search/src/__tests__/search-servers-page.integration.test.ts` | server detail includes `trustProfile`, `latestHealth`, and `installAvailability`; deleted-upstream install returns `410 UPSTREAM_DELETED`; search excludes `deleted_upstream` by default                                     | `pnpm --filter @themcpdirectory/domain test -- src/health/__tests__/remote-probe-eligibility.test.ts src/health/__tests__/run-remote-health-check.integration.test.ts src/trust/__tests__/refresh-trust-profile.integration.test.ts src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts && pnpm --filter @themcpdirectory/domain typecheck && pnpm --filter @themcpdirectory/search test -- src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/search typecheck && pnpm --filter @themcpdirectory/worker test -- src/__tests__/trust-health-worker.test.ts && pnpm --filter @themcpdirectory/worker typecheck && pnpm --filter @themcpdirectory/directory-client test -- src/__tests__/client.test.ts && pnpm --filter @themcpdirectory/cli typecheck && pnpm --filter @themcpdirectory/web test:e2e -- e2e/detail.spec.ts e2e/contrast.spec.ts` |
| G     | Better Auth runtime and GitHub App verification               | `packages/auth/src/better-auth.ts`, `packages/auth/src/capabilities.ts`, `packages/auth/src/session.ts`, `packages/auth/src/request-guards.ts`, `packages/auth/src/__tests__/better-auth.test.ts`, `packages/auth/src/__tests__/capabilities.test.ts`, `packages/auth/src/__tests__/github-oauth-flow.integration.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `/sign-in`, Better Auth session cookie handling, GitHub App callback replay and expiry rejection                                                                                                                             | `pnpm --filter @themcpdirectory/auth test -- src/__tests__/better-auth.test.ts src/__tests__/capabilities.test.ts src/__tests__/github-oauth-flow.integration.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| G     | Publisher claims, memberships, export, erasure, and workers   | `packages/domain/src/publisher/dashboard.ts`, `packages/domain/src/publisher/memberships.ts`, `packages/domain/src/publisher/audit.ts`, `packages/domain/src/publisher/github-app-client.ts`, `packages/domain/src/publisher/claims.ts`, `packages/domain/src/publisher/account-export.ts`, `packages/domain/src/publisher/account-erasure.ts`, `packages/domain/src/publisher/trust-refresh.ts`, `packages/domain/src/publisher/retention.ts`, `packages/domain/src/publisher/__tests__/dashboard.integration.test.ts`, `packages/domain/src/publisher/__tests__/memberships.integration.test.ts`, `packages/domain/src/publisher/__tests__/claims.integration.test.ts`, `packages/domain/src/publisher/__tests__/account-export.integration.test.ts`, `packages/domain/src/publisher/__tests__/account-erasure.integration.test.ts`, `apps/worker/src/publisher-outbox-worker.ts`, `apps/worker/src/publisher-erasure-worker.ts`, `apps/worker/src/publisher-retention-worker.ts`, `apps/worker/src/__tests__/publisher-outbox-worker.test.ts`, `apps/worker/src/__tests__/publisher-erasure-worker.test.ts`, `apps/worker/src/__tests__/publisher-retention-worker.test.ts`                                                                                                                                                                                                             | claim verify start, claim verify callback, claim withdrawal, export endpoint, erasure endpoint, outbox delivery, retention sweep                                                                                             | `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/dashboard.integration.test.ts src/publisher/__tests__/memberships.integration.test.ts src/publisher/__tests__/claims.integration.test.ts src/publisher/__tests__/account-export.integration.test.ts src/publisher/__tests__/account-erasure.integration.test.ts && pnpm --filter @themcpdirectory/worker test -- src/__tests__/publisher-outbox-worker.test.ts src/__tests__/publisher-erasure-worker.test.ts src/__tests__/publisher-retention-worker.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G     | Publisher web routes and deterministic authenticated fixtures | `apps/web/src/app/api/auth/[...all]/route.ts`, `apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts`, `apps/web/src/app/api/publisher/v1/session/route.ts`, `apps/web/src/app/api/publisher/v1/claims/route.ts`, `apps/web/src/app/api/publisher/v1/claims/[claimId]/verify/route.ts`, `apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts`, `apps/web/src/app/api/publisher/v1/claims/[claimId]/withdraw/route.ts`, `apps/web/src/app/api/publisher/v1/memberships/[membershipId]/route.ts`, `apps/web/src/app/api/publisher/v1/account/export/route.ts`, `apps/web/src/app/api/publisher/v1/account/erasure/route.ts`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/dashboard/layout.tsx`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/dashboard/listings/[id]/page.tsx`, `apps/web/e2e/setup/publisher-session-fixtures.ts`, `apps/web/e2e/publisher-auth.spec.ts`, `apps/web/e2e/publisher-dashboard.spec.ts`, `apps/web/e2e/publisher-claims.spec.ts`, `apps/web/e2e/contrast.spec.ts`                                                                                                                                                                                                                                                                                                                                                   | `/sign-in`, authenticated `/dashboard`, authenticated `/dashboard/listings/11111111-1111-4111-8111-111111111111`, same-origin publisher mutations, export and erasure flows                                                  | `pnpm --filter @themcpdirectory/web test:e2e -- publisher-auth.spec.ts publisher-dashboard.spec.ts publisher-claims.spec.ts contrast.spec.ts && pnpm --filter @themcpdirectory/web typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

- [ ] **Step 1: Write the failing prerequisite-gate test**

```ts
import { describe, expect, it } from "vitest";
import { PHASE_PREREQUISITE_MATRIX } from "../phase-prerequisites";

describe("phase H prerequisite gate", () => {
  it("tracks the canonical D-G prerequisite surfaces in order", () => {
    expect(PHASE_PREREQUISITE_MATRIX.map((entry) => `${entry.phase}:${entry.capability}`)).toEqual([
      "D:Contract schemas and deterministic OpenAPI",
      "D:Search pagination and ranking",
      "D:Public detail, resolve, install, and discovery projections",
      "D:API middleware, routes, and empty-database behaviour",
      "E:Directory transport layer",
      "E:Install intent resolution and plan validation",
      "E:Client adapters",
      "E:CLI command surface, receipts, and built binary smoke",
      "F:Remote probe transport hardening",
      "F:Trust, health, public projection, and worker retention",
      "G:Better Auth runtime and GitHub App verification",
      "G:Publisher claims, memberships, export, erasure, and workers",
      "G:Publisher web routes and deterministic authenticated fixtures",
    ]);
  });
});
```

- [ ] **Step 2: Run the prerequisite-gate test to verify it fails**

Run: `pnpm --filter @themcpdirectory/release-tools test -- phase-prerequisites.test.ts`

Expected: FAIL because the release-tools package and prerequisite matrix do not exist yet.

- [ ] **Step 3: Write the fail-closed prerequisite verifier**

```ts
export const PHASE_PREREQUISITE_MATRIX = [
  {
    phase: "D",
    capability: "Contract schemas and deterministic OpenAPI",
    artefacts: [
      "packages/api-contract/src/public-api/shared.ts",
      "packages/api-contract/src/public-api/errors.ts",
      "packages/api-contract/src/public-api/servers.ts",
      "packages/api-contract/src/public-api/install.ts",
      "packages/api-contract/src/public-api/discovery.ts",
      "packages/api-contract/src/public-api/openapi.ts",
      "packages/api-contract/src/index.ts",
      "packages/api-contract/src/__tests__/shared-contract.test.ts",
      "packages/api-contract/src/__tests__/client-parsers.test.ts",
      "packages/api-contract/src/__tests__/servers-contract.test.ts",
      "packages/api-contract/src/__tests__/install-discovery-contract.test.ts",
      "packages/api-contract/src/__tests__/openapi.test.ts",
    ],
    probes: [
      "GET /api/v1/openapi.json",
      "GET /api/v1/servers/github",
      "GET /api/v1/resolve/github/install",
      "GET /api/v1/clients/codex",
    ],
    command:
      "pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/shared-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts && pnpm --filter @themcpdirectory/api-contract typecheck",
  },
  {
    phase: "D",
    capability: "Search pagination and ranking",
    artefacts: [
      "packages/search/src/public-api/types.ts",
      "packages/search/src/public-api/query-fingerprint.ts",
      "packages/search/src/public-api/cursor.ts",
      "packages/search/src/public-api/server-projections.ts",
      "packages/search/src/public-api/search-servers-page.ts",
      "packages/search/src/__tests__/cursor.test.ts",
      "packages/search/src/__tests__/search-servers-page.integration.test.ts",
    ],
    probes: [
      "GET /api/v1/servers?limit=30",
      "GET /api/v1/search?q=github",
      "GET /api/v1/servers?sort=recent",
    ],
    command:
      "pnpm --filter @themcpdirectory/search test -- src/__tests__/cursor.test.ts src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/search typecheck",
  },
  {
    phase: "D",
    capability: "Public detail, resolve, install, and discovery projections",
    artefacts: [
      "packages/domain/src/public-api/server-detail.ts",
      "packages/domain/src/public-api/resolve-server-identifier.ts",
      "packages/domain/src/public-api/install-manifest.ts",
      "packages/domain/src/public-api/categories.ts",
      "packages/domain/src/public-api/publishers.ts",
      "packages/domain/src/public-api/clients.ts",
      "packages/domain/src/public-api/__tests__/server-detail.integration.test.ts",
      "packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts",
      "packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts",
      "packages/domain/src/public-api/__tests__/discovery.integration.test.ts",
    ],
    probes: [
      "GET /api/v1/servers/github",
      "GET /api/v1/resolve/github-server",
      "GET /api/v1/resolve/github/install",
      "GET /api/v1/categories",
      "GET /api/v1/publishers/github",
      "GET /api/v1/clients",
    ],
    command:
      "pnpm --filter @themcpdirectory/domain test:integration -- src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts src/public-api/__tests__/discovery.integration.test.ts && pnpm --filter @themcpdirectory/domain typecheck",
  },
  {
    phase: "D",
    capability: "API middleware, routes, and empty-database behaviour",
    artefacts: [
      "apps/api/src/app.ts",
      "apps/api/src/http/request-id.ts",
      "apps/api/src/http/errors.ts",
      "apps/api/src/http/logging.ts",
      "apps/api/src/http/rate-limit.ts",
      "apps/api/src/http/cors.ts",
      "apps/api/src/http/cache.ts",
      "apps/api/src/routes/servers.ts",
      "apps/api/src/routes/search.ts",
      "apps/api/src/routes/resolve.ts",
      "apps/api/src/routes/install.ts",
      "apps/api/src/routes/categories.ts",
      "apps/api/src/routes/publishers.ts",
      "apps/api/src/routes/clients.ts",
      "apps/api/src/__tests__/middleware.test.ts",
      "apps/api/src/__tests__/error-boundary.test.ts",
      "apps/api/src/__tests__/public-api-core.integration.test.ts",
      "apps/api/src/__tests__/public-api-discovery.integration.test.ts",
      "apps/api/src/__tests__/empty-database.integration.test.ts",
      "apps/api/src/index.test.ts",
    ],
    probes: [
      "GET /api/v1/servers",
      "GET /api/v1/search?q=github",
      "GET /api/v1/resolve/github-server",
      "GET /api/v1/servers/github/install",
      "GET /api/v1/categories",
      "GET /api/v1/clients",
      "freshly migrated empty-database boot smoke",
    ],
    command:
      "pnpm --filter @themcpdirectory/api test -- src/__tests__/middleware.test.ts src/__tests__/error-boundary.test.ts src/__tests__/public-api-core.integration.test.ts src/__tests__/public-api-discovery.integration.test.ts src/__tests__/empty-database.integration.test.ts src/index.test.ts && pnpm --filter @themcpdirectory/api typecheck && pnpm --filter @themcpdirectory/api build && pnpm --filter @themcpdirectory/config test -- src/env.test.ts",
  },
  {
    phase: "E",
    capability: "Directory transport layer",
    artefacts: [
      "packages/directory-client/src/errors.ts",
      "packages/directory-client/src/client.ts",
      "packages/directory-client/src/fixtures.ts",
      "packages/directory-client/src/index.ts",
      "packages/directory-client/src/__tests__/client.test.ts",
      "packages/test-utils/src/directory-api-server.ts",
    ],
    probes: [
      "GET /api/v1/resolve/github-server",
      "GET /api/v1/resolve/github/install",
      "GET /api/v1/search?q=github-server",
      "GET /api/v1/clients",
    ],
    command:
      "pnpm --filter @themcpdirectory/directory-client exec vitest run src/__tests__/client.test.ts && pnpm --filter @themcpdirectory/directory-client typecheck && pnpm --filter @themcpdirectory/test-utils typecheck",
  },
  {
    phase: "E",
    capability: "Install intent resolution and plan validation",
    artefacts: [
      "packages/install-engine/src/semver.ts",
      "packages/install-engine/src/errors.ts",
      "packages/install-engine/src/types.ts",
      "packages/install-engine/src/select-variant.ts",
      "packages/install-engine/src/input-resolution.ts",
      "packages/install-engine/src/intent.ts",
      "packages/install-engine/src/hash.ts",
      "packages/install-engine/src/validate-plan.ts",
      "packages/install-engine/src/__tests__/semver.test.ts",
      "packages/install-engine/src/__tests__/select-variant.test.ts",
      "packages/install-engine/src/__tests__/input-resolution.test.ts",
      "packages/install-engine/src/__tests__/intent.test.ts",
      "packages/install-engine/src/__tests__/validate-plan.test.ts",
    ],
    probes: [
      "mcpdir add github-server --dry-run --json",
      "mcpdir add github-server --to codex --dry-run --json",
    ],
    command:
      "pnpm --filter @themcpdirectory/install-engine exec vitest run src/__tests__/semver.test.ts src/__tests__/select-variant.test.ts src/__tests__/input-resolution.test.ts src/__tests__/intent.test.ts src/__tests__/validate-plan.test.ts && pnpm --filter @themcpdirectory/install-engine typecheck",
  },
  {
    phase: "E",
    capability: "Client adapters",
    artefacts: [
      "packages/client-adapters/src/catalog.ts",
      "packages/client-adapters/src/types.ts",
      "packages/client-adapters/src/runtime.ts",
      "packages/client-adapters/src/registry.ts",
      "packages/client-adapters/src/codex.ts",
      "packages/client-adapters/src/claude-code.ts",
      "packages/client-adapters/src/cursor-json.ts",
      "packages/client-adapters/src/cursor-deeplink.ts",
      "packages/client-adapters/src/cursor.ts",
      "packages/client-adapters/src/index.ts",
      "packages/client-adapters/src/__tests__/catalog.test.ts",
      "packages/client-adapters/src/__tests__/registry.test.ts",
      "packages/client-adapters/src/__tests__/codex.test.ts",
      "packages/client-adapters/src/__tests__/claude-code.test.ts",
      "packages/client-adapters/src/__tests__/cursor.test.ts",
    ],
    probes: [
      "mcpdir add github-server --to codex --dry-run --json",
      "mcpdir add github-server --to claude-code --dry-run --json",
      "mcpdir add github-server --to cursor --dry-run --json",
      "mcpdir doctor --json",
    ],
    command:
      "pnpm --filter @themcpdirectory/client-adapters test -- src/__tests__/catalog.test.ts src/__tests__/registry.test.ts src/__tests__/codex.test.ts src/__tests__/claude-code.test.ts src/__tests__/cursor.test.ts && pnpm --filter @themcpdirectory/client-adapters typecheck",
  },
  {
    phase: "E",
    capability: "CLI command surface, receipts, and built binary smoke",
    artefacts: [
      "packages/cli/tsconfig.build.json",
      "packages/cli/src/config/runtime.ts",
      "packages/cli/src/config/state-paths.ts",
      "packages/cli/src/config/file-lock.ts",
      "packages/cli/src/config/receipt-store.ts",
      "packages/cli/src/output/redaction.ts",
      "packages/cli/src/output/render.ts",
      "packages/cli/src/output/json.ts",
      "packages/cli/src/commands/result.ts",
      "packages/cli/src/commands/search.ts",
      "packages/cli/src/commands/info.ts",
      "packages/cli/src/commands/add-plan.ts",
      "packages/cli/src/commands/add-execute.ts",
      "packages/cli/src/commands/list.ts",
      "packages/cli/src/commands/remove.ts",
      "packages/cli/src/commands/update.ts",
      "packages/cli/src/commands/doctor.ts",
      "packages/cli/src/cli.ts",
      "packages/cli/src/index.ts",
      "packages/cli/src/__tests__/state-paths.test.ts",
      "packages/cli/src/__tests__/receipt-store.test.ts",
      "packages/cli/src/__tests__/search-info.test.ts",
      "packages/cli/src/__tests__/add-planning.test.ts",
      "packages/cli/src/__tests__/add-execution.test.ts",
      "packages/cli/src/__tests__/list-remove.test.ts",
      "packages/cli/src/__tests__/update.test.ts",
      "packages/cli/src/__tests__/doctor.test.ts",
      "packages/cli/src/__tests__/integration-cli.test.ts",
      "packages/cli/src/__tests__/binary-smoke.test.ts",
    ],
    probes: [
      "mcpdir search github-server --json",
      "mcpdir info github-server --json",
      "mcpdir add github-server --dry-run --json",
      "mcpdir list --json",
      "mcpdir doctor --json",
      "built mcpdir --help smoke",
    ],
    command:
      "pnpm test:cli && pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/integration-cli.test.ts src/__tests__/binary-smoke.test.ts && pnpm --filter @themcpdirectory/cli typecheck",
  },
  {
    phase: "F",
    capability: "Remote probe transport hardening",
    artefacts: [
      "packages/security/src/url.ts",
      "packages/security/src/remote-probe.ts",
      "packages/security/src/index.ts",
      "packages/security/src/__tests__/remote-probe.test.ts",
    ],
    probes: [
      "bounded HTTPS probe classification",
      "redirect revalidation",
      "DNS pinning",
      "private-address rejection",
    ],
    command:
      "pnpm --filter @themcpdirectory/security test -- src/__tests__/remote-probe.test.ts && pnpm --filter @themcpdirectory/security typecheck",
  },
  {
    phase: "F",
    capability: "Trust, health, public projection, and worker retention",
    artefacts: [
      "packages/domain/src/health/remote-probe-eligibility.ts",
      "packages/domain/src/health/run-remote-health-check.ts",
      "packages/domain/src/health/get-latest-remote-health.ts",
      "packages/domain/src/trust/refresh-trust-profile.ts",
      "packages/domain/src/trust/get-current-trust-profile.ts",
      "packages/domain/src/public-api/server-detail.ts",
      "packages/domain/src/public-api/resolve-server-identifier.ts",
      "packages/domain/src/public-api/install-manifest.ts",
      "packages/search/src/public-api/types.ts",
      "packages/search/src/public-api/server-projections.ts",
      "packages/search/src/public-api/search-servers-page.ts",
      "apps/worker/src/trust-health-config.ts",
      "apps/worker/src/trust-health-jobs.ts",
      "apps/worker/src/retention.ts",
      "apps/worker/src/__tests__/trust-health-worker.test.ts",
      "packages/domain/src/health/__tests__/remote-probe-eligibility.test.ts",
      "packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts",
      "packages/domain/src/trust/__tests__/refresh-trust-profile.integration.test.ts",
      "packages/domain/src/public-api/__tests__/server-detail.integration.test.ts",
      "packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts",
      "packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts",
      "packages/search/src/__tests__/search-servers-page.integration.test.ts",
    ],
    probes: [
      "server detail includes trustProfile",
      "server detail includes latestHealth",
      "server detail includes installAvailability",
      "deleted-upstream install returns 410 UPSTREAM_DELETED",
      "search excludes deleted_upstream by default",
    ],
    command:
      "pnpm --filter @themcpdirectory/domain test -- src/health/__tests__/remote-probe-eligibility.test.ts src/health/__tests__/run-remote-health-check.integration.test.ts src/trust/__tests__/refresh-trust-profile.integration.test.ts src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts && pnpm --filter @themcpdirectory/domain typecheck && pnpm --filter @themcpdirectory/search test -- src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/search typecheck && pnpm --filter @themcpdirectory/worker test -- src/__tests__/trust-health-worker.test.ts && pnpm --filter @themcpdirectory/worker typecheck && pnpm --filter @themcpdirectory/directory-client test -- src/__tests__/client.test.ts && pnpm --filter @themcpdirectory/cli typecheck && pnpm --filter @themcpdirectory/web test:e2e -- e2e/detail.spec.ts e2e/contrast.spec.ts",
  },
  {
    phase: "G",
    capability: "Better Auth runtime and GitHub App verification",
    artefacts: [
      "packages/auth/src/better-auth.ts",
      "packages/auth/src/capabilities.ts",
      "packages/auth/src/session.ts",
      "packages/auth/src/request-guards.ts",
      "packages/auth/src/__tests__/better-auth.test.ts",
      "packages/auth/src/__tests__/capabilities.test.ts",
      "packages/auth/src/__tests__/github-oauth-flow.integration.test.ts",
    ],
    probes: [
      "/sign-in",
      "Better Auth session cookie handling",
      "GitHub App callback replay rejection",
      "GitHub App callback expiry rejection",
    ],
    command:
      "pnpm --filter @themcpdirectory/auth test -- src/__tests__/better-auth.test.ts src/__tests__/capabilities.test.ts src/__tests__/github-oauth-flow.integration.test.ts",
  },
  {
    phase: "G",
    capability: "Publisher claims, memberships, export, erasure, and workers",
    artefacts: [
      "packages/domain/src/publisher/dashboard.ts",
      "packages/domain/src/publisher/memberships.ts",
      "packages/domain/src/publisher/audit.ts",
      "packages/domain/src/publisher/github-app-client.ts",
      "packages/domain/src/publisher/claims.ts",
      "packages/domain/src/publisher/account-export.ts",
      "packages/domain/src/publisher/account-erasure.ts",
      "packages/domain/src/publisher/trust-refresh.ts",
      "packages/domain/src/publisher/retention.ts",
      "packages/domain/src/publisher/__tests__/dashboard.integration.test.ts",
      "packages/domain/src/publisher/__tests__/memberships.integration.test.ts",
      "packages/domain/src/publisher/__tests__/claims.integration.test.ts",
      "packages/domain/src/publisher/__tests__/account-export.integration.test.ts",
      "packages/domain/src/publisher/__tests__/account-erasure.integration.test.ts",
      "apps/worker/src/publisher-outbox-worker.ts",
      "apps/worker/src/publisher-erasure-worker.ts",
      "apps/worker/src/publisher-retention-worker.ts",
      "apps/worker/src/__tests__/publisher-outbox-worker.test.ts",
      "apps/worker/src/__tests__/publisher-erasure-worker.test.ts",
      "apps/worker/src/__tests__/publisher-retention-worker.test.ts",
    ],
    probes: [
      "claim verify start",
      "claim verify callback",
      "claim withdrawal",
      "export endpoint",
      "erasure endpoint",
      "outbox delivery",
      "retention sweep",
    ],
    command:
      "pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/dashboard.integration.test.ts src/publisher/__tests__/memberships.integration.test.ts src/publisher/__tests__/claims.integration.test.ts src/publisher/__tests__/account-export.integration.test.ts src/publisher/__tests__/account-erasure.integration.test.ts && pnpm --filter @themcpdirectory/worker test -- src/__tests__/publisher-outbox-worker.test.ts src/__tests__/publisher-erasure-worker.test.ts src/__tests__/publisher-retention-worker.test.ts",
  },
  {
    phase: "G",
    capability: "Publisher web routes and deterministic authenticated fixtures",
    artefacts: [
      "apps/web/src/app/api/auth/[...all]/route.ts",
      "apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts",
      "apps/web/src/app/api/publisher/v1/session/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/[claimId]/verify/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/[claimId]/withdraw/route.ts",
      "apps/web/src/app/api/publisher/v1/memberships/[membershipId]/route.ts",
      "apps/web/src/app/api/publisher/v1/account/export/route.ts",
      "apps/web/src/app/api/publisher/v1/account/erasure/route.ts",
      "apps/web/src/app/sign-in/page.tsx",
      "apps/web/src/app/dashboard/layout.tsx",
      "apps/web/src/app/dashboard/page.tsx",
      "apps/web/src/app/dashboard/listings/[id]/page.tsx",
      "apps/web/e2e/setup/publisher-session-fixtures.ts",
      "apps/web/e2e/publisher-auth.spec.ts",
      "apps/web/e2e/publisher-dashboard.spec.ts",
      "apps/web/e2e/publisher-claims.spec.ts",
      "apps/web/e2e/contrast.spec.ts",
    ],
    probes: [
      "/sign-in",
      "authenticated /dashboard",
      "authenticated /dashboard/listings/11111111-1111-4111-8111-111111111111",
      "same-origin publisher mutations",
      "export and erasure flows",
    ],
    command:
      "pnpm --filter @themcpdirectory/web test:e2e -- publisher-auth.spec.ts publisher-dashboard.spec.ts publisher-claims.spec.ts contrast.spec.ts && pnpm --filter @themcpdirectory/web typecheck",
  },
] as const;
```

- [ ] **Step 4: Run the fail-closed verifier**

Run: `pnpm --filter @themcpdirectory/release-tools exec tsx src/verify-phase-prerequisites.ts`

Expected: In the current Phase A-C repository this should fail closed and print the missing Phase D-G artefacts, routes, commands, or tests. Do not continue to Task 2 until this command passes on a repository state with completed Phase D-G work.

- [ ] **Step 5: Commit**

```bash
git add tooling/release
git commit -m "build(release): add phase prerequisite gate"
```

### Task 2: Create the Shared Document Shell And Release Navigation

**Files:**

- Create: `apps/web/src/components/document-page.tsx`
- Create: `apps/web/src/components/legal-draft-banner.tsx`
- Create: `apps/web/src/content/document-model.ts`
- Create: `apps/web/src/content/release-nav.ts`
- Create: `apps/web/src/app/docs/page.tsx`
- Create: `apps/web/e2e/document-shell.spec.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/site-nav.tsx`

**Interfaces:**

- Produces: `ReleaseDocument`
- Produces: `DocumentPage({ document })`
- Produces: `RELEASE_DOCUMENT_LINKS`

- [ ] **Step 1: Write the failing document-shell browser test**

```ts
import { test, expect } from "@playwright/test";

test("document routes share the accessible launch shell", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("navigation", { name: "Site navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
```

- [ ] **Step 2: Run the document-shell browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/document-shell.spec.ts`

Expected: FAIL because `/docs` and the shared document shell do not exist.

- [ ] **Step 3: Write the shared document-shell implementation**

```tsx
export function DocumentPage({ document }: { document: ReleaseDocument }) {
  return (
    <main id="main-content" tabIndex={-1}>
      {document.draftLabel ? <LegalDraftBanner label={document.draftLabel} /> : null}
      <article>
        <h1>{document.title}</h1>
        <p>{document.description}</p>
        {document.sections.map((section) => (
          <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id}>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
```

- [ ] **Step 4: Run the document-shell browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/document-shell.spec.ts`

Expected: PASS and the shared shell preserves the existing skip link, visible focus, footer, and navigation semantics.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components apps/web/src/content apps/web/src/app/layout.tsx apps/web/src/app/docs/page.tsx apps/web/e2e/document-shell.spec.ts
git commit -m "feat(web): add shared launch document shell"
```

### Task 3: Publish Actual Route Docs For The Shipped Web Surface

**Files:**

- Create: `apps/web/src/content/site-route-reference.ts`
- Create: `apps/web/src/content/docs-routes.ts`
- Modify: `apps/web/src/app/docs/page.tsx`
- Create: `apps/web/e2e/docs-routes.spec.ts`

**Interfaces:**

- Produces: `PUBLIC_SITE_ROUTE_REFERENCE`
- Produces: `getDocsRoutesDocument()`

- [ ] **Step 1: Write the failing route-docs browser test**

```ts
import { test, expect } from "@playwright/test";

test("docs landing lists only the shipped route families", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByText("/", { exact: true })).toBeVisible();
  await expect(page.getByText("/search", { exact: true })).toBeVisible();
  await expect(page.getByText("/docs/api", { exact: true })).toBeVisible();
  await expect(page.getByText("/dashboard", { exact: true })).toBeVisible();
  await expect(page.getByText(/anonymous browsing remains available/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the route-docs browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-routes.spec.ts`

Expected: FAIL because the docs landing page does not yet describe the actual route inventory.

- [ ] **Step 3: Write the route-reference source and docs landing page**

```ts
export const PUBLIC_SITE_ROUTE_REFERENCE = [
  { path: "/", title: "Home", auth: "anonymous", index: true },
  { path: "/search", title: "Search", auth: "anonymous", index: false },
  { path: "/categories", title: "Categories", auth: "anonymous", index: true },
  { path: "/[slug]", title: "Server detail", auth: "anonymous", index: true },
  { path: "/docs/api", title: "API docs", auth: "anonymous", index: true },
  { path: "/dashboard", title: "Publisher dashboard", auth: "authenticated", index: false },
] as const;
```

- [ ] **Step 4: Run the route-docs browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-routes.spec.ts`

Expected: PASS and `/docs` documents the real public and authenticated route families, their indexability, and their anonymous or authenticated access boundary.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/site-route-reference.ts apps/web/src/content/docs-routes.ts apps/web/src/app/docs/page.tsx apps/web/e2e/docs-routes.spec.ts
git commit -m "docs(web): add route inventory documentation"
```

### Task 4: Publish API Docs Derived From Verified Contracts

**Files:**

- Create: `apps/web/src/content/docs-api.ts`
- Create: `apps/web/src/app/docs/api/page.tsx`
- Create: `apps/web/e2e/docs-api.spec.ts`

**Interfaces:**

- Consumes: `createPublicApiOpenApiDocument()`, `apiErrorCodeSchema`, and the verified Phase D route behaviours from Task 1
- Produces: `PUBLIC_API_DOC_ROUTES`
- Produces: `getApiReferenceDocument()`

- [ ] **Step 1: Write the failing API-docs browser test**

```ts
import { test, expect } from "@playwright/test";

test("API docs list the shipped routes, errors, and deletion semantics", async ({ page }) => {
  await page.goto("/docs/api");
  await expect(page.getByText("GET /api/v1/servers", { exact: true })).toBeVisible();
  await expect(
    page.getByText("GET /api/v1/resolve/:identifier/install", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("UPSTREAM_DELETED", { exact: true })).toBeVisible();
  await expect(page.getByText("deleted_upstream", { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Run the API-docs browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-api.spec.ts`

Expected: FAIL because `/docs/api` does not exist.

- [ ] **Step 3: Write the API docs from verified contract sources**

```ts
export function getApiReferenceDocument() {
  const openApi = createPublicApiOpenApiDocument("https://api.themcpdirectory.test");
  const PUBLIC_API_DOC_ROUTES = Object.entries(openApi.paths).flatMap(([path, methods]) =>
    Object.keys(methods ?? {}).map((method) => `${method.toUpperCase()} ${path}`),
  );

  return {
    slug: "/docs/api",
    title: "Public API Reference",
    description:
      "Versioned read-only routes, envelopes, pagination, rate limits, and install-manifest rules.",
    sections: [
      {
        id: "routes",
        heading: "Routes",
        body: PUBLIC_API_DOC_ROUTES,
      },
      { id: "errors", heading: "Errors", body: apiErrorCodeSchema.options },
      {
        id: "deletion",
        heading: "Upstream deletion",
        body: [
          "`deleted_upstream` remains the canonical listing status.",
          "Install requests return `410 UPSTREAM_DELETED`.",
        ],
      },
    ],
    openApi,
  };
}
```

- [ ] **Step 4: Run the API-docs browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-api.spec.ts`

Expected: PASS and `/docs/api` exposes real routes, envelopes, cursor rules, errors, rate-limit notes, install-manifest safety rules, and deleted-upstream behaviour from verified Phase D contracts.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/docs-api.ts apps/web/src/app/docs/api/page.tsx apps/web/e2e/docs-api.spec.ts
git commit -m "docs(web): add contract-derived API reference"
```

### Task 5: Publish CLI Docs Derived From Verified Command Metadata

**Files:**

- Create: `apps/web/src/content/docs-cli.ts`
- Create: `apps/web/src/app/docs/cli/page.tsx`
- Create: `apps/web/e2e/docs-cli.spec.ts`

**Interfaces:**

- Consumes: verified Phase E command handlers, supported client identifiers, exit-code behaviour, and receipt-store constraints from Task 1
- Produces: `getCliReferenceDocument()`

- [ ] **Step 1: Write the failing CLI-docs browser test**

```ts
import { test, expect } from "@playwright/test";

test("CLI docs list the shipped install flows and safety guarantees", async ({ page }) => {
  await page.goto("/docs/cli");
  await expect(page.getByText("mcpdir add github-server", { exact: true })).toBeVisible();
  await expect(
    page.getByText("mcpdir add github-server --to codex", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/secrets are never written to receipts/i)).toBeVisible();
  await expect(
    page.getByText(/unsupported clients and ambiguous servers fail clearly/i),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run the CLI-docs browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-cli.spec.ts`

Expected: FAIL because `/docs/cli` does not exist.

- [ ] **Step 3: Write the CLI docs from verified command and receipt metadata**

```ts
export function getCliReferenceDocument() {
  return {
    slug: "/docs/cli",
    title: "CLI Reference",
    description:
      "Installation, removal, dry runs, scopes, receipts, secret handling, troubleshooting, and uninstall.",
    sections: [
      {
        id: "commands",
        heading: "Commands",
        body: [
          "mcpdir search github-server",
          "mcpdir info github-server",
          "mcpdir add github-server",
          "mcpdir add github-server --to codex",
          "mcpdir add github-server --to claude-code",
          "mcpdir add github-server --to cursor",
          "mcpdir list",
          "mcpdir remove github-server --to codex",
          "mcpdir update github-server",
          "mcpdir doctor",
        ],
      },
      {
        id: "receipts",
        heading: "Receipts",
        body: [
          "Receipts store non-secret install state only.",
          "Secrets are never written to receipts.",
          "Exact package versions remain pinned.",
        ],
      },
      {
        id: "safety",
        heading: "Safety",
        body: [
          "Install plans are reviewed before mutation.",
          "Unsupported clients and ambiguous servers fail clearly.",
        ],
      },
    ],
  };
}
```

- [ ] **Step 4: Run the CLI-docs browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-cli.spec.ts`

Expected: PASS and `/docs/cli` documents the real shipped command surface, scope handling, dry runs, receipts, secret handling, exit codes, troubleshooting, and uninstall guidance.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/docs-cli.ts apps/web/src/app/docs/cli/page.tsx apps/web/e2e/docs-cli.spec.ts
git commit -m "docs(web): add contract-derived CLI reference"
```

### Task 6: Publish Trust And Publisher Docs Derived From Verified Contracts

**Files:**

- Create: `apps/web/src/content/docs-trust.ts`
- Create: `apps/web/src/content/docs-publishers.ts`
- Create: `apps/web/src/app/docs/trust/page.tsx`
- Create: `apps/web/src/app/docs/publishers/page.tsx`
- Create: `apps/web/e2e/docs-trust-publishers.spec.ts`

**Interfaces:**

- Consumes: verified Phase F trust-profile and health contracts, and verified Phase G publisher role, claim-status, export, and erasure contracts from Task 1
- Produces: `getTrustDocument()`
- Produces: `getPublisherDocument()`

- [ ] **Step 1: Write the failing trust-and-publisher browser test**

```ts
import { test, expect } from "@playwright/test";

test("trust and publisher docs explain shipped statuses and roles", async ({ page }) => {
  await page.goto("/docs/trust");
  await expect(page.getByText("deleted_upstream", { exact: true })).toBeVisible();
  await expect(page.getByText("healthy", { exact: true })).toBeVisible();

  await page.goto("/docs/publishers");
  await expect(page.getByText("owner", { exact: true })).toBeVisible();
  await expect(page.getByText("admin", { exact: true })).toBeVisible();
  await expect(page.getByText(/export/i)).toBeVisible();
  await expect(page.getByText(/erasure/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the trust-and-publisher browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-trust-publishers.spec.ts`

Expected: FAIL because `/docs/trust` and `/docs/publishers` do not exist.

- [ ] **Step 3: Write the trust and publisher docs from verified Phase F and Phase G outputs**

```ts
export function getTrustDocument() {
  return {
    slug: "/docs/trust",
    title: "Trust And Health",
    description:
      "Factual trust signals, remote health meanings, and deleted-upstream installation blocking.",
    sections: [
      {
        id: "signals",
        heading: "Signals",
        body: [
          "Trust signals are factual and independent.",
          "No aggregate trust score is emitted.",
        ],
      },
      {
        id: "health",
        heading: "Health outcomes",
        body: [
          "Remote health outcomes include `healthy`, `degraded`, `unreachable`, `timed_out`, `unsafe_destination`, `response_too_large`, `unsupported`, and `unknown`.",
        ],
      },
      {
        id: "deletion",
        heading: "Upstream deletion",
        body: [
          "`deleted_upstream` remains visible on detail pages.",
          "Install requests fail with `410 UPSTREAM_DELETED`.",
        ],
      },
    ],
  };
}
```

- [ ] **Step 4: Run the trust-and-publisher browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/docs-trust-publishers.spec.ts`

Expected: PASS and the new docs pages explain real trust-signal meanings, health states, claim statuses, role capabilities, export, erasure, and dashboard access without inventing certification or unsupported workflows.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/docs-trust.ts apps/web/src/content/docs-publishers.ts apps/web/src/app/docs/trust apps/web/src/app/docs/publishers apps/web/e2e/docs-trust-publishers.spec.ts
git commit -m "docs(web): add trust and publisher reference pages"
```

### Task 7: Add Legal, Security, About, And Open Source Routes Without Inventing Facts

**Files:**

- Create: `apps/web/src/content/legal.ts`
- Create: `apps/web/src/content/about.ts`
- Create: `apps/web/src/content/open-source.ts`
- Create: `apps/web/src/app/security/page.tsx`
- Create: `apps/web/src/app/privacy/page.tsx`
- Create: `apps/web/src/app/terms/page.tsx`
- Create: `apps/web/src/app/about/page.tsx`
- Create: `apps/web/src/app/open-source/page.tsx`
- Create: `apps/web/e2e/legal-and-governance.spec.ts`

**Interfaces:**

- Produces: `getSecurityPolicyDocument()`
- Produces: `getPrivacyDraftDocument()`
- Produces: `getTermsDraftDocument()`
- Produces: `getAboutDocument()`
- Produces: `getOpenSourceDocument()`

- [ ] **Step 1: Write the failing legal-and-governance browser test**

```ts
import { test, expect } from "@playwright/test";

test("legal and governance routes preserve repository truth", async ({ page }) => {
  await page.goto("/security");
  await expect(page.getByText(/GitHub's private vulnerability reporting form/i)).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

  await page.goto("/privacy");
  await expect(page.getByText("Estopia Engineering Ltd")).toBeVisible();
  await expect(page.getByText(/draft requiring qualified legal review/i)).toBeVisible();

  await page.goto("/open-source");
  await expect(page.getByText(/No open-source licence has been selected yet/i)).toBeVisible();
  await expect(page.getByText(/External code contributions are paused/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the legal-and-governance browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/legal-and-governance.spec.ts`

Expected: FAIL because these routes do not yet exist.

- [ ] **Step 3: Write factual legal and governance documents**

```ts
const operatorAddress = [
  "Estopia Engineering Ltd",
  "3 Braemount",
  "Cowdenbeath",
  "Fife",
  "KY4 9RB",
  "Scotland",
  "United Kingdom",
] as const;

export function getOpenSourceDocument() {
  return {
    slug: "/open-source",
    title: "Open Source Status",
    description: "Current licence and contribution status for the repository.",
    sections: [
      {
        id: "licence",
        heading: "Licence",
        body: ["No open-source licence has been selected yet."],
      },
      {
        id: "contributions",
        heading: "Contributions",
        body: ["External code contributions are paused until contribution terms exist."],
      },
    ],
  };
}
```

- [ ] **Step 4: Run the legal-and-governance browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/legal-and-governance.spec.ts`

Expected: PASS and `/security`, `/privacy`, `/terms`, `/about`, and `/open-source` all render factual content, contain no invented contact channel, and preserve the current licence, contribution, and disclosure truth.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/legal.ts apps/web/src/content/about.ts apps/web/src/content/open-source.ts apps/web/src/app/security apps/web/src/app/privacy apps/web/src/app/terms apps/web/src/app/about apps/web/src/app/open-source apps/web/e2e/legal-and-governance.spec.ts
git commit -m "feat(web): add legal and governance launch routes"
```

### Task 8: Add Publish And Advertise Routes As Separate Truthful Surfaces

**Files:**

- Create: `apps/web/src/content/publish.ts`
- Create: `apps/web/src/content/advertise.ts`
- Create: `apps/web/src/app/publish/page.tsx`
- Create: `apps/web/src/app/advertise/page.tsx`
- Create: `apps/web/e2e/publish-and-advertise.spec.ts`

**Interfaces:**

- Produces: `getPublishDocument()`
- Produces: `getAdvertiseDocument()`

- [ ] **Step 1: Write the failing publish-and-advertise browser test**

```ts
import { test, expect } from "@playwright/test";

test("publish and advertise pages state launch truth separately", async ({ page }) => {
  await page.goto("/publish");
  await expect(page.getByText(/verification cannot be purchased/i)).toBeVisible();

  await page.goto("/advertise");
  await expect(page.getByText(/does not accept paid campaigns/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
});
```

- [ ] **Step 2: Run the publish-and-advertise browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/publish-and-advertise.spec.ts`

Expected: FAIL because `/publish` and `/advertise` do not yet exist.

- [ ] **Step 3: Write the separate publish and advertise documents**

```ts
export function getAdvertiseDocument() {
  return {
    slug: "/advertise",
    title: "Advertising Status",
    description: "Current status of paid placements and sponsorship policy.",
    index: false,
    sections: [
      {
        id: "launch",
        heading: "Launch status",
        body: ["The launch release does not accept paid campaigns."],
      },
      {
        id: "policy",
        heading: "Future policy",
        body: ["Any future sponsorship must stay separate from organic ranking and trust state."],
      },
    ],
  };
}
```

- [ ] **Step 4: Run the publish-and-advertise browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/publish-and-advertise.spec.ts`

Expected: PASS and `/publish` explains the real publisher claim path while `/advertise` remains descriptive, unavailable, and `noindex`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/publish.ts apps/web/src/content/advertise.ts apps/web/src/app/publish apps/web/src/app/advertise apps/web/e2e/publish-and-advertise.spec.ts
git commit -m "feat(web): add publish and advertise launch routes"
```

### Task 9: Add Canonical Metadata And JSON-LD Without Fabrication

**Files:**

- Create: `apps/web/src/lib/metadata.ts`
- Create: `apps/web/src/lib/structured-data.ts`
- Create: `apps/web/e2e/metadata.release.spec.ts`
- Modify: `apps/web/src/app/[slug]/page.tsx`
- Modify: document and legal route pages created in Tasks 2-8

**Interfaces:**

- Produces: `buildDocumentMetadata(input)`
- Produces: `buildCanonicalUrl(path)`
- Produces: `buildSoftwareApplicationJsonLd(detail)`
- Produces: `buildBreadcrumbJsonLd(input)`

- [ ] **Step 1: Write the failing metadata browser test**

```ts
import { test, expect } from "@playwright/test";

test("launch pages emit canonical metadata and factual JSON-LD", async ({ page }) => {
  await page.goto("/docs/api");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/docs\/api$/);

  await page.goto("/github");
  await expect(page.locator('script[type="application/ld+json"]')).toContainText(
    '"@type":"SoftwareApplication"',
  );
  await expect(page.locator('script[type="application/ld+json"]')).not.toContainText(
    '"aggregateRating"',
  );
});
```

- [ ] **Step 2: Run the metadata browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/metadata.release.spec.ts`

Expected: FAIL because the shared metadata helpers and route metadata are not present.

- [ ] **Step 3: Write shared metadata and JSON-LD helpers**

```ts
export function buildDocumentMetadata(input: {
  title: string;
  description: string;
  path: string;
  index: boolean;
}) {
  const canonical = buildCanonicalUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical },
    robots: { index: input.index, follow: input.index },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      type: "website",
    },
  };
}
```

- [ ] **Step 4: Run the metadata browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/metadata.release.spec.ts`

Expected: PASS and all indexable launch routes emit canonical metadata while detail pages emit only factual JSON-LD fields.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/metadata.ts apps/web/src/lib/structured-data.ts apps/web/src/app/[slug]/page.tsx apps/web/e2e/metadata.release.spec.ts apps/web/src/app/docs apps/web/src/app/security apps/web/src/app/privacy apps/web/src/app/terms apps/web/src/app/about apps/web/src/app/open-source apps/web/src/app/publish apps/web/src/app/advertise
git commit -m "feat(web): add launch metadata and structured data"
```

### Task 10: Add Robots And Sitemap Generation From Canonical Launch Routes

**Files:**

- Create: `apps/web/e2e/robots-sitemap.release.spec.ts`
- Modify: `apps/web/src/app/robots.ts`
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/content/site-route-reference.ts`

**Interfaces:**

- Consumes: `PUBLIC_SITE_ROUTE_REFERENCE` and indexability metadata from Tasks 3 and 9
- Produces: `INDEXABLE_ROUTE_REFERENCE`

- [ ] **Step 1: Write the failing robots-and-sitemap browser test**

```ts
import { test, expect } from "@playwright/test";

test("robots and sitemap expose only canonical indexable launch pages", async ({ page }) => {
  const robots = await page.goto("/robots.txt");
  expect(await robots?.text()).toContain("Sitemap:");

  const sitemap = await page.goto("/sitemap.xml");
  const body = await sitemap?.text();
  expect(body).toContain("/docs/trust");
  expect(body).not.toContain("/search?q=");
  expect(body).not.toContain("/advertise");
  expect(body).not.toContain("/dashboard");
});
```

- [ ] **Step 2: Run the robots-and-sitemap browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/robots-sitemap.release.spec.ts`

Expected: FAIL because the launch route inventory is not yet wired into `robots.ts` or `sitemap.ts`.

- [ ] **Step 3: Generate robots and sitemap from canonical launch-route metadata**

```ts
export const INDEXABLE_ROUTE_REFERENCE = PUBLIC_SITE_ROUTE_REFERENCE.filter((route) => route.index);

export function getSitemapEntries() {
  return INDEXABLE_ROUTE_REFERENCE.map((route) => ({
    url: buildCanonicalUrl(route.path.replace("/[slug]", "/github")),
  }));
}
```

- [ ] **Step 4: Run the robots-and-sitemap browser test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/robots-sitemap.release.spec.ts`

Expected: PASS and only canonical, indexable, public launch pages appear in `robots.txt` and the XML sitemap.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts apps/web/src/content/site-route-reference.ts apps/web/e2e/robots-sitemap.release.spec.ts
git commit -m "feat(web): generate robots and sitemap from launch routes"
```

### Task 11: Add Full Accessibility Release Gates For Shell, Forms, Forced Colours, And 320px Reflow

**Files:**

- Create: `packages/test-utils/src/release-route-matrix.ts`
- Modify: `packages/test-utils/src/index.ts`
- Modify: `apps/web/package.json`
- Create: `apps/web/e2e/accessibility.release.spec.ts`
- Create: `docs/release-accessibility-manual-checklist.md`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/search-form.tsx`
- Modify: `apps/web/src/components/site-nav.tsx`
- Modify: document components created in Task 2

**Interfaces:**

- Produces: `PUBLIC_RELEASE_ROUTE_MATRIX`
- Produces: `AUTHENTICATED_FIXTURE_ROUTE_MATRIX`
- Produces: `SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE`
- Produces manual checklist sections for keyboard-only navigation, heading order, visible focus, reduced motion, forced colours, zoom, and 320 CSS-pixel reflow

- [ ] **Step 1: Write the failing accessibility browser test**

```ts
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import {
  AUTHENTICATED_FIXTURE_ROUTE_MATRIX,
  PUBLIC_RELEASE_ROUTE_MATRIX,
} from "@themcpdirectory/test-utils";
import { seedPublisherSession } from "./setup/publisher-session-fixtures";

for (const route of PUBLIC_RELEASE_ROUTE_MATRIX) {
  test(`${route} supports skip link, labels, and 320px reflow`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((entry) => ["serious", "critical"].includes(entry.impact ?? "")),
    ).toEqual([]);
  });
}

for (const route of AUTHENTICATED_FIXTURE_ROUTE_MATRIX) {
  test(`${route} supports authenticated accessibility release gates`, async ({ page, context }) => {
    const session = await seedPublisherSession({ role: "owner" });

    await context.addCookies([
      {
        name: "session_token",
        value: session.sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((entry) => ["serious", "critical"].includes(entry.impact ?? "")),
    ).toEqual([]);
  });
}
```

- [ ] **Step 2: Run the accessibility browser test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web exec playwright test e2e/accessibility.release.spec.ts`

Expected: FAIL because the shared route matrices and accessibility gate are not present.

- [ ] **Step 3: Write the route matrices and accessibility gate implementation**

```ts
export const SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE =
  "/dashboard/listings/11111111-1111-4111-8111-111111111111" as const;

export const PUBLIC_RELEASE_ROUTE_MATRIX = [
  "/",
  "/search?q=github",
  "/github",
  "/docs",
  "/docs/api",
  "/docs/cli",
  "/docs/trust",
  "/docs/publishers",
  "/security",
  "/sign-in",
  "/privacy",
  "/terms",
  "/about",
  "/open-source",
  "/publish",
] as const;

export const AUTHENTICATED_FIXTURE_ROUTE_MATRIX = [
  "/dashboard",
  SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
] as const;
```

- [ ] **Step 4: Run the accessibility browser test to verify it passes**

Run: `pnpm install && pnpm --filter @themcpdirectory/web exec playwright test e2e/accessibility.release.spec.ts`

Expected: PASS and the automated plus manual gate covers shell navigation, form labels, visible focus, forced colours, reduced motion, zoom, and 320px reflow across public and deterministic authenticated fixtures.

- [ ] **Step 5: Commit**

```bash
git add packages/test-utils apps/web/package.json apps/web/src/app/globals.css apps/web/src/components apps/web/e2e/accessibility.release.spec.ts docs/release-accessibility-manual-checklist.md pnpm-lock.yaml
git commit -m "test(web): add launch accessibility gates"
```

### Task 12: Add Production-Build Lighthouse Gates With Seeded Public And Authenticated Fixture Matrices

**Files:**

- Modify: `package.json`
- Modify: `tooling/release/package.json`
- Create: `tooling/release/src/lighthouse-profiles.ts`
- Create: `tooling/release/src/run-lighthouse.ts`
- Create: `tooling/release/src/release-report.ts`
- Create: `tooling/release/src/__tests__/run-lighthouse.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `PUBLIC_RELEASE_ROUTE_MATRIX`, `AUTHENTICATED_FIXTURE_ROUTE_MATRIX`, `SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE`, seeded database fixtures, and deterministic authenticated fixture sessions from Task 11 and verified Phase G helpers from Task 1
- Produces: `PUBLIC_LIGHTHOUSE_ROUTE_MATRIX`
- Produces: `AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX`
- Produces: `LIGHTHOUSE_MOBILE_PROFILE`
- Produces: `LIGHTHOUSE_DESKTOP_PROFILE`
- Produces: `medianScore(scores)`
- Produces root script `test:lighthouse`

- [ ] **Step 1: Write the failing Lighthouse release-tools test**

```ts
import { describe, expect, it } from "vitest";
import { medianScore } from "../run-lighthouse";

describe("lighthouse release harness", () => {
  it("selects the middle score from three runs", () => {
    expect(medianScore([0.97, 0.95, 0.98])).toBe(0.97);
  });
});
```

- [ ] **Step 2: Run the Lighthouse release-tools test to verify it fails**

Run: `pnpm --filter @themcpdirectory/release-tools test -- run-lighthouse.test.ts`

Expected: FAIL because the Lighthouse harness does not yet exist.

- [ ] **Step 3: Write the seeded production-build Lighthouse harness**

```json
{
  "scripts": {
    "test:lighthouse": "pnpm --filter @themcpdirectory/release-tools exec tsx src/run-lighthouse.ts"
  }
}
```

```ts
export const PUBLIC_LIGHTHOUSE_ROUTE_MATRIX = [
  "/",
  "/search?q=github",
  "/github",
  "/docs",
  "/docs/api",
  "/docs/cli",
  "/docs/trust",
  "/docs/publishers",
  "/security",
  "/sign-in",
] as const;

export const AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX = [
  "/dashboard",
  SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
] as const;
```

- [ ] **Step 4: Run the production-build Lighthouse gate**

Run: `pnpm test:lighthouse`

Expected: PASS on a built web application started with `pnpm --filter @themcpdirectory/web build` and `pnpm --filter @themcpdirectory/web start`, using seeded data, deterministic authenticated fixture sessions, pinned Chromium and Lighthouse versions, three runs per route and profile, and recorded median scores `>=95`.

- [ ] **Step 5: Commit**

```bash
git add package.json tooling/release/package.json tooling/release/src/lighthouse-profiles.ts tooling/release/src/run-lighthouse.ts tooling/release/src/release-report.ts tooling/release/src/__tests__/run-lighthouse.test.ts .github/workflows/ci.yml
git commit -m "build(release): add seeded production Lighthouse gate"
```

### Task 13: Add Concrete Security, Secret Scanning, Lockfile Integrity, And Privacy Release Checks With Triaged Audit Evidence

**Files:**

- Create: `apps/web/e2e/security.release.spec.ts`
- Create: `tooling/release/dependency-audit-baseline.json`
- Create: `tooling/release/src/verify-dependency-audit.ts`
- Create: `tooling/release/src/verify-secret-scanning.ts`
- Create: `tooling/release/src/verify-lockfile-integrity.ts`
- Create: `tooling/release/src/__tests__/verify-dependency-audit.test.ts`
- Create: `tooling/release/src/__tests__/verify-release-integrity.test.ts`
- Modify: `package.json`
- Modify: `tooling/release/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `SECURITY_HEADER_EXPECTATIONS`
- Produces: `DEPENDENCY_AUDIT_BASELINE`
- Produces: `SECRET_SCAN_TARGETS`
- Produces: `LOCKFILE_INTEGRITY_STEPS`
- Produces: `verifyDependencyAudit()`
- Produces: `verifySecretScanning()`
- Produces: `verifyLockfileIntegrity()`
- Produces root scripts `web:security-release`, `release:dependency-audit`, `release:secret-scan`, and `release:lockfile-integrity`

- [ ] **Step 1: Write the failing security-release browser test and integrity-gate tests**

```ts
import { test, expect } from "@playwright/test";

test("public headers and publisher mutations satisfy release security rules", async ({
  page,
  request,
}) => {
  const home = await page.goto("/");
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home?.headers()["content-security-policy"]).toBeTruthy();

  const response = await request.post("/api/publisher/v1/claims", {
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    data: { serverSlug: "github" },
  });
  expect(response.status()).toBe(403);
});
```

```ts
import { describe, expect, it } from "vitest";
import { LOCKFILE_INTEGRITY_STEPS } from "../verify-lockfile-integrity";
import { SECRET_SCAN_TARGETS } from "../verify-secret-scanning";

describe("release integrity gates", () => {
  it("scans the tracked repository surfaces for secrets", () => {
    expect(SECRET_SCAN_TARGETS).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "apps",
      "packages",
      "tooling",
      "docs",
    ]);
  });

  it("uses a frozen, non-mutating lockfile verification path", () => {
    expect(LOCKFILE_INTEGRITY_STEPS).toEqual([
      "pnpm install --frozen-lockfile --ignore-scripts",
      "pnpm dedupe --check",
    ]);
  });
});
```

- [ ] **Step 2: Run the security, secret-scanning, and lockfile-integrity tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/release-tools test -- verify-dependency-audit.test.ts verify-release-integrity.test.ts && pnpm --filter @themcpdirectory/web exec playwright test e2e/security.release.spec.ts`

Expected: FAIL because the release-specific security checks, secret-scanning gate, and lockfile-integrity gate do not yet exist.

- [ ] **Step 3: Write the release security, audit-triage, and integrity tooling**

```json
{
  "scripts": {
    "web:security-release": "pnpm --filter @themcpdirectory/web exec playwright test e2e/security.release.spec.ts",
    "release:dependency-audit": "pnpm --filter @themcpdirectory/release-tools exec tsx src/verify-dependency-audit.ts",
    "release:secret-scan": "pnpm --filter @themcpdirectory/release-tools exec tsx src/verify-secret-scanning.ts",
    "release:lockfile-integrity": "pnpm --filter @themcpdirectory/release-tools exec tsx src/verify-lockfile-integrity.ts"
  }
}
```

```json
[
  {
    "id": "GHSA-example-example-example",
    "package": "example-package",
    "severity": "high",
    "owner": "release-manager",
    "expiresAt": "2026-10-01",
    "justification": "No reachable exploit path in shipped release artefacts."
  }
]
```

```ts
export const SECRET_SCAN_TARGETS = [
  "package.json",
  "pnpm-lock.yaml",
  "apps",
  "packages",
  "tooling",
  "docs",
] as const;

export const LOCKFILE_INTEGRITY_STEPS = [
  "pnpm install --frozen-lockfile --ignore-scripts",
  "pnpm dedupe --check",
] as const;
```

The secret-scan verifier walks `git ls-files` for the tracked repository surfaces and fails on any untriaged finding. The lockfile verifier runs the frozen-install and dedupe checks without mutating the workspace.

- [ ] **Step 4: Run the security and privacy release gate**

Run: `pnpm release:lockfile-integrity && pnpm web:security-release && pnpm release:secret-scan && pnpm release:dependency-audit`

Expected: PASS with recorded evidence for a frozen non-mutating lockfile check, CSP, HSTS in production configuration, frame and MIME protections, explicit CORS, same-origin and CSRF rejection, secure cookies, log redaction tests, SSRF tests, retention and export/erasure checks, dependency audit findings that are either absent or explicitly triaged with owner and expiry, and secret scanning over tracked files with no untriaged findings.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/web/e2e/security.release.spec.ts tooling/release/dependency-audit-baseline.json tooling/release/src/verify-dependency-audit.ts tooling/release/src/verify-secret-scanning.ts tooling/release/src/verify-lockfile-integrity.ts tooling/release/src/__tests__/verify-dependency-audit.test.ts tooling/release/src/__tests__/verify-release-integrity.test.ts tooling/release/package.json .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "build(release): add security, audit, and integrity gates"
```

### Task 14: Add Empty-State And Upgrade Migration Checks Plus Seed Repeatability

**Files:**

- Create: `tooling/release/fixtures/previous-release.sql`
- Create: `tooling/release/src/verify-database-release.ts`
- Create: `tooling/release/src/__tests__/verify-database-release.test.ts`
- Modify: `package.json`
- Modify: `tooling/release/package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: `DATABASE_RELEASE_STEPS`
- Produces: `runEmptyDatabaseMigrationCheck()`
- Produces: `runUpgradeMigrationCheck()`
- Produces: `runSeedRepeatabilityCheck()`
- Produces root script `release:database`

- [ ] **Step 1: Write the failing database-release test**

```ts
import { describe, expect, it } from "vitest";
import { DATABASE_RELEASE_STEPS } from "../verify-database-release";

describe("database release gate", () => {
  it("covers empty, upgrade, and repeatable seed checks", () => {
    expect(DATABASE_RELEASE_STEPS).toEqual([
      "create-empty-db",
      "run-empty-migrations",
      "load-previous-release-fixture",
      "run-upgrade-migrations",
      "run-seed-once",
      "run-seed-twice",
      "compare-fixture-owned-checksum",
    ]);
  });
});
```

- [ ] **Step 2: Run the database-release test to verify it fails**

Run: `pnpm --filter @themcpdirectory/release-tools test -- verify-database-release.test.ts`

Expected: FAIL because the database release harness does not yet exist.

- [ ] **Step 3: Write the database release verifier**

```json
{
  "scripts": {
    "release:database": "pnpm --filter @themcpdirectory/release-tools exec tsx src/verify-database-release.ts"
  }
}
```

```ts
export const DATABASE_RELEASE_STEPS = [
  "create-empty-db",
  "run-empty-migrations",
  "load-previous-release-fixture",
  "run-upgrade-migrations",
  "run-seed-once",
  "run-seed-twice",
  "compare-fixture-owned-checksum",
] as const;
```

- [ ] **Step 4: Run the database release gate**

Run: `pnpm release:database`

Expected: PASS and record evidence that empty-state migrations succeed, previous-release upgrades succeed, and two consecutive `pnpm db:seed` runs produce identical fixture-owned checksums.

- [ ] **Step 5: Commit**

```bash
git add package.json tooling/release/fixtures/previous-release.sql tooling/release/src/verify-database-release.ts tooling/release/src/__tests__/verify-database-release.test.ts tooling/release/package.json .github/workflows/ci.yml
git commit -m "build(release): add database release gates"
```

### Task 15: Add Deterministic Packed-Tarball Verification And Compose `pnpm verify:release`

**Files:**

- Create: `tooling/release/fixtures/legacy-receipt-v1.json`
- Create: `tooling/release/src/fake-directory-api.ts`
- Create: `tooling/release/src/verify-cli-tarball.ts`
- Create: `tooling/release/src/verify-release.ts`
- Create: `tooling/release/src/__tests__/verify-cli-tarball.test.ts`
- Modify: `packages/cli/package.json`
- Modify: `package.json`
- Modify: `tooling/release/package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: `CLI_TARBALL_ALLOWLIST`
- Produces: `CLI_TARBALL_SMOKE_STEPS`
- Produces: `verifyCliTarball()`
- Produces: `RELEASE_CHECKS`
- Produces root scripts `release:prerequisites`, `release:cli-tarball`, and `verify:release`

- [ ] **Step 1: Write the failing tarball-smoke and release-composition tests**

```ts
import { describe, expect, it } from "vitest";
import { CLI_TARBALL_SMOKE_STEPS } from "../verify-cli-tarball";
import { RELEASE_CHECKS } from "../verify-release";

describe("cli tarball smoke", () => {
  it("covers deterministic pack, published bin, JSON, adapters, and receipt migration", () => {
    expect(CLI_TARBALL_SMOKE_STEPS).toEqual([
      "npm-pack-dry-run",
      "pnpm-pack",
      "inspect-tarball-allowlist",
      "hash-tarball-sha256",
      "install-into-temporary-prefix",
      "start-fake-directory-api",
      "published-bin-help",
      "published-bin-version",
      "search-json-schema",
      "info-json-schema",
      "list-json-schema",
      "doctor-json-schema",
      "add-dry-run-json-schema",
      "add-codex-dry-run-json-schema",
      "add-claude-code-dry-run-json-schema",
      "add-cursor-dry-run-json-schema",
      "codex-adapter-sandbox",
      "claude-code-adapter-sandbox",
      "cursor-adapter-sandbox",
      "receipt-migration",
    ]);
  });
});

describe("verify:release composition", () => {
  it("runs prerequisite, integrity, database, build/browser, security, and tarball gates", () => {
    expect(RELEASE_CHECKS).toEqual([
      "release:prerequisites",
      "format:check",
      "release:lockfile-integrity",
      "lint",
      "typecheck",
      "test",
      "test:integration",
      "test:cli",
      "release:database",
      "build",
      "test:e2e",
      "web:accessibility-release",
      "web:security-release",
      "test:lighthouse",
      "release:secret-scan",
      "release:dependency-audit",
      "release:cli-tarball",
    ]);
  });
});
```

- [ ] **Step 2: Run the tarball-smoke and release-composition tests to verify they fail**

Run: `pnpm --filter @themcpdirectory/release-tools test -- verify-cli-tarball.test.ts`

Expected: FAIL because the tarball verifier and composed release gate do not yet exist.

- [ ] **Step 3: Write the deterministic packed-tarball verifier and root release gate**

```json
{
  "bin": {
    "mcpdir": "dist/index.js"
  },
  "files": ["dist", "README.md"],
  "license": "UNLICENSED"
}
```

```ts
export const RELEASE_CHECKS = [
  "release:prerequisites",
  "format:check",
  "release:lockfile-integrity",
  "lint",
  "typecheck",
  "test",
  "test:integration",
  "test:cli",
  "release:database",
  "build",
  "test:e2e",
  "web:accessibility-release",
  "web:security-release",
  "test:lighthouse",
  "release:secret-scan",
  "release:dependency-audit",
  "release:cli-tarball",
] as const;
```

```ts
export const CLI_TARBALL_SMOKE_STEPS = [
  "npm-pack-dry-run",
  "pnpm-pack",
  "inspect-tarball-allowlist",
  "hash-tarball-sha256",
  "install-into-temporary-prefix",
  "start-fake-directory-api",
  "published-bin-help",
  "published-bin-version",
  "search-json-schema",
  "info-json-schema",
  "list-json-schema",
  "doctor-json-schema",
  "add-dry-run-json-schema",
  "add-codex-dry-run-json-schema",
  "add-claude-code-dry-run-json-schema",
  "add-cursor-dry-run-json-schema",
  "codex-adapter-sandbox",
  "claude-code-adapter-sandbox",
  "cursor-adapter-sandbox",
  "receipt-migration",
] as const;
```

The verifier must invoke the packed binary from the temporary install prefix rather than `pnpm exec` from the workspace, and it must validate CLI JSON output against the shipped schemas.

- [ ] **Step 4: Run the real tarball smoke checks and composed release gate**

Run: `pnpm verify:release`

Expected: PASS after running `npm pack --dry-run`, `pnpm pack`, tarball allowlist inspection, SHA-256 hashing, installation into a temporary prefix, fake-API startup, published `mcpdir --help`, published `mcpdir --version`, schema validation for `mcpdir search github-server --json`, `mcpdir info github-server --json`, `mcpdir list --json`, `mcpdir doctor --json`, `mcpdir add github-server --dry-run --json`, `mcpdir add github-server --to codex --dry-run --json`, `mcpdir add github-server --to claude-code --dry-run --json`, and `mcpdir add github-server --to cursor --dry-run --json`, adapter sandbox checks against temporary Codex, Claude Code, and Cursor config roots, and a legacy receipt migration smoke proving the packed CLI can read and rewrite the prior receipt format, with reports under `test-results/release/`. The verifier must execute the packed bin from the temporary install prefix, and the published bin contract must point at `dist/index.js`.

- [ ] **Step 5: Commit**

```bash
git add tooling/release/fixtures/legacy-receipt-v1.json tooling/release/src/fake-directory-api.ts tooling/release/src/verify-cli-tarball.ts tooling/release/src/verify-release.ts tooling/release/src/__tests__/verify-cli-tarball.test.ts packages/cli/package.json package.json tooling/release/package.json .github/workflows/ci.yml
git commit -m "build(release): add tarball smoke checks and verify release gate"
```

### Task 16: Reconcile README And Operator Docs, Add The Release Runbook, And Record External Blockers

**Files:**

- Create: `docs/release-runbook.md`
- Create: `docs/production-authorisation-blockers.md`
- Create: `tooling/release/src/__tests__/docs-consistency.test.ts`
- Modify: `README.md`
- Modify: `docs/development.md`
- Modify: `docs/deployment.md`

**Interfaces:**

- Produces: `docs/release-runbook.md` covering versioning, changelog, migration order, worker/API/web deployment order, smoke tests, rollback and forward-fix triggers, health checks, known limitations, legal sign-off, and final operator approvals
- Produces: `docs/production-authorisation-blockers.md` listing non-code production gates

- [ ] **Step 1: Write the failing docs-consistency test**

```ts
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("operator docs consistency", () => {
  it("preserves deployment and publication truth while linking the runbook", async () => {
    const readme = await readFile("README.md", "utf8");
    const development = await readFile("docs/development.md", "utf8");
    const deployment = await readFile("docs/deployment.md", "utf8");

    expect(readme).not.toContain("npm install -g @themcpdirectory/cli");
    expect(readme).toContain("No open-source licence has been selected yet.");
    expect(readme).toContain("docs/release-runbook.md");
    expect(readme).toContain("pnpm verify:release does not publish to npm or deploy the stack.");
    expect(development).toContain("pnpm verify:release");
    expect(development).toContain("docs/release-runbook.md");
    expect(deployment).toContain("Portainer Business Edition");
    expect(deployment).toContain("GHCR");
    expect(deployment).toContain("Pull and redeploy");
    expect(deployment).toContain("backup");
    expect(deployment).toContain("rollback");
    expect(deployment).toContain("docs/release-runbook.md");
    expect(deployment).toContain("docs/production-authorisation-blockers.md");
  });
});
```

- [ ] **Step 2: Run the docs-consistency test to verify it fails**

Run: `pnpm --filter @themcpdirectory/release-tools test -- docs-consistency.test.ts`

Expected: FAIL because the runbook and blockers documents do not exist yet.

- [ ] **Step 3: Reconcile the existing docs without rewriting away current facts**

```md
## Release Verification

Run `pnpm verify:release` from the repository root after the public API, CLI, trust, health, and publisher surfaces are green.

`pnpm verify:release` does not publish to npm or deploy the stack.

Do not add `npm install -g @themcpdirectory/cli` to `README.md` until the CLI package is public, published, and approved for public installation guidance.

See `docs/release-runbook.md` for migration order, GHCR image expectations, Portainer pull-and-redeploy steps, smoke tests, rollback and forward-fix triggers, and external approvals.

See `docs/production-authorisation-blockers.md` for the non-code approvals that still block publication and deployment.
```

- [ ] **Step 4: Run the docs-consistency test to verify it passes**

Run: `pnpm --filter @themcpdirectory/release-tools test -- docs-consistency.test.ts`

Expected: PASS and `README.md`, `docs/development.md`, and `docs/deployment.md` stay truthful about the current non-published CLI state, the non-deploying `pnpm verify:release` gate, Portainer, GHCR, backup, pull-and-redeploy, and rollback while linking the new runbook and production-authorisation blockers.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/development.md docs/deployment.md docs/release-runbook.md docs/production-authorisation-blockers.md tooling/release/src/__tests__/docs-consistency.test.ts
git commit -m "docs: add launch runbook and production blockers"
```

## Self-Review

### 1. Phase Boundary

- All Phase D-G implementation tasks were removed.
- Task 1 is a fail-closed prerequisite matrix that verifies completed Phase D-G artefacts, routes, commands, fixtures, and tests.
- Every later task consumes verified prerequisite surfaces rather than promising to create them.

### 2. Split Launch Tasks

- Shared shell and navigation are isolated in Task 2.
- Route docs, API docs, CLI docs, and trust and publisher docs are split across Tasks 3-6 and derived from verified contracts.
- Legal, governance, publish, and advertise work is split across Tasks 7-8.
- Metadata and JSON-LD are separate from robots and sitemap in Tasks 9-10.
- Accessibility, Lighthouse, security and privacy, database repeatability, tarball verification, and docs reconciliation are split across Tasks 11-16.

### 3. Truth Preservation

- Legal text uses the verified Estopia address only.
- No invented support, legal, privacy, or disclosure email address appears.
- Open-source and contribution pages preserve the current no-licence and paused-contributions truth.
- `/advertise` remains unavailable and `noindex`.
- Operator docs preserve Portainer, GHCR, the current non-published CLI truth, the non-deploying `pnpm verify:release` truth, backup, pull-and-redeploy, and rollback guidance.

### 4. Verification Coverage

- Accessibility gate covers the full public route matrix, including `/sign-in`, plus shell, forms, forced colours, reduced motion, zoom, keyboard use, and 320px reflow.
- Lighthouse uses seeded production builds, pinned profiles, public and authenticated fixture matrices, and three-run medians.
- Security and privacy checks include concrete browser assertions plus lockfile integrity, secret scanning, and triaged audit evidence.
- Database release checks cover empty migrations, upgrade migrations, and seed repeatability.
- Tarball verification covers allowlist inspection, hashing, temporary-prefix installation, published bin help and version smoke, schema-valid JSON output, adapter sandbox tests, receipt migration, and the named `pnpm verify:release` root gate.

### 5. Stop Conditions

- If Task 1 fails, stop Phase H and reopen the missing earlier phase.
- If any later task uncovers absent or drifting prerequisite behaviour, stop that task and move the defect back to the owning phase.
- Production launch remains blocked after engineering completion until the external approvals below are satisfied.

## External Production-Authorisation Blockers

- Qualified legal approval of the final Privacy and Terms text.
- A configured, monitored, and tested responsible-disclosure contact before removing draft-only wording from `/security`.
- Provisioned production Better Auth, GitHub OAuth, GitHub App, encryption, and trusted-origin secrets.
- Verified production backup and restore evidence against the target database and deployment environment.
- Explicit operator approval for deployment, Git tags, GitHub releases, DNS changes, and npm publication.
- Any future change from `UNLICENSED` to a public open-source licence requires an explicit repository decision before public npm publication or licence claims change.
