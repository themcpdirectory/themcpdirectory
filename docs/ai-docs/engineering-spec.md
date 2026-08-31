# The MCP Directory

## Engineering Architecture Specification

**Version:** 0.1
**Status:** Implementation Specification
**Brand:** The MCP Directory
**Domain:** themcpdirectory.org
**GitHub:** github.com/themcpdirectory
**npm scope:** @themcpdirectory
**CLI package:** @themcpdirectory/cli
**CLI binary:** mcpdir

# 1. Purpose

This document defines the concrete software architecture for The MCP Directory.

It is intentionally prescriptive.

A coding agent implementing this specification should not replace architectural decisions with alternative frameworks, databases, APIs, queue systems or storage models unless an implementation blocker makes the specified approach impossible.

The MVP should remain operationally simple, self hostable and understandable by a small engineering team.

# 2. Architecture overview

The system contains three deployable applications:

```text
Web
API
Worker
```

and one independently published CLI:

```text
@themcpdirectory/cli
```

The primary infrastructure dependency is PostgreSQL.

PostgreSQL is used for:

* application data
* normalized Registry data
* search
* background job coordination
* authentication data
* audit data
* moderation data

Do not introduce Redis, Elasticsearch, Kafka or a separate search service during the MVP.

# 3. Technology decisions

## Runtime

Node.js LTS.

## Language

TypeScript with strict mode enabled everywhere.

The following must be enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Package manager

pnpm.

## Monorepo

pnpm workspaces plus Turborepo.

## Website

Next.js with App Router.

## API

Hono running on Node.js.

The public API is intentionally separated from the Next.js application.

The CLI must never depend on Next.js route handlers or internal web application endpoints.

## Database

PostgreSQL.

Required extensions:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
```

## ORM

Drizzle ORM.

## Runtime validation

Zod.

Every external boundary must be runtime validated.

This includes:

* Official MCP Registry responses
* public API requests
* public API responses
* CLI API responses
* GitHub responses used by business logic
* publisher supplied metadata
* environment configuration

## Authentication

Better Auth.

Initial login provider:

```text
GitHub
```

Email and password authentication should not be enabled for the MVP.

## Background jobs

pg-boss.

This allows PostgreSQL to remain the only required stateful backend service during the MVP.

## Search

PostgreSQL full text search plus `pg_trgm`.

## Frontend styling

Tailwind CSS.

Shared visual components belong in `packages/ui`.

## Tests

Vitest:

```text
unit tests
integration tests
contract tests
```

Playwright:

```text
browser end to end tests
```

# 4. Monorepo structure

Use this repository layout:

```text
themcpdirectory/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── api-contract/
│   ├── auth/
│   ├── cli/
│   ├── client-adapters/
│   ├── config/
│   ├── db/
│   ├── domain/
│   ├── install-engine/
│   ├── registry-client/
│   ├── registry-normalizer/
│   ├── search/
│   ├── security/
│   ├── test-utils/
│   └── ui/
│
├── docs/
│   ├── product-specification.md
│   ├── engineering-specification.md
│   ├── api.md
│   ├── cli.md
│   ├── security.md
│   └── contributing.md
│
├── tooling/
│   ├── eslint/
│   ├── typescript/
│   └── scripts/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

# 5. Package responsibilities

## apps/web

Responsible only for the web product.

Contains:

* public pages
* search interface
* listing pages
* category pages
* client pages
* documentation pages
* authentication UI
* publisher dashboard
* moderation UI

Server rendered pages may call `packages/domain` directly.

The web application must not contain Registry synchronization logic.

## apps/api

Public HTTP API.

Responsibilities:

* server discovery API
* search API
* installation resolution API
* categories API
* publishers API
* clients API
* CLI API
* future authenticated publisher API

The API owns `/api/v1`.

## apps/worker

Runs scheduled and asynchronous jobs.

Responsibilities:

* Registry synchronization
* Registry normalization
* GitHub enrichment
* package enrichment
* remote health probes
* trust signal refresh
* search document refresh
* stale listing processing

## packages/api-contract

Contains all public API Zod schemas and TypeScript types.

Both API and CLI depend on this package.

Example:

```text
ServerSummarySchema
ServerDetailSchema
ResolveServerSchema
InstallManifestSchema
SearchRequestSchema
SearchResponseSchema
ApiErrorSchema
```

This package must not depend on the database package.

## packages/auth

Contains Better Auth configuration and authorization helpers.

## packages/cli

Published to npm as:

```text
@themcpdirectory/cli
```

Binary:

```text
mcpdir
```

## packages/client-adapters

Contains MCP client integrations.

Initial adapters:

```text
codex
claude-code
cursor
```

## packages/config

Environment validation and shared configuration.

## packages/db

Contains:

* Drizzle schema
* migrations
* database client
* transaction helpers

