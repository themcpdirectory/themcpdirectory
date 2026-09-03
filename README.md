![The MCP Directory Logo](assets/wordmark-with-bg-1000x216.svg)

The MCP Directory is an open directory for discovering and installing Model Context Protocol (MCP) servers. The repository includes Registry ingestion, deterministic normalization, PostgreSQL search, GitHub repository enrichment, a versioned public API, and the `mcpdir` CLI.

## Current Features

- Public directory pages for search, categories, server details, aliases, robots, and sitemap
- Official MCP Registry client with validated pagination and typed failures
- Transactional, idempotent Registry ingestion with immutable raw snapshots
- PostgreSQL full-text and trigram search with deterministic ranking
- Optional authenticated GitHub enrichment with append-only repository snapshots
- PostgreSQL-backed `pg-boss` worker queues
- Deterministic local seed data and isolated Playwright browser tests
- Versioned public discovery and install-manifest contracts under `/api/v1`
- `mcpdir` support for Claude Code, Codex, Cursor, and VS Code

## CLI

Build the executable and inspect its commands:

```sh
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
```

The CLI provides `search`, `info`, `add`, `list`, `remove`, `update`, and `doctor`. It uses `http://127.0.0.1:3001/api/v1` by default; set `MCPDIR_API_BASE_URL` to use another Directory API.

Install and removal plans are restricted to adapter-owned executables, configuration roots, capabilities, and deeplinks. Mutating commands show or require confirmation unless `--yes` is supplied, receipts are written only after successful verification, and `doctor` performs read-only configuration inspection without starting installed MCP servers. Output and receipts never contain environment values or persisted secrets.

The workspace build is intended for local development. Packed-tarball verification and publishing remain Phase H work.

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

## Deployment

The MVP can be deployed from Git to Portainer Business Edition on Docker Standalone. GitHub Actions publishes the workspace image to GHCR, and the production stack pulls it, runs migrations, starts the public web directory and Registry worker, keeps PostgreSQL private, and connects the web service to an existing Nginx Proxy Manager network.

See [Portainer deployment](docs/deployment.md) for required environment variables, stack settings, proxy configuration, updates, backups, and rollback constraints.

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
- `packages/api-contract`: versioned public API and install-manifest schemas
- `packages/cli`: bundled `mcpdir` command-line client
- `packages/client-adapters`: Claude Code, Codex, Cursor, and VS Code integration
- `packages/directory-client`: validated public API transport
- `packages/install-engine`: deterministic intent, hashing, and plan validation
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

Run the focused CLI integration and binary checks with:

```sh
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/integration-cli.test.ts src/__tests__/binary-smoke.test.ts
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
```

The browser suite creates, migrates, seeds, and drops an isolated PostgreSQL database. Install its Chromium runtime once with `pnpm --filter @themcpdirectory/web exec playwright install chromium`.

## Contributing and Security

External code contributions are paused until the project selects licensing and contribution terms. Maintainers and invited contributors should read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Follow the private process in [SECURITY.md](SECURITY.md) for vulnerability details; never put technical vulnerability information in a public issue.

## License

No open-source license has been selected yet. Do not assume permission to copy, modify, or redistribute the repository until the project publishes an explicit license.
