import { and, eq, ne, sql } from "drizzle-orm";
import { repositorySnapshots, servers, type Database } from "@themcpdirectory/db";
import { normalizeHttpUrl } from "@themcpdirectory/security";
import {
  fetchGitHubRepository,
  fetchLatestGitHubRelease,
  repositoryIdentityLockKey,
  type GitHubRequestOptions,
} from "./github-client.js";

interface GitHubRepositoryCoordinates {
  owner: string;
  name: string;
  url: string;
}

export interface EnrichGitHubRepositoryOptions extends GitHubRequestOptions {
  checkedAt?: Date;
}

export class GitHubRepositoryUrlError extends Error {
  constructor() {
    super("Server does not have a valid GitHub repository URL.");
    this.name = "GitHubRepositoryUrlError";
  }
}

export class GitHubRepositoryIdentityConflictError extends Error {
  constructor() {
    super("GitHub repository identity conflicts with the server's stable repository identity.");
    this.name = "GitHubRepositoryIdentityConflictError";
  }
}

export class GitHubRepositoryChangedError extends Error {
  constructor() {
    super("Server repository changed while GitHub enrichment was in progress.");
    this.name = "GitHubRepositoryChangedError";
  }
}

export class GitHubEnrichmentServerNotFoundError extends Error {
  constructor() {
    super("Server was not found for GitHub enrichment.");
    this.name = "GitHubEnrichmentServerNotFoundError";
  }
}

function parseGitHubRepositoryUrl(value: string | null): GitHubRepositoryCoordinates {
  const normalized = value === null ? null : normalizeHttpUrl(value);
  if (normalized === null) throw new GitHubRepositoryUrlError();

  const parsed = new URL(normalized);
  if (parsed.hostname.toLowerCase() !== "github.com") throw new GitHubRepositoryUrlError();

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) throw new GitHubRepositoryUrlError();

  let owner: string;
  let name: string;
  try {
    owner = decodeURIComponent(segments[0]!);
    name = decodeURIComponent(segments[1]!).replace(/\.git$/i, "");
  } catch {
    throw new GitHubRepositoryUrlError();
  }

  const validSegment = /^[a-zA-Z0-9_.-]+$/;
  if (!validSegment.test(owner) || !validSegment.test(name)) {
    throw new GitHubRepositoryUrlError();
  }

  return { owner, name, url: normalized };
}

export async function enrichGitHubRepository(
  db: Database,
  serverId: string,
  options: EnrichGitHubRepositoryOptions = {},
) {
  if (options.checkedAt) {
    const [existingSnapshot] = await db
      .select()
      .from(repositorySnapshots)
      .where(
        and(
          eq(repositorySnapshots.serverId, serverId),
          eq(repositorySnapshots.provider, "github"),
          eq(repositorySnapshots.checkedAt, options.checkedAt),
        ),
      )
      .limit(1);
    if (existingSnapshot) return existingSnapshot;
  }

  const [initialServer] = await db
    .select({ repositoryUrl: servers.repositoryUrl })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!initialServer) throw new GitHubEnrichmentServerNotFoundError();

  const coordinates = parseGitHubRepositoryUrl(initialServer.repositoryUrl);
  const repository = await fetchGitHubRepository(coordinates.owner, coordinates.name, options);
  const latestRelease = await fetchLatestGitHubRelease(
    repository.owner.login,
    repository.name,
    options,
  );
  const canonicalCoordinates = parseGitHubRepositoryUrl(repository.html_url);
  const externalRepositoryId = String(repository.id);
  const checkedAt = options.checkedAt ?? new Date();

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${repositoryIdentityLockKey("github", externalRepositoryId)}))`,
    );
    const [currentServer] = await transaction
      .select({
        repositoryUrl: servers.repositoryUrl,
        repositorySource: servers.repositorySource,
        repositoryExternalId: servers.repositoryExternalId,
      })
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1)
      .for("update");
    if (!currentServer) throw new GitHubEnrichmentServerNotFoundError();
    if (currentServer.repositoryUrl !== initialServer.repositoryUrl) {
      throw new GitHubRepositoryChangedError();
    }

    const [identityOwner] = await transaction
      .select({ id: servers.id })
      .from(servers)
      .where(
        and(
          eq(servers.repositorySource, "github"),
          eq(servers.repositoryExternalId, externalRepositoryId),
          ne(servers.id, serverId),
        ),
      )
      .limit(1);

    const hasProviderConflict =
      currentServer.repositorySource !== null && currentServer.repositorySource !== "github";
    const hasIdentityConflict =
      currentServer.repositoryExternalId !== null &&
      currentServer.repositoryExternalId !== externalRepositoryId;
    if (identityOwner || hasProviderConflict || hasIdentityConflict) {
      throw new GitHubRepositoryIdentityConflictError();
    }

    const [existingSnapshot] = await transaction
      .select()
      .from(repositorySnapshots)
      .where(
        and(
          eq(repositorySnapshots.serverId, serverId),
          eq(repositorySnapshots.provider, "github"),
          eq(repositorySnapshots.checkedAt, checkedAt),
        ),
      )
      .limit(1);
    if (existingSnapshot) return existingSnapshot;

    await transaction
      .update(servers)
      .set({
        repositorySource: "github",
        repositoryExternalId: externalRepositoryId,
        repositoryUrl: canonicalCoordinates.url,
        licenseSpdx:
          repository.license?.spdx_id && repository.license.spdx_id !== "NOASSERTION"
            ? sql`coalesce(${servers.licenseSpdx}, ${repository.license.spdx_id})`
            : servers.licenseSpdx,
        updatedAt: checkedAt,
      })
      .where(eq(servers.id, serverId));

    const [snapshot] = await transaction
      .insert(repositorySnapshots)
      .values({
        serverId,
        provider: "github",
        externalRepositoryId,
        owner: repository.owner.login,
        name: repository.name,
        url: canonicalCoordinates.url,
        defaultBranch: repository.default_branch,
        isArchived: repository.archived,
        isFork: repository.fork,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        openIssues: repository.open_issues_count,
        licenseSpdx: repository.license?.spdx_id ?? null,
        lastPushAt: repository.pushed_at === null ? null : new Date(repository.pushed_at),
        lastReleaseAt:
          latestRelease?.published_at == null ? null : new Date(latestRelease.published_at),
        payload: { repository, latestRelease },
        checkedAt,
      })
      .returning();
    if (!snapshot) throw new Error("Unable to persist GitHub repository snapshot.");
    return snapshot;
  });
}
