import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { PUBLISHER_ROLES, roleHasCapability, type PublisherRole } from "@themcpdirectory/auth";
import {
  accountErasureRequests,
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
import { appendAuditEvent } from "./audit.js";
import type {
  GitHubAppClient,
  GitHubInstallationFacts,
  GitHubRepositoryCoordinates,
  GitHubUserPermissionFacts,
} from "./github-app-client.js";

const CLAIM_EXPIRY_DAYS = 30;
const MAX_INSTALLATION_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const TOKEN_CLEANUP_TIMEOUT_MS = 10_000;
const OPEN_CLAIM_STATUSES = ["pending", "verifying"] as const;
const OPEN_SERVER_CLAIM_CONSTRAINT = "publisher_claims_open_server_uidx";
export const PUBLISHER_CLAIM_STATUSES = Object.freeze([
  "pending",
  "verifying",
  "verified",
  "rejected",
  "withdrawn",
  "superseded",
  "revoked",
] as const);
export type PublisherClaimStatus = (typeof PUBLISHER_CLAIM_STATUSES)[number];

type ClaimStore = Pick<Database, "select" | "insert" | "update">;

export interface CreatePublisherClaimInput {
  readonly requesterUserId: string;
  readonly serverId: string;
  readonly publisherId: string;
  readonly verificationMethod: "github_repository" | "github_organization";
}

export interface CreatePublisherClaimResult {
  readonly claimId: string;
  readonly requesterUserId: string;
  readonly status: string;
}

export interface ClaimVerificationDeps {
  sha256(value: string): string;
  randomId(): string;
  randomSecret(): string;
  encrypt(value: string): string;
  redirectUri: string;
  buildUserAuthorisationUrl(input: {
    state: string;
    redirectUri: string;
    codeChallenge: string;
  }): string;
}

export interface CompleteClaimVerificationDeps {
  sha256(value: string): string;
  decrypt(value: string): string;
  redirectUri: string;
  githubApp: GitHubAppClient;
}

interface BeginClaimVerificationInput {
  readonly claimId: string;
  readonly requesterUserId: string;
  readonly returnTo: string;
  readonly now: Date;
}

interface BeginClaimVerificationResult {
  readonly claimId: string;
  readonly redirectUrl: string;
  readonly expiresAt: Date;
}

interface CompleteClaimVerificationInput {
  readonly state: string;
  readonly code: string;
  readonly installationId: number | null;
  readonly setupAction: "install" | "request" | null;
  readonly requesterUserId: string;
  readonly verifiedAt: Date;
}

interface CompleteClaimVerificationResult {
  readonly claimId: string;
  readonly status: string;
  readonly publisherId: string;
  readonly serverId: string;
  readonly githubSubjectType: "repository" | "organization";
  readonly returnTo: string;
}

interface ClaimForVerification {
  readonly id: string;
  readonly serverId: string;
  readonly publisherId: string;
  readonly requesterUserId: string;
  readonly githubSubjectType: "repository" | "organization";
  readonly githubSubjectId: string;
  readonly repositoryExternalId: string | null;
  readonly repositoryOwner: string | null;
  readonly repositoryName: string | null;
  readonly organisationLogin: string | null;
}

interface LockedClaim {
  readonly id: string;
  readonly status: string;
  readonly serverId: string;
  readonly publisherId: string;
  readonly requesterUserId: string;
}

type ClaimTransitionReason = "NOT_FOUND" | "FORBIDDEN" | "INVALID_TRANSITION" | "EXPIRED";

export class PublisherClaimTransitionError extends Error {
  readonly claimId: string;
  readonly currentStatus: string | null;
  readonly reason: ClaimTransitionReason;

  constructor(claimId: string, currentStatus: string | null, reason: ClaimTransitionReason) {
    super(`PUBLISHER_CLAIM_${reason}`);
    this.name = "PublisherClaimTransitionError";
    this.claimId = claimId;
    this.currentStatus = currentStatus;
    this.reason = reason;
  }
}

export class PublisherClaimConflictError extends Error {
  readonly claimId: string | null;
  readonly conflictClaimId: string | null;

  constructor(input: { claimId: string | null; conflictClaimId: string | null }) {
    super("PUBLISHER_CLAIM_CONFLICT");
    this.name = "PublisherClaimConflictError";
    this.claimId = input.claimId;
    this.conflictClaimId = input.conflictClaimId;
  }
}

export class PublisherClaimAuthorityError extends Error {
  readonly publisherId: string;

  constructor(publisherId: string) {
    super("PUBLISHER_CLAIM_MEMBERSHIP_REQUIRED");
    this.name = "PublisherClaimAuthorityError";
    this.publisherId = publisherId;
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function toSubjectType(value: string): "repository" | "organization" {
  return value === "organization" ? "organization" : "repository";
}

function parseStableGitHubId(value: string, errorCode: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(errorCode);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(errorCode);
  }
  return parsed;
}

function isOpenClaimUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (candidate.code === "23505" && candidate.constraint_name === OPEN_SERVER_CLAIM_CONSTRAINT) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}

function parseGitHubRepositorySlug(url: string | null): { owner: string; name: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const [rawOwner, rawName] = parsed.pathname.replace(/^\//, "").split("/");
    if (!rawOwner || !rawName) return null;
    const owner = decodeURIComponent(rawOwner);
    const name = decodeURIComponent(rawName).replace(/\.git$/, "");
    if (!/^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$/.test(owner)) return null;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return null;
    return { owner, name };
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function lockClaimForTransition(
  store: Pick<Database, "select">,
  input: {
    claimId: string;
    allowed: readonly string[];
    requesterUserId?: string;
    requireUnexpired?: boolean;
  },
): Promise<LockedClaim> {
  const [row] = await store
    .select({
      id: publisherClaims.id,
      status: publisherClaims.status,
      serverId: publisherClaims.serverId,
      publisherId: publisherClaims.publisherId,
      requesterUserId: publisherClaims.requesterUserId,
      expired: sql<boolean>`${publisherClaims.expiresAt} <= now()`,
    })
    .from(publisherClaims)
    .where(eq(publisherClaims.id, input.claimId))
    .limit(1)
    .for("update");

  if (!row) {
    throw new PublisherClaimTransitionError(input.claimId, null, "NOT_FOUND");
  }
  if (input.requesterUserId !== undefined && row.requesterUserId !== input.requesterUserId) {
    throw new PublisherClaimTransitionError(input.claimId, row.status, "FORBIDDEN");
  }
  if (!input.allowed.includes(row.status)) {
    throw new PublisherClaimTransitionError(input.claimId, row.status, "INVALID_TRANSITION");
  }
  if (input.requireUnexpired && row.expired) {
    throw new PublisherClaimTransitionError(input.claimId, row.status, "EXPIRED");
  }

  return {
    id: row.id,
    status: row.status,
    serverId: row.serverId,
    publisherId: row.publisherId,
    requesterUserId: row.requesterUserId,
  };
}

async function resolveServerRepositoryIdentity(
  db: Pick<Database, "select">,
  serverId: string,
): Promise<GitHubRepositoryCoordinates> {
  const [server] = await db
    .select({
      repositoryExternalId: servers.repositoryExternalId,
      repositoryUrl: servers.repositoryUrl,
    })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);

  if (!server?.repositoryExternalId) {
    throw new Error("SERVER_GITHUB_REPOSITORY_IDENTITY_MISSING");
  }
  const id = parseStableGitHubId(
    server.repositoryExternalId,
    "SERVER_GITHUB_REPOSITORY_IDENTITY_INVALID",
  );

  const slug = parseGitHubRepositorySlug(server.repositoryUrl);
  if (!slug) {
    throw new Error("SERVER_GITHUB_REPOSITORY_COORDINATES_INVALID");
  }

  return { owner: slug.owner, name: slug.name, id };
}

async function resolveClaimSubjectId(
  db: Pick<Database, "select">,
  subjectType: "repository" | "organization",
  input: CreatePublisherClaimInput,
): Promise<string> {
  // Every verification method is anchored to the server's stable repository identity; without one
  // no method is eligible, which also stops organisation claims floating free of any listing.
  const repository = await resolveServerRepositoryIdentity(db, input.serverId);

  if (subjectType === "repository") {
    return String(repository.id);
  }

  const [publisher] = await db
    .select({ githubOrg: publishers.githubOrg, githubOrgId: publishers.githubOrgId })
    .from(publishers)
    .where(eq(publishers.id, input.publisherId))
    .limit(1);
  if (!publisher?.githubOrg || !publisher.githubOrgId) {
    throw new Error("PUBLISHER_GITHUB_ORGANISATION_IDENTITY_MISSING");
  }
  if (repository.owner.toLowerCase() !== publisher.githubOrg.toLowerCase()) {
    throw new Error("GITHUB_ORGANISATION_REPOSITORY_MISMATCH");
  }
  parseStableGitHubId(publisher.githubOrgId, "PUBLISHER_GITHUB_ORGANISATION_IDENTITY_INVALID");
  return publisher.githubOrgId;
}

async function lockPublisher(store: Pick<Database, "select">, publisherId: string): Promise<void> {
  await store
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.id, publisherId))
    .limit(1)
    .for("update");
}

