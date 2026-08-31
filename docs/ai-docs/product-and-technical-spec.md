# The MCP Directory

## Product and Technical Specification

**Version:** 0.1
**Status:** MVP Specification
**Domain:** themcpdirectory.org
**GitHub:** github.com/themcpdirectory
**npm scope:** @themcpdirectory
**CLI binary:** mcpdir

## 1. Product vision

The MCP Directory is an open source discovery, trust and installation layer for the Model Context Protocol ecosystem.

The product should solve three questions for developers:

**Find it. Trust it. Install it.**

The MCP Directory is not intended to become another huge uncurated list of MCP servers.

It should instead make it easy to:

* discover relevant MCP servers
* understand who publishes them
* inspect their source and metadata
* understand what they require
* see whether they appear maintained
* determine which MCP clients they support
* install them safely
* manage installed MCP servers through one consistent CLI

The long term goal is to become infrastructure for MCP discovery and distribution rather than merely a directory website.

## 2. Product principles

### 2.1 Open

Core infrastructure should be open source.

Registry data provenance must be visible.

Ranking rules must be documented.

Verification cannot be purchased.

### 2.2 Transparent

Sponsored placements must always be explicitly marked as sponsored.

Payment must never modify organic search ranking, verification state, health information or security information.

### 2.3 Safe by design

The CLI must treat all server supplied metadata as untrusted input.

Installation must never execute arbitrary commands through a shell.

Secrets must never be silently stored.

Potentially dangerous configuration changes must be visible before they are applied.

### 2.4 Developer first

The website should be fast, minimal and information dense.

The CLI should feel like a native developer tool.

Common tasks should require a single command.

### 2.5 Quality over quantity

The homepage should never market raw server count as the primary achievement.

The platform should emphasize useful signals such as:

* official Registry presence
* verified publisher
* source availability
* recent maintenance
* package metadata
* endpoint status
* version information
* security findings
* client compatibility

## 3. Product identity

### Brand

The MCP Directory

### Primary tagline

Find it. Trust it. Install it.

### Secondary description

The open directory for the MCP ecosystem.

### CLI

Initial execution:

```bash
npx @themcpdirectory/cli add github
```

Installed globally:

```bash
npm install -g @themcpdirectory/cli

mcpdir add github
```

## 4. MVP scope

The MVP consists of five major systems:

1. Registry ingestion
2. Directory website
3. Public API
4. MCP installation CLI
5. Trust and verification system

Publisher analytics, paid promotion and advanced security analysis should be architecturally supported but do not need to delay the public MVP.

## 5. Primary data source

The primary source of MCP metadata is the Official MCP Registry.

The Directory must not treat the upstream Registry database as its own application database.

Instead it maintains a normalized local mirror.

For every imported Registry object, store:

* upstream server identifier
* upstream server name
* server version
* Registry status
* schema version
* complete raw payload
* normalized payload
* date first discovered
* date last observed
* date upstream payload last changed
* source provenance

This is important because the upstream Registry specification can evolve.

## 6. Additional data sources

The application may enrich Registry data using:

* GitHub API
* npm Registry
* PyPI
* OCI Registry metadata
* server publisher metadata
* remote endpoint probes
* manual moderation
* publisher submitted information

Third party MCP directories must not be treated as authoritative data sources.

They may be used during research but should not become dependencies of the product.

## 7. Canonical server identity

Every server receives an internal immutable UUID.

The user facing server receives a stable slug.

Example:

```text
github
supabase
playwright
filesystem
postgres
```

The canonical server record must not use the slug as its database primary key.

Aliases must be supported.

Example:

```text
github-mcp
github-server
github
```

All aliases may resolve to one canonical listing.

This allows package renames, repository moves and branding changes without destroying URLs or search ranking.

## 8. Server data model

A canonical server should contain approximately:

```text
Server

id
slug
title
shortDescription
longDescription

canonicalName
currentVersion

publisherId
publisherVerificationStatus

officialRegistryId
officialRegistryName
officialRegistryStatus

repositoryUrl
repositoryProvider
repositoryId
repositorySubfolder

homepageUrl
documentationUrl

sourceAvailable
license

createdAt
updatedAt
firstSeenAt
lastSeenAt

listingStatus
moderationStatus

featured
sponsored
```

