# Local Development

This guide covers the workspace on macOS or Linux. Commands run from the repository root unless noted otherwise.

## Prerequisites

- Node.js `>=24.10 <25`
- pnpm `11.17.0`, selected by Corepack from the repository's `packageManager` field
- Docker with the `docker compose` command
- Git

Enable the pinned package manager and install the lockfile exactly:

```sh
corepack enable
pnpm install --frozen-lockfile
```

## Environment

Create a local environment file:

```sh
cp .env.example .env
```

The applications and test tooling use these variables. Shared processes validate database, Registry, port, retention, and optional enrichment settings. The standalone API and publisher-authenticated web routes validate additional process-specific settings when they start or receive a request.

| Variable                         | Required     | Default                       | Purpose                                                                 |
| -------------------------------- | ------------ | ----------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                   | Yes          | None                          | PostgreSQL connection URL                                               |
| `THEMCP_TEST_ADMIN_DATABASE_URL` | For DB tests | Local PostgreSQL admin lookup | Administrative URL used to create and drop isolated test databases      |
| `MCP_REGISTRY_BASE_URL`          | Yes          | None                          | Upstream Registry base URL                                              |
| `NEXT_PUBLIC_BASE_URL`           | No           | `https://themcpdirectory.org` | Public origin for canonical metadata, JSON-LD, robots, and sitemap URLs |
| `WEB_PORT`                       | No           | `3000`                        | Next.js development and production port                                 |
| `API_PORT`                       | No           | `3001`                        | Hono API port                                                           |
| `GITHUB_TOKEN`                   | No           | None                          | GitHub bearer token for higher API limits                               |

The standalone public API also requires `API_CURSOR_SIGNING_SECRET` with at least 32 characters. `API_BASE_URL`, `API_CORS_ALLOWED_ORIGINS`, `API_RATE_LIMIT_WINDOW_SECONDS`, and `API_RATE_LIMIT_MAX_READS` have development defaults; production operators must review them for the public origin and expected traffic.

Publisher authentication and claim verification require `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_SLUG`. `BETTER_AUTH_URL` is optional and defaults to `/api/auth` on `NEXT_PUBLIC_BASE_URL`; when supplied, it must use that exact origin. The worker also loads this web-auth configuration at startup because account-erasure jobs authenticate as the GitHub App.

The checked-in `.env.example` supports the anonymous web app and shared database commands. The copied file does not by itself satisfy `pnpm dev`: add a local-only `API_CURSOR_SIGNING_SECRET` of at least 32 characters before starting the API, and provision dedicated development GitHub OAuth and GitHub App credentials before starting the worker or testing publisher routes. Generate `BETTER_AUTH_SECRET` and `API_CURSOR_SIGNING_SECRET` independently, store the GitHub App private key through an approved local secret-loading method, and never reuse production credentials in development.

Retention intervals can be overridden with `PUBLISHER_AUDIT_RETENTION_DAYS`, `PUBLISHER_CLAIM_EXPIRY_DAYS`, `PUBLISHER_CLAIM_EVIDENCE_RETENTION_DAYS`, `PUBLISHER_OUTBOX_RETENTION_DAYS`, `PUBLISHER_EXPIRED_SESSION_GRACE_DAYS`, and `PUBLISHER_DORMANT_ACCOUNT_RETENTION_DAYS`. Keep the reviewed defaults unless a privacy and operations review approves a change.

The application scripts read exported process variables. Export the root file in every new shell that runs an app or database command:

```sh
set -a
. ./.env
set +a
```

Do not commit `.env`, `.env.local`, access tokens, or production connection strings. The optional GitHub token is used only for repository enrichment requests.

## PostgreSQL

Start the PostgreSQL 17 development service and wait for its health check:

```sh
docker compose up -d --wait postgres
docker compose ps
```

The default service listens on `localhost:5432` with database, user, and password all set to `mcpdirectory`. Its named volume preserves data between restarts.

Apply all committed Drizzle migrations:

```sh
pnpm db:migrate
```

The migration role must be allowed to install the `citext` and `pg_trgm` extensions. The Compose superuser satisfies this requirement for local development.