// A browser-supplied publisher id is never authority: an established publisher may only be claimed
// by someone who already manages it. Only a publisher with no members at all may be bootstrapped.
async function assertRequesterMayClaimForPublisher(
  store: Pick<Database, "select">,
  input: { publisherId: string; requesterUserId: string },
): Promise<void> {
  const memberships = await store
    .select({ userId: publisherMemberships.userId, role: publisherMemberships.role })
    .from(publisherMemberships)
    .where(eq(publisherMemberships.publisherId, input.publisherId));

  if (memberships.length === 0) return;

  const own = memberships.find((membership) => membership.userId === input.requesterUserId);
  const role = own && PUBLISHER_ROLES.includes(own.role as PublisherRole) ? own.role : null;
  if (!role || !roleHasCapability(role as PublisherRole, "claims.manage")) {
    throw new PublisherClaimAuthorityError(input.publisherId);
  }
}

async function assertUserMayManagePublisherClaims(
  store: Pick<Database, "select">,
  input: {
    claimId: string;
    publisherId: string;
    originalRequesterUserId: string;
    userId: string;
  },
): Promise<void> {
  const memberships = await store
    .select({ userId: publisherMemberships.userId, role: publisherMemberships.role })
    .from(publisherMemberships)
    .where(eq(publisherMemberships.publisherId, input.publisherId));

  if (memberships.length === 0 && input.originalRequesterUserId === input.userId) return;

  const membership = memberships.find(({ userId }) => userId === input.userId);
  const role =
    membership && PUBLISHER_ROLES.includes(membership.role as PublisherRole)
      ? (membership.role as PublisherRole)
      : null;
  if (!role || !roleHasCapability(role, "claims.manage")) {
    throw new PublisherClaimTransitionError(input.claimId, null, "FORBIDDEN");
  }
}

