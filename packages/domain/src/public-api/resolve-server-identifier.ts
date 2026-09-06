import { and, asc, eq, sql } from "drizzle-orm";
import type { InstallAvailability, ResolvedServerIdentifier } from "@themcpdirectory/api-contract";
import {
  serverAliases,
  serverPackages,
  repositorySnapshots,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { deriveInstallAvailability } from "./server-detail.js";

const IDENTIFIER_PRECEDENCE = [
  "slug",
  "alias",
  "canonical_registry_name",
  "package_identifier",
] as const;

type IdentifierMatchType = (typeof IDENTIFIER_PRECEDENCE)[number];
type AmbiguousIdentifierMatchType = Exclude<IdentifierMatchType, "slug"> | "github_repository";

export interface IdentifierMatchRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly version: string | null;
  readonly matchedValue: string;
  readonly listingStatus: string;
}

export interface AmbiguousServerMatchSummary {
  readonly slug: string;
  readonly title: string;
  readonly matchedBy: AmbiguousIdentifierMatchType;
  readonly matchedValue: string;
  readonly installAvailability: InstallAvailability;
}

export class AmbiguousServerIdentifierError extends Error {
  readonly identifier: string;
  readonly matchedBy: AmbiguousIdentifierMatchType;
  readonly matches: readonly AmbiguousServerMatchSummary[];

  constructor(
    identifier: string,
    matchedBy: AmbiguousIdentifierMatchType,
    matches: readonly IdentifierMatchRow[],
  ) {
    super(`Server identifier is ambiguous: ${identifier}`);
    this.name = "AmbiguousServerIdentifierError";
    this.identifier = identifier;
    this.matchedBy = matchedBy;
    this.matches = matches.slice(0, 3).map((match) => ({
      slug: match.slug,
      title: match.title,
      matchedBy,
      matchedValue: match.matchedValue,
      installAvailability: deriveInstallAvailability(match.listingStatus, match.version),
    }));
  }
}

function publicServerPredicate() {
  return sql`${servers.moderationStatus} not in ('hidden', 'blocked')`;
}

interface GitHubRepositoryIdentifier {
  readonly owner: string;
  readonly repository: string;
  readonly canonicalUrl: string;
}

function parseGitHubRepositoryIdentifier(identifier: string): GitHubRepositoryIdentifier | null {
  const trimmed = identifier.trim();
  let owner: string;
  let repository: string;

  if (/^https:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "github.com" ||
      parsed.port !== "" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    const pathMatch = /^\/([^/]+)\/([^/]+)\/?$/.exec(parsed.pathname);
    if (!pathMatch) return null;
    owner = pathMatch[1]!;
    repository = pathMatch[2]!;
  } else {
    if (trimmed.includes(":")) return null;
    const segments = trimmed.split("/");
    if (segments.length !== 2) return null;
    [owner, repository] = segments as [string, string];
  }

  const validSegment = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;
  if (!validSegment.test(owner) || !validSegment.test(repository)) return null;

  const normalizedOwner = owner.toLowerCase();
  const normalizedRepository = repository.toLowerCase();
  return {
    owner: normalizedOwner,
    repository: normalizedRepository,
    canonicalUrl: `https://github.com/${normalizedOwner}/${normalizedRepository}`,
  };
}

async function lookupGitHubRepositoryMatches(
  db: Database,
  identifier: GitHubRepositoryIdentifier,
): Promise<readonly IdentifierMatchRow[]> {
  return db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      version: serverVersions.version,
      matchedValue: sql<string>`min(${repositorySnapshots.owner} || '/' || ${repositorySnapshots.name})`,
      listingStatus: servers.listingStatus,
    })
    .from(repositorySnapshots)
    .innerJoin(servers, eq(servers.id, repositorySnapshots.serverId))
    .leftJoin(
      serverVersions,
      and(eq(serverVersions.id, servers.currentVersionId), eq(serverVersions.serverId, servers.id)),
    )
    .where(
      and(
        eq(repositorySnapshots.provider, "github"),
        eq(servers.repositorySource, "github"),
        eq(servers.repositoryExternalId, repositorySnapshots.externalRepositoryId),
        sql`lower(${repositorySnapshots.owner}) = ${identifier.owner}`,
        sql`lower(${repositorySnapshots.name}) = ${identifier.repository}`,
        sql`lower(${repositorySnapshots.url}) = ${identifier.canonicalUrl}`,
        sql`lower(${servers.repositoryUrl}) = ${identifier.canonicalUrl}`,
        publicServerPredicate(),
      ),
    )
    .groupBy(servers.id, servers.slug, servers.title, servers.listingStatus, serverVersions.version)
    .orderBy(asc(servers.slug))
    .limit(3);
}

