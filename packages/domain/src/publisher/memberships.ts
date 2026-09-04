import {
  roleHasCapability,
  type PublisherCapability,
  type PublisherRole,
} from "@themcpdirectory/auth";
import { authUsers, publisherMemberships, publishers, type Database } from "@themcpdirectory/db";
import { and, eq, sql } from "drizzle-orm";
import { appendAuditEvent } from "./audit.js";
import type { PublisherMemberSummary } from "./dashboard.js";

type MembershipReadStore = Pick<Database, "select">;

interface MembershipAccess {
  readonly membershipId: string;
  readonly publisherId: string;
  readonly role: PublisherRole;
}

interface MembershipRecord {
  readonly membershipId: string;
  readonly publisherId: string;
  readonly userId: string;
  readonly role: PublisherRole;
  readonly displayName: string;
  readonly email: string;
}

type MembershipMutationErrorCode = "LAST_OWNER" | "MEMBERSHIP_NOT_FOUND" | "PUBLISHER_FORBIDDEN";

type RoleUpdateResult =
  | { readonly kind: "success"; readonly member: PublisherMemberSummary }
  | { readonly kind: "error"; readonly code: MembershipMutationErrorCode };

type MembershipRemovalResult =
  | { readonly kind: "success"; readonly removedMembershipId: string }
  | { readonly kind: "error"; readonly code: MembershipMutationErrorCode };

const PUBLISHER_ROLES: readonly PublisherRole[] = ["owner", "admin", "editor", "viewer"];

function toPublisherRole(value: string): PublisherRole {
  if (PUBLISHER_ROLES.includes(value as PublisherRole)) {
    return value as PublisherRole;
  }

  throw new Error(`Unsupported publisher role: ${value}`);
}

function toMemberSummary(record: MembershipRecord): PublisherMemberSummary {
  return {
    membershipId: record.membershipId,
    userId: record.userId,
    role: record.role,
    displayName: record.displayName ?? null,
    email: record.email ?? null,
  };
}

async function loadMembershipRecord(
  db: MembershipReadStore,
  membershipId: string,
): Promise<MembershipRecord | null> {
  const [record] = await db
    .select({
      membershipId: publisherMemberships.id,
      publisherId: publisherMemberships.publisherId,
      userId: authUsers.id,
      role: publisherMemberships.role,
      displayName: authUsers.name,
      email: authUsers.email,
    })
    .from(publisherMemberships)
    .innerJoin(authUsers, eq(authUsers.id, publisherMemberships.userId))
    .where(eq(publisherMemberships.id, membershipId))
    .limit(1);

  if (!record) {
    return null;
  }

  return {
    membershipId: record.membershipId,
    publisherId: record.publisherId,
    userId: record.userId,
    role: toPublisherRole(record.role),
    displayName: record.displayName,
    email: record.email,
  };
}

async function loadMembershipAccess(
  db: MembershipReadStore,
  userId: string,
  publisherId: string,
): Promise<MembershipAccess | null> {
  const [membership] = await db
    .select({
      membershipId: publisherMemberships.id,
      publisherId: publisherMemberships.publisherId,
      role: publisherMemberships.role,
    })
    .from(publisherMemberships)
    .where(
      and(
        eq(publisherMemberships.userId, userId),
        eq(publisherMemberships.publisherId, publisherId),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    membershipId: membership.membershipId,
    publisherId: membership.publisherId,
    role: toPublisherRole(membership.role),
  };
}

async function lockPublisher(db: MembershipReadStore, publisherId: string): Promise<void> {
  const [publisher] = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.id, publisherId))
    .limit(1)
    .for("update");

  if (!publisher) {
    throw new Error("PUBLISHER_NOT_FOUND");
  }
}

async function countOwners(db: MembershipReadStore, publisherId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publisherMemberships)
    .where(
      and(
        eq(publisherMemberships.publisherId, publisherId),
        eq(publisherMemberships.role, "owner"),
      ),
    );

  return result?.count ?? 0;
}

function requiresOwnershipTransfer(currentRole: PublisherRole, nextRole: PublisherRole): boolean {
  if (currentRole === "owner" && nextRole !== "owner") {
    return true;
  }

  return currentRole !== "owner" && nextRole === "owner";
}