No business logic belongs here.

## packages/domain

Contains application business logic.

Examples:

```text
getServer
resolveServer
claimServer
verifyPublisher
moderateServer
calculateTrustProfile
```

This is the primary business layer used by Web, API and Worker.

## packages/install-engine

Converts normalized Directory installation manifests into client specific installation plans.

## packages/registry-client

HTTP client for the Official MCP Registry.

It should know nothing about the local database.

## packages/registry-normalizer

Transforms external Registry schemas into the Directory internal model.

## packages/search

Search query construction and ranking.

## packages/security

Contains:

* URL safety validation
* SSRF protection
* package integrity helpers
* HTML and Markdown sanitization
* trusted origin validation

## packages/ui

Reusable website components.

No domain logic.

# 6. Dependency rules

Dependencies must flow inward.

Allowed:

```text
web -> domain
api -> domain
worker -> domain

domain -> db
domain -> search
domain -> security

cli -> api-contract
cli -> client-adapters
cli -> install-engine

registry-normalizer -> api-contract
```

Forbidden:

```text
db -> domain
ui -> db
api-contract -> db
client-adapters -> web
cli -> db
cli -> internal database
```

The CLI communicates exclusively through the public API.

# 7. Database conventions

All internal primary keys use PostgreSQL UUIDs.

Generate UUIDs using PostgreSQL.

Every mutable business table should contain:

```text
created_at timestamptz
updated_at timestamptz
```

External identifiers must never become internal primary keys.

Use `jsonb` only when the represented data is genuinely variable or external.

Core searchable entities should remain relational.

# 8. Registry sources table

```text
registry_sources
```

Fields:

```text
id                  uuid primary key
key                 text unique not null
name                text not null
base_url            text not null
kind                text not null
enabled             boolean not null default true
created_at          timestamptz not null
updated_at          timestamptz not null
```

Initial source:

```text
key: official
name: Official MCP Registry
kind: mcp-registry
```

This allows additional compatible registries to be added later without changing the schema.

# 9. Registry synchronization runs

```text
registry_sync_runs
```

Fields:

```text
id                  uuid primary key
registry_source_id  uuid not null
started_at          timestamptz not null
finished_at         timestamptz
status              text not null
cursor_start        text
cursor_end          text
records_seen        integer not null default 0
records_created     integer not null default 0
records_updated     integer not null default 0
records_failed      integer not null default 0
error_summary       text
created_at          timestamptz not null
```

Statuses:

```text
running
succeeded
partially_failed
failed
```

# 10. Raw Registry snapshots

Every upstream version observed must be preservable.

Table:

```text
registry_snapshots
```

Fields:

```text
id                  uuid primary key
registry_source_id  uuid not null
external_name       text not null
external_version    text not null
schema_uri          text
payload_hash        text not null
raw_payload         jsonb not null
first_seen_at       timestamptz not null
last_seen_at        timestamptz not null
created_at          timestamptz not null
```

Unique constraint:

```text
registry_source_id
external_name
external_version
payload_hash
```

Never modify `raw_payload` after insertion.

# 11. Publishers

Table:

```text
publishers
```

Fields:

```text
id                  uuid primary key
slug                citext unique not null
display_name        text not null
description         text
website_url         text
github_org          text
logo_url            text
verification_state  text not null default 'unverified'
created_at          timestamptz not null
updated_at          timestamptz not null
```

Verification states:

```text
unverified
pending
verified
rejected
revoked
```

# 12. Publisher memberships

```text
publisher_memberships
```

Fields:

```text
id
publisher_id
user_id
role
created_at
updated_at
```

Roles:

```text
owner
admin
editor
viewer
```

# 13. Servers

This is the canonical product entity.

Table:

```text
servers
```

Fields:

```text
id                      uuid primary key
slug                    citext unique not null
title                   text not null
short_description       text not null
long_description        text

canonical_registry_name text
publisher_id            uuid

listing_status          text not null
moderation_status       text not null

current_version_id      uuid

repository_url          text
repository_source       text
repository_external_id  text
repository_subfolder    text

homepage_url            text
documentation_url       text
license_spdx            text

source_available        boolean
open_source             boolean

first_seen_at           timestamptz not null
last_seen_at            timestamptz not null

created_at              timestamptz not null
updated_at              timestamptz not null
```

Listing statuses:

```text
active
deprecated
deleted_upstream
unavailable
```

Moderation statuses:

```text
normal
under_review
hidden
blocked
```

A server is publicly visible only when the combination of these fields allows publication.

# 14. Server aliases

```text
server_aliases
```

Fields:

```text
id
server_id
alias
kind
created_at
```

Unique:

```text
lower(alias)
```

Kinds:

```text
slug
package
legacy_name
repository
manual
```

Requests for aliases should redirect to the canonical slug when used through the website.

