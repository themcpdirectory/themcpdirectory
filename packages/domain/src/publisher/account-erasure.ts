import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  accountErasureRequests,
  auditEvents,
  authAccounts,
  authSessions,
  authUsers,
  legalHolds,
  publisherClaimEvents,
  publisherClaims,
  publisherMemberships,
  publishers,
  type Database,
} from "@themcpdirectory/db";
import { appendAuditEvent } from "./audit.js";

const OPEN_REQUEST_STATUSES = ["pending", "in_progress", "retry_scheduled", "blocked"] as const;
const MAX_RETRIES = 5;
const MAX_RESUMED_REQUESTS = 25;
const EXTERNAL_OPERATION_LEASE_MS = 5 * 60_000;
const BLOCKED_RECHECK_MS = 24 * 60 * 60_000;

export type AccountErasureStatus =
  | "pending"
  | "in_progress"
  | "retry_scheduled"
  | "blocked"
  | "completed"
  | "failed";

export type AccountErasureStep =
  | "revoke_sessions"
  | "disconnect_github_app_installations"
  | "transfer_or_lock_publishers"
  | "revoke_open_claims"
  | "scrub_local_data"
  | "pseudonymise_audits"
  | "done";

export interface SuccessorAssignment {
  readonly publisherId: string;
  readonly successorUserId: string;
}

export interface AccountErasureDeps {
  readonly githubApp: {
    disconnectOwnedInstallations(input: {
      userId: string;
      requestId: string;
      operationId: string;
    }): Promise<{ disconnectedInstallationIds: readonly number[] }>;
  };
}

interface ErasureMetadata {
  readonly successorAssignments: readonly SuccessorAssignment[];
  readonly auditTombstone: string;
  readonly deletedAccountAlias: string;
  readonly claimHistoryUserId: string;
  readonly githubDisconnect?: {
    readonly operationId: string;
    readonly state: "attempting" | "completed";
  };
}

interface ErasureResult {
  readonly requestId: string;
  readonly status: AccountErasureStatus;
  readonly currentStep: AccountErasureStep;
}

type ErasureStore = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

function randomErasureToken(): string {
  return randomBytes(24).toString("hex");
}

function erasureMetadata(value: unknown): ErasureMetadata {
  if (!value || typeof value !== "object") throw new Error("ACCOUNT_ERASURE_METADATA_INVALID");
  const metadata = value as {
    successorAssignments?: unknown;
    auditTombstone?: unknown;
    deletedAccountAlias?: unknown;
    claimHistoryUserId?: unknown;
    githubDisconnect?: unknown;
  };
  if (
    !Array.isArray(metadata.successorAssignments) ||
    typeof metadata.auditTombstone !== "string" ||
    typeof metadata.deletedAccountAlias !== "string" ||
    typeof metadata.claimHistoryUserId !== "string"
  ) {
    throw new Error("ACCOUNT_ERASURE_METADATA_INVALID");
  }

  const githubDisconnect = metadata.githubDisconnect;
  const parsedDisconnect =
    githubDisconnect &&
    typeof githubDisconnect === "object" &&
    typeof (githubDisconnect as { operationId?: unknown }).operationId === "string" &&
    ((githubDisconnect as { state?: unknown }).state === "attempting" ||
      (githubDisconnect as { state?: unknown }).state === "completed")
      ? {
          operationId: (githubDisconnect as { operationId: string }).operationId,
          state: (githubDisconnect as { state: "attempting" | "completed" }).state,
        }
      : undefined;

  return {
    successorAssignments: metadata.successorAssignments.filter(
      (assignment): assignment is SuccessorAssignment =>
        Boolean(
          assignment &&
            typeof assignment === "object" &&
            typeof (assignment as SuccessorAssignment).publisherId === "string" &&
            typeof (assignment as SuccessorAssignment).successorUserId === "string",
        ),
    ),
    auditTombstone: metadata.auditTombstone,
    deletedAccountAlias: metadata.deletedAccountAlias,
    claimHistoryUserId: metadata.claimHistoryUserId,
    ...(parsedDisconnect ? { githubDisconnect: parsedDisconnect } : {}),
  };
}

async function lockLegalHoldMutations(db: ErasureStore): Promise<void> {
  // SHARE conflicts with INSERT/UPDATE/DELETE's ROW EXCLUSIVE lock. A hold either commits before
  // this check and blocks erasure, or starts only after the local destructive transaction commits.
  await db.execute(sql`lock table ${legalHolds} in share mode`);
}