async function findVerifiedClaimsForServer(
  store: Pick<Database, "select">,
  serverId: string,
  excludeClaimId?: string,
): Promise<{ id: string; publisherId: string }[]> {
  const base = and(
    eq(publisherClaims.serverId, serverId),
    eq(publisherClaims.status, "verified"),
    ...(excludeClaimId ? [ne(publisherClaims.id, excludeClaimId)] : []),
  );

  return store
    .select({ id: publisherClaims.id, publisherId: publisherClaims.publisherId })
    .from(publisherClaims)
    .where(base)
    .orderBy(desc(publisherClaims.verifiedAt));
}

async function lockPublisherForManualReview(
  store: Pick<Database, "update">,
  publisherId: string,
  now: Date,
): Promise<void> {
  await store
    .update(publishers)
    .set({
      ownershipState: "manual_review",
      ownershipLockedAt: now,
      ownershipLockReason: "conflicting_verified_claim",
      updatedAt: now,
    })
    .where(eq(publishers.id, publisherId));
}

// The public "publisher verified" signal is derived from the publisher's remaining verified claims,
// so it never downgrades a publisher that still holds another verified claim.
async function refreshPublisherVerificationState(
  tx: ClaimStore,
  input: { publisherId: string; actorUserId: string; now: Date },
): Promise<void> {
  const [remaining] = await tx
    .select({ id: publisherClaims.id })
    .from(publisherClaims)
    .where(
      and(
        eq(publisherClaims.publisherId, input.publisherId),
        eq(publisherClaims.status, "verified"),
      ),
    )
    .limit(1);

  const next = remaining ? "verified" : "unverified";
  const [changed] = await tx
    .update(publishers)
    .set({ verificationState: next, updatedAt: input.now })
    .where(and(eq(publishers.id, input.publisherId), ne(publishers.verificationState, next)))
    .returning({ id: publishers.id });

  if (!changed) return;

  await appendAuditEvent(tx, {
    actorUserId: input.actorUserId,
    resourceType: "publisher",
    resourceId: input.publisherId,
    action: "publisher.verification_state_changed",
    outcome: "success",
    metadata: { verificationState: next },
  });
}

export async function createPublisherClaim(
  db: Database,
  input: CreatePublisherClaimInput,
): Promise<CreatePublisherClaimResult> {
  const now = new Date();
  const githubSubjectType =
    input.verificationMethod === "github_repository" ? "repository" : "organization";
  const githubSubjectId = await resolveClaimSubjectId(db, githubSubjectType, input);

  let created;
  try {
    created = await db.transaction(async (tx) => {
      // Serialise against a concurrent bootstrap of the same publisher.
      await lockPublisher(tx, input.publisherId);
      await assertRequesterMayClaimForPublisher(tx, {
        publisherId: input.publisherId,
        requesterUserId: input.requesterUserId,
      });

      const verified = await findVerifiedClaimsForServer(tx, input.serverId);
      const incumbent = verified.find((claim) => claim.publisherId !== input.publisherId) ?? null;

      const [claim] = await tx
        .insert(publisherClaims)
        .values({
          serverId: input.serverId,
          publisherId: input.publisherId,
          requesterUserId: input.requesterUserId,
          verificationMethod: input.verificationMethod,
          githubSubjectType,
          githubSubjectId,
          status: "pending",
          conflictClaimId: incumbent?.id ?? null,
          expiresAt: addDays(now, CLAIM_EXPIRY_DAYS),
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: publisherClaims.id,
          requesterUserId: publisherClaims.requesterUserId,
          status: publisherClaims.status,
        });

      if (!claim) {
        throw new Error("PUBLISHER_CLAIM_CREATE_FAILED");
      }

      await tx.insert(publisherClaimEvents).values({
        claimId: claim.id,
        actorUserId: input.requesterUserId,
        eventType: incumbent ? "claim.conflict_detected" : "claim.created",
        fromStatus: null,
        toStatus: "pending",
        reason: incumbent ? "conflicting_verified_owner" : null,
        metadata: incumbent ? { conflictClaimId: incumbent.id } : {},
      });

      await appendAuditEvent(tx, {
        actorUserId: input.requesterUserId,
        resourceType: "publisher_claim",
        resourceId: claim.id,
        action: incumbent ? "publisher_claim.conflict" : "publisher_claim.created",
        outcome: incumbent ? "blocked" : "success",
        metadata: {
          serverId: input.serverId,
          publisherId: input.publisherId,
          verificationMethod: input.verificationMethod,
          ...(incumbent ? { conflictClaimId: incumbent.id } : {}),
        },
      });

      if (incumbent) {
        await lockPublisherForManualReview(tx, input.publisherId, now);
      }

      return { claim, conflictClaimId: incumbent?.id ?? null };
    });
  } catch (error) {
    if (isOpenClaimUniqueViolation(error)) {
      throw new PublisherClaimConflictError({ claimId: null, conflictClaimId: null });
    }
    throw error;
  }

  if (created.conflictClaimId) {
    throw new PublisherClaimConflictError({
      claimId: created.claim.id,
      conflictClaimId: created.conflictClaimId,
    });
  }

  return {
    claimId: created.claim.id,
    requesterUserId: created.claim.requesterUserId,
    status: created.claim.status,
  };
}

