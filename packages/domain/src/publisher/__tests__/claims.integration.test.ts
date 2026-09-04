import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  auditEvents,
  authAccounts,
  authUsers,
  claimVerificationNonces,
  publisherClaimEvents,
  publisherClaims,
  publisherMemberships,
  publishers,
  servers,
  transactionalOutbox,
  type Database,
} from "@themcpdirectory/db";
import {
  PublisherClaimConflictError,
  beginPublisherClaimVerification,
  completePublisherClaimVerification,
  createPublisherClaim,
  rejectPublisherClaim,
  revokePublisherClaim,
  withdrawPublisherClaim,
  type ClaimVerificationDeps,
  type CompleteClaimVerificationDeps,
  type GitHubAppClient,
  type GitHubInstallationFacts,
  type GitHubUserPermissionFacts,
} from "../../index.js";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

const REDIRECT_URI = "http://localhost:3000/api/publisher/v1/claims/verify/callback";
const FIXTURE_TIME = new Date("2026-09-01T00:00:00.000Z");
const REPOSITORY_ID = 12345678;
const ORGANISATION_ID = 87654321;

function makeStartDeps(
  stateRef: string,
  stateNonce: string,
  pkceVerifier: string,
): ClaimVerificationDeps {
  const secrets = [stateNonce, pkceVerifier];
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
      return `ciphertext:${stateRef}`;
    },
    redirectUri: REDIRECT_URI,
    buildUserAuthorisationUrl: ({ state, redirectUri, codeChallenge }) =>
      `https://github.com/login/oauth/authorize?client_id=github-app-client-id&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&allow_signup=false`,
  };
}

interface GitHubAppOptions {
  readonly subject: "repository" | "organization";
  readonly githubUserId?: string;
  readonly userToken?: string;
  readonly installationToken?: string;
  readonly installationId?: number;
  readonly userFacts?: Partial<GitHubUserPermissionFacts>;
  readonly installationFacts?: Partial<GitHubInstallationFacts>;
  readonly mintedExpiresAt?: Date;
  readonly mintedPermissions?: Record<string, string>;
  readonly onExchange?: () => void;
}

interface GitHubAppSpy {
  readonly client: GitHubAppClient;
  readonly revokedUserTokens: string[];
  readonly revokedInstallationTokens: string[];
  readonly exchanges: number[];
}

function makeGitHubApp(options: GitHubAppOptions): GitHubAppSpy {
  const revokedUserTokens: string[] = [];
  const revokedInstallationTokens: string[] = [];
  const exchanges: number[] = [];
  const githubUserId = options.githubUserId ?? String(REPOSITORY_ID);
  const userToken = options.userToken ?? "ghu_user_token";
  const installationToken = options.installationToken ?? "ghs_installation_token";
  const installationId = options.installationId ?? 91;
  const isRepository = options.subject === "repository";

  const client: GitHubAppClient = {
    exchangeUserCodeForToken: async () => {
      options.onExchange?.();
      exchanges.push(exchanges.length + 1);
      return { accessToken: userToken, expiresAt: null };
    },
    getAuthenticatedUser: async () => ({ githubUserId, login: "octocat" }),
    getUserPermissionFacts: async () => ({
      githubUserId,
      installationVisible: true,
      repositoryId: REPOSITORY_ID,
      repositoryOwnerId: ORGANISATION_ID,
      repositoryAdmin: isRepository,
      organisationId: isRepository ? null : ORGANISATION_ID,
      organisationMembershipState: isRepository ? "none" : "active",
      organisationRole: isRepository ? "none" : "admin",
      ...options.userFacts,
    }),
    createInstallationToken: async ({ permissions }) => ({
      token: installationToken,
      expiresAt: options.mintedExpiresAt ?? new Date(Date.now() + 30 * 60_000),
      permissions: options.mintedPermissions ?? permissions,
    }),
    getInstallationFacts: async () => ({
      installationId,
      targetType: "organization",
      targetId: ORGANISATION_ID,
      repositoryIds: isRepository ? [REPOSITORY_ID] : [],
      repositorySelection: isRepository ? "selected" : "all",
      repositoryAccessible: true,
      permissions: isRepository
        ? { metadata: "read", administration: "read" }
        : { metadata: "read", members: "read" },
      ...options.installationFacts,
    }),
    revokeUserAccessToken: async (token) => {
      revokedUserTokens.push(token);
    },
    revokeInstallationToken: async (token) => {
      revokedInstallationTokens.push(token);
    },
  };

  return { client, revokedUserTokens, revokedInstallationTokens, exchanges };
}