export async function lookupIdentifierMatches(
  db: Database,
  matchedBy: IdentifierMatchType,
  identifier: string,
  limit: number,
): Promise<readonly IdentifierMatchRow[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 3));

  if (matchedBy === "slug") {
    return db
      .select({
        id: servers.id,
        slug: sql<string>`${servers.slug}::text`,
        title: servers.title,
        version: serverVersions.version,
        matchedValue: sql<string>`${servers.slug}::text`,
        listingStatus: servers.listingStatus,
      })
      .from(servers)
      .leftJoin(
        serverVersions,
        and(
          eq(serverVersions.id, servers.currentVersionId),
          eq(serverVersions.serverId, servers.id),
        ),
      )
      .where(sql`lower(${servers.slug}::text) = ${identifier} and ${publicServerPredicate()}`)
      .orderBy(asc(servers.slug))
      .limit(boundedLimit);
  }

  if (matchedBy === "alias") {
    return db
      .select({
        id: servers.id,
        slug: sql<string>`${servers.slug}::text`,
        title: servers.title,
        version: serverVersions.version,
        matchedValue: serverAliases.alias,
        listingStatus: servers.listingStatus,
      })
      .from(serverAliases)
      .innerJoin(servers, eq(servers.id, serverAliases.serverId))
      .leftJoin(
        serverVersions,
        and(
          eq(serverVersions.id, servers.currentVersionId),
          eq(serverVersions.serverId, servers.id),
        ),
      )
      .where(sql`lower(${serverAliases.alias}) = ${identifier} and ${publicServerPredicate()}`)
      .orderBy(asc(servers.slug))
      .limit(boundedLimit);
  }

  if (matchedBy === "canonical_registry_name") {
    return db
      .select({
        id: servers.id,
        slug: sql<string>`${servers.slug}::text`,
        title: servers.title,
        version: serverVersions.version,
        matchedValue: sql<string>`${servers.canonicalRegistryName}`,
        listingStatus: servers.listingStatus,
      })
      .from(servers)
      .leftJoin(
        serverVersions,
        and(
          eq(serverVersions.id, servers.currentVersionId),
          eq(serverVersions.serverId, servers.id),
        ),
      )
      .where(
        sql`lower(${servers.canonicalRegistryName}) = ${identifier} and ${publicServerPredicate()}`,
      )
      .orderBy(asc(servers.slug))
      .limit(boundedLimit);
  }

  return db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      version: serverVersions.version,
      matchedValue: sql<string>`min(${serverPackages.identifier})`,
      listingStatus: servers.listingStatus,
    })
    .from(servers)
    .innerJoin(
      serverVersions,
      and(eq(serverVersions.id, servers.currentVersionId), eq(serverVersions.serverId, servers.id)),
    )
    .innerJoin(serverPackages, eq(serverPackages.serverVersionId, serverVersions.id))
    .where(sql`lower(${serverPackages.identifier}) = ${identifier} and ${publicServerPredicate()}`)
    .groupBy(servers.id, servers.slug, servers.title, servers.listingStatus, serverVersions.version)
    .orderBy(asc(servers.slug))
    .limit(boundedLimit);
}

export async function resolveServerIdentifier(
  db: Database,
  identifier: string,
): Promise<ResolvedServerIdentifier | null> {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.length === 0) return null;

  for (const matchedBy of IDENTIFIER_PRECEDENCE) {
    const matches = await lookupIdentifierMatches(db, matchedBy, normalized, 3);
    if (matches.length === 0) continue;
    if (matches.length > 1 && matchedBy !== "slug") {
      throw new AmbiguousServerIdentifierError(normalized, matchedBy, matches);
    }

    const match = matches[0];
    if (!match) return null;
    return {
      id: match.id,
      slug: match.slug,
      title: match.title,
      version: match.version,
      canonicalUrl: `https://themcpdirectory.org/${match.slug}`,
      matchedBy,
      matchedValue: match.matchedValue,
      needsRedirect: matchedBy !== "slug",
      installAvailability: deriveInstallAvailability(match.listingStatus, match.version),
    };
  }

  const githubIdentifier = parseGitHubRepositoryIdentifier(identifier);
  if (!githubIdentifier) return null;
  const githubMatches = await lookupGitHubRepositoryMatches(db, githubIdentifier);
  if (githubMatches.length > 1) {
    throw new AmbiguousServerIdentifierError(normalized, "github_repository", githubMatches);
  }
  const githubMatch = githubMatches[0];
  if (!githubMatch) return null;
  return {
    id: githubMatch.id,
    slug: githubMatch.slug,
    title: githubMatch.title,
    version: githubMatch.version,
    canonicalUrl: `https://themcpdirectory.org/${githubMatch.slug}`,
    matchedBy: "github_repository",
    matchedValue: githubMatch.matchedValue,
    needsRedirect: true,
    installAvailability: deriveInstallAvailability(githubMatch.listingStatus, githubMatch.version),
  };
}