The API may resolve aliases transparently.

# 15. Server versions

```text
server_versions
```

Fields:

```text
id                    uuid primary key
server_id             uuid not null
registry_source_id    uuid
registry_snapshot_id  uuid

version               text not null
schema_uri            text
upstream_status       text

description           text
title                 text

published_at          timestamptz
first_seen_at         timestamptz not null
last_seen_at          timestamptz not null

normalized_payload    jsonb not null

created_at            timestamptz not null
updated_at            timestamptz not null
```

Unique:

```text
server_id
version
registry_source_id
```

The normalized payload is retained because future Registry versions may contain fields The MCP Directory does not yet expose relationally.

# 16. Packages

```text
server_packages
```

Fields:

```text
id                    uuid primary key
server_version_id     uuid not null

registry_type         text not null
registry_base_url     text
identifier            text not null
version               text
file_sha256           text
runtime_hint          text

transport_type        text not null

runtime_arguments     jsonb not null default '[]'
package_arguments     jsonb not null default '[]'
environment_variables jsonb not null default '[]'

created_at            timestamptz not null
```

Supported upstream registry types must not be hardcoded as a PostgreSQL enum.

The MCP Registry can evolve.

Known values currently include:

```text
npm
pypi
cargo
oci
nuget
mcpb
```

# 17. Remote endpoints

```text
server_remotes
```

Fields:

```text
id                uuid primary key
server_version_id uuid not null

transport_type    text not null
url_template      text not null

headers           jsonb not null default '[]'
variables         jsonb not null default '{}'

created_at        timestamptz not null
```

Known transports:

```text
streamable-http
sse
```

Do not assume the set will never expand.

# 18. Server icons

```text
server_icons
```

Fields:

```text
id
server_version_id
src
mime_type
sizes
theme
created_at
```

Remote SVG files must never be rendered directly without sanitization.

Prefer proxied and sanitized assets.

# 19. Categories

```text
categories
```

Fields:

```text
id
slug
name
description
sort_order
created_at
updated_at
```

Join table:

```text
server_categories
```

Fields:

```text
server_id
category_id
source
confidence
created_at
```

Source:

```text
manual
publisher
classifier
import
```

Publisher suggestions must not automatically become authoritative categories.

# 20. Trust signals

Table:

```text
trust_signals
```

Fields:

```text
id
server_id
server_version_id
signal_key
status
source
summary
details
checked_at
expires_at
created_at
updated_at
```

Example signal keys:

```text
publisher_verified
official_registry
official_publisher
repository_available
repository_identity_stable
open_source_license
package_available
package_integrity_hash
remote_reachable
recently_maintained
upstream_deleted
known_security_issue
```

Status:

```text
positive
neutral
warning
negative
unknown
```

Do not aggregate these into a single numerical Trust Score during the MVP.

# 21. Health checks

```text
server_health_checks
```

Fields:

```text
id
server_id
server_version_id
remote_id
check_type
status
latency_ms
http_status
error_code
error_summary
checked_at
created_at
```

Never store authentication secrets used during probes.

Initial remote probe:

```text
DNS resolution
TCP and TLS reachability
HTTP endpoint reachability
safe MCP initialization where possible without authentication
```

# 22. GitHub enrichment

Table:

```text
repository_snapshots
```

Fields:

```text
id
server_id
provider
external_repository_id
owner
name
url
default_branch
is_archived
is_fork
stars
forks
open_issues
license_spdx
last_push_at
last_release_at
payload
checked_at
created_at
```

The stable provider repository ID is critical.

Repository URL alone is insufficient because repositories can be renamed, transferred, deleted or recreated.

# 23. Client compatibility

```text
client_compatibility
```

Fields:

```text
id
server_id
client_id
status
reason
checked_at
created_at
updated_at
```

Client IDs:

```text
codex
claude-code
cursor
```

Status:

```text
supported
supported_with_configuration
unsupported
unknown
```

Compatibility should usually be calculated rather than manually edited.

# 24. Client specific overrides

Some MCP servers will have quirks that cannot be reliably inferred.

Use:

```text
install_overrides
```

Fields:

```text
id
server_id
client_id
variant_id
override_payload
reason
source
approved_by
created_at
updated_at
```

Every manual override requires an explanation.

Overrides must not permit arbitrary shell scripts.

# 25. Reports and moderation

```text
reports
```

Fields:

```text
id
server_id
reporter_user_id
reporter_email
category
message
status
created_at
updated_at
```

Categories:

```text
malware
impersonation
incorrect_metadata
broken
abandoned
security
spam
other
```

Moderation audit:

```text
moderation_events
```

Fields:

```text
id
server_id
actor_user_id
action
reason
metadata
created_at
```

Moderation history is append only.

# 26. Authentication tables

Better Auth owns its own required tables.