export async function beginPublisherClaimVerification(
  db: Database,
  input: BeginClaimVerificationInput,
  deps: ClaimVerificationDeps,
): Promise<BeginClaimVerificationResult> {
  const stateRef = deps.randomId();
  const stateNonce = deps.randomSecret();
  const pkceVerifier = deps.randomSecret();

  const expiresAt = await db.transaction(async (tx) => {
    const current = await lockClaimForTransition(tx, {
      claimId: input.claimId,
      allowed: OPEN_CLAIM_STATUSES,
      requireUnexpired: true,
    });
    await assertUserMayManagePublisherClaims(tx, {
      claimId: current.id,
      publisherId: current.publisherId,
      originalRequesterUserId: current.requesterUserId,
      userId: input.requesterUserId,
    });

    // Only one live callback state may exist per claim.
    await tx
      .update(claimVerificationNonces)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(claimVerificationNonces.claimId, input.claimId),
          isNull(claimVerificationNonces.usedAt),
        ),
      );

    const [nonce] = await tx
      .insert(claimVerificationNonces)
      .values({
        claimId: input.claimId,
        requesterUserId: input.requesterUserId,
        stateRef,
        stateHash: deps.sha256(stateNonce),
        pkceVerifierCiphertext: deps.encrypt(pkceVerifier),
        returnTo: input.returnTo,
        expiresAt: sql`now() + interval '10 minutes'`,
      })
      .returning({ expiresAt: claimVerificationNonces.expiresAt });

    if (!nonce) {
      throw new Error("CLAIM_VERIFICATION_NONCE_CREATE_FAILED");
    }

    await tx
      .update(publisherClaims)
      .set({ status: "verifying", updatedAt: input.now })
      .where(eq(publisherClaims.id, input.claimId));

    await tx.insert(publisherClaimEvents).values({
      claimId: input.claimId,
      actorUserId: input.requesterUserId,
      eventType: "claim.verification_started",
      fromStatus: current.status,
      toStatus: "verifying",
      metadata: { stateRef },
    });

    await appendAuditEvent(tx, {
      actorUserId: input.requesterUserId,
      resourceType: "publisher_claim",
      resourceId: input.claimId,
      action: "publisher_claim.verification_started",
      outcome: "success",
      metadata: { serverId: current.serverId, publisherId: current.publisherId },
    });

    return nonce.expiresAt;
  });

  return {
    claimId: input.claimId,
    redirectUrl: deps.buildUserAuthorisationUrl({
      state: `${stateRef}.${stateNonce}`,
      redirectUri: deps.redirectUri,
      codeChallenge: deps.sha256(pkceVerifier),
    }),
    expiresAt,
  };
}

async function consumeClaimVerificationNonce(
  db: Pick<Database, "select" | "update">,
  input: { stateRef: string; stateHash: string; requesterUserId: string },
) {
  const [nonce] = await db
    .update(claimVerificationNonces)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(claimVerificationNonces.stateRef, input.stateRef),
        eq(claimVerificationNonces.stateHash, input.stateHash),
        eq(claimVerificationNonces.requesterUserId, input.requesterUserId),
        isNull(claimVerificationNonces.usedAt),
        sql`${claimVerificationNonces.expiresAt} > now()`,
      ),
    )
    .returning();

  if (nonce) return nonce;

  // The compare-and-set never mutates a non-matching row; classify read-only.
  const [existing] = await db
    .select({
      stateHash: claimVerificationNonces.stateHash,
      requesterUserId: claimVerificationNonces.requesterUserId,
      usedAt: claimVerificationNonces.usedAt,
    })
    .from(claimVerificationNonces)
    .where(eq(claimVerificationNonces.stateRef, input.stateRef))
    .limit(1);

  if (!existing || existing.stateHash !== input.stateHash) {
    throw new Error("CLAIM_CALLBACK_STATE_INVALID");
  }
  if (existing.requesterUserId !== input.requesterUserId) {
    throw new Error("CLAIM_CALLBACK_REQUESTER_SESSION_MISMATCH");
  }
  if (existing.usedAt !== null) {
    throw new Error("CLAIM_CALLBACK_STATE_ALREADY_USED");
  }
  throw new Error("CLAIM_CALLBACK_STATE_EXPIRED");
}

async function loadRequesterGitHubUserId(
  db: Pick<Database, "select">,
  requesterUserId: string,
): Promise<string> {
  const [account] = await db
    .select({ accountId: authAccounts.accountId })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, requesterUserId), eq(authAccounts.providerId, "github")))
    .orderBy(authAccounts.createdAt, authAccounts.id)
    .limit(1);

  if (!account) {
    throw new Error("CLAIM_CALLBACK_GITHUB_ACCOUNT_NOT_LINKED");
  }

  return account.accountId;
}

async function loadClaimForVerification(
  db: Pick<Database, "select">,
  claimId: string,
): Promise<ClaimForVerification | null> {
  const [row] = await db
    .select({
      id: publisherClaims.id,
      serverId: publisherClaims.serverId,
      publisherId: publisherClaims.publisherId,
      requesterUserId: publisherClaims.requesterUserId,
      githubSubjectType: publisherClaims.githubSubjectType,
      githubSubjectId: publisherClaims.githubSubjectId,
      repositoryExternalId: servers.repositoryExternalId,
      repositoryUrl: servers.repositoryUrl,
      githubOrg: publishers.githubOrg,
    })
    .from(publisherClaims)
    .innerJoin(servers, eq(servers.id, publisherClaims.serverId))
    .innerJoin(publishers, eq(publishers.id, publisherClaims.publisherId))
    .where(eq(publisherClaims.id, claimId))
    .limit(1);

  if (!row) return null;

  const repository = parseGitHubRepositorySlug(row.repositoryUrl);

  return {
    id: row.id,
    serverId: row.serverId,
    publisherId: row.publisherId,
    requesterUserId: row.requesterUserId,
    githubSubjectType: toSubjectType(row.githubSubjectType),
    githubSubjectId: row.githubSubjectId,
    repositoryExternalId: row.repositoryExternalId,
    repositoryOwner: repository?.owner ?? null,
    repositoryName: repository?.name ?? null,
    organisationLogin: row.githubOrg,
  };
}