function makeCompleteDeps(
  githubApp: GitHubAppClient,
  verifier = "pkce-verifier",
): { deps: CompleteClaimVerificationDeps; decryptedCiphertexts: string[] } {
  const decryptedCiphertexts: string[] = [];
  return {
    decryptedCiphertexts,
    deps: {
      sha256: (value) => `sha:${value}`,
      decrypt: (value) => {
        decryptedCiphertexts.push(value);
        return verifier;
      },
      redirectUri: REDIRECT_URI,
      githubApp,
    },
  };
}

function claimExpiry(): Date {
  return new Date(Date.now() + 30 * 86_400_000);
}

async function seedRequester(db: Database, id: string, githubUserId?: string): Promise<void> {
  await db.insert(authUsers).values({
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
  });

  if (githubUserId) {
    await db.insert(authAccounts).values({
      accountId: githubUserId,
      providerId: "github",
      issuer: "github",
      userId: id,
    });
  }
}

async function seedPublisher(
  db: Database,
  id: string,
  organisation?: { login: string; id: string },
): Promise<void> {
  await db.insert(publishers).values({
    id,
    slug: `publisher-${id}`,
    displayName: `Publisher ${id}`,
    githubOrg: organisation?.login ?? null,
    githubOrgId: organisation?.id ?? null,
    verificationState: "unverified",
    ownershipState: "unlocked",
  });
}

async function seedServer(
  db: Database,
  id: string,
  repositoryExternalId: string | null = null,
): Promise<void> {
  await db.insert(servers).values({
    id,
    slug: `server-${id}`,
    title: `Server ${id}`,
    shortDescription: "Fixture server",
    listingStatus: "active",
    moderationStatus: "normal",
    repositorySource: repositoryExternalId ? "github" : null,
    repositoryExternalId,
    repositoryUrl: repositoryExternalId ? "https://github.com/octo-org/repo-tool" : null,
    firstSeenAt: FIXTURE_TIME,
    lastSeenAt: FIXTURE_TIME,
  });
}

async function seedVerifiedClaim(
  db: Database,
  input: { serverId: string; publisherId: string; requesterUserId: string },
): Promise<string> {
  const [claim] = await db
    .insert(publisherClaims)
    .values({
      serverId: input.serverId,
      publisherId: input.publisherId,
      requesterUserId: input.requesterUserId,
      verificationMethod: "github_repository",
      githubSubjectType: "repository",
      githubSubjectId: String(REPOSITORY_ID),
      status: "verified",
      verifiedAt: new Date("2026-09-01T11:00:00.000Z"),
      expiresAt: claimExpiry(),
    })
    .returning({ id: publisherClaims.id });

  if (!claim) throw new Error("failed to seed verified claim");
  return claim.id;
}

