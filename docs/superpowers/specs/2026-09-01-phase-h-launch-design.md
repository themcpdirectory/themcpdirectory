# Phase H Launch Design

**Status:** Approved working design

**Date:** 2026-09-01

**Authorities:** `docs/ai-docs/engineering-spec.md`, `docs/ai-docs/product-and-technical-spec.md`, and verified operator information supplied by the company director

## Goal

Turn the implemented directory, API, CLI, trust system, and publisher platform into a documented, accessible, secure, performant, and reproducible launch candidate. Phase H is a set of release gates, not a cosmetic pass.

## Verified Operator Information

Legal drafts may identify:

```text
Estopia Engineering Ltd
3 Braemount
Cowdenbeath
Fife
KY4 9RB
Scotland
United Kingdom
```

The directors are Timo Haseloff and Jay Brammeld. Their names appear only where a specific legal or governance purpose requires them; they are not used as generic contact details. No support, privacy, or legal email address is invented. Policies must not claim a contact channel that has not been configured and monitored.

During implementation, Privacy and Terms content is labelled as a draft requiring qualified legal review. Phase H engineering completion produces a release candidate, not production-launch authorisation. Production launch requires recorded legal approval of final policy text. Engineering validation checks factual alignment but does not represent legal advice or guarantee compliance.

## Scope

Phase H delivers public user and API documentation, CLI documentation, development/contribution/security material, legal draft routes, metadata and structured data, accessibility closure, performance budgets, production configuration checks, CLI packaging, and a reproducible release runbook.

It does not introduce behavioural analytics, advertising, billing, a consent banner without a real consent-requiring technology, unsupported service-level promises, or automatic external publication.

## Documentation Information Architecture

Public documentation covers:

- finding, evaluating, and installing listings
- trust signal meanings and limitations
- upstream deletion behaviour
- all public API routes, schemas, pagination, errors, examples, and rate limits
- CLI installation, every command, scopes, receipts, secret handling, exit codes, troubleshooting, and uninstall
- publisher sign-in, claims, verification evidence, roles, export, and erasure
- security model and responsible vulnerability reporting through a verified channel when one exists

Repository documentation covers architecture, exact prerequisites, environment variables without values, PostgreSQL setup, migrations, seeding, workers, test layers, release gates, incident-safe logging, and contribution expectations. Documentation examples are executable or schema-validated in CI where practical.

## Legal Drafts

The Privacy draft describes only actual processing: anonymous directory requests, optional GitHub authentication, account/session data, non-persisted GitHub OAuth access and refresh tokens during callback processing, short-lived non-persisted GitHub App installation tokens during claim verification, publisher memberships and claims, audit events, remote health probes, operational security logs, purposes, lawful-basis candidates for counsel review, recipients/processors once verified, international transfer considerations, retention periods, security measures, rights, and the operator address.

The Terms draft covers service scope, factual-but-not-certified trust data, third-party Registry/GitHub/client dependencies, user responsibility for reviewing install plans and secret storage, prohibited abuse, intellectual-property reporting, availability limitations, account/publisher responsibilities, suspension, and governing-law placeholders requiring counsel confirmation.

The Security Policy draft describes the intended reporting process without a fictitious address or response SLA. A configured and monitored responsible-disclosure contact is a mandatory production-launch gate; the operator must supply and verify it before the draft can become final. Secrets and environment examples use placeholders.

## Analytics And Cookies

Behavioural analytics is absent at launch. The application does not add advertising, fingerprinting, session replay, marketing pixels, or cross-site tracking. Strictly necessary authentication cookies are documented and do not trigger a decorative consent banner. Any future analytics or advertising requires a separate privacy/design review and consent implementation before deployment.

## SEO And Discoverability

Every indexable public page has a unique title, plain-language description, canonical URL, one page-topic `h1`, and stable server-rendered content. Alias routes redirect to canonical slugs. Deleted listings remain directly indexable only when provenance value outweighs stale-install risk and carry clear status metadata; search/filter pages avoid index bloat.

`robots.txt` and the XML sitemap are generated from visible canonical listings. Structured data uses only supported Schema.org types and factual fields; no fabricated ratings or reviews. Open Graph imagery uses supplied brand assets and meaningful page-specific text where generated. API, auth callback, dashboard, and private routes are not indexed.

## Accessibility Gate

WCAG 2.2 Level AA is the target. Automated tools supplement, not replace, manual review.

