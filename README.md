<p align="center">
  <a href="https://themcpdirectory.org">
    <img src="assets/wordmark-with-bg-1000x216.svg" alt="The MCP Directory" width="760">
  </a>
</p>

<p align="center"><strong>Find it. Trust it. Install it.</strong></p>

<p align="center">
  The open discovery and installation layer for the Model Context Protocol ecosystem.
  Search MCP servers, inspect the evidence behind each listing, and manage installations across your development tools with one CLI.
</p>

<p align="center">
  <a href="https://themcpdirectory.org">Explore the directory</a>
  ·
  <a href="#install-the-cli">Install the CLI</a>
  ·
  <a href="#how-it-works">How it works</a>
  ·
  <a href="#quick-start">Quick start</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@themcpdirectory/cli"><img src="https://img.shields.io/npm/v/@themcpdirectory/cli?style=flat-square&amp;label=mcpdir&amp;color=111111" alt="mcpdir version on npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/clients-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor%20%C2%B7%20VS%20Code-111111?style=flat-square" alt="Supports Claude Code, Codex, Cursor, and Visual Studio Code">
</p>

## Install the CLI

Run `mcpdir` with Node.js 24. The primary installation path is one command:

```sh
npx mcpdir add github
```

Search, inspect, and target a supported client from the same command surface:

```sh
npx mcpdir search github
npx mcpdir info github
npx mcpdir add github --to cursor
```

For repeated use, install the canonical scoped package globally:

```sh
npm install --global @themcpdirectory/cli
```

One command surface works across **Claude Code**, **Codex**, **Cursor**, and **Visual Studio Code**.

```text
Search  →  Inspect  →  Review  →  Install
```

Use `mcpdir` to manage the rest of the lifecycle:

```sh
npx mcpdir list
npx mcpdir update
npx mcpdir doctor
npx mcpdir remove github
```

Run `mcpdir` without arguments for an interactive experience, or use explicit commands and `--json` for scripts and automation.

## Why The MCP Directory?

An MCP server listing should help you make a decision, not just add another name to a long list.

### Find it

Search a normalized mirror of the Official MCP Registry by name, capability, category, and client compatibility. Stable aliases keep listings discoverable when packages or repositories move.

### Trust it

Inspect factual signals such as Registry provenance, publisher authority, source availability, repository activity, version metadata, and observed endpoint health. Signals remain explainable: there is no opaque trust score, paid verification, or implied endorsement.

### Install it

Preview client-aware configuration changes before they happen. `mcpdir` validates its plan, asks for confirmation, applies only adapter-owned changes, and verifies the result before writing a receipt.

## Built for Review, Not Blind Execution

- **Plans before mutation.** Use `--dry-run` to inspect validated install, update, and removal plans.
- **Explicit approval.** Mutating commands ask for confirmation unless you provide `--yes`.
- **Bounded changes.** Adapters restrict which executables, configuration roots, capabilities, and deeplinks a plan may use.
- **Secrets stay out of output.** Environment values and persisted secrets are excluded from rendered plans and receipts.
- **Read-only diagnosis.** `mcpdir doctor` inspects configuration without starting installed MCP servers.
- **Stable automation.** Versioned JSON envelopes and public API contracts support tooling without scraping terminal output.

The Directory presents evidence, not certification. Every trust and health signal is an observation with source and context, not a security guarantee.

## How It Works

```text
Official MCP Registry ──> normalized listings ──> search and server pages
          GitHub API ──> repository evidence ──> trust and health signals
                                                     │
Public API <─────────────────────────────────────────┘
    │
    └──> mcpdir ──> reviewed adapter plan ──> local client configuration
```

The platform combines five open-source systems:

- **Directory:** fast public search, categories, server details, aliases, and source provenance
- **Registry pipeline:** validated ingestion, deterministic normalization, and immutable raw snapshots
- **Evidence layer:** repository enrichment and bounded health observations without hidden scoring
- **Public API:** versioned discovery and install-manifest contracts under `/api/v1`
- **CLI:** search, inspect, add, list, update, diagnose, and remove across supported clients

## CLI Reference

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `mcpdir search <query>`  | Search directory listings                          |
| `mcpdir info <slug>`     | Inspect one server and its metadata                |
| `mcpdir add <slug>`      | Review and install an MCP server                   |
| `mcpdir list`            | List Directory-managed installations               |
| `mcpdir update [server]` | Preview and apply available updates                |
| `mcpdir doctor`          | Diagnose Directory and client configuration health |
| `mcpdir remove <slug>`   | Review and remove an installation                  |

The CLI connects to `https://api.themcpdirectory.org/api/v1` by default. Set `MCPDIR_API_BASE_URL` to use another Directory API or `MCPDIR_STATE_DIR` to isolate receipt state.

`add` accepts a canonical slug or alias, an Official MCP Registry or package identifier, a validated GitHub `owner/repository` identifier, or a validated `https://github.com/owner/repository` URL. Resolution uses normalized Directory and validated repository metadata only; README text is never scraped or executed.

