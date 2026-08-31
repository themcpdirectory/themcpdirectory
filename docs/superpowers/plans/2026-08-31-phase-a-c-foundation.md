# Phase A-C Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Phase A-C foundation for The MCP Directory, from validated Registry ingestion through PostgreSQL search and server-rendered public pages.

**Architecture:** A pnpm/Turborepo monorepo separates deployable Next.js, Hono, and pg-boss applications from focused database, domain, Registry, search, security, and UI packages. PostgreSQL is the only stateful service; all external data is validated and normalized before persistence or presentation.

**Tech Stack:** Node.js LTS, TypeScript, pnpm, Turborepo, Next.js App Router, Hono, PostgreSQL, Drizzle ORM, Zod, pg-boss, Tailwind CSS, Vitest, Playwright.

**Spec:** `docs/ai-docs/product-and-technical-spec.md` and `docs/ai-docs/engineering-spec.md`

## Global Constraints

- Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` in every TypeScript project.
- Preserve validated raw Registry payloads as immutable snapshots.
- Never execute Registry-supplied commands or render Registry-supplied HTML.
- Keep the CLI, publisher dashboard, advertising, and later-phase systems out of this implementation.
- Use PostgreSQL full-text search and `pg_trgm`; do not add a separate search service.
- Public UI targets WCAG 2.2 AA and remains usable at 320 CSS pixels.
- Commit each verified milestone using Conventional Commit messages.

---

### Task 1: Monorepo Foundation

**Files:** Root workspace/configuration files, shared tooling packages, minimal `apps/api`, `apps/worker`, and future-phase package manifests.

**Interfaces:**

- Produces root commands `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `db:generate`, `db:migrate`, and `db:seed`.
- Produces shared TypeScript and ESLint configuration consumed by every workspace.

- [ ] Create workspace manifests, pinned package manager metadata, Node LTS engine constraint, and Turborepo task graph.
- [ ] Configure shared strict TypeScript, ESLint, Prettier, and Vitest defaults.
- [ ] Add validated environment configuration and `.env.example`.
- [ ] Add PostgreSQL-only Docker Compose and GitHub Actions verification.
- [ ] Install dependencies; run format, lint, typecheck, unit tests, and builds.
- [ ] Commit as `chore: initialize monorepo foundation`.

### Task 2: Database Schema and Migrations

**Files:** `packages/db/src/schema/*`, database client and migration helpers, `packages/db/drizzle/*`, integration database utilities.

**Interfaces:**

- Produces Drizzle tables and inferred row types for Registry sources/runs/snapshots, publishers, servers, aliases, versions, packages, remotes, icons, categories, repository snapshots, trust signals, and compatibility.
- Produces `createDatabase(databaseUrl)` and migration/seed entry points.

- [ ] Write schema invariant tests for UUID defaults, foreign keys, unique identities, immutable snapshot identity, and required indexes.
- [ ] Run the tests and confirm they fail before schema implementation.
- [ ] Implement relational Drizzle schemas with explicit delete behavior and timestamps.
- [ ] Generate and inspect committed SQL enabling `citext` and `pg_trgm`, tables, constraints, and search indexes.
- [ ] Start PostgreSQL and validate empty-database migration plus repeat migration.
- [ ] Commit as `feat(db): add registry persistence schema`.

### Task 3: Security and Registry Client

**Files:** `packages/security/src/url.ts`, `packages/registry-client/src/schema.ts`, pagination client, normalized errors, and fixtures.

**Interfaces:**

- Produces `validatePublicHttpUrl(value)` for untrusted metadata.
- Produces `OfficialRegistryClient.pages(options)` yielding validated `RegistryPage` values.

- [ ] Write failing tests for public URL validation, blocked local/private addresses, Registry validation, cursor pagination, retryable failures, and timeouts.
- [ ] Implement URL parsing and SSRF-oriented hostname/address rejection.
- [ ] Implement Zod schemas matching the current Official MCP Registry response contract.
- [ ] Implement bounded retries, timeout cancellation, cursor preservation, and typed failures.
- [ ] Run focused tests and package typecheck.
- [ ] Commit as `feat(registry): implement official registry client`.

### Task 4: Deterministic Registry Normalization

**Files:** `packages/registry-normalizer/src/*` and fixture-driven unit tests.

**Interfaces:**

- Produces `normalizeRegistryServer(input): NormalizedRegistryServer`.
- Produces `hashRegistryPayload(input): string` using stable canonical JSON.
- Produces `selectCurrentVersion(versions)` without requiring valid SemVer.

- [ ] Write failing normalization, hashing, package, remote, icon, and version-selection tests.
- [ ] Implement deterministic canonicalization and SHA-256 hashing.
- [ ] Normalize package arguments, environment variables, remote variables, repository metadata, and upstream state without command-string flattening.
- [ ] Preserve unmodeled validated fields in `normalizedPayload`.
- [ ] Run focused tests and package typecheck.
- [ ] Commit as `feat(registry): normalize server packages and remotes`.