Every page is checked for landmarks, one page-topic `h1`, heading order, skip-link operation, keyboard-only use, visible focus, accessible names containing visible labels, form instructions/errors, focus management, status announcements, non-colour cues, text and control contrast, forced-colours behaviour, reduced motion, zoom, and 320 CSS-pixel reflow.

Tables use proper headers; dynamic composites use established keyboard patterns; decorative graphics are hidden; informative graphics have alternatives. Authentication, claim, install, warning, empty, loading, error, and destructive-action states are included. The release report records remaining manual-review risk and never claims the product is fully accessible.

## Performance Gate

Performance budgets are measured on representative seeded production builds at mobile and desktop profiles. Initial gates are:

- Core Web Vitals targets: LCP at most 2.5 seconds, INP at most 200 milliseconds, CLS at most 0.1 at the 75th percentile when field data becomes available
- Lighthouse lab scores of at least 95 for performance, accessibility, best practices, and SEO on the homepage, search, server detail, documentation, sign-in, and dashboard fixture routes
- no unbounded list response or client-side hydration requirement for primary public content
- explicit image dimensions, bounded font loading, and no layout-shifting warning or navigation states

CI pins Chromium and Lighthouse versions, uses the Lighthouse mobile preset and a documented desktop profile, runs each seeded route three times, and evaluates the median while retaining all reports. It uses stable budgets and artefacts rather than treating a local run as field evidence. Regressions require an explicit documented exception with owner and expiry.

## Security And Privacy Gate

Launch checks include dependency audit triage, secret scanning, lockfile integrity, security headers, CSP appropriate to Next.js and OAuth, HSTS in production, MIME/sniffing and framing protections, explicit CORS, CSRF/origin tests, SSRF tests, secure cookies, log redaction, rate limits, retention jobs, export/erasure tests, and backup/restore validation.

Database migrations must succeed from empty and previous release states, and rollback/forward-fix procedures are documented. Production configuration fails closed when required secrets, trusted origins, encryption keys, or canonical URLs are absent.

## CLI Release

The CLI package has a correct `bin`, files allowlist, licence metadata, repository/homepage links, Node engine, provenance-friendly build, and no development fixtures, local paths, secrets, or unintended source maps in the tarball.

Release verification starts with `npm pack --dry-run`, then creates a real tarball with `pnpm pack`. The exact tarball is inspected, hashed with SHA-256, installed into a temporary prefix, and used for help/version, schema-valid JSON output, fixture API commands, all add dry runs, adapter sandbox tests, and receipt migration. Package contents and hashes are recorded in the release artefacts.

Actual npm publication, Git tags, GitHub releases, DNS changes, production deployment, OAuth application creation, and secret configuration are external side effects. They require explicit approval and operator credentials after all local gates pass.

## Release Pipeline And Evidence

The named root command is `pnpm verify:release`. It composes formatting, lint, typecheck, unit, PostgreSQL integration, migration/seed repeatability, builds, browser E2E, accessibility scans, three-run Lighthouse budgets for the seeded route matrix, secret scanning, dependency checks, and real-tarball CLI package tests. CI stores machine-readable reports without personal data or secrets.

The release runbook includes versioning, changelog, migration order, worker/API/web deployment order, smoke tests, rollback/forward-fix triggers, health checks, known limitations, legal-review sign-off, and final external-action approvals.

## Release Candidate Definition Of Done

Phase H is complete when:

- documentation matches implemented behaviour and validated examples
- legal drafts contain verified operator facts, no invented contacts, and remain clearly marked for legal review
- anonymous use remains possible and analytics remains off
- accessibility and performance gates pass for the defined routes and viewports
- security/privacy checks and retention/export/erasure jobs pass
- clean and upgrade database migrations pass
- the CLI tarball passes clean-environment smoke tests
- full monorepo verification is green
- a final cross-phase code review finds no unresolved critical or high-severity issue
- external publication/deployment remains pending explicit approval

Production-launch authorisation is a separate operator-controlled gate. It additionally requires recorded qualified legal approval of final Privacy and Terms text, a configured and tested responsible-disclosure contact, removal of draft labels only after that approval, production OAuth/GitHub App configuration, deployment secrets, final migration/backup checks, and explicit approval for deployment, tags, releases, DNS, and npm publication.

## Decisions Deferred

Advertising, analytics, billing, community content, service-level guarantees, translated legal policies, and external publication are separate post-launch decisions.
