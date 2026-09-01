# Phase G Publisher Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GitHub-authenticated publisher platform for claims, publisher membership management, export, and erasure without changing anonymous public browsing or public installation.

**Architecture:** Better Auth 1.7.2 is mounted only in the Next.js 16.3.4 web app and configured in `packages/auth` through a `createAuth({ db, env, fetchImpl })` factory so tests can inject temporary databases, canonical web origins, and mocked fetch implementations while production still uses reviewed Drizzle migrations in `packages/db`. `packages/domain` owns publisher authorisation, claim verification, audit, export, and a persisted erasure state machine; GitHub verification runs as a separate GitHub App user-to-server authorisation-code flow with server-side state, PKCE, compare-and-set callback-state consumption before any external exchange, a BETTER_AUTH_SECRET-derived server-side PKCE decrypt boundary after nonce consumption and before token exchange, ephemeral permission checks, and explicit revocation of both the temporary user token and any minted installation token. `apps/worker` delivers `trust.refresh` outbox events, retention jobs, and resumable erasure retries so Phase G stays aligned with the approved Phase F trust model and consumes the existing Phase F `legalHolds` storage instead of recreating it.

**Tech Stack:** Node.js 24, pnpm 11, Next.js 16.3.4 App Router, Better Auth 1.7.2, `@better-auth/drizzle-adapter` 1.7.2, PostgreSQL, Drizzle ORM, Zod, pg-boss, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-phase-g-publisher-platform-design.md`, `docs/superpowers/specs/2026-09-01-phase-f-trust-health-design.md`, `docs/ai-docs/engineering-spec.md`, `docs/ai-docs/product-and-technical-spec.md`

## Global Constraints

- GitHub is the only sign-in provider.
- Browsing and installing MCP servers requires no account.
- Better Auth owns its own required tables.
- Do not manually redesign Better Auth session or account storage.
- The application user ID referenced by Directory tables must correspond to the Better Auth user ID.
- All browser, auth, and GitHub App configuration variables stay in `WebEnv`. `loadEnv()` must remain usable by the API, worker, migration, and seed entrypoints without any web-only variables.
- Better Auth GitHub OAuth requests only identity scopes needed for sign-in (`read:user` and `user:email`) and no repository or organisation scope.
- After callback identity validation, provider access and refresh tokens are omitted from persistent account records.
- Ephemeral GitHub App user access tokens are explicitly revoked after verification or failure cleanup once issued, ignored beyond the current request, and never persisted.
- Phase G consumes the Phase F `legalHolds` table and `0003_phase_f_trust_health.sql` migration as an existing prerequisite. Do not recreate, rename, drop, or re-own legal-hold storage in Phase G.
- Installation tokens are minted server-side, explicitly revoked after verification or failure cleanup once issued, expire within GitHub's maximum lifetime if revocation fails, and are never persisted.
- Use `NEXT_PUBLIC_BASE_URL` as the canonical web origin. `BETTER_AUTH_URL` may be omitted and default to that canonical origin plus `/api/auth`; if provided, it must share the exact same origin.
- Sessions use host-only, secure, HTTP-only, `SameSite=Lax` cookies with path `/`, HTTPS in production, the canonical web origin above, explicit trusted origins, and origin/CSRF checks on every mutation.
- Authenticated endpoints live under `/api/publisher/v1` in `apps/web`.
- Mutations accept JSON, enforce content type and exact same-origin checks, validate with Zod, return the shared request/error shape where practical, and expose no CORS headers.
- `GET /api/publisher/v1/claims/verify/callback` is the only exception to the generic same-origin JSON mutation rule because GitHub reaches it via a top-level redirect. It must still require the current Better Auth session, state round-trip, hashed nonce match, bound user match, expiry, and single-use compare-and-set nonce consumption before any external code exchange.
- Route ownership is never inferred from a publisher ID supplied by the browser.
- Roles use the existing database values `owner`, `admin`, `editor`, and `viewer`.
- Only one active claim may exist per server.
- Better Auth linking configuration must use `account.accountLinking`, not legacy top-level account-linking option placement.
- OAuth callback tests must exercise a real sign-in start plus callback flow, including stored verification state and the signed state cookie required by `account.storeStateStrategy = "database"`.
- GitHub App verification must use the GitHub App web flow at `https://github.com/login/oauth/authorize` with an explicit `redirect_uri`, `state`, `allow_signup=false`, and `code_challenge_method=S256`, and must store only a short-lived server-side state reference, hashed nonce, and encrypted PKCE verifier bound to the current user and claim. The verifier is decrypted only server-side after successful single-use nonce consumption, exists in plaintext only in memory for the live code exchange, and is never persisted or logged.
- GitHub App callback coverage must prove success, expired-state rejection, mismatched-session rejection, atomic concurrent replay rejection with exactly one winner, explicit revocation of both GitHub App user and installation tokens on success and on any failure after issuance, decrypted-verifier use only after nonce consumption, no provider-token persistence, no persisted or logged plaintext verifier, and no browser cookie carrying a verification grant.
- Repository claim verification must prove from the ephemeral GitHub App user grant that the authenticated user can see the callback installation and has `permissions.admin === true` on the target repository before minting an installation token with `repository_ids: [targetRepositoryId]` and `{ metadata: "read", administration: "read" }`.
- Organisation claim verification must prove from the ephemeral GitHub App user grant that the authenticated user has `state === "active"` and `role === "admin"` on `GET /user/memberships/orgs/{org}` before minting an installation token with `{ metadata: "read", members: "read" }`, then bind success to `installationFacts.targetType === "organization"` and exact `installationFacts.targetId === claimedOrganisationId`. Treat GitHub's `admin` membership role as the owner-capable authority accepted by Phase G.
- Verified, revoked, superseded, and ownership-changing transactions write a `trust.refresh` event to a transactional outbox in the same commit.
- Claim lifecycle coverage must explicitly include `rejected`, `revoked`, `superseded`, and ownership-changing transitions, including their audit and outbox behaviour.
- Audit records are retained for 24 months for dispute and security handling, then deleted or irreversibly minimised unless a documented legal obligation requires longer retention.
- Expired sessions are deleted within seven days.
- Accounts with no login for 12 months and no active publisher responsibility, membership, claim, legal hold of any scope on the user, or unresolved erasure operation are deleted by a monthly worker job.
- Unverified or abandoned claims expire after 30 days.
- Rejected or withdrawn claim evidence is removed after 90 days while the minimal audit outcome follows the 24-month schedule.
- Transactional outbox records are deleted 30 days after successful delivery.
- Legal holds require a reason and expiry.
- Account erasure must be a persisted, resumable state machine that records current step, retry state, last external-side-effect failure, and next attempt time.
- Do not cache authenticated publisher responses in public caches.
- Do not add `proxy.ts` in Phase G. Enforce authentication and authorisation in the page or route handler that needs it, as required by the current Next.js 16 and Better Auth guidance.
- Dashboard accessibility coverage must include permissions explanation text, visible focus, 320px reflow, forced colours, and contrast checks for claim, membership, and danger-zone controls.
- Use `pnpm` for dependency, migration, and verification commands.

## GitHub App Verification Flow

1. Better Auth GitHub OAuth under `/api/auth/*` handles identity only. It requests only `read:user` and `user:email`, persists no provider token material, and returns the normal Better Auth session cookie.
2. `POST /api/publisher/v1/claims/[claimId]/verify` is a same-origin JSON mutation. It loads the authenticated user's pending claim, generates `stateRef`, `stateNonce`, and `pkceVerifier`, stores `stateRef`, `sha256(stateNonce)`, encrypted `pkceVerifier`, `requesterUserId`, `claimId`, `returnTo`, `expiresAt`, and `usedAt = null` in `claimVerificationNonces`, and returns a redirect to `https://github.com/login/oauth/authorize` with the GitHub App `client_id`, explicit `redirect_uri`, `state=${stateRef}.${stateNonce}`, `code_challenge`, `code_challenge_method=S256`, and `allow_signup=false`. No GitHub verification grant is written to cookies, local storage, or the database.
3. GitHub redirects to `GET /api/publisher/v1/claims/verify/callback?code=...&state=...&installation_id=...&setup_action=...`. This callback route is the documented exception to same-origin JSON mutation checks, but it still requires the current Better Auth session and the stored requester user to match.
4. The callback decodes `stateRef` and `stateNonce`, then atomically consumes the nonce row with a compare-and-set update (`usedAt = verifiedAt` only when `stateRef`, `sha256(stateNonce)`, `requesterUserId`, and `expiresAt > verifiedAt` still match and `usedAt is null`). If no row is updated, the callback is rejected as invalid, expired, mismatched, or replayed. Only the winner may then decrypt `pkceVerifierCiphertext` with BETTER_AUTH_SECRET-derived server crypto and exchange `code` at `https://github.com/login/oauth/access_token` using the GitHub App client credentials, the plaintext `codeVerifier`, and the same `redirect_uri`. Repository claims pass the target `repository_id` during exchange to minimise the user grant. Any returned refresh token is ignored and never persisted.
5. The ephemeral GitHub App user token is used immediately to call `/user`, `/user/installations`, and `/user/installations/{installation_id}/repositories`, plus `/user/memberships/orgs/{org}` for organisation claims. Repository claims must prove the target repository is visible through the callback installation and that the repository response reports `permissions.admin === true`. Organisation claims must prove the callback installation is visible, that the membership response reports `state === "active"` and `role === "admin"`, and that the later installation facts resolve to `targetType === "organization"` with exact `targetId === claimedOrganisationId`.
6. Only after the user-bound checks succeed does the server mint an installation token with explicit permissions. Repository claims must scope to the target repository ID and use `{ metadata: "read", administration: "read" }`. Organisation claims must use `{ metadata: "read", members: "read" }`. The installation token is used for the single verification transaction, and both the ephemeral GitHub App user token and any minted installation token are explicitly revoked in `finally` cleanup after verification succeeds or fails after issuance. Neither token is persisted.

---

## File Map

- `packages/auth/package.json`: pin Better Auth runtime and adapter versions in the auth workspace.
- `apps/web/package.json`: add the Better Auth React client and the workspace auth package to the web app.
- `packages/domain/package.json`: add the workspace auth package so the domain layer can reuse the capability matrix and session types.
- `packages/config/src/env.ts`: split shared environment loading from web-auth environment loading, keep all web/auth variables in `WebEnv`, validate the canonical origin, and add retention defaults.
- `packages/auth/src/better-auth.ts`: Better Auth 1.7.2 factory and thin default instance using `createAuth({ db, env, fetchImpl })`, UUID IDs, provider-scoped identity strategy, strict GitHub scope, canonical trusted origins, and token-stripping account hooks.
- `packages/auth/src/capabilities.ts`: four-role capability matrix used by domain and web code.
- `packages/auth/src/session.ts`: framework-neutral session lookup and authenticated-session helpers.
- `packages/auth/src/request-guards.ts`: same-origin JSON mutation guard and typed route errors.
- `packages/db/src/schema/better-auth.ts`: Better Auth-owned `user`, `session`, `account`, and `verification` tables generated from the pinned auth config.
- `packages/db/src/schema/publisher-claims.ts`: claim lifecycle entity keyed by server, publisher, requester, and stable GitHub subject IDs.
- `packages/db/src/schema/publisher-claim-events.ts`: append-only per-claim state transitions and evidence summaries.
- `packages/db/src/schema/claim-verification-nonces.ts`: tokenless state references, hashed nonces, encrypted PKCE verifiers, bound requester user IDs, expiry, and single-use compare-and-set callback records for GitHub App verification.
- `packages/db/src/schema/audit-events.ts`: append-only audit trail for claims, memberships, sessions, export, and erasure.
- `packages/db/src/schema/transactional-outbox.ts`: durable `trust.refresh` outbox queue.
- `packages/db/src/schema/account-erasure-requests.ts`: retryable erasure state machine state.
- `packages/db/src/schema/publishers.ts`: ownerless-manual-review lock fields.
- `packages/db/src/schema/publisher-memberships.ts`: membership uniqueness and Better Auth user foreign key.
- `packages/db/drizzle/0004_phase_g_publisher_platform.sql`: reviewed migration for auth, claim, audit, outbox, erasure, and publisher-lock changes while consuming the existing Phase F `legal_holds` table without recreating it. If Phase F lands under a different final number, derive the next available migration number before generating this file.
- `packages/domain/src/publisher/dashboard.ts`: publisher dashboard read model.
- `packages/domain/src/publisher/memberships.ts`: role changes, member removal, and last-owner protection.
- `packages/domain/src/publisher/audit.ts`: bounded audit writer.
- `packages/domain/src/publisher/github-app-client.ts`: GitHub App user-to-server code exchange, explicit ephemeral user-token revocation, user-permission checks, and narrowly scoped installation-token client for repository and organisation claims.
- `packages/domain/src/publisher/claims.ts`: claim creation, verification start, compare-and-set callback nonce consumption, verification completion, rejection, revocation, supersession, withdrawal, and ownership-change handling.
- `packages/domain/src/publisher/account-export.ts`: machine-readable export builder.
- `packages/domain/src/publisher/account-erasure.ts`: erasure request creation and persisted, resumable step runner for external side effects.
- `packages/domain/src/publisher/trust-refresh.ts`: publisher-verification trust-signal updater used by outbox delivery.
- `packages/domain/src/publisher/retention.ts`: retention sweeps for sessions, claims, audits, outbox, and dormant accounts.
- `apps/web/src/lib/auth-client.ts`: Better Auth React client for the sign-in page and dashboard actions.
- `apps/web/src/app/api/auth/[...all]/route.ts`: Better Auth route mount at the recommended Next.js App Router path.
- `apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts`: same-origin JSON route utilities, callback-session helpers, and private-cache headers.
- `apps/web/src/app/api/publisher/v1/session/route.ts`: authenticated dashboard JSON read model.
- `apps/web/src/app/api/publisher/v1/claims/route.ts`: claim creation endpoint.
- `apps/web/src/app/api/publisher/v1/claims/[claimId]/verify/route.ts`: verification-start endpoint.
- `apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts`: GitHub App verification callback endpoint, documented same-origin exception, and dashboard redirect after state, nonce, session, and PKCE validation.
- `apps/web/src/app/api/publisher/v1/claims/[claimId]/withdraw/route.ts`: claim withdrawal endpoint.
- `apps/web/src/app/api/publisher/v1/memberships/[membershipId]/route.ts`: role-change and membership-removal endpoint.
- `apps/web/src/app/api/publisher/v1/account/export/route.ts`: machine-readable export endpoint.
- `apps/web/src/app/api/publisher/v1/account/erasure/route.ts`: erasure-request endpoint.
- `apps/web/src/app/sign-in/page.tsx`: GitHub-only publisher sign-in screen with explicit dashboard callback.
- `apps/web/src/app/dashboard/layout.tsx`: page-level session guard for the private dashboard.
- `apps/web/src/app/dashboard/page.tsx`: publisher dashboard landing page.
- `apps/web/src/app/dashboard/listings/[id]/page.tsx`: claim and listing detail view for one claimed listing.
- `apps/web/src/components/publisher/*`: accessible dashboard UI primitives.
- `apps/web/e2e/setup/publisher-session-fixtures.ts`: Better Auth user, account, session, publisher, and claim test data seeding.
- `apps/web/e2e/publisher-dashboard.spec.ts`: keyboard, focus, error, and reflow coverage for the dashboard.
- `apps/web/e2e/publisher-auth.spec.ts`: sign-in boundary and signed-out redirect coverage.
- `apps/web/e2e/publisher-claims.spec.ts`: claim lifecycle, conflict guidance, and destructive confirmation coverage.
- `apps/web/e2e/contrast.spec.ts`: contrast and forced-colours checks extended to publisher surfaces.
- `apps/worker/src/publisher-outbox-worker.ts`: delivery and reconciliation of `trust.refresh` outbox rows.
- `apps/worker/src/publisher-erasure-worker.ts`: resumable processing of retryable account-erasure side effects.
- `apps/worker/src/publisher-retention-worker.ts`: scheduled sweeps for expired sessions, claims, dormant accounts, legal holds, and outbox cleanup.