function claimRepositoryCoordinates(claim: ClaimForVerification): GitHubRepositoryCoordinates {
  if (!claim.repositoryExternalId || !claim.repositoryOwner || !claim.repositoryName) {
    throw new Error("SERVER_GITHUB_REPOSITORY_IDENTITY_MISSING");
  }

  return {
    owner: claim.repositoryOwner,
    name: claim.repositoryName,
    id: parseStableGitHubId(
      claim.repositoryExternalId,
      "SERVER_GITHUB_REPOSITORY_IDENTITY_INVALID",
    ),
  };
}

function claimSubjectNumber(claim: ClaimForVerification): number {
  return parseStableGitHubId(
    claim.githubSubjectId,
    claim.githubSubjectType === "repository"
      ? "CLAIM_GITHUB_REPOSITORY_ID_INVALID"
      : "CLAIM_GITHUB_ORGANISATION_ID_INVALID",
  );
}

function assertAuthenticatedUserControlsSubject(
  claim: ClaimForVerification,
  facts: GitHubUserPermissionFacts,
): void {
  if (!facts.installationVisible) {
    throw new Error("GITHUB_INSTALLATION_NOT_VISIBLE");
  }

  const subjectId = claimSubjectNumber(claim);
  const repository = claimRepositoryCoordinates(claim);

  if (facts.repositoryId !== repository.id) {
    throw new Error("GITHUB_REPOSITORY_IDENTITY_MISMATCH");
  }

  if (claim.githubSubjectType === "repository") {
    if (!facts.repositoryAdmin) {
      throw new Error("GITHUB_REPOSITORY_ADMIN_REQUIRED");
    }
    return;
  }

  // The ephemeral user grant must prove the claimed organisation owns this exact repository.
  if (facts.repositoryOwnerId !== subjectId) {
    throw new Error("GITHUB_ORGANISATION_REPOSITORY_OWNERSHIP_MISMATCH");
  }

  if (
    facts.organisationId !== subjectId ||
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
  const subjectId = claimSubjectNumber(claim);

  // Proven by a token-scoped repository lookup, so paginated `all`-selection installations cannot
  // be mistaken for access to the claimed listing.
  if (!installationFacts.repositoryAccessible) {
    throw new Error("GITHUB_INSTALLATION_REPOSITORY_ACCESS_MISSING");
  }

  if (claim.githubSubjectType === "repository") {
    if (!installationFacts.repositoryIds.includes(subjectId)) {
      throw new Error("GITHUB_REPOSITORY_INSTALLATION_TARGET_MISMATCH");
    }
    return;
  }

  if (installationFacts.targetType !== "organization" || installationFacts.targetId !== subjectId) {
    throw new Error("GITHUB_ORGANISATION_INSTALLATION_TARGET_MISMATCH");
  }
}

function assertMintedInstallationToken(
  minted: { expiresAt: Date; permissions: Record<string, string> },
  requested: Record<string, string>,
  issuedAt: Date,
): void {
  const expiresAtMs = minted.expiresAt instanceof Date ? minted.expiresAt.getTime() : Number.NaN;
  if (
    Number.isNaN(expiresAtMs) ||
    expiresAtMs <= issuedAt.getTime() ||
    expiresAtMs > issuedAt.getTime() + MAX_INSTALLATION_TOKEN_LIFETIME_MS
  ) {
    throw new Error("GITHUB_INSTALLATION_TOKEN_LIFETIME_INVALID");
  }

  const requestedEntries = Object.entries(requested);
  const grantedKeys = Object.keys(minted.permissions);
  if (
    grantedKeys.length !== requestedEntries.length ||
    requestedEntries.some(([key, value]) => minted.permissions[key] !== value)
  ) {
    throw new Error("GITHUB_INSTALLATION_TOKEN_PERMISSIONS_INVALID");
  }
}

function buildEvidenceSummary(
  claim: ClaimForVerification,
  installationId: number,
  userFacts: GitHubUserPermissionFacts,
  installationFacts: GitHubInstallationFacts,
): Record<string, unknown> {
  return {
    subjectType: claim.githubSubjectType,
    subjectId: claim.githubSubjectId,
    installationId,
    githubUserId: userFacts.githubUserId,
    repositoryId: userFacts.repositoryId,
    repositoryOwnerId: userFacts.repositoryOwnerId,
    repositoryAdmin: userFacts.repositoryAdmin,
    organisationMembershipState: userFacts.organisationMembershipState,
    organisationRole: userFacts.organisationRole,
    installationTargetType: installationFacts.targetType,
    installationTargetId: String(installationFacts.targetId),
    repositorySelection: installationFacts.repositorySelection,
    repositoryAccessible: installationFacts.repositoryAccessible,
    grantedPermissions: Object.keys(installationFacts.permissions).sort(),
  };
}

async function writeTrustRefresh(
  tx: Pick<Database, "insert">,
  input: {
    serverId: string;
    claimId: string;
    publisherId: string;
    reason: string;
    key: string;
    availableAt: Date;
  },
): Promise<void> {
  await tx.insert(transactionalOutbox).values({
    eventType: "trust.refresh",
    eventKey: `trust.refresh:${input.serverId}:${input.claimId}:${input.key}`,
    payload: {
      serverId: input.serverId,
      claimId: input.claimId,
      publisherId: input.publisherId,
      reason: input.reason,
    },
    availableAt: input.availableAt,
  });
}

async function confirmRequesterMembership(
  tx: ClaimStore,
  input: { publisherId: string; userId: string; now: Date },
): Promise<void> {
  // Serialise against a concurrent bootstrap so only one requester can seed the first owner.
  await lockPublisher(tx, input.publisherId);

  const memberships = await tx
    .select({ userId: publisherMemberships.userId })
    .from(publisherMemberships)
    .where(eq(publisherMemberships.publisherId, input.publisherId));

  if (memberships.some((membership) => membership.userId === input.userId)) return;

  // An established publisher never grants itself a new administrator through verification; the
  // authority gate at claim creation already required existing membership.
  if (memberships.length > 0) {
    throw new PublisherClaimAuthorityError(input.publisherId);
  }

  await tx
    .insert(publisherMemberships)
    .values({
      publisherId: input.publisherId,
      userId: input.userId,
      role: "owner",
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({
      target: [publisherMemberships.publisherId, publisherMemberships.userId],
    });
}

async function assertRequesterCanCompleteClaim(
  tx: ClaimStore,
  input: { claimId: string; requesterUserId: string },
): Promise<void> {
  const [user] = await tx
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.id, input.requesterUserId))
    .limit(1)
    .for("update");
  if (!user) {
    throw new PublisherClaimTransitionError(input.claimId, "verifying", "FORBIDDEN");
  }

  const [erasure] = await tx
    .select({ id: accountErasureRequests.id })
    .from(accountErasureRequests)
    .where(
      and(
        eq(accountErasureRequests.userId, input.requesterUserId),
        ne(accountErasureRequests.status, "failed"),
      ),
    )
    .limit(1);
  if (erasure) {
    throw new PublisherClaimTransitionError(input.claimId, "verifying", "FORBIDDEN");
  }
}

function describeCleanupError(error: unknown): string {
  // Error messages in this path are internal codes; tokens are never interpolated into them.
  return error instanceof Error ? error.message : "unknown_error";
}

async function cleanupIssuedTokens(
  db: Pick<Database, "insert">,
  deps: CompleteClaimVerificationDeps,
  input: {
    claimId: string;
    requesterUserId: string;
    userAccessToken: string | null;
    installationToken: string | null;
  },
): Promise<void> {
  const operations: { operation: string; run: Promise<void> }[] = [];
  if (input.installationToken) {
    operations.push({
      operation: "installation_token",
      run: deps.githubApp.revokeInstallationToken(input.installationToken),
    });
  }
  if (input.userAccessToken) {
    operations.push({
      operation: "user_access_token",
      run: deps.githubApp.revokeUserAccessToken(input.userAccessToken),
    });
  }
  if (operations.length === 0) return;

  const settled = await Promise.allSettled(
    operations.map((entry) => withTimeout(entry.run, TOKEN_CLEANUP_TIMEOUT_MS, entry.operation)),
  );

  const failures = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            operation: operations[index]?.operation ?? "unknown",
            error: describeCleanupError(result.reason),
          },
        ]
      : [],
  );
  if (failures.length === 0) return;

  try {
    await appendAuditEvent(db, {
      actorUserId: input.requesterUserId,
      resourceType: "publisher_claim",
      resourceId: input.claimId,
      action: "publisher_claim.token_cleanup_failed",
      outcome: "failure",
      metadata: { failures },
    });
  } catch {
    // Cleanup observability must never mask the verification outcome.
  }
}

