# Phase F Trust And Health Design

**Status:** Approved working design

**Date:** 2026-09-01

**Authorities:** `docs/ai-docs/engineering-spec.md` trust, worker, security, and roadmap sections, plus `docs/ai-docs/product-and-technical-spec.md`

## Goal

Add explainable, factual trust and availability evidence without converting it into a subjective score. Preserve ingestion independence, probe only safe remote endpoints, and make upstream deletion impossible to miss in the API, web application, and CLI.

## Scope

Phase F completes GitHub enrichment projections, computes factual trust signals, records bounded remote health checks, schedules refresh jobs, and adds deletion and health warnings to public and installation surfaces.

It does not certify server safety, execute stdio packages, use publisher secrets, probe authenticated resources, create an aggregate trust score, or let sponsorship influence trust or ranking.

## TrustProfileV1

The shared trust projection is a collection of independently labelled facts with provenance and observation times. Initial signals include:

- official Registry presence and current upstream state
- publisher verification state
- source repository availability
- repository archived state
- recognised open-source licence metadata
- recent repository push and release timestamps
- remote endpoint's latest bounded health result
- current version/package/remotes presence

Each signal has a stable key, one persisted state from `positive`, `neutral`, `warning`, `negative`, or `unknown`, a plain-language label, `observedAt`, and source. Unavailable evidence is represented as `unknown` with a bounded source-specific reason; it is never converted into failure or fabricated confidence.

There is no total, percentage, star rating, grade, badge hierarchy implying certification, or opaque scoring formula. UI ordering is fixed by signal type, not by favourable outcome.

## Ownership

`packages/domain/src/trust` derives and persists trust signals from validated canonical records and immutable snapshots.

`packages/domain/src/health` owns probe selection, execution policy, result classification, and persistence.

`apps/worker` owns `trust.refresh` and `remote.health` scheduling, retry policy, concurrency, and structured operational logs.

`packages/search` projects current factual signals. `packages/api-contract` defines `TrustProfileV1` and health enums. The web and CLI render those contracts without reinterpreting them.

## Trust Refresh

A trust refresh is idempotent for a server and observation boundary. It reads Registry state, publisher verification, current version, repository identity, and the latest validated repository snapshot. It upserts current signal state while retaining source observations needed for audit and debugging.

Registry synchronisation and GitHub enrichment enqueue refresh work after their own transaction commits. A trust failure never rolls back Registry ingestion or makes a listing unqueryable. Retries are bounded and permanent validation errors are summarised.

## Remote Probe Eligibility

Only active `http`, `sse`, or `streamable-http` remotes with a concrete public HTTPS URL are eligible. URL templates with unresolved required variables, authentication requirements, non-HTTP transports, localhost/private destinations, and upstream-deleted listings are not probed.

Stdio packages are never installed, downloaded, imported, resolved, or executed. Health checks never send configured headers, environment variables, user cookies, Directory credentials, publisher secrets, OAuth tokens, or ambient proxy credentials.

## Network Security Boundary

Every outbound request uses `packages/security` validation before connection. Hostnames are resolved explicitly; every resolved address must be public. The connection is pinned to a validated address while preserving TLS hostname verification, and redirects repeat URL, DNS, address, scheme, and port validation. Mixed public/private DNS answers are rejected. DNS rebinding and IPv4-mapped IPv6 forms are covered by tests.

Only HTTPS is probed in production. Redirect count, response bytes, header bytes, decompression, total duration, connect duration, and concurrency are bounded. Safe methods are `HEAD` followed by a minimal `GET` only when endpoint behaviour requires it. Request headers are a fixed allowlist containing no identifying user data.

## Health Classification

A health result records remote ID, checked time, duration, final safe origin, bounded HTTP status, redirect count, and a classified outcome. Outcomes include `healthy`, `degraded`, `unreachable`, `timed_out`, `unsafe_destination`, `response_too_large`, `unsupported`, and `unknown`.

Response bodies are discarded and never persisted. Query strings and path segments that may contain tokens are redacted from logs and stored display values. A single failure does not claim permanent downtime; public copy states the observation time and result.

Scheduling uses jitter, per-origin concurrency limits, exponential backoff, and slower retry after repeated failures. Manual refresh endpoints are not public in this phase.

## Upstream Deletion Policy

`deleted_upstream` is the canonical listing status; moderation status remains separate, and `UPSTREAM_DELETED` is the API error code. When Registry ingestion marks a listing `deleted_upstream`:

- direct detail routes remain available for provenance and existing links
- search, homepage, categories, and recommendations exclude it by default
- the detail page presents a prominent text-and-icon warning before installation information
- API summaries/details expose the status
- install manifest requests return `410 UPSTREAM_DELETED`
- CLI add/update blocks installation and doctor reports the condition
- existing receipts are retained so users can diagnose or remove configuration

Restoration upstream returns the listing to normal state through ingestion and triggers a fresh trust/health evaluation. Historical deletion observations are retained.

## Presentation

Trust labels use neutral factual wording such as “Listed in the Official MCP Registry”, “Publisher verification not available”, or “Remote responded on 1 September 2026 at 18:00 UTC”. Colour is supplementary to text and icons.

Warnings are visible in normal reading order, exposed to assistive technology, keyboard reachable where interactive, and usable in forced-colours mode and at 320 CSS pixels. Tooltips never carry essential information alone.

## Privacy And Retention

Health probes target publisher-declared server infrastructure, not end users. Requests contain no user identifier. Operational probe records retain only bounded metadata needed for trends and abuse investigation. Detailed checks and daily aggregates are deleted after 90 days. Superseded trust observations are deleted after 24 months; the current signal remains while the listing exists. Registry snapshots remain governed by their separate provenance retention. Operational request logs are deleted after 30 days unless a documented, expiring legal hold applies.

Infrastructure logs omit full URLs when they contain query strings and follow the shortest operational retention supported by deployment requirements.

`apps/worker` owns daily health cleanup, monthly trust-history cleanup, and operational-log expiry where the application controls those logs. Jobs use clock-driven cut-offs, bounded batches, idempotent deletion, retry summaries, and legal-hold exclusions. Retention tests use a controlled clock.

## Testing And Verification

Trust tests cover every source combination, unknown states, stale observations, idempotency, and the prohibition on aggregate scores.

Health tests run against controlled DNS and HTTP fixtures for private ranges, loopback, metadata addresses, redirects, rebinding, mixed answers, IPv6, timeouts, oversized and compressed responses, header limits, credential stripping, and concurrency/backoff. Tests assert no stdio execution path exists.

Integration tests prove worker failure isolation, deletion/restoration transitions, API projections, search exclusion, `410` manifests, CLI warnings, and web warning semantics. Phase F closes after security review and focused browser checks at desktop, mobile, keyboard-only, reduced-motion, and forced-colours settings.

## Decisions Deferred

Authenticated health checks, publisher-triggered probes, uptime SLAs, incident notifications, vulnerability scanning, package execution, community reviews, and trust aggregation are outside Phase F.