Generate a migration after changing files in `packages/db/src/schema`:

```sh
pnpm db:generate
```

Review generated SQL and metadata before committing them. Migrations must preserve populated databases and follow the runtime table lock order documented in the existing migration tests.

To remove all local database data and rebuild from an empty volume:

```sh
docker compose down -v
docker compose up -d --wait postgres
pnpm db:migrate
pnpm db:seed
```

`docker compose down -v` is destructive for the repository's local PostgreSQL volume.

## Deterministic Seed Data

Populate curated categories, Registry fixtures, publishers, aliases, category assignments, and search documents:

```sh
pnpm db:seed
```

The seed is deterministic and idempotent. Running it again updates fixture-owned records, reconciles fixture-owned aliases and category assignments, and preserves unrelated records.

The worker also provides a narrower ingestion fixture command:

```sh
pnpm --filter @themcpdirectory/worker sync:fixtures
```

That command sends one synthetic fixture page through the Registry synchronization path twice and logs table counts plus whether the second pass was idempotent. It writes persistent records under the `official` source in the configured `DATABASE_URL`; run it only against a disposable local database. It is an ingestion check, not a replacement for the richer directory seed.

## Running Processes

After configuring every process-specific value described above, start all development processes:

```sh
pnpm dev
```

This runs persistent Turbo tasks for:

| Process | Default address         | Behavior                                           |
| ------- | ----------------------- | -------------------------------------------------- |
| Web     | <http://localhost:3000> | Next.js App Router public directory                |
| API     | <http://localhost:3001> | `GET /` returns `{ "status": "ok" }`               |
| Worker  | No HTTP port            | Processes `registry.sync` and `github.enrich` jobs |

The worker initializes its queues and creates one pending initial Registry synchronization job. That job reads the live upstream configured by `MCP_REGISTRY_BASE_URL`; it may also enqueue GitHub enrichment. There is no recurring Registry schedule yet.

For deterministic anonymous UI work without process-specific credentials or live ingestion, run only the web app:

```sh
pnpm --filter @themcpdirectory/web dev
```

After setting `API_CURSOR_SIGNING_SECRET`, run the API in a separate exported shell:

```sh
pnpm --filter @themcpdirectory/api dev
```

Run the worker separately only after configuring the required development GitHub OAuth and GitHub App values and when live synchronization is intended:

```sh
pnpm --filter @themcpdirectory/worker dev
```

Public web routes are:

- `/`
- `/search?q=<query>`
- `/categories`
- `/categories/<slug>`
- `/<server-slug>`
- `/robots.txt`
- `/sitemap.xml`

Alias detail routes redirect permanently to the canonical server slug. Listings, search, category counts, and sitemap entries include only active, normally moderated records. Direct detail lookup suppresses hidden and blocked records but may render other listing or moderation states with their factual availability metadata.

## CLI Development

Build and run the repository-linked binary:

```sh
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
pnpm --filter @themcpdirectory/cli exec mcpdir search github
```

The default API root is `http://127.0.0.1:3001/api/v1`. Override it per command when testing another API:

```sh
MCPDIR_API_BASE_URL=https://api.example.test/api/v1 pnpm --filter @themcpdirectory/cli exec mcpdir search github
```

CLI changes must preserve these safety properties:

- Installation and removal execute only adapter-generated plans accepted by the install-engine validator.
- Mutating commands require an interactive confirmation or `--yes`; `--dry-run` does not mutate client configuration or receipts.
- Installation receipts are persisted only after adapter verification succeeds.
- Secret values are not rendered, serialized into plans, or stored in receipts.
- `doctor` is read-only and skips adapter inspections that may connect to or start configured MCP servers.

Run the compact command workflow and built-binary smoke gates:

```sh
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/integration-cli.test.ts src/__tests__/binary-smoke.test.ts
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
pnpm prettier --check README.md docs/development.md docs/superpowers/plans/2026-09-01-phase-e-cli-installation.md
```