Do not manually redesign Better Auth session or account storage.

The application user ID referenced by Directory tables must correspond to the Better Auth user ID.

# 27. Search document

Add a materialized search representation to `servers`.

Fields:

```text
search_document tsvector
search_text text
```

`search_text` should contain normalized combinations of:

```text
title
slug
aliases
description
publisher
registry name
package identifiers
categories
```

Indexes:

```sql
CREATE INDEX servers_search_document_idx
ON servers USING GIN(search_document);

CREATE INDEX servers_title_trgm_idx
ON servers USING GIN(title gin_trgm_ops);

CREATE INDEX servers_slug_trgm_idx
ON servers USING GIN(slug gin_trgm_ops);
```

# 28. Search ranking

Organic ranking should use a deterministic score.

Suggested conceptual formula:

```text
textual relevance
+
exact slug boost
+
exact title boost
+
alias boost
+
publisher verification boost
+
active maintenance boost
+
metadata completeness boost
+
official Registry signal
+
small popularity boost
```

Popularity must not dominate relevance.

Sponsored status is never part of this formula.

Search ranking should be implemented in `packages/search` and covered by snapshot tests.

# 29. Public API conventions

Base URL:

```text
https://themcpdirectory.org/api/v1
```

JSON only.

UTF 8.

All timestamps use RFC 3339 UTC.

# 30. API success format

Single resource:

```json
{
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

Collection:

```json
{
  "data": [],
  "meta": {
    "requestId": "...",
    "nextCursor": null
  }
}
```

# 31. API error format

Every API error uses:

```json
{
  "error": {
    "code": "SERVER_NOT_FOUND",
    "message": "Server not found",
    "requestId": "..."
  }
}
```

Optional validation details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "requestId": "...",
    "details": [
      {
        "path": "client",
        "message": "Unsupported client"
      }
    ]
  }
}
```

Never leak stack traces.

# 32. Pagination

Use cursor pagination.

Do not expose database offsets for primary API collections.

Example:

```text
GET /api/v1/servers?limit=30&cursor=abc
```

Maximum limit:

```text
100
```

Default:

```text
30
```

# 33. GET /servers

Request:

```text
GET /api/v1/servers
```

Filters:

```text
q
category
publisher
client
transport
registryType
verified
openSource
status
sort
cursor
limit
```

Sort options:

```text
relevance
recent
updated
popular
name
```

Response summary:

```json
{
  "data": [
    {
      "slug": "github",
      "title": "GitHub",
      "description": "Access GitHub repositories, issues and pull requests.",
      "publisher": {
        "slug": "github",
        "name": "GitHub",
        "verified": true
      },
      "version": "1.2.3",
      "repository": {
        "url": "https://github.com/example/example"
      },
      "signals": {
        "officialRegistry": true,
        "publisherVerified": true,
        "sourceAvailable": true
      }
    }
  ],
  "meta": {
    "nextCursor": null,
    "requestId": "..."
  }
}
```

# 34. GET /servers/:slug

```text
GET /api/v1/servers/github
```

Returns:

```text
identity
publisher
descriptions
current version
repository
packages
remotes
categories
trust profile
client compatibility
timestamps
```

Raw upstream Registry payload is not part of the standard public response.

A separate provenance response may expose it later.

# 35. GET /resolve/:identifier

Primary CLI resolution endpoint:

```text
GET /api/v1/resolve/github
```

The identifier may match:

```text
canonical slug
alias
Registry name
known package identifier
```

Response:

```json
{
  "data": {
    "serverId": "uuid",
    "slug": "github",
    "title": "GitHub",
    "version": "1.2.3",
    "canonicalUrl": "https://themcpdirectory.org/github"
  }
}
```

Ambiguous identifiers return:

```text
409 AMBIGUOUS_SERVER
```

with possible matches.

The CLI must never silently choose between ambiguous servers.

# 36. Installation manifest endpoint

```text
GET /api/v1/servers/:slug/install
```

Optional:

```text
?client=codex
```

Response:

```json
{
  "data": {
    "schemaVersion": 1,
    "server": {
      "id": "uuid",
      "slug": "github",
      "title": "GitHub",
      "version": "1.2.3"
    },
    "provenance": {
      "registry": "official",
      "registryName": "io.github.example/github",
      "observedAt": "2026-08-31T18:00:00Z"
    },
    "variants": [
      {
        "id": "remote-1",
        "kind": "remote",
        "transport": "streamable-http",
        "urlTemplate": "https://example.com/mcp",
        "headers": [],
        "variables": []
      },
      {
        "id": "npm-1",
        "kind": "package",
        "registryType": "npm",
        "identifier": "@example/github-mcp",
        "version": "1.2.3",
        "runtimeHint": "npx",
        "transport": "stdio",
        "runtimeArguments": [],
        "packageArguments": [],
        "environmentVariables": []
      }
    ],
    "compatibility": {
      "codex": "supported",
      "claude-code": "supported",
      "cursor": "supported"
    }
  },
  "meta": {
    "requestId": "..."
  }
}
```