Related records:

```text
ServerVersion
ServerPackage
ServerRemote
ServerEnvironmentVariable
ServerArgument
ServerAlias
ServerCategory
ServerClientCompatibility
ServerSignal
ServerHealthCheck
ServerSourceSnapshot
Publisher
PublisherVerification
Promotion
ModerationEvent
```

## 9. Server detail page

Canonical route:

```text
/[slug]
```

Examples:

```text
/github
/supabase
/playwright
```

The page should display:

### Header

* icon
* title
* publisher
* short description
* verification state
* official Registry state
* current version
* source availability

### Primary install area

Tabs for supported clients.

Example:

```text
Codex
Claude Code
Cursor
More
```

Primary command:

```bash
npx @themcpdirectory/cli add github --to codex
```

If mcpdir is already installed:

```bash
mcpdir add github --to codex
```

### Server information

* supported transports
* required environment variables
* authentication method
* package source
* current version
* repository
* license
* recent release
* latest observed update

### Trust profile

The page must show factual trust signals rather than simply displaying a green shield.

Example:

```text
Publisher verified
Official Registry listing
Source repository available
Package ownership verified upstream
Updated 4 days ago
Remote endpoint reachable
No known Directory moderation issues
```

## 10. Verification terminology

Verification terminology must be precise.

### Publisher Verified

Means The MCP Directory has verified control of the associated publisher identity.

It does not mean the software is safe.

### Official Registry

Means the server exists in the Official MCP Registry.

It does not mean The MCP Directory endorses it.

### Official Publisher

Used only when there is strong evidence that the listing is published by the organization responsible for the represented product.

Example:

GitHub MCP published by GitHub.

### Source Available

Means a source repository is available.

It does not automatically mean the repository is open source.

### Open Source

Requires a recognized open source license.

### Endpoint Reachable

Means an automated probe was able to reach the configured remote endpoint.

It does not mean every MCP tool works.

### No Known Issues

Must never be phrased as "Safe".

Absence of detected issues is not proof of safety.

## 11. Trust system

Do not launch with a vague numerical Trust Score.

Use a Trust Profile composed of independently explainable signals.

Signal groups:

### Identity

* publisher verified
* official publisher
* Registry namespace verification
* stable repository identity

### Transparency

* source repository available
* open source license
* documentation available
* declared environment variables
* declared authentication requirements

### Maintenance

* latest release date
* latest repository activity
* package availability
* abandoned status

### Runtime

For remote servers:

* endpoint reachable
* MCP initialization possible
* authentication required
* response latency

For local stdio packages:

Do not execute unknown packages on production infrastructure during the MVP.

### Security

Possible signals:

* package integrity data
* known dependency vulnerabilities
* repository advisories
* malicious package detection
* moderation reports
* upstream Registry deletion status

Each signal should contain:

```text
status
source
checkedAt
explanation
```

## 12. Search

MVP search should use PostgreSQL full text search plus trigram matching.

Do not introduce Elasticsearch or a separate search cluster for the MVP.

Searchable fields include:

* title
* description
* server name
* package names
* publisher
* repository
* aliases
* categories

Ranking should prioritize:

1. textual relevance
2. exact title match
3. exact alias match
4. active listings
5. verified identity signals
6. metadata completeness
7. maintenance signals

Sponsored status must never enter the organic ranking formula.

## 13. Categories

Initial curated categories:

* Developer Tools
* Databases
* Browser Automation
* Search
* Productivity
* Communication
* Project Management
* Cloud
* Infrastructure
* Monitoring
* Data and Analytics
* AI and Machine Learning
* Files and Storage
* Commerce
* Security

Publishers may suggest categories.

The Directory retains final category control.

## 14. Homepage

The homepage should be intentionally simple.

Suggested structure:

```text
The MCP Directory

Find it. Trust it. Install it.

[ Search MCP servers... ]

Popular
Recently updated
Official publishers
Developer tools
Databases
Browser automation
```

The homepage must not resemble a generic AI SaaS landing page.

Avoid:

* giant gradients
* glassmorphism
* glowing AI spheres
* meaningless feature cards
* excessive animations
* fake activity feeds
* invented statistics

Prefer:

* typography
* whitespace
* subtle borders
* real metadata
* terminal interface elements
* instant search
* dense but readable server cards

## 15. CLI architecture

Package:

```text
@themcpdirectory/cli
```

Binary:

```text
mcpdir
```

Initial commands:

```bash
mcpdir add <server>
mcpdir remove <server>
mcpdir search <query>
mcpdir info <server>
mcpdir list
mcpdir update [server]
mcpdir doctor
```

## 16. CLI add command

Example:

```bash
mcpdir add github
```

If multiple supported clients are detected:

```text
Install GitHub MCP to:

> Codex
  Claude Code
  Cursor
  All detected clients
```

Non interactive:

```bash
mcpdir add github --to codex
```

Multiple clients:

```bash
mcpdir add github --to codex,cursor
```

All:

```bash
mcpdir add github --to all
```

Preview:

```bash
mcpdir add github --to codex --dry-run
```

Skip normal confirmation:

```bash
mcpdir add github --to codex --yes
```

## 17. Client adapter system

Each supported MCP client must implement a common adapter interface.

Conceptually:

```ts
interface ClientAdapter {
  id: string
  displayName: string

  detect(): Promise<ClientDetection>
  inspect(): Promise<InstalledServer[]>

  planInstall(
    manifest: InstallManifest,
    options: InstallOptions
  ): Promise<InstallPlan>

  install(plan: InstallPlan): Promise<InstallResult>

  remove(server: string): Promise<void>
  diagnose(): Promise<DiagnosticResult[]>
}
```

No MCP client specific logic should exist directly inside the generic add command.

## 18. Initial client support

Tier 1:

* OpenAI Codex
* Claude Code
* Cursor

Tier 2:

* VS Code
* Claude Desktop
* Windsurf
* additional clients with sufficiently stable configuration formats

Adapters should prefer a client's official CLI or installation mechanism when one exists.

Direct configuration editing should be used only when necessary.

## 19. Install manifests

The website API must expose a normalized installation manifest.

Example:

```json
{
  "schemaVersion": 1,
  "server": {
    "id": "uuid",
    "slug": "github",
    "title": "GitHub",
    "version": "1.2.3"
  },
  "source": {
    "registry": "official-mcp-registry",
    "verifiedAt": "2026-08-31T18:00:00Z"
  },
  "variants": [
    {
      "id": "remote",
      "transport": "streamable-http",
      "url": "https://example.com/mcp"
    },
    {
      "id": "npm",
      "transport": "stdio",
      "package": "@example/mcp",
      "version": "1.2.3"
    }
  ]
}
```

The CLI resolves this normalized format into the configuration required by each supported client.

## 20. Installation safety

The CLI must follow these rules.

### Never use shell execution for untrusted metadata

Commands and arguments must be executed using argument arrays.

Never construct:

```bash
sh -c "<registry supplied string>"
```

### Never silently persist secrets

If a server requires an API key, prefer an environment variable reference.

Example:

```text
GITHUB_TOKEN
```

Do not insert an actual token into a configuration file unless the user explicitly requests it and the target client requires it.

### Prefer OAuth

For remote servers with proper OAuth support, configure the server and allow the MCP client to perform its native OAuth flow.

### Show changes

Before writing client configuration, display:

* target client
* server
* transport
* command or URL
* configuration file affected
* environment variables required

### Backups

Before modifying a configuration file:

1. parse and validate existing configuration
2. create a backup
3. make an atomic write
4. validate resulting configuration

### Pin local packages

Where possible, install an exact known version.

Example:

```text
@example/mcp@1.2.3
```

Do not silently rely on latest.

Updates should be explicit through:

```bash
mcpdir update
```

## 21. Doctor command

Example:

```bash
mcpdir doctor
```

Output concept:

```text
The MCP Directory

Checking clients...

✓ Codex detected
✓ Claude Code detected
✓ Cursor detected

Checking MCP servers...

✓ GitHub
  Codex configuration valid

✓ Supabase
  OAuth configuration valid

! Playwright
  New version available

x Example Server
  Package no longer available
```

Doctor should inspect configuration without executing unknown stdio server packages.

## 22. Public API

The platform requires a versioned public API.

Base:

```text
https://themcpdirectory.org/api/v1
```

Initial endpoints:

```text
GET /servers
GET /servers/:slug
GET /servers/:slug/install
GET /search
GET /categories
GET /categories/:slug
GET /publishers/:slug
GET /clients
GET /clients/:id
```

CLI specific:

```text
GET /resolve/:slug
GET /resolve/:slug/install
```

## 23. MCP compatible subregistry

The MCP Directory should eventually expose an MCP Registry compatible API in addition to its own product API.

Custom Directory metadata should use an appropriate reverse DNS namespace.

Example:

```text
org.themcpdirectory
```

Potential metadata:

```json
{
  "_meta": {
    "org.themcpdirectory/trust": {
      "publisherVerified": true,
      "sourceAvailable": true,
      "lastCheckedAt": "..."
    }
  }
}
```

This allows other MCP clients to consume The MCP Directory as a genuine subregistry rather than scraping the website.

## 24. Registry ingestion

Implement ingestion as an idempotent pipeline.

Stages:

```text
Fetch
Validate
Persist raw snapshot
Normalize
Resolve identity
Upsert server
Upsert version
Enrich
Calculate signals
Update search index
```

Never mutate raw snapshots.

If normalization logic changes, existing raw payloads must be reprocessable.

## 25. Sync scheduling

Suggested initial schedule:

Official Registry:

```text
Every 15 minutes
```

GitHub metadata:

```text
Every 6 hours for active listings
Every 24 hours for inactive listings
```

Remote endpoint signal:

```text
Every 6 hours
```

Package availability:

```text
Every 12 hours
```

Exact intervals should remain configurable.

## 26. Publisher accounts

Regular directory users do not need accounts.

Accounts are only required for:

* claiming listings
* publisher management
* promotion
* future analytics
* moderation
* administration

Initial authentication:

```text
GitHub OAuth
```

Additional identity providers can be introduced later.

## 27. Claim listing flow

Publisher selects:

```text
Claim this listing
```

Verification options may include:

### GitHub repository verification

Verify that the authenticated GitHub account has appropriate control of the source repository or organization.

### Domain verification

For domain based publishers, use a DNS based verification challenge.

### Manual verification

Reserved for exceptional cases.

Every verification action must create an audit record.

## 28. Promotions

Paid promotion should be implemented as a separate system.

Possible placements:

* homepage sponsored listing
* category sponsored listing
* search sponsored result
* client page sponsored listing

Every paid result must display:

```text
Sponsored
```

Rules:

* sponsored results remain visually distinguishable
* sponsorship never changes organic ranking
* sponsorship never grants verification
* sponsorship never modifies trust signals
* unsafe or moderated listings cannot advertise

## 29. Initial monetization

Potential future products:

### Promoted Listing

Priority advertising placement.

### Category Sponsor

Sponsored placement within a category.

### Publisher Pro

Possible future features:

* enhanced analytics
* conversion statistics
* team access
* listing management
* release announcements

Do not place Publisher Pro in the critical MVP path.

## 30. Analytics and privacy

The website may collect privacy respecting aggregate analytics.

The CLI should have no behavioral telemetry enabled by default in the MVP.

If CLI telemetry is introduced later:

* it must be clearly documented
* it must be disableable
* secrets and configuration contents must never be transmitted
* installation attribution must use privacy preserving identifiers

The website must launch with:

* Privacy Policy
* Terms of Service
* Security Policy
* Responsible Disclosure information
* legally required operator information

Advertising terms should be created before accepting paid campaigns.

## 31. Moderation

Every listing has a moderation state.

Possible values:

```text
active
hidden
under_review
blocked
upstream_deleted
```

Reasons may include:

* malware
* impersonation
* spam
* misleading metadata
* abandoned package takeover
* illegal content
* malicious installation instructions

The moderation history should be auditable internally.

## 32. Reporting

Every server page should contain:

```text
Report listing
```

Initial report categories:

* malware
* impersonation
* incorrect metadata
* broken server
* abandoned project
* security issue
* spam
* other

## 33. Technical architecture

Use a TypeScript monorepo.

Recommended structure:

```text
themcpdirectory/
  apps/
    web/
    worker/

  packages/
    cli/
    db/
    registry/
    installer/
    clients/
    trust/
    api-types/
    config/
    ui/

  tooling/
  docs/
```

## 34. Core technology choices

### Runtime

Node.js current LTS.

### Package manager

pnpm.

### Monorepo

pnpm workspaces with Turborepo.

### Web

Next.js current stable version using App Router.

### Language

TypeScript with strict mode.

### Database

PostgreSQL.

### ORM

Drizzle ORM.

### Validation

Zod.

### Search

PostgreSQL full text search and pg_trgm.

### Styling

Tailwind CSS with custom components and design tokens.

Avoid shipping a visually unchanged component library theme.

### Testing

Vitest for unit and integration testing.

Playwright for end to end browser testing.

### CLI

TypeScript compiled into a small Node compatible executable package.

## 35. Database requirements

PostgreSQL migrations must be committed to Git.

Production schema changes must never rely on automatic destructive synchronization.

Important indexes:

* slug unique
* Registry identifiers
* repository identifiers
* publisher
* current version
* listing status
* updated dates
* search vector
* trigram indexes for server title and aliases

## 36. Worker

The worker handles:

* Official Registry synchronization
* GitHub enrichment
* package enrichment
* remote endpoint probes
* search document refresh
* stale listing detection
* scheduled promotion state
* future security scans

Jobs must be idempotent.

A failed enrichment task must not prevent the core Registry record from being updated.

## 37. Caching

Public server pages should use aggressive application caching with invalidation after relevant ingestion updates.

The website must remain functional during temporary upstream Registry outages.

Registry API failures must never make existing Directory pages disappear.

## 38. API stability

Every public CLI response format must be versioned.

The CLI must never depend on undocumented Next.js internal endpoints.

API contracts should live in:

```text
packages/api-types
```

Breaking API changes require a new API version.

## 39. Security

### Application

* strict input validation
* rate limiting
* CSRF protection where applicable
* secure authentication cookies
* Content Security Policy
* dependency scanning
* secret scanning
* branch protection
* signed releases where practical

### Registry ingestion

Treat every external field as untrusted.

Sanitize rendered Markdown.

Never render arbitrary HTML supplied by publishers.

Never fetch arbitrary internal network URLs from server supplied metadata.

Remote probes require SSRF protection.

Block:

```text
localhost
private IPv4 ranges
private IPv6 ranges
cloud metadata endpoints
link local addresses
```

### CLI

Never evaluate Registry supplied JavaScript.

Never invoke untrusted commands through a shell.

Never automatically execute an installed stdio MCP server during installation.

## 40. Open source strategy

Suggested licensing:

### CLI and shared SDK packages

Apache License 2.0.

### Hosted application and worker

AGPL 3.0.

This keeps client tooling highly reusable while ensuring hosted modified versions of the Directory backend remain open.

A trademark policy should separately protect:

```text
The MCP Directory
themcpdirectory.org
mcpdir
```

## 41. Repository structure

Primary repository:

```text
github.com/themcpdirectory/themcpdirectory
```

Possible future repositories:

```text
github.com/themcpdirectory/registry
github.com/themcpdirectory/spec
```

Do not split the project into multiple repositories before there is a concrete reason.

## 42. GitHub automation

CI should run on every pull request.

Required checks:

```text
format
lint
typecheck
unit tests
integration tests
build
CLI tests
database migration validation
```

Main branch should be protected.

Production deployments should only originate from the protected main branch or signed release tags.

