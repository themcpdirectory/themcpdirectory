# Local Development

This guide covers the implemented Phase A-C workspace on macOS or Linux. Commands run from the repository root unless noted otherwise.

## Prerequisites

- Node.js `>=24 <25`
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

The applications and test tooling use these variables. The shared runtime configuration validates `DATABASE_URL`, `MCP_REGISTRY_BASE_URL`, `WEB_PORT`, `API_PORT`, and `GITHUB_TOKEN`; web metadata validates `NEXT_PUBLIC_BASE_URL` separately.

| Variable                         | Required     | Default                       | Purpose                                                                 |
| -------------------------------- | ------------ | ----------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                   | Yes          | None                          | PostgreSQL connection URL                                               |
| `THEMCP_TEST_ADMIN_DATABASE_URL` | For DB tests | Local PostgreSQL admin lookup | Administrative URL used to create and drop isolated test databases      |
| `MCP_REGISTRY_BASE_URL`          | Yes          | None                          | Upstream Registry base URL                                              |
| `NEXT_PUBLIC_BASE_URL`           | No           | `https://themcpdirectory.org` | Public origin for canonical metadata, JSON-LD, robots, and sitemap URLs |
| `WEB_PORT`                       | No           | `3000`                        | Next.js development and production port                                 |
| `API_PORT`                       | No           | `3001`                        | Hono API port                                                           |
| `GITHUB_TOKEN`                   | No           | None                          | GitHub bearer token for higher API limits                               |

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

Start all development processes:

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

For deterministic UI work without live ingestion, run only web and API in separate exported shells:

```sh
pnpm --filter @themcpdirectory/web dev
pnpm --filter @themcpdirectory/api dev
```

Run the worker separately when live synchronization is intended:

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

## Validation

Run the same core gates as CI:

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