export async function completePublisherClaimVerification(
  db: Database,
  input: CompleteClaimVerificationInput,
  deps: CompleteClaimVerificationDeps,
): Promise<CompleteClaimVerificationResult> {
  const [stateRef, stateNonce] = input.state.split(".");
  if (!stateRef || !stateNonce) {
    throw new Error("CLAIM_CALLBACK_STATE_INVALID");
  }

  // Single-use compare-and-set binds state, hash, requester, and database-owned expiry in one step,
  // before any decrypt or external exchange, so at most one replay can win.
  const nonce = await consumeClaimVerificationNonce(db, {
    stateRef,
    stateHash: deps.sha256(stateNonce),
    requesterUserId: input.requesterUserId,
  });

  const claim = await loadClaimForVerification(db, nonce.claimId);
  if (!claim) {
    throw new PublisherClaimTransitionError(nonce.claimId, null, "NOT_FOUND");
  }

  const expectedGitHubUserId = await loadRequesterGitHubUserId(db, input.requesterUserId);
  // The verifier is decrypted to plaintext only here, in memory, after single-use nonce
  // consumption, and only for this live exchange; it is never persisted or logged.
  const codeVerifier = deps.decrypt(nonce.pkceVerifierCiphertext);

  let userAccessToken: string | null = null;
  let installationToken: string | null = null;

  try {
    const exchanged = await deps.githubApp.exchangeUserCodeForToken({
      code: input.code,
      redirectUri: deps.redirectUri,
      codeVerifier,
      ...(claim.githubSubjectType === "repository"
        ? { repositoryId: claimSubjectNumber(claim) }
        : {}),
    });
    userAccessToken = exchanged.accessToken;

    const authenticatedUser = await deps.githubApp.getAuthenticatedUser({ userAccessToken });
    if (authenticatedUser.githubUserId !== expectedGitHubUserId) {
      throw new Error("CLAIM_CALLBACK_GITHUB_IDENTITY_MISMATCH");
    }

    if (input.installationId === null) {
      throw new Error("CLAIM_CALLBACK_INSTALLATION_ID_MISSING");
    }
    const installationId = input.installationId;

    const userFacts = await deps.githubApp.getUserPermissionFacts({
      userAccessToken,
      installationId,
      subjectType: claim.githubSubjectType,
      repositoryOwner: claim.repositoryOwner,
      repositoryName: claim.repositoryName,
      organisationLogin: claim.organisationLogin,
    });

    assertAuthenticatedUserControlsSubject(claim, userFacts);

    const permissions =
      claim.githubSubjectType === "repository"
        ? ({ metadata: "read", administration: "read" } as const)
        : ({ metadata: "read", members: "read" } as const);

    // Bound the token lifetime against a server-owned clock, never the caller's timestamp.
    const mintedAt = new Date();
    const minted = await deps.githubApp.createInstallationToken({
      installationId,
      ...(claim.githubSubjectType === "repository"
        ? { repositoryIds: [claimSubjectNumber(claim)] }
        : {}),
      permissions,
    });
    installationToken = minted.token;
    assertMintedInstallationToken(minted, permissions, mintedAt);

    const installationFacts = await deps.githubApp.getInstallationFacts({
      installationId,
      token: installationToken,
      subjectType: claim.githubSubjectType,
      repository: claimRepositoryCoordinates(claim),
    });

    assertInstallationMatchesClaim(claim, installationFacts);

    const evidenceSummary = buildEvidenceSummary(
      claim,
      installationId,
      userFacts,
      installationFacts,
    );

    const outcome = await db.transaction(async (tx) => {
      await assertRequesterCanCompleteClaim(tx, {
        claimId: claim.id,
        requesterUserId: claim.requesterUserId,
      });
      const current = await lockClaimForTransition(tx, {
        claimId: claim.id,
        allowed: ["verifying"],
        requireUnexpired: true,
      });

      const others = await findVerifiedClaimsForServer(tx, claim.serverId, claim.id);
      const conflicting = others.find((other) => other.publisherId !== claim.publisherId);
      if (conflicting) {
        await tx
          .update(publisherClaims)
          .set({ conflictClaimId: conflicting.id, updatedAt: input.verifiedAt })
          .where(eq(publisherClaims.id, claim.id));
        await lockPublisherForManualReview(tx, claim.publisherId, input.verifiedAt);
        await appendAuditEvent(tx, {
          actorUserId: input.requesterUserId,
          resourceType: "publisher_claim",
          resourceId: claim.id,
          action: "publisher_claim.conflict",
          outcome: "blocked",
          metadata: { serverId: claim.serverId, conflictClaimId: conflicting.id },
        });
        return { kind: "conflict" as const, conflictClaimId: conflicting.id };
      }

      const [verified] = await tx
        .update(publisherClaims)
        .set({
          status: "verified",
          verifiedAt: input.verifiedAt,
          updatedAt: input.verifiedAt,
          failureReason: null,
          evidenceSummary,
        })
        .where(eq(publisherClaims.id, claim.id))
        .returning({
          id: publisherClaims.id,
          status: publisherClaims.status,
          serverId: publisherClaims.serverId,
          publisherId: publisherClaims.publisherId,
          githubSubjectType: publisherClaims.githubSubjectType,
        });

      if (!verified) {
        throw new PublisherClaimTransitionError(claim.id, current.status, "INVALID_TRANSITION");
      }

      for (const superseded of others) {
        await tx
          .update(publisherClaims)
          .set({
            status: "superseded",
            reviewedAt: input.verifiedAt,
            updatedAt: input.verifiedAt,
          })
          .where(eq(publisherClaims.id, superseded.id));

        await tx.insert(publisherClaimEvents).values({
          claimId: superseded.id,
          actorUserId: input.requesterUserId,
          eventType: "claim.superseded",
          fromStatus: "verified",
          toStatus: "superseded",
          reason: "superseded_by_newer_verified_claim",
          metadata: { supersededByClaimId: verified.id },
        });

        await appendAuditEvent(tx, {
          actorUserId: input.requesterUserId,
          resourceType: "publisher_claim",
          resourceId: superseded.id,
          action: "publisher_claim.superseded",
          outcome: "success",
          metadata: { serverId: verified.serverId, supersededByClaimId: verified.id },
        });

        await writeTrustRefresh(tx, {
          serverId: verified.serverId,
          claimId: superseded.id,
          publisherId: superseded.publisherId,
          reason: "publisher_claim_superseded",
          key: "superseded",
          availableAt: input.verifiedAt,
        });

        await refreshPublisherVerificationState(tx, {
          publisherId: superseded.publisherId,
          actorUserId: input.requesterUserId,
          now: input.verifiedAt,
        });
      }

      await refreshPublisherVerificationState(tx, {
        publisherId: verified.publisherId,
        actorUserId: input.requesterUserId,
        now: input.verifiedAt,
      });

      await tx
        .update(servers)
        .set({ publisherId: verified.publisherId, updatedAt: input.verifiedAt })
        .where(eq(servers.id, verified.serverId));

      await confirmRequesterMembership(tx, {
        publisherId: verified.publisherId,
        userId: claim.requesterUserId,
        now: input.verifiedAt,
      });

      await tx.insert(publisherClaimEvents).values({
        claimId: verified.id,
        actorUserId: input.requesterUserId,
        eventType: "claim.verified",
        fromStatus: current.status,
        toStatus: "verified",
        evidenceSummary,
        metadata: { installationId },
      });

      await appendAuditEvent(tx, {
        actorUserId: input.requesterUserId,
        resourceType: "publisher_claim",
        resourceId: verified.id,
        action: "publisher_claim.verified",
        outcome: "success",
        metadata: {
          serverId: verified.serverId,
          publisherId: verified.publisherId,
          subjectType: claim.githubSubjectType,
          supersededClaimIds: others.map((entry) => entry.id),
        },
      });

      await writeTrustRefresh(tx, {
        serverId: verified.serverId,
        claimId: verified.id,
        publisherId: verified.publisherId,
        reason: "publisher_claim_verified",
        key: "verified",
        availableAt: input.verifiedAt,
      });

      return {
        kind: "verified" as const,
        result: {
          claimId: verified.id,
          status: verified.status,
          publisherId: verified.publisherId,
          serverId: verified.serverId,
          githubSubjectType: toSubjectType(verified.githubSubjectType),
          returnTo: nonce.returnTo,
        },
      };
    });

    if (outcome.kind === "conflict") {
      throw new PublisherClaimConflictError({
        claimId: claim.id,
        conflictClaimId: outcome.conflictClaimId,
      });
    }

    return outcome.result;
  } finally {
    await cleanupIssuedTokens(db, deps, {
      claimId: claim.id,
      requesterUserId: input.requesterUserId,
      userAccessToken,
      installationToken,
    });
  }
}