Every install response includes a canonical SHA-256 manifest hash. The CLI verifies the hash before planning a change and records it in the installation receipt. The API also exposes the same manifest at a hash-addressed immutable snapshot URL.

Embed a server's CLI-reported successful-add total with the dynamic badge URL:

```text
https://api.themcpdirectory.org/b/<slug>.svg
```

## CLI Telemetry

Privacy-minimal CLI telemetry is enabled by default and is best-effort. A reporting timeout or failure never changes the command result. Set `DO_NOT_TRACK=1` or `MCPDIR_DISABLE_TELEMETRY=1` to disable telemetry before an event is constructed.

The CLI event payload contains the event, canonical slug when known, exact CLI version, supported target client when applicable, success, and package or remote variant when applicable. Storage retains CLI major/minor instead of the exact version and adds the server receipt time. It does not persist the search query, raw identifier, arguments, paths, configuration or project content, error text, secrets, IP address, user agent, cookie, request ID, or a persistent device, installation, or person identifier. Network infrastructure necessarily processes source addresses and HTTP metadata transiently to deliver requests and limit abuse; the telemetry route is excluded from application request logs.

Raw events are retained for seven days and daily aggregates for thirteen months. Public display exposes anonymous, CLI-reported successful add totals and supported-client totals only; these counts are abuse-limited reports, not verified unique users or installations.

## Publish A Server

Maintainers can create an `mcpdir.json` file that validates to the Official MCP Registry ServerJSON schema, validate it locally, and publish its validated `server` object:

```sh
npx mcpdir init --package @example/mcp-server --name io.github.example/mcp-server --description "An MCP server" --version 1.2.3
npx mcpdir validate
MCP_REGISTRY_TOKEN=... npx mcpdir publish
```

Use `mcpdir init --remote https://mcp.example.com/v1` for a remote server. `publish` requires `MCP_REGISTRY_TOKEN` and sends `POST /v0/publish` to the Official MCP Registry. `MCP_REGISTRY_BASE_URL` may override the Registry origin only with a public HTTPS URL without embedded credentials.

## Architecture

This repository is a pnpm monorepo. The main ownership boundaries are:

- `apps/web`: Next.js public directory and publisher surfaces
- `apps/api`: versioned Hono public API
- `apps/worker`: Registry and GitHub background jobs
- `packages/domain`: framework-independent directory, ingestion, and enrichment behavior
- `packages/db`: Drizzle schema, migrations, and PostgreSQL client
- `packages/search`: full-text and trigram query construction and deterministic ranking
- `packages/api-contract`: versioned public API and install-manifest schemas
- `packages/cli`: bundled `mcpdir` command-line client
- `packages/mcpdir`: unscoped npm wrapper for the canonical CLI package
- `packages/client-adapters`: Claude Code, Codex, Cursor, and VS Code integration
- `packages/install-engine`: deterministic intent, hashing, and plan validation
- `packages/security`: outbound URL and SSRF protections

Authoritative product and engineering specifications live in [`docs/ai-docs`](docs/ai-docs). They include later-phase designs; this README describes implemented behavior.

## Quick Start

### Requirements

- Node.js 24
- pnpm 11.17.0, selected by Corepack from `packageManager`
- Docker with Docker Compose

### Run the directory locally

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
pnpm --filter @themcpdirectory/web dev
```

Open <http://localhost:3000>.

The copied `.env.example` is sufficient for the anonymous web app and shared database commands, but not for `pnpm dev`. The standalone API additionally requires `API_CURSOR_SIGNING_SECRET`; the worker and publisher routes require dedicated development GitHub OAuth and GitHub App credentials. Starting the worker creates an initial live Registry synchronization job.

See [Local development](docs/development.md) for environment setup, database resets, migrations, ingestion, process commands, and test workflows.

### Build the repository CLI

```sh
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
```

`pnpm release:cli-tarballs` builds, inspects, hashes, installs, and smoke-tests both the canonical CLI and unscoped wrapper in an isolated temporary environment before publication. The existing `pnpm release:cli-tarball` command remains as a compatibility alias.

## Verification

Run the complete release-candidate gate from the repository root:

```sh
pnpm verify:release
```

pnpm verify:release does not publish to npm or deploy the stack. Individual checks remain available:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

See the [release runbook](docs/release-runbook.md) for versioning, release evidence, migration and deployment order, health checks, smoke tests, and recovery decisions.

## Deployment Status

A reference deployment targets Portainer Business Edition on Docker Standalone, with GHCR images, private PostgreSQL, migrations, the public web directory, and background workers. See [Portainer deployment](docs/deployment.md) for the topology and operational procedure.

> [!WARNING]
> **Production deployment is blocked.** The reference stack does not yet deploy or proxy the standalone public API or pass all required publisher-authentication configuration. Do not execute the production procedure until every applicable [production authorisation blocker](docs/production-authorisation-blockers.md) is resolved and each external action is explicitly approved.

## Contributing and Security

External code contributions are paused while the project finalizes its contribution terms. Maintainers and invited contributors should read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.

Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md). Never include technical vulnerability details in a public issue.

## License

The MCP Directory is open source under the [MIT License](LICENSE).