## 43. CLI publishing

Package:

```text
@themcpdirectory/cli
```

The package exposes:

```json
{
  "bin": {
    "mcpdir": "./dist/index.js"
  }
}
```

Releases should use semantic versioning.

CLI release tags:

```text
cli-v0.1.0
cli-v0.2.0
cli-v1.0.0
```

## 44. Initial UI routes

```text
/
/search
/[slug]

/categories
/categories/[slug]

/clients
/clients/[client]

/publish
/docs
/docs/cli
/docs/api

/about
/open-source
/advertise

/security
/privacy
/terms
```

Authenticated:

```text
/dashboard
/dashboard/listings
/dashboard/listings/[id]
```

Internal:

```text
/admin
/admin/review
/admin/reports
/admin/promotions
```

## 45. SEO

Server pages must use server rendered metadata.

Each listing receives:

* canonical URL
* unique title
* unique description
* Open Graph metadata
* structured data where appropriate

Programmatic pages may include:

```text
/clients/codex
/clients/claude-code
/clients/cursor

/categories/databases
/categories/browser-automation
/categories/developer-tools
```

Do not generate thousands of thin SEO pages with no useful original information.

## 46. Accessibility

Minimum target:

WCAG 2.2 AA.

Requirements include:

* complete keyboard navigation
* visible focus states
* semantic HTML
* adequate contrast
* accessible dialogs
* accessible command copying
* proper form labels
* reduced motion support

## 47. Performance

Target Lighthouse measurements on public pages:

```text
Performance >= 95
Accessibility >= 95
Best Practices >= 95
SEO >= 95
```

Avoid client side JavaScript unless interaction genuinely requires it.

Search should feel immediate.

Server pages should primarily render on the server.

## 48. MVP milestone 1

Foundation.

Deliver:

* monorepo
* web application
* PostgreSQL schema
* Official Registry ingestion
* normalized server records
* server pages
* basic search
* categories
* source provenance
* basic GitHub metadata

## 49. MVP milestone 2

CLI.

Deliver:

* @themcpdirectory/cli
* mcpdir binary
* client detection
* Codex adapter
* Claude Code adapter
* Cursor adapter
* add
* remove
* list
* info
* dry run
* safe configuration writing

## 50. MVP milestone 3

Trust.

Deliver:

* publisher model
* GitHub authentication
* listing claims
* publisher verification
* trust signals
* remote endpoint status
* moderation
* report listing

## 51. MVP milestone 4

Public launch.

Deliver:

* polished homepage
* documentation
* CLI documentation
* public API documentation
* Privacy Policy
* Terms
* Security Policy
* Responsible Disclosure
* About page
* Open Source page
* GitHub repository ready for contributors

## 52. Post MVP

Potential next features:

* VS Code adapter
* Claude Desktop adapter
* Windsurf adapter
* MCP compatible subregistry API
* security sandbox for stdio testing
* dependency vulnerability scanning
* package takeover detection
* publisher analytics
* sponsored placements
* API keys
* public statistics
* collections
* server comparisons
* install history
* team policies
* enterprise approved server lists

## 53. Explicit non goals for MVP

Do not build:

* MCP hosting
* MCP proxy infrastructure
* user reviews
* social profiles
* comments
* chat
* community feeds
* recommendation AI
* a custom package registry
* a proprietary MCP protocol
* enterprise billing
* complex ad bidding
* a mobile application

These features would distract from proving discovery, trust and installation.

## 54. Definition of MVP success

The MVP succeeds when a developer can:

1. visit themcpdirectory.org
2. search for an MCP server
3. understand who publishes it
4. inspect relevant trust information
5. see what installation requires
6. copy one command
7. run that command
8. select or specify an installed MCP client
9. receive a safe configuration change
10. successfully see the MCP server inside that client

The ideal user journey is:

```text
Search
→ Evaluate
→ Install
→ Done
```

## 55. Core product test

Whenever a new feature is proposed, ask:

Does this make it easier to find, trust or install an MCP server?

If the answer is no, it probably does not belong in the initial product.