# 37. Manifest rules

The installation manifest is declarative.

It may describe:

```text
runtime
package
arguments
environment variables
remote URL
headers
variables
transport
version
integrity information
```

It may never contain:

```text
shell script
postinstall script
arbitrary executable code
JavaScript expression
PowerShell expression
bash expression
```

# 38. API contract generation

`packages/api-contract` contains Zod schemas.

OpenAPI documentation should be generated from the same source where practical.

Do not separately maintain incompatible TypeScript and OpenAPI models.

# 39. Official MCP compatible subregistry

This is separate from the Directory product API.

Future route:

```text
/registry/v0.1/servers
```

The response should follow the upstream MCP Registry OpenAPI contract.

Directory metadata belongs under:

```text
_meta["org.themcpdirectory/*"]
```

Examples:

```text
org.themcpdirectory/trust
org.themcpdirectory/health
org.themcpdirectory/publisher
```

Do not modify standard MCP Registry fields with Directory specific meanings.

# 40. Registry synchronization algorithm

The synchronization worker performs:

```text
1. Start sync run
2. Fetch Registry page
3. Validate upstream response
4. Store raw snapshot
5. Normalize Registry server
6. Resolve canonical server identity
7. Upsert server version
8. Upsert package records
9. Upsert remote records
10. Update server last seen timestamp
11. Determine current version
12. Queue enrichment jobs
13. Continue with upstream cursor
14. Complete sync run
```

The process must be resumable.

# 41. Identity resolution

Identity resolution order:

```text
1. Existing upstream Registry name mapping
2. Stable repository provider ID
3. Exact package identity
4. Existing manually approved alias
5. Create new server
```

Never merge two server records based solely on similar titles.

Example:

```text
Postgres
PostgreSQL MCP
Postgres MCP Server
```

may represent unrelated projects.

# 42. Current version selection

Prefer the newest active version observed in the upstream Registry.

Do not assume semantic versioning is always valid.

If SemVer parsing succeeds, it may be used.

Otherwise use upstream ordering and observed publication metadata.

# 43. Upstream deletion handling

If the Official Registry reports a version or server as deleted:

```text
preserve historical data
mark upstream state
stop recommending it
prevent normal installation by default
surface a warning
```

Do not physically delete the local record.

# 44. Worker queues

Initial pg-boss queues:

```text
registry.sync
registry.normalize

github.enrich

package.enrich

remote.health

trust.refresh

search.refresh
```

Each job must be idempotent.

# 45. Job retry policy

Network jobs:

```text
maximum retries: 5
exponential backoff
random jitter
```

Permanent validation failures must not retry indefinitely.

Store a summarized failure reason.

# 46. CLI command architecture

Commands:

```text
mcpdir add
mcpdir remove
mcpdir search
mcpdir info
mcpdir list
mcpdir update
mcpdir doctor
```

Future:

```text
mcpdir auth
mcpdir config
mcpdir registry
```

# 47. CLI package structure

```text
packages/cli/
├── src/
│   ├── commands/
│   │   ├── add.ts
│   │   ├── remove.ts
│   │   ├── search.ts
│   │   ├── info.ts
│   │   ├── list.ts
│   │   ├── update.ts
│   │   └── doctor.ts
│   │
│   ├── api/
│   ├── output/
│   ├── prompts/
│   ├── errors/
│   ├── config/
│   └── index.ts
└── package.json
```

# 48. mcpdir add flow

Command:

```bash
mcpdir add github
```

Flow:

```text
Resolve identifier
Fetch installation manifest
Detect installed MCP clients
Determine compatible variants
Ask for client if necessary
Ask for configuration inputs
Generate install plan
Display install plan
Request confirmation
Execute adapter
Verify configuration state
Display success
```

# 49. Noninteractive installation

```bash
mcpdir add github --to codex --yes
```

The command must fail if user input is required and no safe value exists.

Never silently invent required configuration.

Example:

```text
Error: GITHUB_TOKEN is required.

Set the environment variable and retry:

GITHUB_TOKEN=... mcpdir add github --to codex
```

Prefer references to existing environment variables over inserting secret values into configuration.

# 50. Installation plan model

Before installation, the install engine produces a client independent plan.

Example:

```json
{
  "server": "github",
  "client": "codex",
  "scope": "user",
  "operations": [
    {
      "type": "client-command",
      "executable": "codex",
      "args": [
        "mcp",
        "add",
        "github",
        "--",
        "npx",
        "-y",
        "@example/github-mcp@1.2.3"
      ]
    }
  ]
}
```