export async function rejectPublisherClaim(
  db: Database,
  input: { claimId: string; reviewerUserId: string; reason: string; reviewedAt: Date },
): Promise<{ claimId: string; status: "rejected" }> {
  return db.transaction(async (tx) => {
    const current = await lockClaimForTransition(tx, {
      claimId: input.claimId,
      allowed: OPEN_CLAIM_STATUSES,
    });

    await tx
      .update(publisherClaims)
      .set({
        status: "rejected",
        failureReason: input.reason,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: input.reviewedAt,
        updatedAt: input.reviewedAt,
      })
      .where(eq(publisherClaims.id, input.claimId));

    await tx.insert(publisherClaimEvents).values({
      claimId: input.claimId,
      actorUserId: input.reviewerUserId,
      eventType: "claim.rejected",
      fromStatus: current.status,
      toStatus: "rejected",
      reason: input.reason,
    });

    await appendAuditEvent(tx, {
      actorUserId: input.reviewerUserId,
      resourceType: "publisher_claim",
      resourceId: input.claimId,
      action: "publisher_claim.rejected",
      outcome: "success",
      metadata: {
        serverId: current.serverId,
        publisherId: current.publisherId,
        reason: input.reason,
      },
    });

    return { claimId: input.claimId, status: "rejected" as const };
  });
}

