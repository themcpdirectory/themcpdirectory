# The MCP Directory

The MCP Directory is an open directory for discovering Model Context Protocol (MCP) servers. This repository currently implements the Phase A-C foundation: Registry ingestion, deterministic normalization, PostgreSQL search, GitHub repository enrichment, fixture data, and a server-rendered public directory.

## Current Features

- Public directory pages for search, categories, server details, aliases, robots, and sitemap
- Official MCP Registry client with validated pagination and typed failures
- Transactional, idempotent Registry ingestion with immutable raw snapshots
- PostgreSQL full-text and trigram search with deterministic ranking
- Optional authenticated GitHub enrichment with append-only repository snapshots
- PostgreSQL-backed `pg-boss` worker queues
- Deterministic local seed data and isolated Playwright browser tests

The API currently exposes only `GET /` as a health endpoint. Authentication, installation workflows, client adapters, and the public API contract are reserved package boundaries, not shipped product features.

## Quick Start

Requirements:

- Node.js 24
- pnpm 11.17.0 (selected by Corepack from `packageManager`)
- Docker with Docker Compose

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
set -a
. ./.env
set +a
docker compose up -d --wait postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open:

- Web directory: <http://localhost:3000>
- API health: <http://localhost:3001>

`pnpm dev` starts the web app, API, and worker. Starting the worker creates an initial live Registry synchronization job against `MCP_REGISTRY_BASE_URL`; omit the worker when you only want to browse deterministic seed data.

```sh
pnpm --filter @themcpdirectory/web dev
pnpm --filter @themcpdirectory/api dev
```

See [Local development](docs/development.md) for database reset, migrations, fixture and live ingestion, process commands, tests, and production builds.

## Architecture

```text
Official MCP Registry ----> registry-client ----> registry-normalizer
                                                    |
GitHub API --------------------> domain <------------+
                                   |
                +------------------+------------------+
                |                  |                  |
              web                worker            search
                |                  |                  |
                +------------------+------------------+
                                   |
                           PostgreSQL / pg-boss
```

- `apps/web`: Next.js public directory
- `apps/api`: Hono health API running on Node.js
- `apps/worker`: Registry and GitHub background jobs
- `packages/db`: Drizzle schema, migrations, and database client
- `packages/domain`: framework-independent directory, ingestion, and enrichment behavior
- `packages/registry-client`: validated Official Registry HTTP client
- `packages/registry-normalizer`: deterministic Registry normalization
- `packages/search`: PostgreSQL query construction and ranking
- `packages/security`: outbound URL and SSRF protections
- `packages/ui`: shared visual tokens and UI primitives
- `tooling/db-seed`: deterministic local fixture seed

Authoritative product and engineering specifications live in [`docs/ai-docs`](docs/ai-docs). They include later-phase designs; this README describes only implemented behavior.

## Verification

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

The browser suite creates, migrates, seeds, and drops an isolated PostgreSQL database. Install its Chromium runtime once with `pnpm --filter @themcpdirectory/web exec playwright install chromium`.

## Contributing and Security

External code contributions are paused until the project selects licensing and contribution terms. Maintainers and invited contributors should read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Follow the private process in [SECURITY.md](SECURITY.md) for vulnerability details; never put technical vulnerability information in a public issue.

## License

No open-source license has been selected yet. Do not assume permission to copy, modify, or redistribute the repository until the project publishes an explicit license.
