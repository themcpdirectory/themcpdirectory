# Phase G Publisher Platform Design

**Status:** Approved working design

**Date:** 2026-09-01

**Authorities:** `docs/ai-docs/engineering-spec.md` sections 64-67 and `docs/ai-docs/product-and-technical-spec.md`

## Goal

Allow people who control a repository or GitHub organisation to authenticate, claim listings, manage publisher membership, and see a private dashboard. Public browsing and installation remain anonymous.

## Scope

Phase G implements GitHub sign-in with Better Auth, PostgreSQL-backed accounts and sessions, publisher membership authorisation, claim submission and verification, an auditable claim lifecycle, authenticated API routes, and an accessible publisher dashboard.

It does not add password authentication, advertising, billing, public write APIs, domain verification, automated moderation decisions, or a claim based only on matching display names.

## Authentication Architecture

`packages/auth` owns the Better Auth server configuration, GitHub provider, session helpers, token-minimising account hooks, and framework-neutral authorisation primitives. The selected Better Auth version is pinned and its generated schema is reviewed into the repository as normal Drizzle migrations; production never runs ad hoc auth migrations at startup.

`apps/web` is the sole owner of browser authentication and publisher operations. It hosts Better Auth at `/api/auth/*`, publisher JSON route handlers at `/api/publisher/v1/*`, and sign-in/dashboard pages. `apps/api` remains exclusively responsible for anonymous public API traffic and does not validate browser sessions.

GitHub is the only sign-in provider. Account linking trusts only the configured GitHub provider and verified provider identifiers. Email addresses are not used as proof of publisher control.

Sessions use host-only, secure, HTTP-only, `SameSite=Lax` cookies with path `/`, HTTPS in production, an exact canonical web origin, explicit trusted origins, and origin/CSRF checks on every mutation. Publisher API routes are same-origin only and do not expose CORS. Sessions have a maximum 30-day lifetime with rotation. Session identifiers are hashed where supported. Logout invalidates the current session; security-sensitive account changes invalidate all sessions.

## OAuth Token Security

Better Auth GitHub OAuth requests only identity scopes needed for sign-in (`read:user` and `user:email`) and no repository or organisation scope. After callback identity validation, provider access and refresh tokens are omitted from persistent account records; tests verify the database contains neither token. Tokens, authorisation headers, OAuth callback parameters, and GitHub responses containing personal data are never logged.

Claims use a separate GitHub App installation flow bound to the authenticated user and a single-purpose, expiring, hashed nonce. The App requests repository metadata and administration read access plus organisation members read access only where an organisation claim requires it; it requests no contents write access. Installation tokens are minted server-side, expire within GitHub's maximum lifetime, and are never persisted. Revoked installations, expired tokens, failed refresh, and pending organisation approval leave verification unavailable and require reauthorisation without weakening an existing ownership record.

The UI explains both permission sets before redirect. A user may unlink GitHub only after active claims are transferred, withdrawn, or otherwise made safe. GitHub App private-key rotation is versioned in deployment secret storage, supports overlap during rotation, and never places private key material in the database.

## Publisher And Membership Model

The existing publisher and publisher-membership tables remain the source of publisher identity and roles. One user may belong to multiple publishers; one publisher may have multiple members. Roles use the existing database values `owner`, `admin`, `editor`, and `viewer`.

Every authenticated operation loads the session, resolves active membership, and checks the required capability in application code. Route ownership is never inferred from a publisher ID supplied by the browser. PostgreSQL foreign keys and uniqueness constraints enforce structural invariants; application-layer authorisation is mandatory. PostgreSQL RLS is deferred unless the deployment later exposes database access outside trusted server processes.

Capabilities are explicit: owners manage ownership and destructive publisher actions; owners and admins manage claims, members, and publisher profile; editors may edit non-security-sensitive profile fields; viewers receive read-only dashboard access. The last owner cannot remove or demote themselves through ordinary membership operations without transferring ownership.

## Claim Lifecycle

A new append-audited claim entity records listing, requested publisher, requester, method, stable GitHub repository or organisation ID, status, evidence summary, timestamps, and reviewer fields where applicable.

Statuses are `pending`, `verifying`, `verified`, `rejected`, `withdrawn`, `superseded`, and `revoked`. Only one active claim may exist per server. Conflicting active claims return a conflict and enter a manual-review path rather than overwriting ownership.

Flow:

1. authenticated user selects a listing and an existing or newly created publisher
2. server determines eligible verification methods from stable repository identity
3. user confirms the exact repository or organisation relationship to verify
4. verification service mints an ephemeral GitHub App installation token and retrieves permission facts
5. repository claims require administration permission confirmed through the bound GitHub App installation; organisation claims require owner or an explicitly documented sufficiently privileged role
6. service compares stable GitHub numeric IDs, never names alone
7. successful verification links the server to the publisher, creates or confirms membership, and records audit events in one transaction
8. failure stores a bounded reason and preserves any prior valid ownership

Transient GitHub failures leave the claim retryable. Denied permission is not retried automatically. Installation revocation and ownership-changing claim transitions move affected claims through an audited state change without silently changing publisher ownership. Manual moderation can reject or revoke with a required reason and audit record.

Verified, revoked, superseded, and ownership-changing transactions write a `trust.refresh` event to a transactional outbox in the same commit. The worker delivers outbox events idempotently and periodically reconciles undelivered records, preventing stale public publisher-verification signals.

## Audit Trail

Claim requests, evidence checks, state transitions, ownership links, membership changes, role changes, session-security events, export requests, and erasure outcomes produce append-only audit events. Events store actor/resource IDs, action, coarse outcome, timestamp, and bounded structured metadata. They do not store OAuth tokens, cookies, full GitHub payloads, IP addresses by default, or free-form personal request bodies.

Audit records are retained for 24 months for dispute and security handling, then deleted or irreversibly minimised unless a documented legal obligation requires longer retention.

## Authenticated API And Dashboard

Authenticated endpoints live under `/api/publisher/v1` in `apps/web`. Mutations accept JSON, enforce content type and exact same-origin checks, validate with Zod, return the shared request/error shape where practical, and expose no CORS headers.

The dashboard provides:

- signed-in identity and session controls
- publisher switcher for multiple memberships
- claimed listings and claim status
- claim initiation, retry, withdrawal, and conflict guidance
- publisher member list and permitted role controls
- data export and account-erasure entry points

All controls use native semantics or established project components, visible labels, predictable focus, error summaries with focus on the first invalid field, and confirmation for destructive actions. GitHub avatars are optional; if shown, they are not required to identify an account.

## Privacy Rights And Retention

The system collects only GitHub identity fields needed for sign-in, account linking, publisher administration, and claim evidence. Optional profile fields are not copied merely because GitHub returns them.

Users can request a machine-readable export of their account, memberships, claims, and relevant audit history. Erasure is a retryable state machine. It invalidates sessions, revokes or disconnects GitHub App installations where owned by the account, transfers claims when a confirmed successor exists, otherwise revokes claims and locks an ownerless publisher for manual review, removes memberships and provider-account data, deletes unnecessary profile data, and pseudonymises retained audits with a non-reversible tombstone. These steps run transactionally where local data permits and record bounded retry state for external revocation failures; identity erasure is not postponed indefinitely by an absent transferee.

Expired sessions are deleted within seven days. Accounts with no login for 12 months and no active publisher responsibility, membership, claim, legal hold, or unresolved erasure operation are deleted by a monthly worker job. Unverified or abandoned claims expire after 30 days. Rejected/withdrawn claim evidence is removed after 90 days while the minimal audit outcome follows the 24-month schedule. Transactional outbox records are deleted 30 days after successful delivery. Legal holds require a reason and expiry. These periods are configuration-backed, enforced in bounded idempotent jobs with a controlled clock, and documented in the Privacy Policy.

## Errors And Abuse Controls

Auth and claim routes use stricter shared rate limits than public reads. OAuth and claim errors reveal no provider token or unnecessary permission detail. State-changing endpoints are idempotent where retries are plausible and use database transactions/advisory locking for claim conflicts.

No login success, claim count, or GitHub identity is sent to analytics. Security monitoring uses event type and request ID without behavioural profiling.

## Testing And Verification

Tests use synthetic identities and mocked GitHub responses. They cover CSRF/origin rejection, secure cookie configuration, session expiry/revocation, absence of OAuth tokens at rest, ephemeral GitHub App tokens, installation revocation and reauthorisation, log redaction, stable GitHub ID comparison, permission levels, concurrent/conflicting claims, all state transitions, the four-role capability matrix, last-owner protection, ownerless erasure, outbox delivery, export, erasure, legal holds, and retention jobs.

Database integration tests verify migrations, uniqueness, transaction rollback, and audit append behaviour. Browser tests cover sign-in boundaries with a fake provider, keyboard/focus behaviour, 320-pixel reflow, errors, destructive confirmation, and cross-publisher access denial. No production OAuth credentials are required in CI.

## Decisions Deferred

Domain TXT verification, GitHub App installation workflows beyond the minimum needed for claims, team-level roles, API keys, SSO, passkeys, advertising, billing, and public publisher editing are deferred.