The built file at `packages/cli/dist/index.js` is a bundled local-development executable. Run `pnpm release:cli-tarball` from the repository root to check the publish allowlist, record the tarball SHA-256, install the exact archive into a temporary prefix, and exercise its packed binary and adapters. This validates an artefact but does not publish it; `@themcpdirectory/cli` remains private and `UNLICENSED`.

## Validation

Run the authoritative release-candidate gate on Node.js `>=24.10 <25`:

```sh
pnpm verify:release
```

The command runs the release prerequisites, formatting, lockfile integrity, lint, typecheck, unit and integration suites, CLI checks, database release checks, build, browser E2E, accessibility, production security, Lighthouse, secret scanning, dependency audit, and packed CLI verification in sequence. It stops at the first failure and writes release evidence under `test-results/release/` where a gate produces a report.

`pnpm verify:release` does not publish to npm, create a tag or GitHub release, publish a container, change DNS, configure secrets, or deploy Portainer. Follow [`docs/release-runbook.md`](release-runbook.md) only after the gate passes and confirm every item in [`docs/production-authorisation-blockers.md`](production-authorisation-blockers.md) separately.

For a shorter development loop, run the affected package command or these core gates individually:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:cli
pnpm build
pnpm test:e2e
```

`pnpm test` and `pnpm test:integration` run package Vitest suites, including tests that create temporary PostgreSQL databases. Set `THEMCP_TEST_ADMIN_DATABASE_URL` to a disposable local PostgreSQL cluster whose role may create and drop databases. When this variable is set, connection failure is terminal; tests do not fall back to another cluster. Only when it is absent may helpers try the administrative database derived from `DATABASE_URL` and then local PostgreSQL.

Run package integration scripts explicitly with:

```sh
pnpm test:integration
```

The current package `test:integration` scripts invoke the same Vitest suites as `test`; this explicit gate repeats them rather than selecting a second set of files.

Run browser tests with:

```sh
pnpm --filter @themcpdirectory/web exec playwright install chromium
pnpm test:e2e
```

Playwright uses one worker and a reserved `task8_web_e2e` database name prefix. Its setup connects through `THEMCP_TEST_ADMIN_DATABASE_URL`, creates a fresh database, applies migrations, runs the deterministic seed, starts Next on an isolated port, and drops the database in teardown. It never reuses an existing web server. The Compose-compatible administrative URL is included in `.env.example`; never point any test administrative URL at shared, staging, or production PostgreSQL.

Useful scoped commands follow the package name:

```sh
pnpm --filter @themcpdirectory/domain test
pnpm --filter @themcpdirectory/worker typecheck
pnpm --filter @themcpdirectory/web build
```

## Production Builds

Build all applications:

```sh
pnpm build
```

After exporting the production environment, start each built process separately:

```sh
pnpm --filter @themcpdirectory/web start
pnpm --filter @themcpdirectory/api start
pnpm --filter @themcpdirectory/worker start
```

Run `pnpm db:migrate` before starting a deployment that includes new migrations. The worker and API start compiled `dist` entrypoints through `tsx` because internal workspace packages export TypeScript source. Deploy them from a complete production pnpm workspace installation; their `dist` directories are not standalone bundles. The web app uses the Next.js production output.

## Generated and Local Artifacts

Commit:

- `pnpm-lock.yaml`
- `packages/db/drizzle/*.sql`
- `packages/db/drizzle/meta/*.json`

Do not commit:

- `.env` or `.env.local`
- `node_modules`, `.turbo`, `.next`, or `dist`
- `coverage`, `playwright-report`, or `test-results`
- logs or TypeScript build metadata

## Troubleshooting

**The app reports an invalid environment configuration.**

Export `.env` in that shell and confirm both required URLs are valid absolute URLs.

**PostgreSQL rejects the configured role or database.**

Confirm `docker compose ps` reports the repository service healthy and that `DATABASE_URL` matches `.env.example`. Another PostgreSQL instance may already own port 5432.

**The web page shows a database query error.**

Run `pnpm db:migrate` and `pnpm db:seed` against the same exported `DATABASE_URL` used by the web process.

**GitHub enrichment is rate limited.**

Set an optional `GITHUB_TOKEN` and restart the worker. Rate-limited jobs defer until GitHub's reset time within one bounded retry budget.