function toStatus(value: string): AccountErasureStatus {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "retry_scheduled" ||
    value === "blocked" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("ACCOUNT_ERASURE_STATUS_INVALID");
}

function toStep(value: string): AccountErasureStep {
  if (value === "requested") return "revoke_sessions";
  if (
    value === "revoke_sessions" ||
    value === "disconnect_github_app_installations" ||
    value === "transfer_or_lock_publishers" ||
    value === "revoke_open_claims" ||
    value === "scrub_local_data" ||
    value === "pseudonymise_audits" ||
    value === "done"
  ) {
    return value;
  }
  throw new Error("ACCOUNT_ERASURE_STEP_INVALID");
}

async function hasActiveLegalHold(db: ErasureStore, userId: string, now: Date): Promise<boolean> {
  const [hold] = await db
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
  return Boolean(hold);
}

async function validateSuccessors(
  db: ErasureStore,
  userId: string,
  assignments: readonly SuccessorAssignment[],
): Promise<void> {
  const publisherIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.successorUserId === userId || publisherIds.has(assignment.publisherId)) {
      throw new Error("INVALID_SUCCESSOR_ASSIGNMENT");
    }
    publisherIds.add(assignment.publisherId);

    const [owner] = await db
      .select({ id: publisherMemberships.id })
      .from(publisherMemberships)
      .where(
        and(
          eq(publisherMemberships.publisherId, assignment.publisherId),
          eq(publisherMemberships.userId, userId),
          eq(publisherMemberships.role, "owner"),
        ),
      )
      .limit(1);
    const [successor] = await db
      .select({ id: publisherMemberships.id })
      .from(publisherMemberships)
      .where(
        and(
          eq(publisherMemberships.publisherId, assignment.publisherId),
          eq(publisherMemberships.userId, assignment.successorUserId),
        ),
      )
      .limit(1);
    if (!owner || !successor) {
      throw new Error("INVALID_SUCCESSOR_ASSIGNMENT");
    }
  }
}

export async function requestAccountErasure(
  db: Database,
  input: {
    readonly userId: string;
    readonly successorAssignments: readonly SuccessorAssignment[];
    readonly requestedAt: Date;
  },
): Promise<ErasureResult> {
  return db.transaction(async (tx) => {
    await lockLegalHoldMutations(tx);
    const [user] = await tx
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, input.userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("ACCOUNT_NOT_FOUND");
    if (await hasActiveLegalHold(tx, input.userId, input.requestedAt)) {
      throw new Error("LEGAL_HOLD_ACTIVE");
    }

    const [existing] = await tx
      .select({
        id: accountErasureRequests.id,
        status: accountErasureRequests.status,
        currentStep: accountErasureRequests.currentStep,
      })
      .from(accountErasureRequests)
      .where(
        and(
          eq(accountErasureRequests.userId, input.userId),
          inArray(accountErasureRequests.status, OPEN_REQUEST_STATUSES),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        requestId: existing.id,
        status: toStatus(existing.status),
        currentStep: toStep(existing.currentStep),
      };
    }

    await validateSuccessors(tx, input.userId, input.successorAssignments);
    const [request] = await tx
      .insert(accountErasureRequests)
      .values({
        userId: input.userId,
        status: "pending",
        currentStep: "revoke_sessions",
        retryCount: 0,
        nextAttemptAt: input.requestedAt,
        metadata: {
          successorAssignments: input.successorAssignments,
          auditTombstone: randomErasureToken(),
          deletedAccountAlias: randomErasureToken(),
          claimHistoryUserId: randomUUID(),
        },
        requestedAt: input.requestedAt,
        createdAt: input.requestedAt,
        updatedAt: input.requestedAt,
      })
      .returning({
        id: accountErasureRequests.id,
        status: accountErasureRequests.status,
        currentStep: accountErasureRequests.currentStep,
      });
    if (!request) throw new Error("ACCOUNT_ERASURE_REQUEST_FAILED");

    await appendAuditEvent(tx, {
      actorUserId: input.userId,
      resourceType: "user",
      resourceId: input.userId,
      action: "account.erasure_requested",
      outcome: "success",
      metadata: { assignmentCount: input.successorAssignments.length },
    });

    return {
      requestId: request.id,
      status: toStatus(request.status),
      currentStep: toStep(request.currentStep),
    };
  });
}