async function expireNonce(db: Database, stateRef: string): Promise<void> {
  await db
    .update(claimVerificationNonces)
    .set({ expiresAt: sql`now() - interval '1 minute'` })
    .where(eq(claimVerificationNonces.stateRef, stateRef));
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

  it("verifies a repository claim in one transaction that links the server, membership, claim event, audit, and trust refresh", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const serverId = "11111111-1111-4111-8111-111111111111";
    const publisherId = "22222222-2222-4222-8222-222222222222";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    const started = await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard/listings/11111111-1111-4111-8111-111111111111",
        now: new Date("2026-09-01T12:00:00.000Z"),
      },
      makeStartDeps("state-ref-123", "state-nonce-123", "pkce-verifier-123"),
    );

    const [nonce] = await db.select().from(claimVerificationNonces);
    expect(nonce).toMatchObject({
      claimId: created.claimId,
      requesterUserId,
      stateRef: "state-ref-123",
      stateHash: "sha:state-nonce-123",
      pkceVerifierCiphertext: "ciphertext:state-ref-123",
      usedAt: null,
    });
    expect(started.redirectUrl).toContain("state=state-ref-123.state-nonce-123");
    expect(started.redirectUrl).toContain("code_challenge=sha:pkce-verifier-123");

    const app = makeGitHubApp({ subject: "repository" });
    const { deps, decryptedCiphertexts } = makeCompleteDeps(app.client, "pkce-verifier-123");

    const completed = await completePublisherClaimVerification(
      db,
      {
        state: "state-ref-123.state-nonce-123",
        code: "repository-code",
        installationId: 91,
        setupAction: "install",
        requesterUserId,
        verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
      },
      deps,
    );

    const [usedNonce] = await db.select().from(claimVerificationNonces);
    const [claim] = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.id, created.claimId));
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    const memberships = await db
      .select()
      .from(publisherMemberships)
      .where(eq(publisherMemberships.publisherId, publisherId));
    const events = await db
      .select()
      .from(publisherClaimEvents)
      .where(eq(publisherClaimEvents.claimId, created.claimId));
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, created.claimId));
    const outbox = await db.select().from(transactionalOutbox);

    const [verifiedPublisher] = await db
      .select()
      .from(publishers)
      .where(eq(publishers.id, publisherId));

    expect(completed.status).toBe("verified");
    expect(completed.returnTo).toBe("/dashboard/listings/11111111-1111-4111-8111-111111111111");
    expect(server?.publisherId).toBe(publisherId);
    expect(verifiedPublisher?.verificationState).toBe("verified");
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.userId).toBe(requesterUserId);
    expect(memberships[0]?.role).toBe("owner");
    expect(claim?.evidenceSummary).toMatchObject({
      subjectType: "repository",
      subjectId: String(REPOSITORY_ID),
      installationId: 91,
      repositoryAdmin: true,
    });
    expect(events.map((event) => event.toStatus)).toEqual(["pending", "verifying", "verified"]);
    expect(audits.some((audit) => audit.action === "publisher_claim.verified")).toBe(true);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ eventType: "trust.refresh" });
    expect(usedNonce?.usedAt).not.toBeNull();
    expect(decryptedCiphertexts).toEqual(["ciphertext:state-ref-123"]);
    expect(app.revokedUserTokens).toEqual(["ghu_user_token"]);
    expect(app.revokedInstallationTokens).toEqual(["ghs_installation_token"]);
    expect(JSON.stringify({ usedNonce, claim, events, audits, outbox })).not.toContain(
      "pkce-verifier-123",
    );
  });

  it("does not consume the nonce for a wrong signed-in session and still lets the bound requester finish", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const attackerUserId = "44444444-4444-4444-8444-444444444444";
    const serverId = "11111111-1111-4111-8111-111111111112";
    const publisherId = "22222222-2222-4222-8222-222222222223";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedRequester(db, attackerUserId, "99999999");
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:00:00.000Z"),
      },
      makeStartDeps("state-ref-456", "state-nonce-456", "pkce-verifier-456"),
    );

    const hostile = makeGitHubApp({ subject: "repository" });
    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-456.state-nonce-456",
          code: "wrong-user-code",
          installationId: 91,
          setupAction: "install",
          requesterUserId: attackerUserId,
          verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
        },
        {
          sha256: (value) => `sha:${value}`,
          decrypt: () => {
            throw new Error("should not decrypt a mismatched user callback");
          },
          redirectUri: REDIRECT_URI,
          githubApp: hostile.client,
        },
      ),
    ).rejects.toThrow(/requester|session|mismatch/i);

    const [untouched] = await db.select().from(claimVerificationNonces);
    expect(untouched?.usedAt).toBeNull();
    expect(hostile.exchanges).toEqual([]);

    const app = makeGitHubApp({ subject: "repository" });
    const completed = await completePublisherClaimVerification(
      db,
      {
        state: "state-ref-456.state-nonce-456",
        code: "legitimate-code",
        installationId: 91,
        setupAction: "install",
        requesterUserId,
        verifiedAt: new Date("2026-09-01T12:06:00.000Z"),
      },
      makeCompleteDeps(app.client, "pkce-verifier-456").deps,
    );

    expect(completed.status).toBe("verified");
  });

  it("rejects callback state once the database clock has passed its expiry", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const serverId = "11111111-1111-4111-8111-111111111117";
    const publisherId = "22222222-2222-4222-8222-222222222228";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:00:00.000Z"),
      },
      makeStartDeps("state-ref-457", "state-nonce-457", "pkce-verifier-457"),
    );
    await expireNonce(db, "state-ref-457");

    const app = makeGitHubApp({ subject: "repository" });
    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-457.state-nonce-457",
          code: "expired-code",
          installationId: 91,
          setupAction: "install",
          requesterUserId,
          verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
        },
        {
          sha256: (value) => `sha:${value}`,
          decrypt: () => {
            throw new Error("should not decrypt expired callback state");
          },
          redirectUri: REDIRECT_URI,
          githubApp: app.client,
        },
      ),
    ).rejects.toThrow(/expired|invalid/i);
    expect(app.exchanges).toEqual([]);
  });

  it("atomically consumes callback state so concurrent replays produce one winner and one rejection", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const serverId = "11111111-1111-4111-8111-111111111115";
    const publisherId = "22222222-2222-4222-8222-222222222226";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:12:00.000Z"),
      },
      makeStartDeps("state-ref-654", "state-nonce-654", "pkce-verifier-654"),
    );

    let exchangeAttempts = 0;
    const callback = () =>
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-654.state-nonce-654",
          code: "replay-code",
          installationId: 94,
          setupAction: "install",
          requesterUserId,
          verifiedAt: new Date("2026-09-01T12:13:00.000Z"),
        },
        makeCompleteDeps(
          makeGitHubApp({
            subject: "repository",
            installationId: 94,
            onExchange: () => {
              exchangeAttempts += 1;
            },
          }).client,
          "pkce-verifier-654",
        ).deps,
      );

    const [first, second] = await Promise.allSettled([callback(), callback()]);
    const winner = first.status === "fulfilled" ? first.value : undefined;
    const loser =
      first.status === "rejected" ? first.reason : (second as PromiseRejectedResult).reason;

    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(winner?.status ?? "verified").toBe("verified");
    expect(String(loser)).toMatch(/invalid|replay|used/i);
    expect(exchangeAttempts).toBe(1);
  });

  it("verifies an organisation claim from the stable org id while the login stays a login", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const reviewerUserId = "99999999-9999-4999-8999-999999999999";
    const serverId = "11111111-1111-4111-8111-111111111113";
    const publisherId = "22222222-2222-4222-8222-222222222224";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedRequester(db, reviewerUserId);
    await seedPublisher(db, publisherId, {
      login: "community-labs",
      id: String(ORGANISATION_ID),
    });
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_organization",
    });

    const [pending] = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.id, created.claimId));
    expect(pending?.githubSubjectId).toBe(String(ORGANISATION_ID));

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:20:00.000Z"),
      },
      makeStartDeps("state-ref-789", "state-nonce-789", "pkce-verifier-789"),
    );

    let observedOrganisationLogin: string | null = null;
    const app = makeGitHubApp({ subject: "organization", installationId: 92 });
    const wrapped: GitHubAppClient = {
      ...app.client,
      getUserPermissionFacts: async (input) => {
        observedOrganisationLogin = input.organisationLogin;
        return app.client.getUserPermissionFacts(input);
      },
    };

    const completed = await completePublisherClaimVerification(
      db,
      {
        state: "state-ref-789.state-nonce-789",
        code: "organisation-code",
        installationId: 92,
        setupAction: "install",
        requesterUserId,
        verifiedAt: new Date("2026-09-01T12:25:00.000Z"),
      },
      makeCompleteDeps(wrapped, "pkce-verifier-789").deps,
    );

    await revokePublisherClaim(db, {
      claimId: completed.claimId,
      reviewerUserId,
      reason: "Installation access revoked.",
      revokedAt: new Date("2026-09-01T12:30:00.000Z"),
    });

    const outbox = await db.select().from(transactionalOutbox);
    const events = await db
      .select()
      .from(publisherClaimEvents)
      .where(eq(publisherClaimEvents.claimId, completed.claimId));
    const [revokedPublisher] = await db
      .select()
      .from(publishers)
      .where(eq(publishers.id, publisherId));
    const [unlinkedServer] = await db.select().from(servers).where(eq(servers.id, serverId));

    expect(completed.githubSubjectType).toBe("organization");
    expect(observedOrganisationLogin).toBe("community-labs");
    expect(revokedPublisher?.verificationState).toBe("unverified");
    expect(unlinkedServer?.publisherId).toBeNull();
    expect(outbox.map((row) => row.eventType)).toEqual(["trust.refresh", "trust.refresh"]);
    expect(events.map((event) => event.toStatus)).toEqual([
      "pending",
      "verifying",
      "verified",
      "revoked",
    ]);
  });

  it("rejects organisation claims when installation facts target a different organisation and still revokes issued tokens", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const serverId = "11111111-1111-4111-8111-111111111116";
    const publisherId = "22222222-2222-4222-8222-222222222227";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId, { login: "community-labs", id: String(ORGANISATION_ID) });
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_organization",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:26:00.000Z"),
      },
      makeStartDeps("state-ref-790", "state-nonce-790", "pkce-verifier-790"),
    );

    const app = makeGitHubApp({
      subject: "organization",
      installationId: 95,
      userToken: "ghu_org_mismatch",
      installationToken: "ghs_org_mismatch",
      installationFacts: { targetId: 11111111 },
    });

    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-790.state-nonce-790",
          code: "organisation-mismatch-code",
          installationId: 95,
          setupAction: "install",
          requesterUserId,
          verifiedAt: new Date("2026-09-01T12:27:00.000Z"),
        },
        makeCompleteDeps(app.client, "pkce-verifier-790").deps,
      ),
    ).rejects.toThrow(/INSTALLATION|ORGANISATION|TARGET|MISMATCH/i);

    expect(app.revokedUserTokens).toEqual(["ghu_org_mismatch"]);
    expect(app.revokedInstallationTokens).toEqual(["ghs_org_mismatch"]);
  });

  it("rejects installation tokens that outlive GitHub's one-hour maximum or drop a requested read permission", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const publisherId = "22222222-2222-4222-8222-22222222222a";
    const serverId = "11111111-1111-4111-8111-11111111111a";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    const attempt = async (
      suffix: string,
      options: Pick<GitHubAppOptions, "mintedExpiresAt" | "mintedPermissions">,
    ) => {
      await beginPublisherClaimVerification(
        db,
        {
          claimId: created.claimId,
          requesterUserId,
          returnTo: "/dashboard",
          now: new Date("2026-09-01T12:00:00.000Z"),
        },
        makeStartDeps(`state-ref-${suffix}`, `state-nonce-${suffix}`, "pkce-verifier"),
      );

      return completePublisherClaimVerification(
        db,
        {
          state: `state-ref-${suffix}.state-nonce-${suffix}`,
          code: "code",
          installationId: 91,
          setupAction: "install",
          requesterUserId,
          verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
        },
        makeCompleteDeps(makeGitHubApp({ subject: "repository", ...options }).client).deps,
      );
    };

    await expect(
      attempt("tok1", { mintedExpiresAt: new Date(Date.now() + 2 * 3_600_000) }),
    ).rejects.toThrow(/TOKEN_LIFETIME/i);

    await expect(attempt("tok2", { mintedPermissions: { metadata: "read" } })).rejects.toThrow(
      /TOKEN_PERMISSIONS/i,
    );
  });

  it("refuses to resurrect terminal claims or rewrite moderation outcomes", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const reviewerUserId = "99999999-9999-4999-8999-999999999999";
    const publisherId = "22222222-2222-4222-8222-22222222222b";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedRequester(db, reviewerUserId);
    await seedPublisher(db, publisherId);

    const terminalStatuses = ["revoked", "rejected", "withdrawn", "superseded"] as const;
    const claimIds = new Map<string, string>();

    for (const [index, status] of terminalStatuses.entries()) {
      const serverId = `11111111-1111-4111-8111-1111111111${20 + index}`;
      await seedServer(db, serverId, String(REPOSITORY_ID + index));
      const [claim] = await db
        .insert(publisherClaims)
        .values({
          serverId,
          publisherId,
          requesterUserId,
          verificationMethod: "github_repository",
          githubSubjectType: "repository",
          githubSubjectId: String(REPOSITORY_ID),
          status,
          expiresAt: claimExpiry(),
        })
        .returning({ id: publisherClaims.id });
      if (!claim) throw new Error("failed to seed terminal claim");
      claimIds.set(status, claim.id);

      await expect(
        beginPublisherClaimVerification(
          db,
          {
            claimId: claim.id,
            requesterUserId,
            returnTo: "/dashboard",
            now: new Date("2026-09-01T12:00:00.000Z"),
          },
          makeStartDeps(`state-${status}`, `nonce-${status}`, "pkce"),
        ),
      ).rejects.toThrow(/TRANSITION/i);
    }

    await expect(
      withdrawPublisherClaim(db, {
        claimId: claimIds.get("revoked") ?? "",
        requesterUserId,
      }),
    ).rejects.toThrow(/TRANSITION/i);

    const verifiedServerId = "11111111-1111-4111-8111-111111111130";
    await seedServer(db, verifiedServerId, String(REPOSITORY_ID + 90));
    const verifiedClaimId = await seedVerifiedClaim(db, {
      serverId: verifiedServerId,
      publisherId,
      requesterUserId,
    });

    await expect(
      rejectPublisherClaim(db, {
        claimId: verifiedClaimId,
        reviewerUserId,
        reason: "Cannot reject a verified claim.",
        reviewedAt: new Date("2026-09-01T12:15:00.000Z"),
      }),
    ).rejects.toThrow(/TRANSITION/i);

    const expiredServerId = "11111111-1111-4111-8111-111111111131";
    await seedServer(db, expiredServerId, String(REPOSITORY_ID + 91));
    const [expired] = await db
      .insert(publisherClaims)
      .values({
        serverId: expiredServerId,
        publisherId,
        requesterUserId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: String(REPOSITORY_ID),
        status: "pending",
        expiresAt: new Date(Date.now() - 86_400_000),
      })
      .returning({ id: publisherClaims.id });
    if (!expired) throw new Error("failed to seed expired claim");

    await expect(
      beginPublisherClaimVerification(
        db,
        {
          claimId: expired.id,
          requesterUserId,
          returnTo: "/dashboard",
          now: new Date("2026-09-01T12:00:00.000Z"),
        },
        makeStartDeps("state-expired", "nonce-expired", "pkce"),
      ),
    ).rejects.toThrow(/EXPIRED|TRANSITION/i);
  });

  it("invalidates prior live nonces when verification restarts", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const serverId = "11111111-1111-4111-8111-111111111140";
    const publisherId = "22222222-2222-4222-8222-22222222222c";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    const begin = (suffix: string) =>
      beginPublisherClaimVerification(
        db,
        {
          claimId: created.claimId,
          requesterUserId,
          returnTo: "/dashboard",
          now: new Date("2026-09-01T12:00:00.000Z"),
        },
        makeStartDeps(`state-ref-${suffix}`, `state-nonce-${suffix}`, `pkce-${suffix}`),
      );

    await begin("first");
    await begin("second");

    const nonces = await db.select().from(claimVerificationNonces);
    expect(nonces.find((row) => row.stateRef === "state-ref-first")?.usedAt).not.toBeNull();
    expect(nonces.find((row) => row.stateRef === "state-ref-second")?.usedAt).toBeNull();

    const app = makeGitHubApp({ subject: "repository" });
    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-first.state-nonce-first",
          code: "stale-code",
          installationId: 91,
          setupAction: "install",
          requesterUserId,
          verifiedAt: new Date("2026-09-01T12:05:00.000Z"),
        },
        makeCompleteDeps(app.client).deps,
      ),
    ).rejects.toThrow(/used|invalid|replay/i);
  });

  it("returns a conflict and enters manual review instead of overwriting a verified owner", async () => {
    const incumbentUserId = "33333333-3333-4333-8333-333333333333";
    const challengerUserId = "44444444-4444-4444-8444-444444444444";
    const serverId = "11111111-1111-4111-8111-111111111114";
    const incumbentPublisherId = "22222222-2222-4222-8222-222222222225";
    const challengerPublisherId = "55555555-5555-4555-8555-555555555555";

    await seedRequester(db, incumbentUserId);
    await seedRequester(db, challengerUserId, "87654321");
    await seedPublisher(db, incumbentPublisherId);
    await seedPublisher(db, challengerPublisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const incumbentClaimId = await seedVerifiedClaim(db, {
      serverId,
      publisherId: incumbentPublisherId,
      requesterUserId: incumbentUserId,
    });

    const conflict = await createPublisherClaim(db, {
      requesterUserId: challengerUserId,
      serverId,
      publisherId: challengerPublisherId,
      verificationMethod: "github_repository",
    }).catch((error: unknown) => error);

    expect(conflict).toBeInstanceOf(PublisherClaimConflictError);
    expect((conflict as PublisherClaimConflictError).conflictClaimId).toBe(incumbentClaimId);

    const [challengerClaim] = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.publisherId, challengerPublisherId));
    const [incumbentClaim] = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.id, incumbentClaimId));
    const [challengerPublisher] = await db
      .select()
      .from(publishers)
      .where(eq(publishers.id, challengerPublisherId));

    expect(challengerClaim?.conflictClaimId).toBe(incumbentClaimId);
    expect(incumbentClaim?.status).toBe("verified");
    expect(challengerPublisher?.ownershipState).toBe("manual_review");
  });

  it("supersedes the same publisher's earlier verified claim with its own trust refresh row", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const serverId = "11111111-1111-4111-8111-111111111150";
    const publisherId = "22222222-2222-4222-8222-22222222222d";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    const priorClaimId = await seedVerifiedClaim(db, {
      serverId,
      publisherId,
      requesterUserId,
    });

    const replacement = await createPublisherClaim(db, {
      requesterUserId,
      serverId,
      publisherId,
      verificationMethod: "github_repository",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: replacement.claimId,
        requesterUserId,
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
        requesterUserId,
        verifiedAt: new Date("2026-09-01T12:45:00.000Z"),
      },
      makeCompleteDeps(
        makeGitHubApp({ subject: "repository", installationId: 93 }).client,
        "pkce-verifier-999",
      ).deps,
    );

    const claims = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.serverId, serverId));
    const outbox = await db.select().from(transactionalOutbox);
    const supersededEvents = await db
      .select()
      .from(publisherClaimEvents)
      .where(eq(publisherClaimEvents.claimId, priorClaimId));
    const reasons = outbox.map((row) => (row.payload as { reason?: string }).reason);

    expect(completed.status).toBe("verified");
    expect(claims.find((claim) => claim.id === priorClaimId)?.status).toBe("superseded");
    expect(supersededEvents.map((event) => event.toStatus)).toEqual(["superseded"]);
    expect(reasons).toContain("publisher_claim_superseded");
    expect(reasons).toContain("publisher_claim_verified");
  });

  it("binds organisation claims to a server repository owned by the claimed organisation", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const publisherId = "22222222-2222-4222-8222-222222222230";
    const anonymousServerId = "11111111-1111-4111-8111-111111111170";
    const foreignServerId = "11111111-1111-4111-8111-111111111171";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedPublisher(db, publisherId, { login: "community-labs", id: String(ORGANISATION_ID) });
    await seedServer(db, anonymousServerId);
    await seedServer(db, foreignServerId, String(REPOSITORY_ID));

    await expect(
      createPublisherClaim(db, {
        requesterUserId,
        serverId: anonymousServerId,
        publisherId,
        verificationMethod: "github_organization",
      }),
    ).rejects.toThrow(/SERVER_GITHUB_REPOSITORY_IDENTITY/i);

    const created = await createPublisherClaim(db, {
      requesterUserId,
      serverId: foreignServerId,
      publisherId,
      verificationMethod: "github_organization",
    });

    await beginPublisherClaimVerification(
      db,
      {
        claimId: created.claimId,
        requesterUserId,
        returnTo: "/dashboard",
        now: new Date("2026-09-01T12:30:00.000Z"),
      },
      makeStartDeps("state-ref-800", "state-nonce-800", "pkce-verifier-800"),
    );

    const app = makeGitHubApp({
      subject: "organization",
      installationId: 96,
      userToken: "ghu_foreign_repo",
      installationToken: "ghs_foreign_repo",
      userFacts: { repositoryOwnerId: 55_555_555 },
    });

    await expect(
      completePublisherClaimVerification(
        db,
        {
          state: "state-ref-800.state-nonce-800",
          code: "foreign-repository-code",
          installationId: 96,
          setupAction: "install",
          requesterUserId,
          verifiedAt: new Date("2026-09-01T12:31:00.000Z"),
        },
        makeCompleteDeps(app.client, "pkce-verifier-800").deps,
      ),
    ).rejects.toThrow(/ORGANISATION_REPOSITORY/i);

    const [claim] = await db
      .select()
      .from(publisherClaims)
      .where(eq(publisherClaims.id, created.claimId));
    expect(claim?.status).toBe("verifying");
    expect(app.revokedUserTokens).toEqual(["ghu_foreign_repo"]);
  });

  it("refuses claims for a publisher the requester does not already administer", async () => {
    const ownerUserId = "33333333-3333-4333-8333-333333333333";
    const outsiderUserId = "44444444-4444-4444-8444-444444444444";
    const publisherId = "22222222-2222-4222-8222-222222222231";
    const serverId = "11111111-1111-4111-8111-111111111180";

    await seedRequester(db, ownerUserId, String(REPOSITORY_ID));
    await seedRequester(db, outsiderUserId, "87654321");
    await seedPublisher(db, publisherId);
    await seedServer(db, serverId, String(REPOSITORY_ID));

    await db
      .insert(publisherMemberships)
      .values({ publisherId, userId: ownerUserId, role: "owner" });

    const claimAs = (requesterUserId: string) =>
      createPublisherClaim(db, {
        requesterUserId,
        serverId,
        publisherId,
        verificationMethod: "github_repository",
      });

    await expect(claimAs(outsiderUserId)).rejects.toThrow(/MEMBERSHIP|FORBIDDEN/i);

    await db
      .update(publisherMemberships)
      .set({ role: "viewer" })
      .where(eq(publisherMemberships.userId, ownerUserId));
    await expect(claimAs(ownerUserId)).rejects.toThrow(/MEMBERSHIP|FORBIDDEN/i);

    await db
      .update(publisherMemberships)
      .set({ role: "admin" })
      .where(eq(publisherMemberships.userId, ownerUserId));
    await expect(claimAs(ownerUserId)).resolves.toMatchObject({ status: "pending" });

    const claims = await db.select().from(publisherClaims);
    expect(claims).toHaveLength(1);
  });

  it("re-derives publisher verification on revoke and only unlinks the server it still owns", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const reviewerUserId = "99999999-9999-4999-8999-999999999999";
    const ownServerId = "11111111-1111-4111-8111-111111111190";
    const foreignServerId = "11111111-1111-4111-8111-111111111191";
    const publisherId = "22222222-2222-4222-8222-222222222232";
    const otherPublisherId = "55555555-5555-4555-8555-555555555556";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedRequester(db, reviewerUserId);
    await seedPublisher(db, publisherId);
    await seedPublisher(db, otherPublisherId);
    await seedServer(db, ownServerId, String(REPOSITORY_ID));
    await seedServer(db, foreignServerId, String(REPOSITORY_ID + 5));

    const ownClaimId = await seedVerifiedClaim(db, {
      serverId: ownServerId,
      publisherId,
      requesterUserId,
    });
    const foreignClaimId = await seedVerifiedClaim(db, {
      serverId: foreignServerId,
      publisherId,
      requesterUserId,
    });

    await db.update(servers).set({ publisherId }).where(eq(servers.id, ownServerId));
    await db
      .update(servers)
      .set({ publisherId: otherPublisherId })
      .where(eq(servers.id, foreignServerId));
    await db
      .update(publishers)
      .set({ verificationState: "verified" })
      .where(eq(publishers.id, publisherId));

    await revokePublisherClaim(db, {
      claimId: ownClaimId,
      reviewerUserId,
      reason: "Installation access removed.",
      revokedAt: new Date("2026-09-01T12:50:00.000Z"),
    });

    const [ownServer] = await db.select().from(servers).where(eq(servers.id, ownServerId));
    const [stillVerified] = await db
      .select()
      .from(publishers)
      .where(eq(publishers.id, publisherId));

    expect(ownServer?.publisherId).toBeNull();
    expect(stillVerified?.verificationState).toBe("verified");

    await revokePublisherClaim(db, {
      claimId: foreignClaimId,
      reviewerUserId,
      reason: "Installation access removed.",
      revokedAt: new Date("2026-09-01T12:55:00.000Z"),
    });

    const [foreignServer] = await db.select().from(servers).where(eq(servers.id, foreignServerId));
    const [downgraded] = await db.select().from(publishers).where(eq(publishers.id, publisherId));

    expect(foreignServer?.publisherId).toBe(otherPublisherId);
    expect(downgraded?.verificationState).toBe("unverified");
  });

  it("records claim events and audits when a claim is rejected or withdrawn", async () => {
    const requesterUserId = "33333333-3333-4333-8333-333333333333";
    const reviewerUserId = "99999999-9999-4999-8999-999999999999";
    const publisherId = "22222222-2222-4222-8222-22222222222e";
    const rejectedServerId = "11111111-1111-4111-8111-111111111160";
    const withdrawnServerId = "11111111-1111-4111-8111-111111111161";

    await seedRequester(db, requesterUserId, String(REPOSITORY_ID));
    await seedRequester(db, reviewerUserId);
    await seedPublisher(db, publisherId);
    await seedServer(db, rejectedServerId, String(REPOSITORY_ID + 1));
    await seedServer(db, withdrawnServerId, String(REPOSITORY_ID + 2));

    const rejected = await createPublisherClaim(db, {
      requesterUserId,
      serverId: rejectedServerId,
      publisherId,
      verificationMethod: "github_repository",
    });
    const withdrawn = await createPublisherClaim(db, {
      requesterUserId,
      serverId: withdrawnServerId,
      publisherId,
      verificationMethod: "github_repository",
    });

    await rejectPublisherClaim(db, {
      claimId: rejected.claimId,
      reviewerUserId,
      reason: "Insufficient evidence.",
      reviewedAt: new Date("2026-09-01T12:15:00.000Z"),
    });
    await withdrawPublisherClaim(db, { claimId: withdrawn.claimId, requesterUserId });

    const events = await db.select().from(publisherClaimEvents);
    const audits = await db.select().from(auditEvents);
    const outbox = await db.select().from(transactionalOutbox);

    expect(events.map((event) => event.toStatus).sort()).toEqual([
      "pending",
      "pending",
      "rejected",
      "withdrawn",
    ]);
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      "publisher_claim.created",
      "publisher_claim.created",
      "publisher_claim.rejected",
      "publisher_claim.withdrawn",
    ]);
    expect(outbox).toHaveLength(0);
  });
});