### Task 5: Idempotent Registry Ingestion

**Files:** `packages/domain/src/registry/*`, `apps/worker/src/*`, database integration tests, and worker scripts.

**Interfaces:**

- Produces `synchronizeRegistryPage(db, source, page, context): SyncPageResult`.
- Produces identity resolution by upstream mapping, stable repository ID, package identity, approved alias, then creation.
- Produces pg-boss queue `registry.sync` and a direct fixture sync command.

- [ ] Write failing integration tests for duplicate imports, changed payloads, versions, packages/remotes, aliases, ambiguity, and upstream deletion.
- [ ] Implement transactions that insert immutable snapshots and upsert canonical records idempotently.
- [ ] Implement safe slug allocation and current-version selection.
- [ ] Implement resumable sync runs, partial failure accounting, structured job logs, and retry policy.
- [ ] Run fixture ingestion twice and assert unchanged entity counts.
- [ ] Commit as `feat(worker): add idempotent registry synchronization`.

### Task 6: Search and Directory Query Layer

**Files:** `packages/search/src/*`, `packages/domain/src/servers/*`, search refresh logic and tests.

**Interfaces:**

- Produces `searchServers(db, input): Promise<SearchResult[]>`.
- Produces `getServerByIdentifier(db, identifier)` with canonical/alias result metadata.
- Produces homepage and category query functions independent of Next.js.

- [ ] Write failing unit snapshots for ranking weights and integration tests for full-text, trigram, exact slug/title, aliases, publishers, categories, and package identifiers.
- [ ] Implement normalized `search_text` refresh and `tsvector` generation.
- [ ] Implement deterministic SQL ranking with active/metadata/Registry boosts and stable tie-breaking.
- [ ] Implement visible-listing policy and canonical alias resolution.
- [ ] Run search tests against PostgreSQL.
- [ ] Commit as `feat(search): add PostgreSQL server search`.

### Task 7: Seed Data and Categories

**Files:** `packages/db/src/seed/*`, required realistic fixtures, category assignments, and seed tests.

**Interfaces:**

- Produces deterministic `pnpm db:seed` data covering every specified server/identity state.

- [ ] Write a failing seed integration test asserting all required fixture cases and 15 curated categories.
- [ ] Implement idempotent category and Registry fixture seeds without fabricated confidence.
- [ ] Run seed twice and verify stable counts.
- [ ] Commit as `feat(db): add deterministic directory seed data`.

### Task 8: Public Web Directory

**Files:** `apps/web/app/*`, `packages/ui/src/*`, styles, metadata routes, and component tests.

**Interfaces:**

- Produces server-rendered `/`, `/search`, `/categories`, `/categories/[slug]`, and `/[slug]` routes.
- Produces canonical redirects for aliases, route metadata, `robots.txt`, and `sitemap.xml`.

- [ ] Write browser tests for homepage, search, result navigation, details, categories, aliases, mobile navigation, and 404 behavior.
- [ ] Build an accessible developer-infrastructure visual system using shared tokens and focused UI primitives.
- [ ] Implement a skip link, semantic landmarks, labeled search, visible focus, loading/empty/error states, and reduced-motion/forced-colors behavior.
- [ ] Render real package, remote, configuration, repository, provenance, and factual trust metadata without fake installation actions.
- [ ] Verify responsive layouts at 320, 768, 1280, and 1536 CSS pixels.
- [ ] Commit homepage and public routes in coherent verified commits.

### Task 9: GitHub Enrichment

**Files:** `packages/domain/src/github/*`, worker job registration, GitHub response schemas and tests.

**Interfaces:**

- Produces `enrichGitHubRepository(db, serverId, options)` and queue `github.enrich`.
- Persists stable repository ID, owner/name, status counts, license, push/release timestamps, payload, and check time.

- [ ] Write failing tests for validated responses, stable IDs, unavailable repositories, rate limiting, and ingestion independence.
- [ ] Implement authenticated optional GitHub requests with timeouts and typed errors.
- [ ] Store append-only repository snapshots and update canonical repository identity safely.
- [ ] Confirm enrichment failure leaves Registry records queryable.
- [ ] Commit as `feat(github): add repository enrichment`.

### Task 10: Documentation and Release Verification

**Files:** Root `README.md`, development/security/contributing docs, package scripts, and CI adjustments.

**Interfaces:**

- Documents only implemented Phase A-C behavior and exact local commands.

- [ ] Document architecture, prerequisites, environment, migrations, seeding, fixture/live sync, tests, build, project structure, contributing, and security reporting.
- [ ] Run `pnpm install`, format check, lint, typecheck, unit tests, integration tests, build, and browser tests.
- [ ] Validate migrations and seeds from an empty PostgreSQL database.
- [ ] Start web/API/worker processes and verify public routes plus fixture ingestion.
- [ ] Review Git status, tracked files, secrets, generated artifacts, and commit history.
- [ ] Commit as `docs: add local development setup` and leave a clean working tree.