async function moveToStep(
  db: ErasureStore,
  requestId: string,
  currentStep: AccountErasureStep,
  now: Date,
): Promise<void> {
  await db
    .update(accountErasureRequests)
    .set({ status: "in_progress", currentStep, nextAttemptAt: null, lastError: null, updatedAt: now })
    .where(eq(accountErasureRequests.id, requestId));
}

async function blockForLegalHold(
  db: ErasureStore,
  request: { id: string; userId: string; status: string; currentStep: string },
  now: Date,
): Promise<ErasureResult> {
  const status = "blocked" as const;
  const currentStep = toStep(request.currentStep);
  await db
    .update(accountErasureRequests)
    .set({
      status,
      nextAttemptAt: new Date(now.getTime() + BLOCKED_RECHECK_MS),
      lastError: "LEGAL_HOLD_ACTIVE",
      updatedAt: now,
    })
    .where(eq(accountErasureRequests.id, request.id));

  if (request.status !== "blocked") {
    await appendAuditEvent(db, {
      actorUserId: request.userId,
      resourceType: "user",
      resourceId: request.userId,
      action: "account.erasure_blocked",
      outcome: "blocked",
      metadata: { requestId: request.id },
    });
  }

  return { requestId: request.id, status, currentStep };
}

function safeExternalError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(message) ? message : "GITHUB_APP_DISCONNECT_FAILED";
}

async function persistRetry(
  db: ErasureStore,
  request: typeof accountErasureRequests.$inferSelect,
  currentStep: AccountErasureStep,
  error: unknown,
  now: Date,
): Promise<ErasureResult> {
  const retryCount = request.retryCount + 1;
  const status = retryCount >= MAX_RETRIES ? "failed" : "retry_scheduled";
  const nextAttemptAt =
    status === "retry_scheduled"
      ? new Date(now.getTime() + Math.min(2 ** retryCount * 60_000, 24 * 60 * 60_000))
      : null;
  await db
    .update(accountErasureRequests)
    .set({
      status,
      currentStep,
      retryCount,
      nextAttemptAt,
      lastError: safeExternalError(error),
      updatedAt: now,
    })
    .where(eq(accountErasureRequests.id, request.id));
  if (status === "failed") {
    await appendAuditEvent(db, {
      actorUserId: request.userId,
      resourceType: "user",
      resourceId: request.userId,
      action: "account.erasure_failed",
      outcome: "failure",
      metadata: { requestId: request.id, currentStep, error: safeExternalError(error) },
    });
  }
  return { requestId: request.id, status, currentStep };
}

async function transferOrLockPublishers(
  db: ErasureStore,
  userId: string,
  assignments: readonly SuccessorAssignment[],
  now: Date,
): Promise<void> {
  const associatedMemberships = await db
    .select({ publisherId: publisherMemberships.publisherId })
    .from(publisherMemberships)
    .where(eq(publisherMemberships.userId, userId))
    .orderBy(asc(publisherMemberships.publisherId));
  const publisherIds = [...new Set(associatedMemberships.map(({ publisherId }) => publisherId))];

  if (publisherIds.length === 0) return;

  await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(inArray(publishers.id, publisherIds))
    .orderBy(asc(publishers.id))
    .for("update");

  const lockedMemberships = await db
    .select({ publisherId: publisherMemberships.publisherId, role: publisherMemberships.role })
    .from(publisherMemberships)
    .where(eq(publisherMemberships.userId, userId))
    .orderBy(asc(publisherMemberships.publisherId));

  for (const membership of lockedMemberships) {
    if (membership.role !== "owner") continue;

    const assignment = assignments.find((entry) => entry.publisherId === membership.publisherId);
    const [otherOwner] = await db
      .select({ id: publisherMemberships.id })
      .from(publisherMemberships)
      .where(
        and(
          eq(publisherMemberships.publisherId, membership.publisherId),
          eq(publisherMemberships.role, "owner"),
          ne(publisherMemberships.userId, userId),
        ),
      )
      .limit(1);

    if (assignment) {
      const [promoted] = await db
        .update(publisherMemberships)
        .set({ role: "owner", updatedAt: now })
        .where(
          and(
            eq(publisherMemberships.publisherId, membership.publisherId),
            eq(publisherMemberships.userId, assignment.successorUserId),
          ),
        )
        .returning({ id: publisherMemberships.id });
      if (!promoted && !otherOwner) {
        await db
          .update(publishers)
          .set({
            ownershipState: "manual_review",
            ownershipLockedAt: now,
            ownershipLockReason: "owner_erased_without_successor",
            updatedAt: now,
          })
          .where(eq(publishers.id, membership.publisherId));
      }
    } else if (!otherOwner) {
      await db
        .update(publishers)
        .set({
          ownershipState: "manual_review",
          ownershipLockedAt: now,
          ownershipLockReason: "owner_erased_without_successor",
          updatedAt: now,
        })
        .where(eq(publishers.id, membership.publisherId));
    }
  }

  await db.delete(publisherMemberships).where(eq(publisherMemberships.userId, userId));
}