Or:

```json
{
  "operations": [
    {
      "type": "config-write",
      "path": "~/.cursor/mcp.json",
      "format": "json",
      "mutation": {}
    }
  ]
}
```

# 51. Allowed operation types

Initial:

```text
client-command
config-write
config-remove
deeplink
```

Explicitly forbidden:

```text
shell
script
eval
download-and-execute
```

# 52. Command execution

Use Node process spawning APIs with:

```text
shell: false
```

Executable and arguments must remain separate.

Never construct:

```text
codex mcp add github -- npx ...
```

as one shell string and pass it to a shell.

# 53. Client adapter contract

```ts
export interface McpClientAdapter {
  readonly id: ClientId
  readonly displayName: string

  detect(): Promise<ClientDetection>

  getScopes(): Promise<ClientScope[]>

  inspect(
    scope?: ClientScope
  ): Promise<InstalledMcpServer[]>

  planInstall(
    manifest: InstallManifest,
    options: InstallOptions
  ): Promise<InstallPlan>

  executeInstall(
    plan: InstallPlan
  ): Promise<InstallResult>

  planRemove(
    server: InstalledMcpServer
  ): Promise<InstallPlan>

  diagnose(): Promise<DiagnosticResult[]>
}
```

# 54. Codex adapter

Adapter ID:

```text
codex
```

Prefer the native Codex MCP CLI.

For stdio:

```bash
codex mcp add <name> -- <command> <args>
```

For supported remote servers, use the native Codex MCP configuration mechanism.

OAuth authentication remains a Codex responsibility.

Where OAuth is required, installation may finish with:

```bash
codex mcp login <name>
```

The Directory CLI should instruct the user rather than attempting to become the OAuth intermediary.

# 55. Claude Code adapter

Adapter ID:

```text
claude-code
```

Prefer:

```bash
claude mcp add
```

For remote HTTP servers:

```bash
claude mcp add --transport http <name> <url>
```

For stdio:

```bash
claude mcp add <name> -- <command> <args>
```

Supported scopes should map to Claude Code scopes.

The adapter should not manually edit Claude configuration when the installed Claude CLI provides the required operation.

# 56. Cursor adapter

Adapter ID:

```text
cursor
```

Preferred installation order:

```text
1. Cursor MCP install deeplink when possible
2. Native programmatic mechanism where available and suitable
3. Safe mcp.json modification
```

Global configuration:

```text
~/.cursor/mcp.json
```

Project configuration:

```text
.cursor/mcp.json
```

When writing JSON:

```text
read
parse
validate
create backup
modify object
write temporary file
atomic rename
parse again
```

Never overwrite malformed configuration.

# 57. Cursor deeplink generation

Cursor supports MCP installation links.

Generate the configuration object, serialize it and Base64 encode it.

The Directory website may expose:

```text
Add to Cursor
```

This is separate from:

```text
mcpdir add github --to cursor
```

Both should use the same normalized installation manifest.

# 58. Client detection

Each adapter returns:

```ts
type ClientDetection = {
  installed: boolean
  executable?: string
  version?: string
  capabilities: string[]
}
```

Executable discovery must account for:

```text
macOS
Linux
Windows
```

Never require clients to be installed at hardcoded paths.

# 59. mcpdir list

The CLI asks each detected adapter for configured servers.

Output:

```text
NAME        CLIENT        SCOPE      TRANSPORT
github      Codex         user       http
supabase    Claude Code   project    http
playwright  Cursor        global     stdio
```

The Directory must distinguish between:

```text
installed through mcpdir
discovered but installed externally
```

Both should still be inspectable.

# 60. Local CLI state

Optional local state:

```text
~/.config/mcpdir/state.json
```

Platform appropriate locations should be used.

State may contain:

```text
Directory installation receipts
server slug
client
installed version
installation timestamp
manifest hash
```

Never store:

```text
API keys
OAuth access tokens
client secrets
raw environment secret values
```

# 61. Installation receipt

After a successful installation:

```json
{
  "schemaVersion": 1,
  "slug": "github",
  "client": "codex",
  "serverVersion": "1.2.3",
  "manifestHash": "...",
  "installedAt": "..."
}
```

Receipts allow:

```text
mcpdir update
mcpdir doctor
```

to behave more intelligently.

# 62. mcpdir update

Default behavior:

```bash
mcpdir update
```

checks installed Directory receipts.

It does not automatically update without user confirmation.

Example:

```text
GitHub
1.2.3 -> 1.4.0

Playwright
0.8.0 -> 0.9.1

Update both? [Y/n]
```

# 63. mcpdir doctor

Doctor checks:

```text
Directory API connectivity
detected clients
config file syntax
server configuration presence
missing environment variables
package availability
version drift
upstream deletion
known Directory warnings
```

