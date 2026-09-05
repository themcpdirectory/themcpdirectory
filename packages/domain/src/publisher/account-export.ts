import { asc, eq } from "drizzle-orm";
import type { PublisherRole } from "@themcpdirectory/auth";
import {
  auditEvents,
  authUsers,
  publisherClaims,
  publisherMemberships,
  publishers,
  type Database,
} from "@themcpdirectory/db";
import { appendAuditEvent } from "./audit.js";

export interface AccountExportV1 {
  readonly exportedAt: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
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

export async function buildAccountExport(
  db: Database,
  userId: string,
  exportedAt = new Date(),
): Promise<AccountExportV1> {
  const [[user], memberships, claims, accountAudits] = await Promise.all([
    db
      .select({ id: authUsers.id, email: authUsers.email, name: authUsers.name, image: authUsers.image })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1),
    db
      .select({
        publisherId: publisherMemberships.publisherId,
        publisherSlug: publishers.slug,
        role: publisherMemberships.role,
      })
      .from(publisherMemberships)
      .innerJoin(publishers, eq(publishers.id, publisherMemberships.publisherId))
      .where(eq(publisherMemberships.userId, userId))
      .orderBy(asc(publishers.slug)),
    db
      .select({
        claimId: publisherClaims.id,
        serverId: publisherClaims.serverId,
        status: publisherClaims.status,
        githubSubjectId: publisherClaims.githubSubjectId,
      })
      .from(publisherClaims)
      .where(eq(publisherClaims.requesterUserId, userId))
      .orderBy(asc(publisherClaims.createdAt), asc(publisherClaims.id)),
    db
      .select({
        action: auditEvents.action,
        outcome: auditEvents.outcome,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, userId))
      .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id)),
  ]);

  if (!user) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  await appendAuditEvent(db, {
    actorUserId: userId,
    resourceType: "user",
    resourceId: userId,
    action: "account.exported",
    outcome: "success",
    metadata: { membershipCount: memberships.length, claimCount: claims.length },
  });

  return {
    exportedAt: exportedAt.toISOString(),
    user,
    memberships: memberships.map((membership) => ({
      ...membership,
      role: membership.role as PublisherRole,
    })),
    claims,
    auditEvents: accountAudits.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}