async function revokeOpenClaims(db: ErasureStore, userId: string, now: Date): Promise<void> {
  const claims = await db
    .select({
      id: publisherClaims.id,
      status: publisherClaims.status,
      publisherId: publisherClaims.publisherId,
      serverId: publisherClaims.serverId,
    })
    .from(publisherClaims)
    .where(
      and(
        eq(publisherClaims.requesterUserId, userId),
        inArray(publisherClaims.status, ["pending", "verifying"]),
      ),
    );

  for (const claim of claims) {
    await db
      .update(publisherClaims)
      .set({
        status: "revoked",
        evidenceSummary: {},
        failureReason: "requester_account_erased",
        updatedAt: now,
      })
      .where(eq(publisherClaims.id, claim.id));
    await db.insert(publisherClaimEvents).values({
      claimId: claim.id,
      actorUserId: userId,
      eventType: "claim.revoked",
      fromStatus: claim.status,
      toStatus: "revoked",
      reason: "requester_account_erased",
    });
    await appendAuditEvent(db, {
      actorUserId: userId,
      resourceType: "publisher_claim",
      resourceId: claim.id,
      action: "publisher_claim.revoked",
      outcome: "success",
      metadata: { publisherId: claim.publisherId, serverId: claim.serverId },
    });
  }
}

async function scrubLocalAccount(
  db: ErasureStore,
  userId: string,
  claimHistoryUserId: string,
  deletedAccountAlias: string,
  now: Date,
): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  await db.delete(authAccounts).where(eq(authAccounts.userId, userId));

  await db
    .insert(authUsers)
    .values({
      id: claimHistoryUserId,
      name: "Deleted account",
      email: `deleted-${deletedAccountAlias}@deleted.invalid`,
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: authUsers.id });

  const claims = await db
    .select({ id: publisherClaims.id })
    .from(publisherClaims)
    .where(eq(publisherClaims.requesterUserId, userId));
  const claimIds = claims.map(({ id }) => id);

  await db
    .update(publisherClaims)
    .set({
      requesterUserId: claimHistoryUserId,
      evidenceSummary: {},
      failureReason: null,
      updatedAt: now,
    })
    .where(eq(publisherClaims.requesterUserId, userId));
  await db
    .update(publisherClaims)
    .set({ reviewedByUserId: null, updatedAt: now })
    .where(eq(publisherClaims.reviewedByUserId, userId));

  await db
    .update(publisherClaimEvents)
    .set({ actorUserId: null, evidenceSummary: {}, metadata: {} })
    .where(eq(publisherClaimEvents.actorUserId, userId));
  if (claimIds.length > 0) {
    await db
      .update(publisherClaimEvents)
      .set({ actorUserId: null, reason: null, evidenceSummary: {}, metadata: {} })
      .where(inArray(publisherClaimEvents.claimId, claimIds));
  }
}

async function pseudonymiseAudits(
  db: ErasureStore,
  userId: string,
  claimHistoryUserId: string,
  auditTombstone: string,
): Promise<void> {
  const tombstone = `erased:${auditTombstone}`;
  const claimIds = (
    await db
      .select({ id: publisherClaims.id })
      .from(publisherClaims)
      .where(eq(publisherClaims.requesterUserId, claimHistoryUserId))
  ).map(({ id }) => id);
  const claimAuditPredicate =
    claimIds.length > 0
      ? and(eq(auditEvents.resourceType, "publisher_claim"), inArray(auditEvents.resourceId, claimIds))
      : sql`false`;

  await db
    .update(auditEvents)
    .set({
      actorUserId: null,
      resourceId: sql`case when ${auditEvents.resourceType} = 'user' and ${auditEvents.resourceId} = ${userId} then ${tombstone} else ${auditEvents.resourceId} end`,
      metadata: {},
    })
    .where(
      or(
        eq(auditEvents.actorUserId, userId),
        and(eq(auditEvents.resourceType, "user"), eq(auditEvents.resourceId, userId)),
        sql`${auditEvents.metadata}->>'targetUserId' = ${userId}`,
        claimAuditPredicate,
      ),
    );
}