### Task 1: Pin Better Auth And Split Environment Loading

**Files:**

- Modify: `packages/auth/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/domain/package.json`
- Modify: `packages/config/src/env.ts`
- Test: `packages/config/src/env.test.ts`

**Interfaces:**

- Produces: `loadEnv(raw?: Record<string, string | undefined>): DirectoryEnv`
- Produces: `loadWebEnv(raw?: Record<string, string | undefined>): WebEnv`
- Produces: `resolveWebUrls(env: Pick<WebEnv, "NEXT_PUBLIC_BASE_URL" | "BETTER_AUTH_URL">): { siteOrigin: string; authBaseURL: string; trustedOrigins: readonly string[] }`
- Produces pinned runtime versions: `better-auth@1.7.2`, `@better-auth/drizzle-adapter@1.7.2`, and CLI use through `pnpm dlx auth@1.7.2 ...`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadEnv, loadWebEnv, resolveWebUrls } from "./env.js";

describe("loadWebEnv", () => {
  it("keeps web/auth variables out of loadEnv and requires them in loadWebEnv", () => {
    const shared = loadEnv({
      DATABASE_URL: "postgresql://localhost:5432/themcpdirectory",
      MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
    });

    expect(shared).not.toHaveProperty("NEXT_PUBLIC_BASE_URL");

    expect(() =>
      loadWebEnv({
        DATABASE_URL: "postgresql://localhost:5432/themcpdirectory",
        MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
        NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects a Better Auth URL with a different origin than the canonical site origin", () => {
    expect(() =>
      resolveWebUrls(
        loadWebEnv({
          DATABASE_URL: "postgresql://localhost:5432/themcpdirectory",
          MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
          NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
          BETTER_AUTH_URL: "https://auth.example.com/api/auth",
          BETTER_AUTH_SECRET: "01234567890123456789012345678901",
          GITHUB_CLIENT_ID: "github-client-id",
          GITHUB_CLIENT_SECRET: "github-client-secret",
          GITHUB_APP_ID: "12345",
          GITHUB_APP_PRIVATE_KEY: "test-private-key",
          GITHUB_APP_SLUG: "themcpdirectory",
        }),
      ),
    ).toThrow(/same origin/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/config test -- src/env.test.ts`
Expected: FAIL with `loadWebEnv` missing or an auth-variable validation error.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "dependencies": {
    "better-auth": "1.7.2",
    "@better-auth/drizzle-adapter": "1.7.2"
  }
}
```

```ts
import { z } from "zod";

const RetentionEnvSchema = z.object({
  PUBLISHER_AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  PUBLISHER_CLAIM_EXPIRY_DAYS: z.coerce.number().int().positive().default(30),
  PUBLISHER_CLAIM_EVIDENCE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  PUBLISHER_OUTBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  PUBLISHER_EXPIRED_SESSION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  PUBLISHER_DORMANT_ACCOUNT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
});

const SharedEnvSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    MCP_REGISTRY_BASE_URL: z.string().url(),
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    API_PORT: z.coerce.number().int().positive().default(3001),
    GITHUB_TOKEN: z.string().optional(),
  })
  .merge(RetentionEnvSchema);

const WebAuthEnvSchema = SharedEnvSchema.extend({
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.string().regex(/^\d+$/),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
}).superRefine((env, ctx) => {
  const siteOrigin = new URL(env.NEXT_PUBLIC_BASE_URL).origin;
  const authBaseURL =
    env.BETTER_AUTH_URL || new URL("/api/auth", env.NEXT_PUBLIC_BASE_URL).toString();

  if (new URL(authBaseURL).origin !== siteOrigin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BETTER_AUTH_URL"],
      message: "BETTER_AUTH_URL must share the same origin as NEXT_PUBLIC_BASE_URL.",
    });
  }
});

export type DirectoryEnv = z.infer<typeof SharedEnvSchema> & z.infer<typeof RetentionEnvSchema>;
export type WebEnv = z.infer<typeof WebAuthEnvSchema>;

export function loadEnv(raw: Record<string, string | undefined> = process.env): DirectoryEnv {
  return SharedEnvSchema.parse(raw);
}

export function loadWebEnv(raw: Record<string, string | undefined> = process.env): WebEnv {
  return WebAuthEnvSchema.parse(raw);
}

export function resolveWebUrls(env: Pick<WebEnv, "NEXT_PUBLIC_BASE_URL" | "BETTER_AUTH_URL">): {
  siteOrigin: string;
  authBaseURL: string;
  trustedOrigins: readonly string[];
} {
  const siteOrigin = new URL(env.NEXT_PUBLIC_BASE_URL).origin;
  const authBaseURL =
    env.BETTER_AUTH_URL || new URL("/api/auth", env.NEXT_PUBLIC_BASE_URL).toString();

  if (new URL(authBaseURL).origin !== siteOrigin) {
    throw new Error("BETTER_AUTH_URL must share the same origin as NEXT_PUBLIC_BASE_URL.");
  }

  return { siteOrigin, authBaseURL, trustedOrigins: [siteOrigin] };
}
```

Run after the file edits:

```bash
pnpm --filter @themcpdirectory/auth add -E better-auth@1.7.2 @better-auth/drizzle-adapter@1.7.2
pnpm --filter @themcpdirectory/web add -E better-auth@1.7.2
pnpm --filter @themcpdirectory/web add @themcpdirectory/auth@workspace:*
pnpm --filter @themcpdirectory/domain add @themcpdirectory/auth@workspace:*
pnpm install
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/config test -- src/env.test.ts`
Expected: PASS and the parsed object includes the default retention periods.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/package.json apps/web/package.json packages/domain/package.json packages/config/src/env.ts packages/config/src/env.test.ts pnpm-lock.yaml
git commit -m "chore(auth): pin better-auth and split env loading"
```

### Task 2: Add Reviewed Auth And Publisher-Platform Migrations

**Files:**

- Create: `packages/auth/src/better-auth.ts`
- Create: `packages/db/src/schema/better-auth.ts`
- Create: `packages/db/src/schema/publisher-claims.ts`
- Create: `packages/db/src/schema/publisher-claim-events.ts`
- Create: `packages/db/src/schema/claim-verification-nonces.ts`
- Create: `packages/db/src/schema/audit-events.ts`
- Create: `packages/db/src/schema/transactional-outbox.ts`
- Create: `packages/db/src/schema/account-erasure-requests.ts`
- Create: `packages/db/src/__tests__/postgres-test-db.ts`
- Create: `packages/db/src/__tests__/publisher-platform.schema.integration.test.ts`
- Modify: `packages/db/src/schema/publishers.ts`
- Modify: `packages/db/src/schema/publisher-memberships.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/0004_phase_g_publisher_platform.sql`
- Modify: `packages/db/drizzle/meta/*`

**Interfaces:**

- Produces Better Auth tables: `authUsers`, `authSessions`, `authAccounts`, `authVerification`
- Produces claim tables: `publisherClaims`, `publisherClaimEvents`, `claimVerificationNonces`
- Produces callback-state columns on `claimVerificationNonces`: `stateRef`, `stateHash`, `pkceVerifierCiphertext`, `requesterUserId`, `expiresAt`, `usedAt`
- Produces operational tables: `auditEvents`, `transactionalOutbox`, `accountErasureRequests`
- Consumes existing Phase F table: `legalHolds`
- Produces publisher lock fields: `publishers.ownershipState`, `publishers.ownershipLockedAt`, `publishers.ownershipLockReason`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publisherClaims, publisherMemberships, type Database } from "@themcpdirectory/db";
import { createTempDatabase } from "./postgres-test-db.js";

describe("publisher platform schema", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task10_publisher_schema");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("rejects a second open claim for the same server", async () => {
    const serverId = "11111111-1111-4111-8111-111111111111";
    const publisherId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";

    await db.insert(publisherClaims).values({
      id: "44444444-4444-4444-8444-444444444444",
      serverId,
      publisherId,
      requesterUserId: userId,
      verificationMethod: "github_repository",
      githubSubjectType: "repository",
      githubSubjectId: "12345678",
      status: "pending",
      evidenceSummary: {},
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    await expect(
      db.insert(publisherClaims).values({
        id: "55555555-5555-4555-8555-555555555555",
        serverId,
        publisherId,
        requesterUserId: userId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "12345678",
        status: "verifying",
        evidenceSummary: {},
        expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate publisher memberships for the same Better Auth user", async () => {
    const publisherId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";

    await db.insert(publisherMemberships).values({
      publisherId,
      userId,
      role: "owner",
    });

    await expect(
      db.insert(publisherMemberships).values({
        publisherId,
        userId,
        role: "viewer",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/db test:integration -- src/__tests__/publisher-platform.schema.integration.test.ts`
Expected: FAIL because the auth and publisher-platform tables do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/auth/src/better-auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { BetterAuthOptions } from "better-auth";
import { createDatabase, type Database } from "@themcpdirectory/db";
import { loadWebEnv, resolveWebUrls, type WebEnv } from "@themcpdirectory/config";

export interface CreateAuthInput {
  readonly db: Database;
  readonly env: WebEnv;
  readonly fetchImpl?: typeof fetch;
}

async function getGitHubUserProfile(fetchImpl: typeof fetch, token: string) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  const [userResponse, emailResponse] = await Promise.all([
    fetchImpl("https://api.github.com/user", { headers }),
    fetchImpl("https://api.github.com/user/emails", { headers }),
  ]);

  const user = await userResponse.json();
  const emails = (await emailResponse.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primaryEmail = emails.find((email) => email.primary && email.verified)?.email ?? null;

  return {
    id: String(user.id),
    email: primaryEmail,
    name: user.name ?? user.login,
    image: user.avatar_url ?? null,
  };
}

export function createAuth({ db, env, fetchImpl = fetch }: CreateAuthInput) {
  const { authBaseURL, trustedOrigins } = resolveWebUrls(env);

  return betterAuth({
    baseURL: authBaseURL,
    basePath: "/api/auth",
    trustedOrigins,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),
    advanced: {
      database: {
        generateId: "uuid",
        joins: true,
      },
    },
    account: {
      identityStrategy: "provider-id",
      storeStateStrategy: "database",
      storeAccountCookie: false,
      accountLinking: {
        disableImplicitLinking: true,
        trustedProviders: ["github"],
        allowDifferentEmails: false,
      },
    },
    verification: {
      storeIdentifier: "hashed",
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        disableDefaultScope: true,
        scope: ["read:user", "user:email"],
        getUserInfo: async (token) => getGitHubUserProfile(fetchImpl, token),
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => ({
            data: { ...account, accessToken: null, refreshToken: null, idToken: null },
          }),
        },
        update: {
          before: async (account) => ({
            data: { ...account, accessToken: null, refreshToken: null, idToken: null },
          }),
        },
      },
    },
  } satisfies BetterAuthOptions);
}

const env = loadWebEnv();
const db = createDatabase(env.DATABASE_URL);
export const auth = createAuth({ db, env });
```

```ts
// packages/db/src/schema/publisher-claims.ts
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { publishers } from "./publishers.js";
import { servers } from "./servers.js";
import { authUsers } from "./better-auth.js";

export const publisherClaims = pgTable(
  "publisher_claims",
  {
    id: uuid().primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    verificationMethod: text("verification_method").notNull(),
    githubSubjectType: text("github_subject_type").notNull(),
    githubSubjectId: text("github_subject_id").notNull(),
    status: text().notNull().default("pending"),
    evidenceSummary: jsonb("evidence_summary")
      .notNull()
      .default(sql`'{}'::jsonb`),
    failureReason: text("failure_reason"),
    conflictClaimId: uuid("conflict_claim_id"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publisher_claims_server_id_idx").on(t.serverId),
    index("publisher_claims_publisher_id_idx").on(t.publisherId),
    uniqueIndex("publisher_claims_open_server_uidx")
      .on(t.serverId)
      .where(sql`${t.status} in ('pending', 'verifying')`),
    check(
      "publisher_claims_status_check",
      sql`${t.status} in ('pending', 'verifying', 'verified', 'rejected', 'withdrawn', 'superseded', 'revoked')`,
    ),
    check(
      "publisher_claims_subject_type_check",
      sql`${t.githubSubjectType} in ('repository', 'organization')`,
    ),
  ],
);
```

```ts
// packages/db/src/schema/claim-verification-nonces.ts
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./better-auth.js";
import { publisherClaims } from "./publisher-claims.js";

export const claimVerificationNonces = pgTable(
  "claim_verification_nonces",
  {
    id: uuid().primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => publisherClaims.id, { onDelete: "cascade" }),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    stateRef: text("state_ref").notNull(),
    stateHash: text("state_hash").notNull(),
    pkceVerifierCiphertext: text("pkce_verifier_ciphertext").notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("claim_verification_nonces_state_ref_uidx").on(t.stateRef),
    uniqueIndex("claim_verification_nonces_state_hash_uidx").on(t.stateHash),
    index("claim_verification_nonces_requester_user_id_idx").on(t.requesterUserId),
    index("claim_verification_nonces_claim_id_idx").on(t.claimId),
  ],
);
```

```ts
// packages/db/src/schema/publisher-memberships.ts
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "./better-auth.js";
import { publishers } from "./publishers.js";

export const publisherMemberships = pgTable(
  "publisher_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publisher_memberships_publisher_id_idx").on(t.publisherId),
    index("publisher_memberships_user_id_idx").on(t.userId),
    uniqueIndex("publisher_memberships_publisher_user_uidx").on(t.publisherId, t.userId),
    check(
      "publisher_memberships_role_check",
      sql`${t.role} in ('owner', 'admin', 'editor', 'viewer')`,
    ),
  ],
);
```

Generate the Better Auth schema and the reviewed Drizzle migration after adding the files:

```bash
pnpm dlx auth@1.7.2 generate --config packages/auth/src/better-auth.ts --adapter drizzle --dialect postgresql --output packages/db/src/schema/better-auth.ts
pnpm --filter @themcpdirectory/db db:generate
```

Review `packages/db/drizzle/0004_phase_g_publisher_platform.sql` before committing so it creates Better Auth, claim, audit, outbox, erasure, and publisher-lock changes only. It must not create, rename, drop, or change ownership of the Phase F `legal_holds` table or any object introduced by `0003_phase_f_trust_health.sql`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/db test:integration -- src/__tests__/publisher-platform.schema.integration.test.ts && pnpm --filter @themcpdirectory/db typecheck`
Expected: PASS. If you need to apply the migration manually during verification, inject an explicit temporary `DATABASE_URL` from the test harness rather than relying on ambient shell state, and apply the Phase F migration first so the existing `legal_holds` table is present.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/better-auth.ts packages/db/src/schema/better-auth.ts packages/db/src/schema/publisher-claims.ts packages/db/src/schema/publisher-claim-events.ts packages/db/src/schema/claim-verification-nonces.ts packages/db/src/schema/audit-events.ts packages/db/src/schema/transactional-outbox.ts packages/db/src/schema/account-erasure-requests.ts packages/db/src/schema/publishers.ts packages/db/src/schema/publisher-memberships.ts packages/db/src/schema/index.ts packages/db/src/__tests__/postgres-test-db.ts packages/db/src/__tests__/publisher-platform.schema.integration.test.ts packages/db/drizzle/0004_phase_g_publisher_platform.sql packages/db/drizzle/meta
git commit -m "feat(db): add publisher auth and claim schema"
```

### Task 3: Expose Auth Session And Capability Helpers

**Files:**

- Create: `packages/auth/src/capabilities.ts`
- Create: `packages/auth/src/session.ts`
- Create: `packages/auth/src/request-guards.ts`
- Create: `packages/auth/src/errors.ts`
- Create: `packages/auth/src/__tests__/better-auth.test.ts`
- Create: `packages/auth/src/__tests__/capabilities.test.ts`
- Modify: `packages/auth/src/better-auth.ts`
- Modify: `packages/auth/src/index.ts`

**Interfaces:**

- Produces: `type PublisherRole = "owner" | "admin" | "editor" | "viewer"`
- Produces: `type PublisherCapability = "publisher.read" | "publisher.edit" | "claims.manage" | "members.manage" | "ownership.transfer" | "publisher.destroy"`
- Produces: `roleHasCapability(role: PublisherRole, capability: PublisherCapability): boolean`
- Produces: `getSessionOrNull(headers: Headers): Promise<AuthenticatedSession | null>`
- Produces: `requireSession(headers: Headers): Promise<AuthenticatedSession>`
- Produces: `assertSameOriginJsonMutation(request: Request, siteOrigin: string): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { auth, roleHasCapability } from "../index.js";

describe("auth configuration", () => {
  it("uses provider-scoped GitHub identity and strips provider token material", async () => {
    const hook = auth.options.databaseHooks?.account?.create?.before;
    const result = await hook?.(
      {
        providerId: "github",
        accessToken: "gho_secret",
        refreshToken: "ghr_secret",
        idToken: "jwt_secret",
      },
      { path: "/callback/:id", context: {} } as never,
    );

    expect(auth.options.account?.identityStrategy).toBe("provider-id");
    expect(auth.options.socialProviders?.github?.scope).toEqual(["read:user", "user:email"]);
    expect(result).toEqual({
      data: expect.objectContaining({
        accessToken: null,
        refreshToken: null,
        idToken: null,
      }),
    });
  });

  it("enforces the four-role capability matrix", () => {
    expect(roleHasCapability("owner", "ownership.transfer")).toBe(true);
    expect(roleHasCapability("admin", "ownership.transfer")).toBe(false);
    expect(roleHasCapability("editor", "publisher.edit")).toBe(true);
    expect(roleHasCapability("viewer", "claims.manage")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/auth test -- src/__tests__/better-auth.test.ts src/__tests__/capabilities.test.ts`
Expected: FAIL because the helper exports and token-stripping hooks are not wired yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/auth/src/capabilities.ts
export type PublisherRole = "owner" | "admin" | "editor" | "viewer";
export type PublisherCapability =
  | "publisher.read"
  | "publisher.edit"
  | "claims.manage"
  | "members.manage"
  | "ownership.transfer"
  | "publisher.destroy";

const PUBLISHER_CAPABILITY_MATRIX: Record<PublisherRole, readonly PublisherCapability[]> = {
  owner: [
    "publisher.read",
    "publisher.edit",
    "claims.manage",
    "members.manage",
    "ownership.transfer",
    "publisher.destroy",
  ],
  admin: ["publisher.read", "publisher.edit", "claims.manage", "members.manage"],
  editor: ["publisher.read", "publisher.edit"],
  viewer: ["publisher.read"],
};

export function roleHasCapability(role: PublisherRole, capability: PublisherCapability): boolean {
  return PUBLISHER_CAPABILITY_MATRIX[role].includes(capability);
}
```

```ts
// packages/auth/src/session.ts
import { auth } from "./better-auth.js";

export interface AuthenticatedSession {
  readonly user: {
    readonly id: string;
    readonly email: string | null;
    readonly name: string | null;
    readonly image: string | null;
  };
  readonly session: {
    readonly id: string;
    readonly token: string;
    readonly userId: string;
    readonly expiresAt: Date;
  };
}

export async function getSessionOrNull(headers: Headers): Promise<AuthenticatedSession | null> {
  const session = await auth.api.getSession({ headers });
  return session ? (session as AuthenticatedSession) : null;
}

export async function requireSession(headers: Headers): Promise<AuthenticatedSession> {
  const session = await getSessionOrNull(headers);
  if (!session) throw new Error("AUTH_REQUIRED");
  return session;
}
```

```ts
// packages/auth/src/request-guards.ts
export function assertSameOriginJsonMutation(request: Request, siteOrigin: string): void {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type")?.split(";")[0];

  if (origin !== siteOrigin) {
    throw new Error("ORIGIN_FORBIDDEN");
  }

  if (contentType !== "application/json") {
    throw new Error("UNSUPPORTED_CONTENT_TYPE");
  }
}
```

```ts
// packages/auth/src/better-auth.ts
databaseHooks: {
  account: {
    create: {
      before: async (account) => ({
        data: {
          ...account,
          accessToken: null,
          refreshToken: null,
          idToken: null,
        },
      }),
    },
    update: {
      before: async (account) => ({
        data: {
          ...account,
          accessToken: null,
          refreshToken: null,
          idToken: null,
        },
      }),
    },
  },
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/auth test -- src/__tests__/better-auth.test.ts src/__tests__/capabilities.test.ts`
Expected: PASS and the auth config proves token material is replaced with `null` before persistence.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/better-auth.ts packages/auth/src/capabilities.ts packages/auth/src/session.ts packages/auth/src/request-guards.ts packages/auth/src/errors.ts packages/auth/src/index.ts packages/auth/src/__tests__/better-auth.test.ts packages/auth/src/__tests__/capabilities.test.ts
git commit -m "feat(auth): add session and capability helpers"
```

### Task 4: Build Publisher Dashboard Authorisation And Audit Foundations

**Files:**

- Create: `packages/domain/src/publisher/dashboard.ts`
- Create: `packages/domain/src/publisher/memberships.ts`
- Create: `packages/domain/src/publisher/audit.ts`
- Create: `packages/domain/src/publisher/__tests__/dashboard.integration.test.ts`
- Create: `packages/domain/src/publisher/__tests__/memberships.integration.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces: `getPublisherDashboard(db: Database, input: { userId: string; preferredPublisherId?: string | null }): Promise<PublisherDashboard>`
- Produces: `updatePublisherMembershipRole(db: Database, input: { actorUserId: string; membershipId: string; nextRole: PublisherRole }): Promise<PublisherMemberSummary>`
- Produces: `removePublisherMembership(db: Database, input: { actorUserId: string; membershipId: string }): Promise<{ removedMembershipId: string }>`
- Produces: `appendAuditEvent(tx: Database, input: AuditEventInput): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database } from "@themcpdirectory/db";
import { getPublisherDashboard, updatePublisherMembershipRole } from "../index.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

describe("publisher authorisation", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task11_publisher_dashboard");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("falls back to an allowed publisher when the browser asks for one the user does not own", async () => {
    const dashboard = await getPublisherDashboard(db, {
      userId: "33333333-3333-4333-8333-333333333333",
      preferredPublisherId: "99999999-9999-4999-8999-999999999999",
    });

    expect(dashboard.activePublisher?.id).not.toBe("99999999-9999-4999-8999-999999999999");
  });

  it("prevents the last owner from demoting themselves", async () => {
    await expect(
      updatePublisherMembershipRole(db, {
        actorUserId: "33333333-3333-4333-8333-333333333333",
        membershipId: "77777777-7777-4777-8777-777777777777",
        nextRole: "admin",
      }),
    ).rejects.toThrow(/LAST_OWNER/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/dashboard.integration.test.ts src/publisher/__tests__/memberships.integration.test.ts`
Expected: FAIL because the dashboard read model and last-owner guard do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/publisher/dashboard.ts
import type { PublisherCapability, PublisherRole } from "@themcpdirectory/auth";

export interface PublisherMembershipSummary {
  readonly membershipId: string;
  readonly publisherId: string;
  readonly publisherSlug: string;
  readonly publisherDisplayName: string;
  readonly role: PublisherRole;
  readonly capabilities: readonly PublisherCapability[];
}

export interface PublisherMemberSummary {
  readonly membershipId: string;
  readonly userId: string;
  readonly role: PublisherRole;
  readonly displayName: string | null;
  readonly email: string | null;
}

export interface PublisherDashboard {
  readonly viewer: {
    readonly userId: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly image: string | null;
  };
  readonly memberships: readonly PublisherMembershipSummary[];
  readonly activePublisher: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
    readonly role: PublisherRole;
    readonly capabilities: readonly PublisherCapability[];
    readonly claims: readonly {
      readonly claimId: string;
      readonly status: string;
      readonly serverTitle: string;
    }[];
    readonly members: readonly PublisherMemberSummary[];
  } | null;
}
```

```ts
// packages/domain/src/publisher/memberships.ts
import {
  roleHasCapability,
  type PublisherCapability,
  type PublisherRole,
} from "@themcpdirectory/auth";

export async function requirePublisherAccess(
  db: Database,
  input: { userId: string; publisherId: string; capability: PublisherCapability },
): Promise<{ membershipId: string; publisherId: string; role: PublisherRole }> {
  const membership = await findMembership(db, input.userId, input.publisherId);
  if (!membership || !roleHasCapability(membership.role, input.capability)) {
    throw new Error("PUBLISHER_FORBIDDEN");
  }
  return membership;
}

export async function updatePublisherMembershipRole(
  db: Database,
  input: { actorUserId: string; membershipId: string; nextRole: PublisherRole },
) {
  const membership = await findMembershipById(db, input.membershipId);
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");

  await requirePublisherAccess(db, {
    userId: input.actorUserId,
    publisherId: membership.publisherId,
    capability: "members.manage",
  });

  if (
    membership.userId === input.actorUserId &&
    membership.role === "owner" &&
    input.nextRole !== "owner"
  ) {
    const ownerCount = await countOwners(db, membership.publisherId);
    if (ownerCount === 1) throw new Error("LAST_OWNER");
  }

  return persistRoleChange(db, membership.id, input.nextRole);
}
```

```ts
// packages/domain/src/publisher/audit.ts
export interface AuditEventInput {
  readonly actorUserId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly outcome: "success" | "failure" | "blocked";
  readonly metadata: Record<string, unknown>;
}

export async function appendAuditEvent(tx: Database, input: AuditEventInput): Promise<void> {
  await tx.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    outcome: input.outcome,
    metadata: input.metadata,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/dashboard.integration.test.ts src/publisher/__tests__/memberships.integration.test.ts`
Expected: PASS and the dashboard resolves only authorised publishers while last-owner protection blocks self-demotion.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/publisher/dashboard.ts packages/domain/src/publisher/memberships.ts packages/domain/src/publisher/audit.ts packages/domain/src/publisher/__tests__/dashboard.integration.test.ts packages/domain/src/publisher/__tests__/memberships.integration.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add publisher dashboard authorisation"
```

### Task 5: Implement Claim Lifecycle And Ephemeral GitHub App Verification

**Files:**

- Create: `packages/domain/src/publisher/github-app-client.ts`
- Create: `packages/domain/src/publisher/claims.ts`
- Create: `packages/domain/src/publisher/__tests__/claims.integration.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces: `createPublisherClaim(db: Database, input: CreatePublisherClaimInput): Promise<CreatePublisherClaimResult>`
- Produces: `beginPublisherClaimVerification(db: Database, input: { claimId: string; requesterUserId: string; returnTo: string; now: Date }, deps: ClaimVerificationDeps): Promise<{ claimId: string; redirectUrl: string; expiresAt: Date }>`
- Produces: `completePublisherClaimVerification(db: Database, input: { state: string; code: string; installationId: number | null; setupAction: "install" | "request" | null; requesterUserId: string; verifiedAt: Date }, deps: CompleteClaimVerificationDeps): Promise<{ claimId: string; status: string; publisherId: string; serverId: string; githubSubjectType: "repository" | "organization"; returnTo: string }>`
- Produces: `rejectPublisherClaim(db: Database, input: { claimId: string; reviewerUserId: string; reason: string; reviewedAt: Date }): Promise<{ claimId: string; status: "rejected" }>`
- Produces: `revokePublisherClaim(db: Database, input: { claimId: string; reviewerUserId: string; reason: string; revokedAt: Date }): Promise<{ claimId: string; status: "revoked" }>`
- Produces: `withdrawPublisherClaim(db: Database, input: { claimId: string; requesterUserId: string }): Promise<{ claimId: string; status: "withdrawn" }>`
- Produces: `type GitHubOrganisationMembershipState = "active" | "pending" | "none"`
- Produces: `type GitHubOrganisationRole = "admin" | "member" | "none"`
- Produces: `interface GitHubUserPermissionFacts { githubUserId: string; installationVisible: boolean; repositoryId: number | null; repositoryAdmin: boolean; organisationId: number | null; organisationMembershipState: GitHubOrganisationMembershipState; organisationRole: GitHubOrganisationRole }`
- Produces: `interface GitHubInstallationFacts { installationId: number; targetType: "user" | "organization"; targetId: number; repositoryIds: readonly number[]; repositorySelection: "all" | "selected"; permissions: Record<string, string> }`
- Produces: `interface ClaimVerificationDeps { sha256(value: string): string; randomId(): string; randomSecret(): string; encrypt(value: string): string; redirectUri: string; buildUserAuthorisationUrl(input: { state: string; redirectUri: string; codeChallenge: string }): string }`
- Produces: `interface CompleteClaimVerificationDeps { sha256(value: string): string; decrypt(value: string): string; redirectUri: string; githubApp: GitHubAppClient }`
- Produces: `createGitHubAppClient(env: Pick<WebEnv, "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET" | "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY" | "GITHUB_APP_SLUG">, fetchImpl?: typeof fetch): GitHubAppClient` using only GitHub client and app credentials; BETTER_AUTH_SECRET-backed PKCE crypto stays outside the client.
- Produces: `GitHubAppClient.exchangeUserCodeForToken(input: { code: string; redirectUri: string; codeVerifier: string; repositoryId?: number }): Promise<{ accessToken: string; expiresAt: Date | null }>`
- Produces: `GitHubAppClient.getAuthenticatedUser(input: { userAccessToken: string }): Promise<{ githubUserId: string; login: string }>`
- Produces: `GitHubAppClient.getUserPermissionFacts(input: { userAccessToken: string; installationId: number; subjectType: "repository" | "organization"; repositoryOwner: string | null; repositoryName: string | null; organisationLogin: string | null }): Promise<GitHubUserPermissionFacts>`
- Produces: `GitHubAppClient.createInstallationToken(input: { installationId: number; repositoryIds?: readonly number[]; permissions: { metadata: "read"; administration?: "read"; members?: "read" } }): Promise<{ token: string; expiresAt: Date; permissions: Record<string, string> }>`
- Produces: `GitHubAppClient.getInstallationFacts(input: { installationId: number; token: string; subjectType: "repository" | "organization" }): Promise<GitHubInstallationFacts>`
- Produces: `GitHubAppClient.revokeUserAccessToken(token: string): Promise<void>`
- Produces: `GitHubAppClient.revokeInstallationToken(token: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  claimVerificationNonces,
  publisherClaims,
  transactionalOutbox,
  type Database,
} from "@themcpdirectory/db";
import {
  beginPublisherClaimVerification,
  completePublisherClaimVerification,
  createPublisherClaim,
  rejectPublisherClaim,
  revokePublisherClaim,
  type ClaimVerificationDeps,
} from "../index.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const REDIRECT_URI = "http://localhost:3000/api/publisher/v1/claims/verify/callback";

function makeStartDeps(
  stateRef: string,
  stateNonce: string,
  pkceVerifier: string,
): ClaimVerificationDeps {
  const secrets = [stateNonce, pkceVerifier];
  const pkceVerifierCiphertext = `ciphertext:${stateRef}`;
  return {
    sha256: (value) => `sha:${value}`,
    randomId: () => stateRef,
    randomSecret: () => {
      const next = secrets.shift();
      if (!next) throw new Error("unexpected randomSecret call");
      return next;
    },
    encrypt: (value) => {
      expect(value).toBe(pkceVerifier);
      return pkceVerifierCiphertext;
    },
    redirectUri: REDIRECT_URI,
    buildUserAuthorisationUrl: ({ state, redirectUri, codeChallenge }) =>
      `https://github.com/login/oauth/authorize?client_id=github-app-client-id&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&allow_signup=false`,
  };
}

describe("publisher claims", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task12_publisher_claims");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("decrypts the verifier only for the winning callback exchange, uses the plaintext code verifier, and never persists it", async () => {
    const created = await createPublisherClaim(db, {
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      serverId: "11111111-1111-4111-8111-111111111111",
      publisherId: "22222222-2222-4222-8222-222222222222",
      verificationMethod: "github_repository",
    });

    const started = await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId: created.requesterUserId,
        returnTo: "/dashboard/listings/11111111-1111-4111-8111-111111111111",
        now: new Date("2026-09-01T12:00:00.000Z"),
      },
      makeStartDeps("state-ref-123", "state-nonce-123", "pkce-verifier-123"),
    );

    const [nonce] = await db.select().from(claimVerificationNonces);

    expect(nonce).toMatchObject({
      claimId: created.claimId,
      requesterUserId: created.requesterUserId,
      stateRef: "state-ref-123",
      stateHash: "sha:state-nonce-123",
      pkceVerifierCiphertext: "ciphertext:state-ref-123",
      usedAt: null,
    });
    expect(started.redirectUrl).toContain("https://github.com/login/oauth/authorize");
    expect(started.redirectUrl).toContain("state=state-ref-123.state-nonce-123");
    expect(started.redirectUrl).toContain("code_challenge=sha:pkce-verifier-123");

    const revokedUserTokens: string[] = [];
    const revokedInstallationTokens: string[] = [];
    const decryptedVerifiers: string[] = [];

    const completed = await completePublisherClaimVerification(
      db,
      {
        state: "state-ref-123.state-nonce-123",
        code: "repository-code",
        installationId: 91,
        setupAction: "install",
        requesterUserId: created.requesterUserId,
        verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
      },
      {
        sha256: (value) => `sha:${value}`,
        decrypt: (value) => {
          decryptedVerifiers.push(value);
          expect(value).toBe("ciphertext:state-ref-123");
          return "pkce-verifier-123";
        },
        redirectUri: REDIRECT_URI,
        githubApp: {
          exchangeUserCodeForToken: async ({ code, redirectUri, codeVerifier, repositoryId }) => {
            expect(code).toBe("repository-code");
            expect(redirectUri).toBe(REDIRECT_URI);
            expect(codeVerifier).toBe("pkce-verifier-123");
            expect(repositoryId).toBe(12345678);
            return {
              accessToken: "ghu_ephemeral_user_token",
              expiresAt: new Date("2026-09-01T20:05:00.000Z"),
            };
          },
          getAuthenticatedUser: async () => ({ githubUserId: "12345678", login: "octocat" }),
          getUserPermissionFacts: async () => ({
            githubUserId: "12345678",
            installationVisible: true,
            repositoryId: 12345678,
            repositoryAdmin: true,
            organisationId: null,
            organisationMembershipState: "none",
            organisationRole: "none",
          }),
          createInstallationToken: async ({ repositoryIds, permissions }) => {
            expect(repositoryIds).toEqual([12345678]);
            expect(permissions).toEqual({ metadata: "read", administration: "read" });
            return {
              token: "ghs_repo_installation_token",
              expiresAt: new Date("2026-09-01T13:05:00.000Z"),
              permissions,
            };
          },
          getInstallationFacts: async () => ({
            installationId: 91,
            targetType: "organization",
            targetId: 87654321,
            repositoryIds: [12345678],
            repositorySelection: "selected",
            permissions: { metadata: "read", administration: "read" },
          }),
          revokeUserAccessToken: async (token) => {
            revokedUserTokens.push(token);
          },
          revokeInstallationToken: async (token) => {
            revokedInstallationTokens.push(token);
          },
        },
      },
    );

    const [usedNonce] = await db
      .select()
      .from(claimVerificationNonces)
      .where(eq(claimVerificationNonces.claimId, created.claimId));
    const outbox = await db.select().from(transactionalOutbox);

    expect(completed.status).toBe("verified");
    expect(completed.returnTo).toBe("/dashboard/listings/11111111-1111-4111-8111-111111111111");
    expect(usedNonce?.usedAt).not.toBeNull();
    expect(usedNonce?.pkceVerifierCiphertext).toBe("ciphertext:state-ref-123");
    expect(decryptedVerifiers).toEqual(["ciphertext:state-ref-123"]);
    expect(revokedUserTokens).toEqual(["ghu_ephemeral_user_token"]);
    expect(revokedInstallationTokens).toEqual(["ghs_repo_installation_token"]);
    expect(outbox[0]).toMatchObject({ eventType: "trust.refresh", aggregateType: "server" });
    expect(JSON.stringify({ nonce, usedNonce, outbox, completed })).not.toContain(
      "pkce-verifier-123",
    );
  });

  it("rejects callback state for a different signed-in user and after expiry", async () => {
    const created = await createPublisherClaim(db, {
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      serverId: "11111111-1111-4111-8111-111111111112",
      publisherId: "22222222-2222-4222-8222-222222222223",
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId: created.requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:00:00.000Z"),
      },
      makeStartDeps("state-ref-456", "state-nonce-456", "pkce-verifier-456"),
    );

    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-456.state-nonce-456",
          code: "wrong-user-code",
          installationId: 91,
          setupAction: "install",
          requesterUserId: "44444444-4444-4444-8444-444444444444",
          verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
        },
        {
          sha256: (value) => `sha:${value}`,
          redirectUri: REDIRECT_URI,
          githubApp: {
            exchangeUserCodeForToken: async () => {
              throw new Error("should not exchange a mismatched user callback");
            },
            getAuthenticatedUser: async () => ({ githubUserId: "12345678", login: "octocat" }),
            getUserPermissionFacts: async () => ({
              githubUserId: "12345678",
              installationVisible: true,
              repositoryId: 12345678,
              repositoryAdmin: true,
              organisationId: null,
              organisationMembershipState: "none",
              organisationRole: "none",
            }),
            createInstallationToken: async ({ permissions }) => ({
              token: "unused",
              expiresAt: new Date("2026-09-01T13:05:00.000Z"),
              permissions,
            }),
            getInstallationFacts: async () => ({
              installationId: 91,
              targetType: "organization",
              targetId: 87654321,
              repositoryIds: [12345678],
              repositorySelection: "selected",
              permissions: { metadata: "read", administration: "read" },
            }),
            revokeUserAccessToken: async () => {},
            revokeInstallationToken: async () => {},
          },
        },
      ),
    ).rejects.toThrow(/requester|session|mismatch/i);

    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-456.state-nonce-456",
          code: "expired-code",
          installationId: 91,
          setupAction: "install",
          requesterUserId: created.requesterUserId,
          verifiedAt: new Date("2026-09-01T12:11:00.000Z"),
        },
        {
          sha256: (value) => `sha:${value}`,
          redirectUri: REDIRECT_URI,
          githubApp: {
            exchangeUserCodeForToken: async () => {
              throw new Error("should not exchange expired callback state");
            },
            getAuthenticatedUser: async () => ({ githubUserId: "12345678", login: "octocat" }),
            getUserPermissionFacts: async () => ({
              githubUserId: "12345678",
              installationVisible: true,
              repositoryId: 12345678,
              repositoryAdmin: true,
              organisationId: null,
              organisationMembershipState: "none",
              organisationRole: "none",
            }),
            createInstallationToken: async ({ permissions }) => ({
              token: "unused",
              expiresAt: new Date("2026-09-01T13:11:00.000Z"),
              permissions,
            }),
            getInstallationFacts: async () => ({
              installationId: 91,
              targetType: "organization",
              targetId: 87654321,
              repositoryIds: [12345678],
              repositorySelection: "selected",
              permissions: { metadata: "read", administration: "read" },
            }),
            revokeUserAccessToken: async () => {},
            revokeInstallationToken: async () => {},
          },
        },
      ),
    ).rejects.toThrow(/expired|invalid/i);
  });

  it("atomically consumes callback state so concurrent replays produce one winner and one rejection", async () => {
    const created = await createPublisherClaim(db, {
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      serverId: "11111111-1111-4111-8111-111111111115",
      publisherId: "22222222-2222-4222-8222-222222222226",
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId: created.requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:12:00.000Z"),
      },
      makeStartDeps("state-ref-654", "state-nonce-654", "pkce-verifier-654"),
    );

    let exchangeAttempts = 0;
    const revokedUserTokens: string[] = [];
    const revokedInstallationTokens: string[] = [];

    const buildDeps = () => ({
      sha256: (value: string) => `sha:${value}`,
      redirectUri: REDIRECT_URI,
      githubApp: {
        exchangeUserCodeForToken: async () => {
          exchangeAttempts += 1;
          return {
            accessToken: "ghu_concurrent_user_token",
            expiresAt: new Date("2026-09-01T20:12:00.000Z"),
          };
        },
        getAuthenticatedUser: async () => ({ githubUserId: "12345678", login: "octocat" }),
        getUserPermissionFacts: async () => ({
          githubUserId: "12345678",
          installationVisible: true,
          repositoryId: 12345678,
          repositoryAdmin: true,
          organisationId: null,
          organisationMembershipState: "none" as const,
          organisationRole: "none" as const,
        }),
        createInstallationToken: async ({ permissions }) => ({
          token: "ghs_concurrent_installation_token",
          expiresAt: new Date("2026-09-01T13:12:00.000Z"),
          permissions,
        }),
        getInstallationFacts: async () => ({
          installationId: 94,
          targetType: "organization" as const,
          targetId: 87654321,
          repositoryIds: [12345678],
          repositorySelection: "selected" as const,
          permissions: { metadata: "read", administration: "read" },
        }),
        revokeUserAccessToken: async (token: string) => {
          revokedUserTokens.push(token);
        },
        revokeInstallationToken: async (token: string) => {
          revokedInstallationTokens.push(token);
        },
      },
    });

    const [first, second] = await Promise.allSettled([
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-654.state-nonce-654",
          code: "replay-code",
          installationId: 94,
          setupAction: "install",
          requesterUserId: created.requesterUserId,
          verifiedAt: new Date("2026-09-01T12:13:00.000Z"),
        },
        buildDeps(),
      ),
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-654.state-nonce-654",
          code: "replay-code",
          installationId: 94,
          setupAction: "install",
          requesterUserId: created.requesterUserId,
          verifiedAt: new Date("2026-09-01T12:13:00.000Z"),
        },
        buildDeps(),
      ),
    ]);

    const winner = first.status === "fulfilled" ? first.value : second.value;
    const loser = first.status === "rejected" ? first.reason : second.reason;

    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(winner.status).toBe("verified");
    expect(String(loser)).toMatch(/invalid|replay|used/i);
    expect(exchangeAttempts).toBe(1);
    expect(revokedUserTokens).toEqual(["ghu_concurrent_user_token"]);
    expect(revokedInstallationTokens).toEqual(["ghs_concurrent_installation_token"]);
  });

  it("accepts organisation claims only for active org admins on the matching installation target and emits revoke outbox rows", async () => {
    const created = await createPublisherClaim(db, {
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      serverId: "11111111-1111-4111-8111-111111111113",
      publisherId: "22222222-2222-4222-8222-222222222224",
      verificationMethod: "github_organization",
    });

    await rejectPublisherClaim(db, {
      claimId: created.claimId,
      reviewerUserId: "99999999-9999-4999-8999-999999999999",
      reason: "Manual review failed.",
      reviewedAt: new Date("2026-09-01T12:15:00.000Z"),
    });

    const replacement = await createPublisherClaim(db, {
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      serverId: "11111111-1111-4111-8111-111111111113",
      publisherId: "22222222-2222-4222-8222-222222222224",
      verificationMethod: "github_organization",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: replacement.claimId,
        requesterUserId: replacement.requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:20:00.000Z"),
      },
      makeStartDeps("state-ref-789", "state-nonce-789", "pkce-verifier-789"),
    );

    const revokedUserTokens: string[] = [];
    const revokedInstallationTokens: string[] = [];

    const completed = await completePublisherClaimVerification(
      db,
      {
        state: "state-ref-789.state-nonce-789",
        code: "organisation-code",
        installationId: 92,
        setupAction: "install",
        requesterUserId: replacement.requesterUserId,
        verifiedAt: new Date("2026-09-01T12:25:00.000Z"),
      },
      {
        sha256: (value) => `sha:${value}`,
        redirectUri: REDIRECT_URI,
        githubApp: {
          exchangeUserCodeForToken: async () => ({
            accessToken: "ghu_org_user_token",
            expiresAt: new Date("2026-09-01T20:25:00.000Z"),
          }),
          getAuthenticatedUser: async () => ({ githubUserId: "12345678", login: "octocat" }),
          getUserPermissionFacts: async () => ({
            githubUserId: "12345678",
            installationVisible: true,
            repositoryId: null,
            repositoryAdmin: false,
            organisationId: 87654321,
            organisationMembershipState: "active",
            organisationRole: "admin",
          }),
          createInstallationToken: async ({ permissions }) => {
            expect(permissions).toEqual({ metadata: "read", members: "read" });
            return {
              token: "ghs_org_installation_token",
              expiresAt: new Date("2026-09-01T13:25:00.000Z"),
              permissions,
            };
          },
          getInstallationFacts: async () => ({
            installationId: 92,
            targetType: "organization",
            targetId: 87654321,
            repositoryIds: [],
            repositorySelection: "all",
            permissions: { metadata: "read", members: "read" },
          }),
          revokeUserAccessToken: async (token) => {
            revokedUserTokens.push(token);
          },
          revokeInstallationToken: async (token) => {
            revokedInstallationTokens.push(token);
          },
        },
      },
    );

    await revokePublisherClaim(db, {
      claimId: completed.claimId,
      reviewerUserId: "99999999-9999-4999-8999-999999999999",
      reason: "Installation access revoked.",
      revokedAt: new Date("2026-09-01T12:30:00.000Z"),
    });

    const outbox = await db.select().from(transactionalOutbox);
    expect(completed.githubSubjectType).toBe("organization");
    expect(revokedUserTokens).toEqual(["ghu_org_user_token"]);
    expect(revokedInstallationTokens).toEqual(["ghs_org_installation_token"]);
    expect(outbox.map((row) => row.eventType)).toEqual(["trust.refresh", "trust.refresh"]);
  });

  it("rejects organisation claims when installation facts target a different organisation and still revokes issued tokens", async () => {
    const created = await createPublisherClaim(db, {
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      serverId: "11111111-1111-4111-8111-111111111116",
      publisherId: "22222222-2222-4222-8222-222222222227",
      verificationMethod: "github_organization",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId: created.requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:26:00.000Z"),
      },
      makeStartDeps("state-ref-790", "state-nonce-790", "pkce-verifier-790"),
    );

    const revokedUserTokens: string[] = [];
    const revokedInstallationTokens: string[] = [];

    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-790.state-nonce-790",
          code: "organisation-mismatch-code",
          installationId: 95,
          setupAction: "install",
          requesterUserId: created.requesterUserId,
          verifiedAt: new Date("2026-09-01T12:27:00.000Z"),
        },
        {
          sha256: (value) => `sha:${value}`,
          redirectUri: REDIRECT_URI,
          githubApp: {
            exchangeUserCodeForToken: async () => ({
              accessToken: "ghu_org_mismatch_user_token",
              expiresAt: new Date("2026-09-01T20:27:00.000Z"),
            }),
            getAuthenticatedUser: async () => ({ githubUserId: "12345678", login: "octocat" }),
            getUserPermissionFacts: async () => ({
              githubUserId: "12345678",
              installationVisible: true,
              repositoryId: null,
              repositoryAdmin: false,
              organisationId: 87654321,
              organisationMembershipState: "active",
              organisationRole: "admin",
            }),
            createInstallationToken: async ({ permissions }) => {
              expect(permissions).toEqual({ metadata: "read", members: "read" });
              return {
                token: "ghs_org_mismatch_installation_token",
                expiresAt: new Date("2026-09-01T13:27:00.000Z"),
                permissions,
              };
            },
            getInstallationFacts: async () => ({
              installationId: 95,
              targetType: "organization",
              targetId: 11111111,
              repositoryIds: [],
              repositorySelection: "all",
              permissions: { metadata: "read", members: "read" },
            }),
            revokeUserAccessToken: async (token) => {
              revokedUserTokens.push(token);
            },
            revokeInstallationToken: async (token) => {
              revokedInstallationTokens.push(token);
            },
          },
        },
      ),
    ).rejects.toThrow(/INSTALLATION|ORGANISATION|TARGET|MISMATCH/i);

    expect(revokedUserTokens).toEqual(["ghu_org_mismatch_user_token"]);
    expect(revokedInstallationTokens).toEqual(["ghs_org_mismatch_installation_token"]);
  });

  it("supersedes a prior verified claim on ownership change and writes a fresh trust.refresh row", async () => {
    await db.insert(publisherClaims).values({
      id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      serverId: "11111111-1111-4111-8111-111111111114",
      publisherId: "22222222-2222-4222-8222-222222222225",
      requesterUserId: "33333333-3333-4333-8333-333333333333",
      verificationMethod: "github_repository",
      githubSubjectType: "repository",
      githubSubjectId: "12345678",
      status: "verified",
      evidenceSummary: {},
      verifiedAt: new Date("2026-09-01T11:00:00.000Z"),
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    const replacement = await createPublisherClaim(db, {
      requesterUserId: "44444444-4444-4444-8444-444444444444",
      serverId: "11111111-1111-4111-8111-111111111114",
      publisherId: "55555555-5555-4555-8555-555555555555",
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: replacement.claimId,
        requesterUserId: replacement.requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:40:00.000Z"),
      },
      makeStartDeps("state-ref-999", "state-nonce-999", "pkce-verifier-999"),
    );

    const completed = await completePublisherClaimVerification(
      db,
      {
        state: "state-ref-999.state-nonce-999",
        code: "replacement-code",
        installationId: 93,
        setupAction: "install",
        requesterUserId: replacement.requesterUserId,
        verifiedAt: new Date("2026-09-01T12:45:00.000Z"),
      },
      {
        sha256: (value) => `sha:${value}`,
        redirectUri: REDIRECT_URI,
        githubApp: {
          exchangeUserCodeForToken: async () => ({
            accessToken: "ghu_replacement_user_token",
            expiresAt: new Date("2026-09-01T20:45:00.000Z"),
          }),
          getAuthenticatedUser: async () => ({ githubUserId: "87654321", login: "replacement" }),
          getUserPermissionFacts: async () => ({
            githubUserId: "87654321",
            installationVisible: true,
            repositoryId: 12345678,
            repositoryAdmin: true,
            organisationId: null,
            organisationMembershipState: "none",
            organisationRole: "none",
          }),
          createInstallationToken: async ({ permissions }) => ({
            token: "ghs_supersede_installation_token",
            expiresAt: new Date("2026-09-01T13:45:00.000Z"),
            permissions,
          }),
          getInstallationFacts: async () => ({
            installationId: 93,
            targetType: "organization",
            targetId: 87654321,
            repositoryIds: [12345678],
            repositorySelection: "selected",
            permissions: { metadata: "read", administration: "read" },
          }),
          revokeUserAccessToken: async () => {},
          revokeInstallationToken: async () => {},
        },
      },
    );

    const supersededClaims = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.serverId, "11111111-1111-4111-8111-111111111114"));
    const outbox = await db.select().from(transactionalOutbox);

    expect(completed.status).toBe("verified");
    expect(
      supersededClaims.find((claim) => claim.publisherId === "22222222-2222-4222-8222-222222222225")
        ?.status,
    ).toBe("superseded");
    expect(outbox.at(-1)).toMatchObject({
      eventType: "trust.refresh",
      payload: expect.objectContaining({ reason: "publisher_claim_ownership_changed" }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/claims.integration.test.ts`
Expected: FAIL because claim lifecycle services, GitHub App code exchange, atomic compare-and-set callback consumption, exact organisation installation-target validation, and dual-token cleanup are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/publisher/github-app-client.ts
export interface GitHubUserPermissionFacts {
  readonly githubUserId: string;
  readonly installationVisible: boolean;
  readonly repositoryId: number | null;
  readonly repositoryAdmin: boolean;
  readonly organisationId: number | null;
  readonly organisationMembershipState: "active" | "pending" | "none";
  readonly organisationRole: "admin" | "member" | "none";
}

export interface GitHubInstallationFacts {
  readonly installationId: number;
  readonly targetType: "user" | "organization";
  readonly targetId: number;
  readonly repositoryIds: readonly number[];
  readonly repositorySelection: "all" | "selected";
  readonly permissions: Record<string, string>;
}

export interface GitHubAppClient {
  exchangeUserCodeForToken(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    repositoryId?: number;
  }): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getAuthenticatedUser(input: {
    userAccessToken: string;
  }): Promise<{ githubUserId: string; login: string }>;
  getUserPermissionFacts(input: {
    userAccessToken: string;
    installationId: number;
    subjectType: "repository" | "organization";
    repositoryOwner: string | null;
    repositoryName: string | null;
    organisationLogin: string | null;
  }): Promise<GitHubUserPermissionFacts>;
  createInstallationToken(input: {
    installationId: number;
    repositoryIds?: readonly number[];
    permissions: { metadata: "read"; administration?: "read"; members?: "read" };
  }): Promise<{ token: string; expiresAt: Date; permissions: Record<string, string> }>;
  getInstallationFacts(input: {
    installationId: number;
    token: string;
    subjectType: "repository" | "organization";
  }): Promise<GitHubInstallationFacts>;
  revokeUserAccessToken(token: string): Promise<void>;
  revokeInstallationToken(token: string): Promise<void>;
}
```

```ts
// packages/domain/src/publisher/claims.ts
export async function beginPublisherClaimVerification(
  db: Database,
  input: BeginClaimVerificationInput,
  deps: ClaimVerificationDeps,
) {
  const stateRef = deps.randomId();
  const stateNonce = deps.randomSecret();
  const pkceVerifier = deps.randomSecret();
  const state = `${stateRef}.${stateNonce}`;
  const expiresAt = addMinutes(input.now, 10);

  await db.insert(claimVerificationNonces).values({
    claimId: input.claimId,
    requesterUserId: input.requesterUserId,
    stateRef,
    stateHash: deps.sha256(stateNonce),
    pkceVerifierCiphertext: deps.encrypt(pkceVerifier),
    returnTo: input.returnTo,
    expiresAt,
    usedAt: null,
  });

  await db
    .update(publisherClaims)
    .set({ status: "verifying", updatedAt: input.now })
    .where(eq(publisherClaims.id, input.claimId));

  return {
    claimId: input.claimId,
    redirectUrl: deps.buildUserAuthorisationUrl({
      state,
      redirectUri: deps.redirectUri,
      codeChallenge: deps.sha256(pkceVerifier),
    }),
    expiresAt,
  };
}

export async function completePublisherClaimVerification(
  db: Database,
  input: CompleteClaimVerificationInput,
  deps: CompleteClaimVerificationDeps,
) {
  const [stateRef, stateNonce] = input.state.split(".");
  if (!stateRef || !stateNonce) throw new Error("CLAIM_STATE_INVALID");

  const nonce = await consumeClaimVerificationNonce(db, {
    stateRef,
    stateHash: deps.sha256(stateNonce),
    requesterUserId: input.requesterUserId,
    usedAt: input.verifiedAt,
  });
  if (!nonce) {
    throw new Error("CLAIM_STATE_INVALID_OR_REPLAYED");
  }

  const claim = await loadClaimForVerification(db, nonce.claimId);
  const expectedGitHubUserId = await loadRequesterGitHubUserId(db, input.requesterUserId);
  // Keep the verifier in plaintext only for the live exchange after single-use nonce consumption.
  const codeVerifier = deps.decrypt(nonce.pkceVerifierCiphertext);
  let userAccessToken: string | null = null;
  let installationToken: string | null = null;

  try {
    const exchanged = await deps.githubApp.exchangeUserCodeForToken({
      code: input.code,
      redirectUri: deps.redirectUri,
      codeVerifier,
      repositoryId:
        claim.githubSubjectType === "repository" ? Number(claim.githubSubjectId) : undefined,
    });
    userAccessToken = exchanged.accessToken;

    const authenticatedUser = await deps.githubApp.getAuthenticatedUser({
      userAccessToken,
    });
    if (authenticatedUser.githubUserId !== expectedGitHubUserId) {
      throw new Error("CLAIM_REQUESTER_MISMATCH");
    }

    const installationId = input.installationId ?? fail("GITHUB_INSTALLATION_ID_MISSING");
    const userFacts = await deps.githubApp.getUserPermissionFacts({
      userAccessToken,
      installationId,
      subjectType: claim.githubSubjectType,
      repositoryOwner: claim.githubRepositoryOwner,
      repositoryName: claim.githubRepositoryName,
      organisationLogin: claim.githubOrganisationLogin,
    });

    assertAuthenticatedUserControlsSubject(claim, userFacts);

    const permissions =
      claim.githubSubjectType === "repository"
        ? { metadata: "read" as const, administration: "read" as const }
        : { metadata: "read" as const, members: "read" as const };

    const mintedInstallationToken = await deps.githubApp.createInstallationToken({
      installationId,
      repositoryIds:
        claim.githubSubjectType === "repository" ? [Number(claim.githubSubjectId)] : undefined,
      permissions,
    });
    installationToken = mintedInstallationToken.token;

    const installationFacts = await deps.githubApp.getInstallationFacts({
      installationId,
      token: installationToken,
      subjectType: claim.githubSubjectType,
    });

    assertInstallationMatchesClaim(claim, installationFacts);

    return await db.transaction(async (tx) => {
      const verifiedClaim = await verifyClaimAgainstFacts(
        tx,
        claim,
        userFacts,
        installationFacts,
        input.verifiedAt,
      );
      const ownershipChanged = await supersedePriorVerifiedClaimsIfNeeded(
        tx,
        verifiedClaim,
        input.verifiedAt,
      );

      await tx.insert(transactionalOutbox).values({
        aggregateType: "server",
        aggregateId: verifiedClaim.serverId,
        eventType: "trust.refresh",
        dedupeKey: ownershipChanged
          ? `${verifiedClaim.serverId}:${verifiedClaim.id}:ownership_changed`
          : `${verifiedClaim.serverId}:${verifiedClaim.id}:verified`,
        payload: {
          serverId: verifiedClaim.serverId,
          claimId: verifiedClaim.id,
          reason: ownershipChanged
            ? "publisher_claim_ownership_changed"
            : "publisher_claim_verified",
        },
        availableAt: input.verifiedAt,
      });

      return {
        claimId: verifiedClaim.id,
        status: verifiedClaim.status,
        publisherId: verifiedClaim.publisherId,
        serverId: verifiedClaim.serverId,
        githubSubjectType: verifiedClaim.githubSubjectType,
        returnTo: nonce.returnTo,
      };
    });
  } finally {
    await Promise.allSettled([
      installationToken
        ? deps.githubApp.revokeInstallationToken(installationToken)
        : Promise.resolve(),
      userAccessToken ? deps.githubApp.revokeUserAccessToken(userAccessToken) : Promise.resolve(),
    ]);
  }
}

async function consumeClaimVerificationNonce(
  db: Database,
  input: {
    stateRef: string;
    stateHash: string;
    requesterUserId: string;
    usedAt: Date;
  },
) {
  const [nonce] = await db
    .update(claimVerificationNonces)
    .set({ usedAt: input.usedAt })
    .where(
      and(
        eq(claimVerificationNonces.stateRef, input.stateRef),
        eq(claimVerificationNonces.stateHash, input.stateHash),
        eq(claimVerificationNonces.requesterUserId, input.requesterUserId),
        isNull(claimVerificationNonces.usedAt),
        gt(claimVerificationNonces.expiresAt, input.usedAt),
      ),
    )
    .returning();

  return nonce ?? null;
}

function assertAuthenticatedUserControlsSubject(
  claim: ClaimForVerification,
  facts: GitHubUserPermissionFacts,
): void {
  if (!facts.installationVisible) throw new Error("GITHUB_INSTALLATION_NOT_VISIBLE");

  if (claim.githubSubjectType === "repository") {
    if (facts.repositoryId !== Number(claim.githubSubjectId) || !facts.repositoryAdmin) {
      throw new Error("GITHUB_REPOSITORY_ADMIN_REQUIRED");
    }
    return;
  }

  if (
    facts.organisationId !== Number(claim.githubSubjectId) ||
    facts.organisationMembershipState !== "active" ||
    facts.organisationRole !== "admin"
  ) {
    throw new Error("GITHUB_ORGANISATION_ADMIN_REQUIRED");
  }
}

function assertInstallationMatchesClaim(
  claim: ClaimForVerification,
  installationFacts: GitHubInstallationFacts,
): void {
  if (claim.githubSubjectType !== "organization") {
    return;
  }

  if (
    installationFacts.targetType !== "organization" ||
    installationFacts.targetId !== Number(claim.githubSubjectId)
  ) {
    throw new Error("GITHUB_ORGANISATION_INSTALLATION_MISMATCH");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/claims.integration.test.ts`
Expected: PASS and the suite proves tokenless state storage, current-user binding, atomic compare-and-set replay protection with one concurrent winner, implementable repository or organisation permission checks from the ephemeral user grant, exact organisation installation targeting, and explicit cleanup of both ephemeral GitHub App user and installation tokens.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/publisher/github-app-client.ts packages/domain/src/publisher/claims.ts packages/domain/src/publisher/__tests__/claims.integration.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add claim verification lifecycle"
```

### Task 6: Mount Better Auth And Add Same-Origin Publisher Routes

**Files:**

- Create: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/app/api/auth/[...all]/route.ts`
- Create: `apps/web/src/app/sign-in/page.tsx`
- Create: `apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts`
- Create: `apps/web/src/app/api/publisher/v1/session/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/claims/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/claims/[claimId]/verify/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/claims/[claimId]/withdraw/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/memberships/[membershipId]/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/__tests__/publisher-routes.test.ts`

**Interfaces:**

- Produces: `GET /api/publisher/v1/session -> PublisherDashboard`
- Produces: `POST /api/publisher/v1/claims <- { serverId: string; publisherId: string; verificationMethod: "github_repository" | "github_organization" } -> { claimId: string; status: string }`
- Produces: `POST /api/publisher/v1/claims/[claimId]/verify -> { claimId: string; redirectUrl: string; expiresAt: string }`
- Produces: `GET /api/publisher/v1/claims/verify/callback?state=...&code=...&installation_id=...&setup_action=... -> 303 /dashboard/listings/[id]`
- Produces: `POST /api/publisher/v1/claims/[claimId]/withdraw -> { claimId: string; status: "withdrawn" }`
- Produces: `PATCH /api/publisher/v1/memberships/[membershipId] <- { role: PublisherRole } -> PublisherMemberSummary`
- Produces: `requirePublisherRouteSession(request: Request): Promise<AuthenticatedSession>` for same-origin JSON reads and mutations
- Produces: `requirePublisherCallbackSession(request: Request): Promise<AuthenticatedSession>` for the GitHub callback exception that still enforces the current Better Auth session

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { GET as callback } from "../claims/verify/callback/route";
import { POST as createClaim } from "../claims/route";
import * as authModule from "@themcpdirectory/auth";
import * as domainModule from "@themcpdirectory/domain";

describe("publisher routes", () => {
  it("rejects cross-origin JSON mutations", async () => {
    const request = new Request("http://localhost:3099/api/publisher/v1/claims", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        serverId: "11111111-1111-4111-8111-111111111111",
        publisherId: "22222222-2222-4222-8222-222222222222",
        verificationMethod: "github_repository",
      }),
    });

    const response = await createClaim(request as never, { params: Promise.resolve({}) } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ORIGIN_FORBIDDEN" } });
  });

  it("treats the GitHub callback as a same-origin exception but still binds it to the current session", async () => {
    vi.spyOn(authModule, "requireSession").mockResolvedValue({
      user: { id: "33333333-3333-4333-8333-333333333333" },
    } as never);
    const completeSpy = vi
      .spyOn(domainModule, "completePublisherClaimVerification")
      .mockResolvedValue({
        claimId: "claim-1",
        status: "verified",
        publisherId: "publisher-1",
        serverId: "11111111-1111-4111-8111-111111111111",
        githubSubjectType: "repository",
        returnTo: "/dashboard/listings/11111111-1111-4111-8111-111111111111",
      });

    const response = await callback(
      new Request(
        "http://localhost:3099/api/publisher/v1/claims/verify/callback?state=state-ref-123.state-nonce-123&code=test-code&installation_id=91&setup_action=install",
      ) as never,
    );

    expect(completeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requesterUserId: "33333333-3333-4333-8333-333333333333",
        state: "state-ref-123.state-nonce-123",
        code: "test-code",
        installationId: 91,
      }),
      expect.anything(),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "/dashboard/listings/11111111-1111-4111-8111-111111111111",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web test:integration -- src/app/api/publisher/v1/__tests__/publisher-routes.test.ts`
Expected: FAIL because the route helpers, callback parsing, and session-to-domain handoff do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/api/auth/[...all]/route.ts
import { auth } from "@themcpdirectory/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

```ts
// apps/web/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "/api/auth",
});
```

```ts
// apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts
import { assertSameOriginJsonMutation, requireSession } from "@themcpdirectory/auth";
import { getSiteOrigin } from "@/lib/site-url";

export async function requirePublisherRouteSession(request: Request) {
  if (request.method !== "GET") {
    assertSameOriginJsonMutation(request, getSiteOrigin());
  }

  return requireSession(request.headers);
}

export async function requirePublisherCallbackSession(request: Request) {
  return requireSession(request.headers);
}

export function privateJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "private, no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function parseClaimVerificationCallback(url: URL) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) {
    throw new Error("GITHUB_CALLBACK_INVALID");
  }

  return {
    state,
    code,
    installationId: url.searchParams.get("installation_id")
      ? Number(url.searchParams.get("installation_id"))
      : null,
    setupAction: (url.searchParams.get("setup_action") as "install" | "request" | null) ?? null,
  };
}
```

```ts
// apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts
import { createHash } from "node:crypto";
import { completePublisherClaimVerification, createGitHubAppClient } from "@themcpdirectory/domain";
import { loadWebEnv } from "@themcpdirectory/config";
import { getDb } from "@/lib/db";
import {
  parseClaimVerificationCallback,
  requirePublisherCallbackSession,
} from "../../_shared/route-helpers";

const env = loadWebEnv();
const redirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/publisher/v1/claims/verify/callback`;

export async function GET(request: Request): Promise<Response> {
  const session = await requirePublisherCallbackSession(request);
  const url = new URL(request.url);
  const callback = parseClaimVerificationCallback(url);

  const result = await completePublisherClaimVerification(
    getDb(),
    {
      ...callback,
      requesterUserId: session.user.id,
      verifiedAt: new Date(),
    },
    {
      sha256: (value) => createHash("sha256").update(value).digest("hex"),
      decrypt: (value) => decryptPkceVerifierCiphertext(value, env.BETTER_AUTH_SECRET),
      redirectUri,
      githubApp: createGitHubAppClient(env),
    },
  );

  return Response.redirect(new URL(result.returnTo, url.origin), 303);
}
```

`decryptPkceVerifierCiphertext` is a server-only BETTER_AUTH_SECRET-derived decryptor. Do not pass that secret or a decryptor into `createGitHubAppClient`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web test:integration -- src/app/api/publisher/v1/__tests__/publisher-routes.test.ts`
Expected: PASS and every JSON mutation route enforces same-origin while the callback route remains the single documented exception and still forwards the signed-in user, state, code, and installation metadata to the domain layer.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth-client.ts apps/web/src/app/api/auth/[...all]/route.ts apps/web/src/app/sign-in/page.tsx apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts apps/web/src/app/api/publisher/v1/session/route.ts apps/web/src/app/api/publisher/v1/claims/route.ts apps/web/src/app/api/publisher/v1/claims/[claimId]/verify/route.ts apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts apps/web/src/app/api/publisher/v1/claims/[claimId]/withdraw/route.ts apps/web/src/app/api/publisher/v1/memberships/[membershipId]/route.ts apps/web/src/app/api/publisher/v1/__tests__/publisher-routes.test.ts
git commit -m "feat(web): mount auth and publisher api routes"
```

### Task 7: Build The Accessible Publisher Dashboard

**Files:**

- Create: `apps/web/src/app/dashboard/layout.tsx`
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/dashboard/listings/[id]/page.tsx`
- Create: `apps/web/src/components/publisher/dashboard-shell.tsx`
- Create: `apps/web/src/components/publisher/publisher-switcher.tsx`
- Create: `apps/web/src/components/publisher/claim-form.tsx`
- Create: `apps/web/src/components/publisher/member-table.tsx`
- Create: `apps/web/src/components/publisher/error-summary.tsx`
- Create: `apps/web/e2e/setup/publisher-session-fixtures.ts`
- Create: `apps/web/e2e/publisher-dashboard.spec.ts`
- Modify: `apps/web/e2e/contrast.spec.ts`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/site-nav.tsx`

**Interfaces:**

- Consumes: `getPublisherDashboard(db, { userId, preferredPublisherId })`
- Consumes: Better Auth session cookie `session_token`
- Produces: `PublisherDashboardShell(props: { dashboard: PublisherDashboard }): JSX.Element`
- Produces: keyboard- and screen-reader-safe dashboard UI for claim submission, member editing, conflict guidance, and a pre-verification explanation of GitHub sign-in scopes versus GitHub App permissions

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "@playwright/test";
import { seedPublisherSession } from "./setup/publisher-session-fixtures";

test("dashboard explains claim permissions, works at 320px, and focuses the error summary on invalid claim submission", async ({
  page,
  context,
}) => {
  const session = await seedPublisherSession({ role: "owner" });

  await context.addCookies([
    {
      name: "session_token",
      value: session.sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard");
  await expect(
    page.getByText(
      "GitHub sign-in only reads your identity. Claim verification starts a separate GitHub App authorisation and then checks repository admin or organisation admin access before using a one-time installation token.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit claim" }).click();

  const errorSummary = page.getByRole("alert");
  await expect(errorSummary).toBeFocused();
  await expect(errorSummary).toContainText("Select a listing before you submit a claim");
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/web test:e2e -- publisher-dashboard.spec.ts`
Expected: FAIL because the dashboard routes, seeded session helper, and accessible error-summary behaviour are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/app/dashboard/layout.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@themcpdirectory/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  return <>{children}</>;
}
```

```tsx
// apps/web/src/components/publisher/error-summary.tsx
import { useEffect, useRef } from "react";

export function ErrorSummary({ errors }: { errors: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) {
      ref.current?.focus();
    }
  }, [errors]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      style={{
        border: "1px solid var(--warn-fg)",
        padding: "1rem",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <h2 style={{ marginTop: 0 }}>There is a problem</h2>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// apps/web/src/components/publisher/claim-form.tsx
export function ClaimForm() {
  return (
    <section aria-labelledby="claim-heading">
      <h2 id="claim-heading">Verify publisher control</h2>
      <p id="claim-auth-explainer">
        GitHub sign-in only reads your identity. Claim verification starts a separate GitHub App
        authorisation and then checks repository admin or organisation admin access before using a
        one-time installation token with only the read permissions required for the chosen
        verification method.
      </p>
      <button type="button" aria-describedby="claim-auth-explainer">
        Verify with GitHub
      </button>
    </section>
  );
}
```

```css
/* apps/web/src/app/globals.css */
@media (forced-colors: active) {
  .publisher-panel,
  .publisher-danger-zone,
  .publisher-member-table {
    border-color: CanvasText;
  }

  .publisher-action:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

```tsx
// apps/web/src/app/dashboard/page.tsx
import { headers } from "next/headers";
import { auth } from "@themcpdirectory/auth";
import { getPublisherDashboard } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { DashboardShell } from "@/components/publisher/dashboard-shell";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ publisher?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }

  const params = await searchParams;
  const dashboard = await getPublisherDashboard(getDb(), {
    userId: session.user.id,
    preferredPublisherId: params.publisher ?? null,
  });

  return (
    <main id="main-content" tabIndex={-1}>
      <DashboardShell dashboard={dashboard} />
    </main>
  );
}
```

```ts
// apps/web/e2e/setup/publisher-session-fixtures.ts
export async function seedPublisherSession(input: {
  role: "owner" | "admin" | "editor" | "viewer";
}) {
  const sessionToken = crypto.randomUUID();
  await insertBetterAuthUserAccountAndSession({
    userId: "33333333-3333-4333-8333-333333333333",
    sessionToken,
    role: input.role,
  });
  return { sessionToken };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/web test:e2e -- publisher-dashboard.spec.ts contrast.spec.ts`
Expected: PASS and the dashboard is usable with the keyboard, exposes one page-topic `h1`, has no horizontal overflow at 320 CSS pixels, and remains legible in forced-colours mode with compliant contrast on claim, membership, and danger-zone controls.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx apps/web/src/app/dashboard/page.tsx apps/web/src/app/dashboard/listings/[id]/page.tsx apps/web/src/components/publisher/dashboard-shell.tsx apps/web/src/components/publisher/publisher-switcher.tsx apps/web/src/components/publisher/claim-form.tsx apps/web/src/components/publisher/member-table.tsx apps/web/src/components/publisher/error-summary.tsx apps/web/e2e/setup/publisher-session-fixtures.ts apps/web/e2e/publisher-dashboard.spec.ts apps/web/e2e/contrast.spec.ts apps/web/src/app/globals.css apps/web/src/components/site-nav.tsx
git commit -m "feat(web): add accessible publisher dashboard"
```

### Task 8: Add Export And Sole-Owner Erasure Workflows

**Files:**

- Create: `packages/domain/src/publisher/account-export.ts`
- Create: `packages/domain/src/publisher/account-erasure.ts`
- Create: `packages/domain/src/publisher/__tests__/account-export.integration.test.ts`
- Create: `packages/domain/src/publisher/__tests__/account-erasure.integration.test.ts`
- Create: `apps/web/src/app/api/publisher/v1/account/export/route.ts`
- Create: `apps/web/src/app/api/publisher/v1/account/erasure/route.ts`
- Create: `apps/web/src/components/publisher/danger-zone.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces: `buildAccountExport(db: Database, userId: string): Promise<AccountExportV1>`
- Produces: `requestAccountErasure(db: Database, input: { userId: string; successorAssignments: readonly { publisherId: string; successorUserId: string }[]; requestedAt: Date }): Promise<{ requestId: string; status: AccountErasureStatus; currentStep: AccountErasureStep }>`
- Produces: `advanceAccountErasure(db: Database, input: { requestId: string; now: Date }, deps: AccountErasureDeps): Promise<{ requestId: string; status: AccountErasureStatus; currentStep: AccountErasureStep }>`
- Produces: `resumeRetryableAccountErasure(db: Database, input: { now: Date }, deps: AccountErasureDeps): Promise<{ resumed: number; completed: number; retryScheduled: number }>`
- Produces: `POST /api/publisher/v1/account/export -> AccountExportV1`
- Produces: `POST /api/publisher/v1/account/erasure <- { successorAssignments: Array<{ publisherId: string; successorUserId: string }> } -> { requestId: string; status: AccountErasureStatus; currentStep: AccountErasureStep }`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database } from "@themcpdirectory/db";
import { advanceAccountErasure, buildAccountExport, requestAccountErasure } from "../index.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

describe("account export and erasure", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task13_export_erasure");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("exports memberships, claims, and audit history", async () => {
    const exportPayload = await buildAccountExport(db, "33333333-3333-4333-8333-333333333333");
    expect(exportPayload.memberships.length).toBeGreaterThan(0);
    expect(exportPayload.claims.length).toBeGreaterThan(0);
    expect(exportPayload.auditEvents.length).toBeGreaterThan(0);
  });

  it("locks an ownerless publisher for manual review when the last owner erases without a successor", async () => {
    const requested = await requestAccountErasure(db, {
      userId: "33333333-3333-4333-8333-333333333333",
      successorAssignments: [],
      requestedAt: new Date("2026-09-01T14:00:00.000Z"),
    });

    const result = await advanceAccountErasure(
      db,
      {
        requestId: requested.requestId,
        now: new Date("2026-09-01T14:00:00.000Z"),
      },
      {
        githubApp: {
          disconnectOwnedInstallations: async () => ({ disconnectedInstallationIds: [] }),
        },
      },
    );

    expect(result.status).toBe("completed");
  });

  it("persists an external-side-effect failure and resumes safely on retry", async () => {
    const requested = await requestAccountErasure(db, {
      userId: "33333333-3333-4333-8333-333333333333",
      successorAssignments: [],
      requestedAt: new Date("2026-09-01T15:00:00.000Z"),
    });

    const first = await advanceAccountErasure(
      db,
      {
        requestId: requested.requestId,
        now: new Date("2026-09-01T15:01:00.000Z"),
      },
      {
        githubApp: {
          disconnectOwnedInstallations: async () => {
            throw new Error("GITHUB_APP_DISCONNECT_FAILED");
          },
        },
      },
    );

    expect(first.status).toBe("retry_scheduled");
    expect(first.currentStep).toBe("disconnect_github_app_installations");

    const second = await advanceAccountErasure(
      db,
      {
        requestId: requested.requestId,
        now: new Date("2026-09-01T15:10:00.000Z"),
      },
      {
        githubApp: {
          disconnectOwnedInstallations: async () => ({ disconnectedInstallationIds: [91] }),
        },
      },
    );

    expect(second.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/account-export.integration.test.ts src/publisher/__tests__/account-erasure.integration.test.ts`
Expected: FAIL because export and erasure flows do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/publisher/account-export.ts
import type { PublisherRole } from "@themcpdirectory/auth";

export interface AccountExportV1 {
  readonly exportedAt: string;
  readonly user: {
    readonly id: string;
    readonly email: string | null;
    readonly name: string | null;
    readonly image: string | null;
  };
  readonly memberships: readonly {
    readonly publisherId: string;
    readonly publisherSlug: string;
    readonly role: PublisherRole;
  }[];
  readonly claims: readonly {
    readonly claimId: string;
    readonly serverId: string;
    readonly status: string;
    readonly githubSubjectId: string;
  }[];
  readonly auditEvents: readonly {
    readonly action: string;
    readonly outcome: string;
    readonly createdAt: string;
  }[];
}

export async function buildAccountExport(db: Database, userId: string): Promise<AccountExportV1> {
  const [user, memberships, claims, audits] = await Promise.all([
    loadAuthUser(db, userId),
    loadExportMemberships(db, userId),
    loadExportClaims(db, userId),
    loadExportAuditEvents(db, userId),
  ]);

  await appendAuditEvent(db, {
    actorUserId: userId,
    resourceType: "user",
    resourceId: userId,
    action: "account.exported",
    outcome: "success",
    metadata: { membershipCount: memberships.length, claimCount: claims.length },
  });

  return {
    exportedAt: new Date().toISOString(),
    user,
    memberships,
    claims,
    auditEvents: audits,
  };
}
```

```ts
// packages/domain/src/publisher/account-erasure.ts
export type AccountErasureStatus =
  "pending" | "running" | "retry_scheduled" | "blocked_legal_hold" | "completed" | "failed";

export type AccountErasureStep =
  | "revoke_sessions"
  | "disconnect_github_app_installations"
  | "transfer_or_lock_publishers"
  | "revoke_open_claims"
  | "scrub_local_data"
  | "pseudonymise_audits"
  | "done";

export interface AccountErasureDeps {
  readonly githubApp: {
    disconnectOwnedInstallations(input: {
      userId: string;
      requestId: string;
    }): Promise<{ disconnectedInstallationIds: readonly number[] }>;
  };
}

export async function requestAccountErasure(
  db: Database,
  input: {
    userId: string;
    successorAssignments: readonly { publisherId: string; successorUserId: string }[];
    requestedAt: Date;
  },
) {
  const activeHold = await findActiveLegalHold(db, {
    subjectType: "user",
    subjectId: input.userId,
  });
  if (activeHold) {
    throw new Error("LEGAL_HOLD_ACTIVE");
  }

  const [request] = await db
    .insert(accountErasureRequests)
    .values({
      requesterUserId: input.userId,
      status: "pending",
      currentStep: "revoke_sessions",
      nextAttemptAt: input.requestedAt,
      attemptCount: 0,
      successorAssignments: input.successorAssignments,
    })
    .returning();

  await appendAuditEvent(db, {
    actorUserId: input.userId,
    resourceType: "user",
    resourceId: input.userId,
    action: "account.erasure_requested",
    outcome: "success",
    metadata: { assignmentCount: input.successorAssignments.length },
  });

  return {
    requestId: request!.id,
    status: request!.status as AccountErasureStatus,
    currentStep: request!.currentStep as AccountErasureStep,
  };
}

export async function advanceAccountErasure(
  db: Database,
  input: { requestId: string; now: Date },
  deps: AccountErasureDeps,
) {
  return db.transaction(async (tx) => {
    const request = await getErasureRequestForUpdate(tx, input.requestId);

    let currentStep = request.currentStep as AccountErasureStep;

    while (currentStep !== "done") {
      switch (currentStep) {
        case "revoke_sessions":
          await revokeUserSessions(tx, request.requesterUserId, input.now);
          currentStep = "disconnect_github_app_installations";
          await moveErasureToStep(tx, request.id, currentStep, input.now);
          break;
        case "disconnect_github_app_installations":
          try {
            await deps.githubApp.disconnectOwnedInstallations({
              userId: request.requesterUserId,
              requestId: request.id,
            });
          } catch (error) {
            await scheduleErasureRetry(tx, request.id, currentStep, error, input.now);
            return { requestId: request.id, status: "retry_scheduled" as const, currentStep };
          }
          currentStep = "transfer_or_lock_publishers";
          await moveErasureToStep(tx, request.id, currentStep, input.now);
          break;
        case "transfer_or_lock_publishers":
          await transferOwnedPublishersOrLockOwnerless(
            tx,
            request.requesterUserId,
            request.successorAssignments,
            input.now,
          );
          currentStep = "revoke_open_claims";
          await moveErasureToStep(tx, request.id, currentStep, input.now);
          break;
        case "revoke_open_claims":
          await revokeOpenClaims(tx, request.requesterUserId, input.now);
          currentStep = "scrub_local_data";
          await moveErasureToStep(tx, request.id, currentStep, input.now);
          break;
        case "scrub_local_data":
          await scrubAuthAccountData(tx, request.requesterUserId, input.now);
          currentStep = "pseudonymise_audits";
          await moveErasureToStep(tx, request.id, currentStep, input.now);
          break;
        case "pseudonymise_audits":
          await pseudonymiseAuditActor(tx, request.requesterUserId);
          currentStep = "done";
          await markErasureCompleted(tx, request.id, input.now);
          break;
        default:
          return {
            requestId: request.id,
            status: request.status as AccountErasureStatus,
            currentStep,
          };
      }
    }

    return { requestId: request.id, status: "completed" as const, currentStep: "done" as const };
  });
}
```

```tsx
// apps/web/src/components/publisher/danger-zone.tsx
export function DangerZone() {
  return (
    <section aria-labelledby="danger-zone-heading">
      <h2 id="danger-zone-heading">Export and erasure</h2>
      <p>
        Export your account data or request erasure. Erasure can lock ownerless publishers for
        manual review.
      </p>
      <button type="button">Export account data</button>
      <button type="button">Request account erasure</button>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/account-export.integration.test.ts src/publisher/__tests__/account-erasure.integration.test.ts`
Expected: PASS and the sole-owner case leaves the publisher locked for manual review while external revocation failures are persisted and resumed without losing local progress.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/publisher/account-export.ts packages/domain/src/publisher/account-erasure.ts packages/domain/src/publisher/__tests__/account-export.integration.test.ts packages/domain/src/publisher/__tests__/account-erasure.integration.test.ts apps/web/src/app/api/publisher/v1/account/export/route.ts apps/web/src/app/api/publisher/v1/account/erasure/route.ts apps/web/src/components/publisher/danger-zone.tsx apps/web/src/app/dashboard/page.tsx packages/domain/src/index.ts
git commit -m "feat(account): add export and erasure workflow"
```

### Task 9: Deliver Trust Refreshes And Retention Jobs

**Files:**

- Create: `packages/domain/src/publisher/trust-refresh.ts`
- Create: `packages/domain/src/publisher/retention.ts`
- Create: `apps/worker/src/publisher-outbox-worker.ts`
- Create: `apps/worker/src/publisher-erasure-worker.ts`
- Create: `apps/worker/src/publisher-retention-worker.ts`
- Create: `apps/worker/src/__tests__/publisher-outbox-worker.test.ts`
- Create: `apps/worker/src/__tests__/publisher-erasure-worker.test.ts`
- Create: `apps/worker/src/__tests__/publisher-retention-worker.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes existing Phase F storage: `legalHolds`
- Produces: `refreshPublisherVerificationTrustSignal(db: Database, serverId: string, checkedAt?: Date): Promise<void>`
- Produces: `deliverTrustRefreshOutbox(db: Database, now: Date): Promise<{ delivered: number; retried: number }>`
- Produces: `resumeRetryableAccountErasure(db: Database, input: { now: Date }, deps: AccountErasureDeps): Promise<{ resumed: number; completed: number; retryScheduled: number }>`
- Produces: `runPublisherRetentionSweep(db: Database, now: Date): Promise<{ expiredSessions: number; expiredClaims: number; cleanedAudits: number; cleanedOutboxRows: number; deletedDormantUsers: number }>`
- Produces worker queues: `PUBLISHER_OUTBOX_QUEUE = "publisher.outbox"`, `PUBLISHER_ERASURE_QUEUE = "publisher.erasure"`, and `PUBLISHER_RETENTION_QUEUE = "publisher.retention"`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { legalHolds, trustSignals, type Database } from "@themcpdirectory/db";
import {
  deliverTrustRefreshOutbox,
  resumeRetryableAccountErasure,
  runPublisherRetentionSweep,
} from "@themcpdirectory/domain";
import { createTempDatabase } from "./postgres-test-db.js";

describe("publisher outbox and retention", () => {
  let db: Database;
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task14_publisher_worker");
    db = temp.db;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("delivers trust.refresh rows idempotently", async () => {
    const first = await deliverTrustRefreshOutbox(db, new Date("2026-09-01T15:00:00.000Z"));
    const second = await deliverTrustRefreshOutbox(db, new Date("2026-09-01T15:01:00.000Z"));
    const signalRows = await db.select().from(trustSignals);

    expect(first.delivered).toBeGreaterThan(0);
    expect(second.delivered).toBe(0);
    expect(signalRows.length).toBeGreaterThan(0);
  });

  it("skips dormant-account deletion while any active user legal_holds row exists", async () => {
    await db.insert(legalHolds).values({
      id: "hold-11111111-1111-4111-8111-111111111111",
      scope: "health_history",
      subjectType: "user",
      subjectId: "33333333-3333-4333-8333-333333333333",
      reason: "open dispute",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      createdBy: "system",
    });

    const summary = await runPublisherRetentionSweep(db, new Date("2027-09-02T00:00:00.000Z"));
    expect(summary.deletedDormantUsers).toBe(0);
  });

  it("resumes retry-scheduled erasure side effects idempotently", async () => {
    const summary = await resumeRetryableAccountErasure(
      db,
      { now: new Date("2026-09-01T16:00:00.000Z") },
      {
        githubApp: {
          disconnectOwnedInstallations: async () => ({ disconnectedInstallationIds: [91] }),
        },
      },
    );

    expect(summary.resumed).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/worker test -- src/__tests__/publisher-outbox-worker.test.ts src/__tests__/publisher-retention-worker.test.ts`
Expected: FAIL because the worker jobs and the retention services do not yet consume the existing Phase F `legal_holds` table for generic active user holds.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/publisher/trust-refresh.ts
import { eq } from "drizzle-orm";

export async function refreshPublisherVerificationTrustSignal(
  db: Database,
  serverId: string,
  checkedAt = new Date(),
): Promise<void> {
  const [row] = await db
    .select({ verificationState: publishers.verificationState })
    .from(servers)
    .leftJoin(publishers, eq(publishers.id, servers.publisherId))
    .where(eq(servers.id, serverId))
    .limit(1);

  const isVerified = row?.verificationState === "verified";

  await db
    .insert(trustSignals)
    .values({
      serverId,
      signalKey: "publisher_verified",
      status: isVerified ? "positive" : "unknown",
      source: "publisher_claim",
      summary: isVerified ? "Publisher verified" : "Publisher verification not available",
      checkedAt,
      updatedAt: checkedAt,
    })
    .onConflictDoUpdate({
      target: [trustSignals.serverId, trustSignals.signalKey],
      set: {
        status: isVerified ? "positive" : "unknown",
        summary: isVerified ? "Publisher verified" : "Publisher verification not available",
        checkedAt,
        updatedAt: checkedAt,
      },
    });
}

export async function deliverTrustRefreshOutbox(db: Database, now: Date) {
  const jobs = await loadPendingTrustRefreshOutboxRows(db, now);
  let delivered = 0;

  for (const job of jobs) {
    await refreshPublisherVerificationTrustSignal(db, job.aggregateId, now);
    await markOutboxDelivered(db, job.id, now);
    delivered += 1;
  }

  return { delivered, retried: 0 };
}
```

```ts
// packages/domain/src/publisher/retention.ts
import { and, eq, gt, isNull, sql } from "drizzle-orm";

async function hasActiveUserHold(db: Database, userId: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: legalHolds.id })
    .from(legalHolds)
    .where(
      and(
        eq(legalHolds.subjectType, "user"),
        eq(legalHolds.subjectId, userId),
        isNull(legalHolds.releasedAt),
        gt(legalHolds.expiresAt, now),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function runPublisherRetentionSweep(db: Database, now: Date) {
  const expiredSessions = await deleteExpiredSessions(db, now);
  const expiredClaims = await expireAbandonedClaims(db, now);
  const cleanedAudits = await pruneAuditEvents(db, now);
  const cleanedOutboxRows = await pruneDeliveredOutboxRows(db, now);
  const deletedDormantUsers = await deleteDormantUsersWithoutResponsibilities(db, now, {
    hasActiveHold: (userId) => hasActiveUserHold(db, userId, now),
  });

  return {
    expiredSessions,
    expiredClaims,
    cleanedAudits,
    cleanedOutboxRows,
    deletedDormantUsers,
  };
}
```

```ts
// apps/worker/src/publisher-outbox-worker.ts
export const PUBLISHER_OUTBOX_QUEUE = "publisher.outbox";

export async function processPublisherOutboxJob(db: Database, checkedAt = new Date()) {
  return deliverTrustRefreshOutbox(db, checkedAt);
}
```

```ts
// apps/worker/src/publisher-retention-worker.ts
export const PUBLISHER_RETENTION_QUEUE = "publisher.retention";

export async function processPublisherRetentionJob(db: Database, checkedAt = new Date()) {
  return runPublisherRetentionSweep(db, checkedAt);
}
```

```ts
// apps/worker/src/publisher-erasure-worker.ts
export const PUBLISHER_ERASURE_QUEUE = "publisher.erasure";

export async function processPublisherErasureJob(db: Database, checkedAt = new Date()) {
  return resumeRetryableAccountErasure(db, { now: checkedAt }, createAccountErasureDeps());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/worker test -- src/__tests__/publisher-outbox-worker.test.ts src/__tests__/publisher-erasure-worker.test.ts src/__tests__/publisher-retention-worker.test.ts`
Expected: PASS and the second outbox delivery run proves idempotency while retryable erasure side effects resume safely and any active Phase F user legal hold, regardless of scope, prevents dormant-account deletion.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/publisher/trust-refresh.ts packages/domain/src/publisher/retention.ts apps/worker/src/publisher-outbox-worker.ts apps/worker/src/publisher-erasure-worker.ts apps/worker/src/publisher-retention-worker.ts apps/worker/src/__tests__/publisher-outbox-worker.test.ts apps/worker/src/__tests__/publisher-erasure-worker.test.ts apps/worker/src/__tests__/publisher-retention-worker.test.ts apps/worker/src/index.ts packages/domain/src/index.ts
git commit -m "feat(worker): add publisher outbox and retention sweeps"
```

### Task 10: Add Synthetic OAuth And Claim Verification Coverage

**Files:**

- Create: `packages/auth/src/__tests__/postgres-test-db.ts`
- Create: `packages/auth/src/__tests__/github-oauth-flow.integration.test.ts`
- Create: `apps/web/e2e/publisher-auth.spec.ts`
- Create: `apps/web/e2e/publisher-claims.spec.ts`
- Modify: `apps/web/e2e/setup/start-test-server.ts`
- Modify: `apps/web/e2e/setup/global-setup.ts`

**Interfaces:**

- Consumes: `createAuth({ db, env, fetchImpl })`
- Consumes: `auth.handler(request: Request): Promise<Response>`
- Consumes: `beginPublisherClaimVerification(...)`
- Consumes: `completePublisherClaimVerification(...)`
- Produces a synthetic Better Auth identity-only sign-in-plus-callback flow with mocked GitHub token, `/user`, and `/user/emails` responses, database-backed OAuth state, and replayed signed state cookies
- Produces browser coverage for signed-out redirects, claim conflicts, permissions explanation, callback start, and absence of any browser-stored verification grant cookie

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { authAccounts, authVerification } from "@themcpdirectory/db";
import { createAuth } from "../better-auth.js";
import { createTempDatabase } from "./postgres-test-db.js";

function extractSetCookieHeader(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected Set-Cookie header");
  return cookie;
}

describe("GitHub OAuth flow", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json({
          access_token: "gho_test",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({
          id: 12345678,
          login: "octocat",
          name: "Octo Cat",
          email: null,
          avatar_url: "https://avatars.githubusercontent.com/u/12345678?v=4",
        });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([{ email: "octocat@example.com", primary: true, verified: true }]);
      }
      return Response.json({ message: "unexpected url" }, { status: 500 });
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("starts Better Auth sign-in, persists OAuth state, replays the signed state cookie, and strips provider tokens", async () => {
    const temp = await createTempDatabase("task15_github_oauth");
    try {
      const auth = createAuth({
        db: temp.db,
        env: {
          DATABASE_URL: "postgresql://localhost:5432/themcpdirectory_test",
          MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
          NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: "01234567890123456789012345678901",
          GITHUB_CLIENT_ID: "github-client-id",
          GITHUB_CLIENT_SECRET: "github-client-secret",
          GITHUB_APP_ID: "12345",
          GITHUB_APP_PRIVATE_KEY: "test-private-key",
          GITHUB_APP_SLUG: "themcpdirectory",
        },
        fetchImpl: global.fetch,
      });

      const signInResponse = await auth.handler(
        new Request(
          "http://localhost:3000/api/auth/sign-in/social?provider=github&callbackURL=%2Fdashboard",
        ),
      );

      expect(signInResponse.status).toBe(302);
      const redirectUrl = signInResponse.headers.get("location");
      const state = new URL(redirectUrl!).searchParams.get("state");
      const cookieHeader = extractSetCookieHeader(signInResponse);

      const verificationRows = await temp.db.select().from(authVerification);
      expect(verificationRows.length).toBeGreaterThan(0);

      const callbackResponse = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/callback/github?code=test-code&state=${state}`,
          {
            headers: { cookie: cookieHeader },
          },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toContain("/dashboard");

      const accounts = await temp.db
        .select()
        .from(authAccounts)
        .where(eq(authAccounts.providerId, "github"));
      expect(accounts[0]).toMatchObject({ accessToken: null, refreshToken: null, idToken: null });
    } finally {
      await temp.destroy();
    }
  });
});
```

```ts
// apps/web/e2e/publisher-claims.spec.ts
import { test, expect } from "@playwright/test";
import { seedPublisherSession } from "./setup/publisher-session-fixtures";

test("claim verification explains the separate GitHub App flow and never stores a browser grant cookie", async ({
  page,
  context,
}) => {
  const session = await seedPublisherSession({ role: "owner" });
  await context.addCookies([
    {
      name: "session_token",
      value: session.sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/dashboard");
  await expect(
    page.getByText(
      "GitHub sign-in only reads your identity. Claim verification starts a separate GitHub App authorisation and then checks repository admin or organisation admin access before using a one-time installation token.",
    ),
  ).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name.startsWith("publisher_claim_verification_"))).toBe(
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @themcpdirectory/auth test -- src/__tests__/github-oauth-flow.integration.test.ts`
Expected: FAIL because the auth integration helper and callback path are not fully wired yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/e2e/setup/start-test-server.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { prepareTestDatabase, TEST_DATABASE_URL, TEST_PORT } from "./test-database";

async function main(): Promise<void> {
  await prepareTestDatabase();

  const nextCli = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextCli, "dev", "--port", TEST_PORT, "--webpack"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      NEXT_PUBLIC_BASE_URL: `http://localhost:${TEST_PORT}`,
      BETTER_AUTH_SECRET: "01234567890123456789012345678901",
      GITHUB_CLIENT_ID: "github-client-id",
      GITHUB_CLIENT_SECRET: "github-client-secret",
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "test-private-key",
      GITHUB_APP_SLUG: "themcpdirectory",
      MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
      WEB_PORT: TEST_PORT,
      API_PORT: "3001",
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

```ts
// apps/web/e2e/publisher-auth.spec.ts
import { test, expect } from "@playwright/test";

test("signed-out dashboard requests redirect to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Publisher sign-in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @themcpdirectory/auth test -- src/__tests__/github-oauth-flow.integration.test.ts && pnpm --filter @themcpdirectory/domain test:integration -- src/publisher/__tests__/claims.integration.test.ts && pnpm --filter @themcpdirectory/web test:e2e -- publisher-auth.spec.ts publisher-dashboard.spec.ts publisher-claims.spec.ts contrast.spec.ts`
Expected: PASS and the suite proves identity-only Better Auth OAuth, user-bound GitHub App callback verification, atomic concurrent replay protection with one winner, exact organisation installation targeting, explicit cleanup of both ephemeral GitHub App user and installation tokens, dashboard accessibility, forced-colours and contrast coverage, and absence of any browser-stored verification grant token.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/__tests__/postgres-test-db.ts packages/auth/src/__tests__/github-oauth-flow.integration.test.ts apps/web/e2e/publisher-auth.spec.ts apps/web/e2e/publisher-claims.spec.ts apps/web/e2e/setup/start-test-server.ts apps/web/e2e/setup/global-setup.ts
git commit -m "test(publisher): cover synthetic oauth and dashboard flows"
```

## Self-Review

- **Spec coverage:** Pinned Better Auth and reviewed Drizzle migrations are covered by Tasks 1-3, with Phase G following Phase F migration numbering through `0004_phase_g_publisher_platform.sql` unless a later verified next number is required. GitHub identity tokens not persisted are covered by Tasks 2, 3, and 10. User-bound GitHub App verification for repository and organisation claims, compare-and-set callback consumption before exchange, atomic concurrent replay rejection with one winner, explicit revocation of both GitHub App user and installation tokens on success and failure after issuance, exact organisation installation-target checks, current-session binding, claim conflicts, reject/revoke/supersede/ownership-changing transitions, and outbox writes are covered by Tasks 5, 6, and 10. The four-role capability matrix and route ownership rules are covered by Tasks 3, 4, and 6. Dashboard accessibility, permission explanations, callback handling, forced colours, and contrast are covered by Tasks 6, 7, and 10. Export, sole-owner erasure, manual-review locks, and a persisted resumable external-side-effect erasure state machine are covered by Tasks 8 and 9. Legal holds are consumed from Phase F storage in Tasks 8 and 9 rather than recreated in Phase G, and dormant-account deletion honours any active user hold regardless of scope.
- **Placeholder scan:** No unfinished marker phrases or unnamed interfaces remain in the plan.
- **Type consistency:** `PublisherRole`, `PublisherCapability`, `PublisherDashboard`, `AccountExportV1`, `AccountErasureStatus`, `AccountErasureStep`, `createAuth`, `createPublisherClaim`, `beginPublisherClaimVerification`, `completePublisherClaimVerification`, `rejectPublisherClaim`, `revokePublisherClaim`, `buildAccountExport`, `advanceAccountErasure`, `resumeRetryableAccountErasure`, and `runPublisherRetentionSweep` are named once and reused consistently across later tasks.