export async function revokePublisherClaim(
  db: Database,
  input: { claimId: string; reviewerUserId: string; reason: string; revokedAt: Date },
): Promise<{ claimId: string; status: "revoked" }> {
  return db.transaction(async (tx) => {
    const current = await lockClaimForTransition(tx, {
      claimId: input.claimId,
      allowed: ["verified"],
    });

    await tx
      .update(publisherClaims)
      .set({
        status: "revoked",
        failureReason: input.reason,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: input.revokedAt,
        updatedAt: input.revokedAt,
      })
      .where(eq(publisherClaims.id, input.claimId));

    await tx.insert(publisherClaimEvents).values({
      claimId: input.claimId,
      actorUserId: input.reviewerUserId,
      eventType: "claim.revoked",
      fromStatus: current.status,
      toStatus: "revoked",
      reason: input.reason,
    });

    await appendAuditEvent(tx, {
      actorUserId: input.reviewerUserId,
      resourceType: "publisher_claim",
      resourceId: input.claimId,
      action: "publisher_claim.revoked",
      outcome: "success",
      metadata: {
        serverId: current.serverId,
        publisherId: current.publisherId,
        reason: input.reason,
      },
    });

    await writeTrustRefresh(tx, {
      serverId: current.serverId,
      claimId: input.claimId,
      publisherId: current.publisherId,
      reason: "publisher_claim_revoked",
      key: "revoked",
      availableAt: input.revokedAt,
    });

    // Only unlink what this claim linked: a link another verified claim still justifies survives.
    const remaining = await findVerifiedClaimsForServer(tx, current.serverId, input.claimId);
    if (!remaining.some((claim) => claim.publisherId === current.publisherId)) {
      await tx
        .update(servers)
        .set({ publisherId: null, updatedAt: input.revokedAt })
        .where(and(eq(servers.id, current.serverId), eq(servers.publisherId, current.publisherId)));
    }

    await refreshPublisherVerificationState(tx, {
      publisherId: current.publisherId,
      actorUserId: input.reviewerUserId,
      now: input.revokedAt,
    });

    return { claimId: input.claimId, status: "revoked" as const };
  });
}

export async function withdrawPublisherClaim(
  db: Database,
  input: { claimId: string; requesterUserId: string },
): Promise<{ claimId: string; status: "withdrawn" }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const current = await lockClaimForTransition(tx, {
      claimId: input.claimId,
      allowed: OPEN_CLAIM_STATUSES,
    });
    await assertUserMayManagePublisherClaims(tx, {
      claimId: current.id,
      publisherId: current.publisherId,
      originalRequesterUserId: current.requesterUserId,
      userId: input.requesterUserId,
    });

    await tx
      .update(publisherClaims)
      .set({ status: "withdrawn", updatedAt: now })
      .where(eq(publisherClaims.id, input.claimId));

    await tx.insert(publisherClaimEvents).values({
      claimId: input.claimId,
      actorUserId: input.requesterUserId,
      eventType: "claim.withdrawn",
      fromStatus: current.status,
      toStatus: "withdrawn",
    });

    await appendAuditEvent(tx, {
      actorUserId: input.requesterUserId,
      resourceType: "publisher_claim",
      resourceId: input.claimId,
      action: "publisher_claim.withdrawn",
      outcome: "success",
      metadata: { serverId: current.serverId, publisherId: current.publisherId },
    });

    return { claimId: input.claimId, status: "withdrawn" as const };
  });
}