function roleUpdateAuditMetadata(input: {
  publisherId: string;
  targetUserId: string;
  previousRole: PublisherRole;
  nextRole: PublisherRole;
  reason?: MembershipMutationErrorCode;
}) {
  return {
    publisherId: input.publisherId,
    targetUserId: input.targetUserId,
    previousRole: input.previousRole,
    nextRole: input.nextRole,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function removalAuditMetadata(input: {
  publisherId: string;
  targetUserId: string;
  previousRole: PublisherRole;
  reason?: MembershipMutationErrorCode;
}) {
  return {
    publisherId: input.publisherId,
    targetUserId: input.targetUserId,
    previousRole: input.previousRole,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function throwMutationError(code: MembershipMutationErrorCode): never {
  throw new Error(code);
}

export async function requirePublisherAccess(
  db: Database,
  input: { userId: string; publisherId: string; capability: PublisherCapability },
): Promise<MembershipAccess> {
  return requirePublisherAccessFromStore(db, input);
}

async function requirePublisherAccessFromStore(
  db: MembershipReadStore,
  input: { userId: string; publisherId: string; capability: PublisherCapability },
): Promise<MembershipAccess> {
  const membership = await loadMembershipAccess(db, input.userId, input.publisherId);
  if (!membership || !roleHasCapability(membership.role, input.capability)) {
    throw new Error("PUBLISHER_FORBIDDEN");
  }

  return membership;
}

export async function updatePublisherMembershipRole(
  db: Database,
  input: { actorUserId: string; membershipId: string; nextRole: PublisherRole },
): Promise<PublisherMemberSummary> {
  const result = await db.transaction(async (tx) => {
    const membership = await loadMembershipRecord(tx, input.membershipId);
    if (!membership) {
      return { kind: "error", code: "MEMBERSHIP_NOT_FOUND" } satisfies RoleUpdateResult;
    }

    await lockPublisher(tx, membership.publisherId);

    const lockedMembership = await loadMembershipRecord(tx, input.membershipId);
    if (!lockedMembership) {
      return { kind: "error", code: "MEMBERSHIP_NOT_FOUND" } satisfies RoleUpdateResult;
    }

    let actorAccess: MembershipAccess;
    try {
      actorAccess = await requirePublisherAccessFromStore(tx, {
        userId: input.actorUserId,
        publisherId: lockedMembership.publisherId,
        capability: "members.manage",
      });
    } catch {
      await appendAuditEvent(tx, {
        actorUserId: input.actorUserId,
        resourceType: "publisher_membership",
        resourceId: lockedMembership.membershipId,
        action: "publisher_membership.role_updated",
        outcome: "blocked",
        metadata: roleUpdateAuditMetadata({
          publisherId: lockedMembership.publisherId,
          targetUserId: lockedMembership.userId,
          previousRole: lockedMembership.role,
          nextRole: input.nextRole,
          reason: "PUBLISHER_FORBIDDEN",
        }),
      });

      return { kind: "error", code: "PUBLISHER_FORBIDDEN" } satisfies RoleUpdateResult;
    }

    if (
      requiresOwnershipTransfer(lockedMembership.role, input.nextRole) &&
      !roleHasCapability(actorAccess.role, "ownership.transfer")
    ) {
      await appendAuditEvent(tx, {
        actorUserId: input.actorUserId,
        resourceType: "publisher_membership",
        resourceId: lockedMembership.membershipId,
        action: "publisher_membership.role_updated",
        outcome: "blocked",
        metadata: roleUpdateAuditMetadata({
          publisherId: lockedMembership.publisherId,
          targetUserId: lockedMembership.userId,
          previousRole: lockedMembership.role,
          nextRole: input.nextRole,
          reason: "PUBLISHER_FORBIDDEN",
        }),
      });

      return { kind: "error", code: "PUBLISHER_FORBIDDEN" } satisfies RoleUpdateResult;
    }

    if (lockedMembership.role === "owner" && input.nextRole !== "owner") {
      const ownerCount = await countOwners(tx, lockedMembership.publisherId);
      if (ownerCount <= 1) {
        await appendAuditEvent(tx, {
          actorUserId: input.actorUserId,
          resourceType: "publisher_membership",
          resourceId: lockedMembership.membershipId,
          action: "publisher_membership.role_updated",
          outcome: "blocked",
          metadata: roleUpdateAuditMetadata({
            publisherId: lockedMembership.publisherId,
            targetUserId: lockedMembership.userId,
            previousRole: lockedMembership.role,
            nextRole: input.nextRole,
            reason: "LAST_OWNER",
          }),
        });

        return { kind: "error", code: "LAST_OWNER" } satisfies RoleUpdateResult;
      }
    }

    if (lockedMembership.role === input.nextRole) {
      return {
        kind: "success",
        member: toMemberSummary(lockedMembership),
      } satisfies RoleUpdateResult;
    }

    await tx
      .update(publisherMemberships)
      .set({ role: input.nextRole, updatedAt: new Date() })
      .where(eq(publisherMemberships.id, lockedMembership.membershipId));

    const updatedMembership = await loadMembershipRecord(tx, lockedMembership.membershipId);
    if (!updatedMembership) {
      return { kind: "error", code: "MEMBERSHIP_NOT_FOUND" } satisfies RoleUpdateResult;
    }

    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId,
      resourceType: "publisher_membership",
      resourceId: updatedMembership.membershipId,
      action: "publisher_membership.role_updated",
      outcome: "success",
      metadata: roleUpdateAuditMetadata({
        publisherId: updatedMembership.publisherId,
        targetUserId: updatedMembership.userId,
        previousRole: lockedMembership.role,
        nextRole: updatedMembership.role,
      }),
    });

    return {
      kind: "success",
      member: toMemberSummary(updatedMembership),
    } satisfies RoleUpdateResult;
  });

  if (result.kind === "error") {
    throwMutationError(result.code);
  }

  return result.member;
}

export async function removePublisherMembership(
  db: Database,
  input: { actorUserId: string; membershipId: string },
): Promise<{ removedMembershipId: string }> {
  const result = await db.transaction(async (tx) => {
    const membership = await loadMembershipRecord(tx, input.membershipId);
    if (!membership) {
      return { kind: "error", code: "MEMBERSHIP_NOT_FOUND" } satisfies MembershipRemovalResult;
    }

    await lockPublisher(tx, membership.publisherId);

    const lockedMembership = await loadMembershipRecord(tx, input.membershipId);
    if (!lockedMembership) {
      return { kind: "error", code: "MEMBERSHIP_NOT_FOUND" } satisfies MembershipRemovalResult;
    }

    let actorAccess: MembershipAccess;
    try {
      actorAccess = await requirePublisherAccessFromStore(tx, {
        userId: input.actorUserId,
        publisherId: lockedMembership.publisherId,
        capability: "members.manage",
      });
    } catch {
      await appendAuditEvent(tx, {
        actorUserId: input.actorUserId,
        resourceType: "publisher_membership",
        resourceId: lockedMembership.membershipId,
        action: "publisher_membership.removed",
        outcome: "blocked",
        metadata: removalAuditMetadata({
          publisherId: lockedMembership.publisherId,
          targetUserId: lockedMembership.userId,
          previousRole: lockedMembership.role,
          reason: "PUBLISHER_FORBIDDEN",
        }),
      });

      return { kind: "error", code: "PUBLISHER_FORBIDDEN" } satisfies MembershipRemovalResult;
    }

    if (
      lockedMembership.role === "owner" &&
      !roleHasCapability(actorAccess.role, "ownership.transfer")
    ) {
      await appendAuditEvent(tx, {
        actorUserId: input.actorUserId,
        resourceType: "publisher_membership",
        resourceId: lockedMembership.membershipId,
        action: "publisher_membership.removed",
        outcome: "blocked",
        metadata: removalAuditMetadata({
          publisherId: lockedMembership.publisherId,
          targetUserId: lockedMembership.userId,
          previousRole: lockedMembership.role,
          reason: "PUBLISHER_FORBIDDEN",
        }),
      });

      return { kind: "error", code: "PUBLISHER_FORBIDDEN" } satisfies MembershipRemovalResult;
    }

    if (lockedMembership.role === "owner") {
      const ownerCount = await countOwners(tx, lockedMembership.publisherId);
      if (ownerCount <= 1) {
        await appendAuditEvent(tx, {
          actorUserId: input.actorUserId,
          resourceType: "publisher_membership",
          resourceId: lockedMembership.membershipId,
          action: "publisher_membership.removed",
          outcome: "blocked",
          metadata: removalAuditMetadata({
            publisherId: lockedMembership.publisherId,
            targetUserId: lockedMembership.userId,
            previousRole: lockedMembership.role,
            reason: "LAST_OWNER",
          }),
        });

        return { kind: "error", code: "LAST_OWNER" } satisfies MembershipRemovalResult;
      }
    }

    await tx
      .delete(publisherMemberships)
      .where(eq(publisherMemberships.id, lockedMembership.membershipId));

    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId,
      resourceType: "publisher_membership",
      resourceId: lockedMembership.membershipId,
      action: "publisher_membership.removed",
      outcome: "success",
      metadata: removalAuditMetadata({
        publisherId: lockedMembership.publisherId,
        targetUserId: lockedMembership.userId,
        previousRole: lockedMembership.role,
      }),
    });

    return {
      kind: "success",
      removedMembershipId: lockedMembership.membershipId,
    } satisfies MembershipRemovalResult;
  });

  if (result.kind === "error") {
    throwMutationError(result.code);
  }

  return { removedMembershipId: result.removedMembershipId };
}