export async function advanceAccountErasure(
  db: Database,
  input: { readonly requestId: string; readonly now: Date },
  deps: AccountErasureDeps,
): Promise<ErasureResult> {
  const prepared = await db.transaction(async (tx) => {
    await lockLegalHoldMutations(tx);
    const [request] = await tx
      .select()
      .from(accountErasureRequests)
      .where(eq(accountErasureRequests.id, input.requestId))
      .limit(1)
      .for("update");
    if (!request) throw new Error("ACCOUNT_ERASURE_REQUEST_NOT_FOUND");

    const status = toStatus(request.status);
    let currentStep = toStep(request.currentStep);
    if (status === "completed" || status === "failed") {
      return {
        kind: "return" as const,
        result: { requestId: request.id, status, currentStep },
      };
    }
    if (request.nextAttemptAt && request.nextAttemptAt > input.now) {
      return {
        kind: "return" as const,
        result: { requestId: request.id, status, currentStep },
      };
    }
    if (await hasActiveLegalHold(tx, request.userId, input.now)) {
      return { kind: "return" as const, result: await blockForLegalHold(tx, request, input.now) };
    }

    const metadata = erasureMetadata(request.metadata);
    if (currentStep === "revoke_sessions") {
      await tx.delete(authSessions).where(eq(authSessions.userId, request.userId));
      currentStep = "disconnect_github_app_installations";
      await moveToStep(tx, request.id, currentStep, input.now);
    }

    if (currentStep === "disconnect_github_app_installations") {
      if (metadata.githubDisconnect?.state === "completed") {
        return { kind: "local" as const, requestId: request.id };
      }

      const operationId = metadata.githubDisconnect?.operationId ?? request.id;
      await tx
        .update(accountErasureRequests)
        .set({
          status: "in_progress",
          currentStep,
          nextAttemptAt: new Date(input.now.getTime() + EXTERNAL_OPERATION_LEASE_MS),
          lastError: null,
          metadata: {
            ...metadata,
            githubDisconnect: { operationId, state: "attempting" },
          },
          updatedAt: input.now,
        })
        .where(eq(accountErasureRequests.id, request.id));
      return {
        kind: "disconnect" as const,
        requestId: request.id,
        userId: request.userId,
        operationId,
      };
    }

    return { kind: "local" as const, requestId: request.id };
  });

  if (prepared.kind === "return") return prepared.result;

  if (prepared.kind === "disconnect") {
    const disconnectResult = await db.transaction(async (tx) => {
      await lockLegalHoldMutations(tx);
      const [request] = await tx
        .select()
        .from(accountErasureRequests)
        .where(eq(accountErasureRequests.id, prepared.requestId))
        .limit(1)
        .for("update");
      if (!request) throw new Error("ACCOUNT_ERASURE_REQUEST_NOT_FOUND");
      const status = toStatus(request.status);
      const currentStep = toStep(request.currentStep);
      if (status === "completed" || status === "failed" || currentStep !== "disconnect_github_app_installations") {
        return { kind: "return" as const, result: { requestId: request.id, status, currentStep } };
      }
      if (request.nextAttemptAt && request.nextAttemptAt > new Date(input.now.getTime() + EXTERNAL_OPERATION_LEASE_MS)) {
        return { kind: "return" as const, result: { requestId: request.id, status, currentStep } };
      }
      if (await hasActiveLegalHold(tx, request.userId, input.now)) {
        return {
          kind: "return" as const,
          result: await blockForLegalHold(tx, request, input.now),
        };
      }

      const metadata = erasureMetadata(request.metadata);
      try {
        // operationId is stable across crashes; absent installations must be treated as success.
        await deps.githubApp.disconnectOwnedInstallations({
          userId: request.userId,
          requestId: request.id,
          operationId: metadata.githubDisconnect?.operationId ?? prepared.operationId,
        });
      } catch (error) {
        return {
          kind: "return" as const,
          result: await persistRetry(tx, request, currentStep, error, input.now),
        };
      }

      await tx.delete(authSessions).where(eq(authSessions.userId, request.userId));
      await tx
        .update(accountErasureRequests)
        .set({
          status: "in_progress",
          currentStep: "transfer_or_lock_publishers",
          nextAttemptAt: input.now,
          lastError: null,
          metadata: {
            ...metadata,
            githubDisconnect: { operationId: prepared.operationId, state: "completed" },
          },
          updatedAt: input.now,
        })
        .where(eq(accountErasureRequests.id, prepared.requestId));
      return { kind: "continue" as const };
    });

    if (disconnectResult.kind === "return") return disconnectResult.result;
  }

  return db.transaction(async (tx) => {
    await lockLegalHoldMutations(tx);
    const [request] = await tx
      .select()
      .from(accountErasureRequests)
      .where(eq(accountErasureRequests.id, prepared.requestId))
      .limit(1)
      .for("update");
    if (!request) throw new Error("ACCOUNT_ERASURE_REQUEST_NOT_FOUND");

    let status = toStatus(request.status);
    let currentStep = toStep(request.currentStep);
    if (status === "completed" || status === "failed") {
      return { requestId: request.id, status, currentStep };
    }
    if (await hasActiveLegalHold(tx, request.userId, input.now)) {
      return blockForLegalHold(tx, request, input.now);
    }

    const metadata = erasureMetadata(request.metadata);
    if (currentStep === "disconnect_github_app_installations") {
      if (metadata.githubDisconnect?.state !== "completed") {
        throw new Error("ACCOUNT_ERASURE_EXTERNAL_STEP_INCOMPLETE");
      }
      currentStep = "transfer_or_lock_publishers";
      await moveToStep(tx, request.id, currentStep, input.now);
    }

    while (currentStep !== "done") {
      switch (currentStep) {
        case "revoke_sessions":
          throw new Error("ACCOUNT_ERASURE_STEP_INVALID");
        case "transfer_or_lock_publishers":
          await transferOrLockPublishers(
            tx,
            request.userId,
            metadata.successorAssignments,
            input.now,
          );
          currentStep = "revoke_open_claims";
          await moveToStep(tx, request.id, currentStep, input.now);
          break;
        case "revoke_open_claims":
          await revokeOpenClaims(tx, request.userId, input.now);
          currentStep = "scrub_local_data";
          await moveToStep(tx, request.id, currentStep, input.now);
          break;
        case "scrub_local_data":
          await scrubLocalAccount(
            tx,
            request.userId,
            metadata.claimHistoryUserId,
            metadata.deletedAccountAlias,
            input.now,
          );
          currentStep = "pseudonymise_audits";
          await moveToStep(tx, request.id, currentStep, input.now);
          break;
        case "pseudonymise_audits":
          await pseudonymiseAudits(
            tx,
            request.userId,
            metadata.claimHistoryUserId,
            metadata.auditTombstone,
          );
          await appendAuditEvent(tx, {
            actorUserId: null,
            resourceType: "user",
            resourceId: `erased:${metadata.auditTombstone}`,
            action: "account.erasure_completed",
            outcome: "success",
            metadata: {},
          });
          currentStep = "done";
          status = "completed";
          await tx
            .update(accountErasureRequests)
            .set({
              status,
              currentStep,
              metadata: {},
              nextAttemptAt: null,
              lastError: null,
              completedAt: input.now,
              updatedAt: input.now,
            })
            .where(eq(accountErasureRequests.id, request.id));
          await tx.delete(authUsers).where(eq(authUsers.id, request.userId));
          break;
      }
    }

    return { requestId: request.id, status, currentStep };
  });
}

export async function resumeRetryableAccountErasure(
  db: Database,
  input: { readonly now: Date },
  deps: AccountErasureDeps,
): Promise<{ resumed: number; completed: number; retryScheduled: number }> {
  const requests = await db
    .select({ id: accountErasureRequests.id })
    .from(accountErasureRequests)
    .where(
      and(
        inArray(accountErasureRequests.status, ["pending", "in_progress", "retry_scheduled", "blocked"]),
        lte(accountErasureRequests.nextAttemptAt, input.now),
      ),
    )
    .orderBy(
      asc(accountErasureRequests.nextAttemptAt),
      asc(accountErasureRequests.createdAt),
      asc(accountErasureRequests.id),
    )
    .limit(MAX_RESUMED_REQUESTS);

  let completed = 0;
  let retryScheduled = 0;
  for (const request of requests) {
    const result = await advanceAccountErasure(db, { requestId: request.id, now: input.now }, deps);
    if (result.status === "completed") completed += 1;
    if (result.status === "retry_scheduled") retryScheduled += 1;
  }

  return { resumed: requests.length, completed, retryScheduled };
}