Doctor must not execute arbitrary stdio MCP server packages.

# 64. Authentication architecture

Website login uses GitHub.

User accounts exist primarily for:

```text
publisher claims
publisher administration
moderation
future advertising
```

Browsing and installing MCP servers requires no account.

# 65. Publisher claim flow

Flow:

```text
Sign in with GitHub
Select listing
Request claim
Determine verification method
Verify control
Create publisher membership
Record audit event
```

# 66. GitHub publisher verification

Possible evidence:

```text
repository administration permission
organization ownership or sufficiently privileged role
verified relationship to repository
```

Verification code must use stable GitHub repository and organization identifiers where possible.

Do not trust display names alone.

# 67. Domain verification

Future domain claim method:

```text
TXT record
```

Example:

```text
_mcpdirectory.example.com
```

Value:

```text
mcpdir-verification=<random-token>
```

Tokens:

```text
cryptographically random
single purpose
expiring
hashed at rest where appropriate
```

# 68. Security boundary for remote URLs

All backend initiated remote requests must pass SSRF validation.

Block destinations resolving to:

```text
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
::1
fc00::/7
fe80::/10
cloud metadata services
```

Validation must happen before request and after redirects.

DNS rebinding must be considered.

# 69. Remote health probe restrictions

Health probes:

```text
maximum response size
strict timeout
redirect limit
safe methods
restricted headers
no user cookies
no Directory credentials
```

Never send publisher configured secrets during automated health probes.

# 70. Markdown and HTML

Descriptions are plain text by default.

If Markdown support is added:

```text
sanitize output
disable raw HTML
sanitize links
prevent scriptable URI schemes
```

Registry supplied HTML must never render directly.

# 71. Secrets

Production secrets live in deployment secret storage.

Never commit `.env`.

Required initial secrets:

```text
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL

GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET

GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY

MCP_REGISTRY_BASE_URL
```

Optional:

```text
SENTRY_DSN
```

# 72. Observability

Use structured JSON logging.

Every request should receive:

```text
requestId
```

Every worker job should contain:

```text
jobId
jobType
attempt
```

Do not log:

```text
authorization headers
cookies
API keys
OAuth tokens
secret environment values
```

# 73. Metrics

Initial metrics:

```text
API request count
API error count
API latency

Registry sync duration
Registry sync failures
Registry records processed

Worker queue depth
Worker failures

Remote endpoint availability

Search latency
Search zero result rate

CLI manifest resolution failures
```

CLI usage telemetry remains disabled by default.

# 74. Local development

Docker Compose should provide:

```text
PostgreSQL
```

Everything else should run locally through pnpm.

Start:

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

# 75. Seed development data

Provide fixtures containing at minimum:

```text
one npm stdio server
one remote HTTP server
one server with both package and remote variants
one unverified publisher
one verified publisher
one deprecated server
one upstream deleted server
one server requiring environment variables
one server requiring URL variables
one ambiguous alias scenario
```

Tests must not depend on the live Official MCP Registry.

# 76. Testing pyramid

## Unit tests

Required for:

```text
normalization
identity resolution
search ranking
manifest creation
trust signals
client configuration generation
URL validation
SSRF protection
alias resolution
```

## Integration tests

Use temporary PostgreSQL.

Test:

```text
Registry import
duplicate sync
version update
upstream deletion
search indexing
publisher claim
moderation state
```

## CLI contract tests

Given a fixed install manifest, verify exact generated plans for:

```text
Codex
Claude Code
Cursor
```

## End to end tests

Playwright:

```text
homepage loads
search works
listing opens
install command copies
category filtering works
GitHub login entry point works
publisher claim protected route works
```

# 77. Critical idempotency tests

Importing the same Registry data twice must result in:

```text
no duplicate server
no duplicate version
no duplicate package
no duplicate remote
no duplicate snapshot for identical payload hash
```

# 78. CI

Every pull request must run:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:cli
```

Main branch additionally runs:

```text
migration validation
dependency audit
secret scanning
```

# 79. Database migrations

Every schema modification requires a committed Drizzle migration.

Do not use destructive automatic schema synchronization in production.

Migration CI should verify that:

```text
empty database -> latest works
previous schema -> latest works
```

# 80. Deployment model

The architecture should work on any environment capable of running:

```text
Node.js
PostgreSQL
```

Do not make the core product depend on proprietary infrastructure APIs.

Suggested production process separation:

```text
web
api
worker
postgres
```

# 81. Caching

Public listing responses may be cached.

Cache keys must include API version and relevant query parameters.

Server record updates should invalidate affected listing and search caches.

Do not cache authenticated publisher responses in public caches.

# 82. Rate limiting

Initial public API limits should be generous.

Unauthenticated API:

```text
IP based limits
```

Authenticated publisher API:

```text
user and IP based limits
```

The CLI should receive a useful error response when rate limited.

HTTP:

```text
429
```

with retry metadata.

# 83. API backwards compatibility

The CLI may lag behind the website.

Therefore:

```text
old CLI versions must continue working against /api/v1
```

Do not make breaking changes to an existing API contract.

Introduce:

```text
/api/v2
```

when necessary.

# 84. Installation manifest compatibility

Manifest contains:

```text
schemaVersion
```

The CLI must reject unsupported future manifest versions with a clear upgrade message.

Example:

```text
This installation manifest requires a newer version of mcpdir.

