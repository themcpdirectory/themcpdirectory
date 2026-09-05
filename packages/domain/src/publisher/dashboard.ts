import {
  PUBLISHER_CAPABILITIES,
  PUBLISHER_ROLES,
  roleHasCapability,
  type PublisherCapability,
  type PublisherRole,
} from "@themcpdirectory/auth";
import {
  authUsers,
  publisherClaims,
  publisherMemberships,
  publishers,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";

interface MembershipRow {
  readonly membershipId: string;
  readonly publisherId: string;
  readonly publisherSlug: string;
  readonly publisherDisplayName: string;
  readonly role: string;
}

interface MemberRow {
  readonly membershipId: string;
  readonly userId: string;
  readonly role: string;
  readonly displayName: string;
  readonly email: string;
}

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
    readonly claimableListings: readonly {
      readonly serverId: string;
      readonly serverTitle: string;
      readonly verificationMethods: readonly (
        | "github_repository"
        | "github_organization"
      )[];
    }[];
    readonly claims: readonly {
      readonly claimId: string;
      readonly serverId: string;
      readonly status: string;
      readonly serverTitle: string;
      readonly requiresManualReview: boolean;
    }[];
    readonly members: readonly PublisherMemberSummary[];
  } | null;
}

function repositoryOwner(repositoryUrl: string): string | null {
  try {
    const url = new URL(repositoryUrl);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const [owner, repository, ...extra] = url.pathname.replace(/^\//, "").split("/");
    return owner && repository && extra.length === 0 ? decodeURIComponent(owner) : null;
  } catch {
    return null;
  }
}

function toPublisherRole(value: string): PublisherRole {
  if (PUBLISHER_ROLES.includes(value as PublisherRole)) {
    return value as PublisherRole;
  }

  throw new Error(`Unsupported publisher role: ${value}`);
}

function capabilitiesForRole(role: PublisherRole): readonly PublisherCapability[] {
  return PUBLISHER_CAPABILITIES.filter((capability) => roleHasCapability(role, capability));
}

function projectMembershipSummary(row: MembershipRow): PublisherMembershipSummary {
  const role = toPublisherRole(row.role);

  return {
    membershipId: row.membershipId,
    publisherId: row.publisherId,
    publisherSlug: row.publisherSlug,
    publisherDisplayName: row.publisherDisplayName,
    role,
    capabilities: capabilitiesForRole(role),
  };
}

function projectMemberSummary(row: MemberRow): PublisherMemberSummary {
  return {
    membershipId: row.membershipId,
    userId: row.userId,
    role: toPublisherRole(row.role),
    displayName: row.displayName ?? null,
    email: row.email ?? null,
  };
}

async function loadViewer(db: Database, userId: string) {
  const [viewer] = await db
    .select({
      userId: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      image: authUsers.image,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  if (!viewer) {
    throw new Error("USER_NOT_FOUND");
  }

  return {
    userId: viewer.userId,
    name: viewer.name ?? null,
    email: viewer.email ?? null,
    image: viewer.image ?? null,
  };
}

async function loadMemberships(
  db: Database,
  userId: string,
): Promise<PublisherMembershipSummary[]> {
  const rows = await db
    .select({
      membershipId: publisherMemberships.id,
      publisherId: publisherMemberships.publisherId,
      publisherSlug: sql<string>`${publishers.slug}::text`,
      publisherDisplayName: publishers.displayName,
      role: publisherMemberships.role,
    })
    .from(publisherMemberships)
    .innerJoin(publishers, eq(publishers.id, publisherMemberships.publisherId))
    .where(eq(publisherMemberships.userId, userId))
    .orderBy(asc(publishers.displayName), asc(sql`${publishers.slug}::text`));

  return rows.map(projectMembershipSummary);
}

async function loadActivePublisherClaims(db: Database, publisherId: string) {
  const rows = await db
    .select({
      claimId: publisherClaims.id,
      serverId: publisherClaims.serverId,
      status: publisherClaims.status,
      serverTitle: servers.title,
      conflictClaimId: publisherClaims.conflictClaimId,
    })
    .from(publisherClaims)
    .innerJoin(servers, eq(servers.id, publisherClaims.serverId))
    .where(eq(publisherClaims.publisherId, publisherId))
    .orderBy(desc(publisherClaims.createdAt), asc(servers.title));

  return rows.map(({ conflictClaimId, ...claim }) => ({
    ...claim,
    requiresManualReview: conflictClaimId !== null,
  }));
}

async function loadClaimableListings(db: Database, publisherId: string) {
  const [publisher, listings] = await Promise.all([
    db
      .select({ githubOrg: publishers.githubOrg, githubOrgId: publishers.githubOrgId })
      .from(publishers)
      .where(eq(publishers.id, publisherId))
      .limit(1),
    db
      .select({
        serverId: servers.id,
        serverTitle: servers.title,
        repositoryUrl: servers.repositoryUrl,
      })
      .from(servers)
      .where(
        and(
          eq(servers.listingStatus, "active"),
          eq(servers.moderationStatus, "normal"),
          isNotNull(servers.repositoryExternalId),
          isNotNull(servers.repositoryUrl),
        ),
      )
      .orderBy(asc(servers.title)),
  ]);

  const organisation = publisher[0];
  const canUseOrganisation = Boolean(organisation?.githubOrg && organisation.githubOrgId);

  return listings.flatMap((listing) => {
    if (!listing.repositoryUrl || !repositoryOwner(listing.repositoryUrl)) return [];
    const methods: ("github_repository" | "github_organization")[] = ["github_repository"];
    if (
      canUseOrganisation &&
      repositoryOwner(listing.repositoryUrl)?.toLowerCase() === organisation?.githubOrg?.toLowerCase()
    ) {
      methods.push("github_organization");
    }
    return [{ serverId: listing.serverId, serverTitle: listing.serverTitle, verificationMethods: methods }];
  });
}

async function loadActivePublisherMembers(
  db: Database,
  publisherId: string,
): Promise<PublisherMemberSummary[]> {
  const rows = await db
    .select({
      membershipId: publisherMemberships.id,
      userId: authUsers.id,
      role: publisherMemberships.role,
      displayName: authUsers.name,
      email: authUsers.email,
    })
    .from(publisherMemberships)
    .innerJoin(authUsers, eq(authUsers.id, publisherMemberships.userId))
    .where(eq(publisherMemberships.publisherId, publisherId))
    .orderBy(asc(authUsers.name), asc(authUsers.email));

  return rows.map(projectMemberSummary);
}

export async function getPublisherDashboard(
  db: Database,
  input: { userId: string; preferredPublisherId?: string | null },
): Promise<PublisherDashboard> {
  const [viewer, memberships] = await Promise.all([
    loadViewer(db, input.userId),
    loadMemberships(db, input.userId),
  ]);

  const activeMembership =
    memberships.find((membership) => membership.publisherId === input.preferredPublisherId) ??
    memberships[0] ??
    null;

  if (!activeMembership) {
    return {
      viewer,
      memberships,
      activePublisher: null,
    };
  }

  const [claims, members, claimableListings] = await Promise.all([
    loadActivePublisherClaims(db, activeMembership.publisherId),
    loadActivePublisherMembers(db, activeMembership.publisherId),
    loadClaimableListings(db, activeMembership.publisherId),
  ]);

  return {
    viewer,
    memberships,
    activePublisher: {
      id: activeMembership.publisherId,
      slug: activeMembership.publisherSlug,
      displayName: activeMembership.publisherDisplayName,
      role: activeMembership.role,
      capabilities: activeMembership.capabilities,
      claimableListings,
      claims,
      members,
    },
  };
}