Run:

npm install -g @themcpdirectory/cli@latest
```

# 85. Promotion architecture

Do not implement advertising in the initial launch path.

Reserve tables:

```text
campaigns
campaign_placements
campaign_impressions
campaign_clicks
```

Sponsored results must always be delivered separately from organic search results.

API concept:

```json
{
  "data": [...],
  "sponsored": [...]
}
```

Never insert paid entries into the organic result array as if they ranked naturally.

# 86. Analytics architecture

Website analytics should be privacy respecting.

MVP should not require cross site trackers.

Track product events such as:

```text
search performed
listing viewed
install command copied
client selected
sponsored listing clicked
```

Avoid storing complete IP addresses longer than operationally necessary.

# 87. Repository documentation

Root README should contain:

```text
what The MCP Directory is
local development
CLI installation
architecture overview
contributing
security reporting
license
```

Do not fill the README with marketing screenshots before contributor documentation is usable.

# 88. Licensing

Recommended:

```text
CLI: Apache 2.0
API contracts: Apache 2.0
client adapters: Apache 2.0
install engine: Apache 2.0
```

Hosted server components may use:

```text
AGPL 3.0
```

Final licensing choice should be reviewed before accepting external contributions.

# 89. Initial implementation sequence

## Phase A

Repository foundation:

```text
monorepo
TypeScript config
linting
formatting
CI
Docker Compose
PostgreSQL
Drizzle
migrations
```

## Phase B

Registry core:

```text
Registry client
Registry response schemas
snapshots
normalizer
servers
versions
packages
remotes
sync worker
```

## Phase C

Directory:

```text
server query layer
search
homepage
search page
server detail page
categories
```

## Phase D

API:

```text
/api/v1/servers
/api/v1/servers/:slug
/api/v1/resolve/:identifier
/api/v1/servers/:slug/install
```

## Phase E

CLI:

```text
mcpdir add
Codex adapter
Claude Code adapter
Cursor adapter
dry run
installation receipts
```

## Phase F

Trust:

```text
GitHub enrichment
trust signals
health checks
upstream deletion warnings
```

## Phase G

Publisher:

```text
GitHub authentication
publisher entity
claim listing
verification
dashboard
```

## Phase H

Launch:

```text
documentation
security policy
privacy policy
terms
SEO
accessibility
performance
release CLI
```

# 90. Definition of done for mcpdir add

This feature is not done until the following works:

```text
mcpdir add <slug>
mcpdir add <alias>
mcpdir add <slug> --to codex
mcpdir add <slug> --to claude-code
mcpdir add <slug> --to cursor
mcpdir add <slug> --dry-run
```

and:

```text
required inputs are handled
secrets are not leaked
existing configuration survives
invalid configuration is not overwritten
package versions are pinned
ambiguous servers fail safely
unsupported clients fail clearly
API errors are understandable
```

# 91. Definition of done for Registry ingestion

Registry ingestion is complete when:

```text
every fetched response is validated
raw payloads are retained
normalization is deterministic
sync is resumable
sync is idempotent
multiple versions work
packages are preserved
remotes are preserved
upstream deletion works
schema changes do not destroy historical data
```

# 92. Definition of done for server pages

Every public server page must answer:

```text
What is this?
Who publishes it?
Where did this listing come from?
What version is current?
Is the source available?
How recently was it maintained?
How is it installed?
What configuration does it require?
Which clients can use it?
Are there warnings I should know about?
```

# 93. Architecture principle

The core flow of the entire product is:

```text
Official MCP Registry
        ↓
Raw immutable snapshot
        ↓
Validation
        ↓
Normalization
        ↓
Canonical server identity
        ↓
Enrichment
        ↓
Trust signals
        ↓
Public Directory API
        ↓
Website
        ↓
@themcpdirectory/cli
        ↓
Client adapter
        ↓
Codex / Claude Code / Cursor
```

No external Registry object should travel directly from upstream into an installation command without validation and normalization.

# 94. Final implementation constraint

When there is a conflict between convenience and transparent installation behavior, choose transparency.

When there is a conflict between automatic installation and safety, choose safety.

When there is a conflict between supporting every MCP server and correctly supporting a smaller subset, choose correctness.

The MCP Directory should earn trust by being predictable.
