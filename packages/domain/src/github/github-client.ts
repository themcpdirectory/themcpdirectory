import { z } from "zod";

const GitHubRepositorySchema = z
  .object({
    id: z.number().int().nonnegative(),
    name: z.string().min(1),
    full_name: z.string().min(1),
    html_url: z.url(),
    default_branch: z.string().min(1),
    archived: z.boolean(),
    fork: z.boolean(),
    stargazers_count: z.number().int().nonnegative(),
    forks_count: z.number().int().nonnegative(),
    open_issues_count: z.number().int().nonnegative(),
    license: z.object({ spdx_id: z.string().nullable() }).nullable(),
    pushed_at: z.iso.datetime().nullable(),
    owner: z.object({ login: z.string().min(1) }),
  })
  .passthrough();

const GitHubReleaseSchema = z
  .object({
    id: z.number().int().nonnegative(),
    published_at: z.iso.datetime().nullable(),
  })
  .passthrough();

export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

export interface GitHubRequestOptions {
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function repositoryIdentityLockKey(source: string, externalId: string): string {
  return `repository:${source}:${externalId}`;
}

export class GitHubResponseValidationError extends Error {
  constructor() {
    super("GitHub returned an invalid repository response.");
    this.name = "GitHubResponseValidationError";
  }
}

export class GitHubRepositoryUnavailableError extends Error {
  constructor() {
    super("GitHub repository is unavailable.");
    this.name = "GitHubRepositoryUnavailableError";
  }
}

export class GitHubRateLimitError extends Error {
  readonly resetAt: Date | null;

  constructor(resetAt: Date | null) {
    super("GitHub API rate limit exceeded.");
    this.name = "GitHubRateLimitError";
    this.resetAt = resetAt;
  }
}

export class GitHubTimeoutError extends Error {
  constructor() {
    super("GitHub request timed out.");
    this.name = "GitHubTimeoutError";
  }
}

export class GitHubHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`GitHub request failed with status ${status}.`);
    this.name = "GitHubHttpError";
    this.status = status;
  }
}

function parseRateLimitReset(value: string | null): Date | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const resetAt = new Date(Number(value) * 1000);
  return Number.isNaN(resetAt.getTime()) ? null : resetAt;
}

function parseRetryAfter(value: string | null): Date | null {
  if (value === null) return null;
  if (/^\d+$/.test(value)) return new Date(Date.now() + Number(value) * 1000);
  const retryAt = new Date(value);
  return Number.isNaN(retryAt.getTime()) ? null : retryAt;
}

async function requestGitHub(path: string, options: GitHubRequestOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  });
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);

  try {
    const response = await (options.fetchImpl ?? fetch)(`https://api.github.com${path}`, {
      headers,
      signal: controller.signal,
    });

    const retryAfter = response.headers.get("retry-after");
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" || retryAfter !== null))
    ) {
      throw new GitHubRateLimitError(
        parseRetryAfter(retryAfter) ??
          parseRateLimitReset(response.headers.get("x-ratelimit-reset")),
      );
    }
    if (!response.ok) throw new GitHubHttpError(response.status);

    try {
      return await response.json();
    } catch {
      if (controller.signal.aborted) throw new GitHubTimeoutError();
      throw new GitHubResponseValidationError();
    }
  } catch (error) {
    if (controller.signal.aborted) throw new GitHubTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGitHubRepository(
  owner: string,
  name: string,
  options: GitHubRequestOptions = {},
): Promise<GitHubRepository> {
  let payload: unknown;
  try {
    payload = await requestGitHub(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      options,
    );
  } catch (error) {
    if (error instanceof GitHubHttpError && error.status === 404) {
      throw new GitHubRepositoryUnavailableError();
    }
    throw error;
  }

  const result = GitHubRepositorySchema.safeParse(payload);
  if (!result.success) throw new GitHubResponseValidationError();
  return result.data;
}

export async function fetchLatestGitHubRelease(
  owner: string,
  name: string,
  options: GitHubRequestOptions = {},
): Promise<GitHubRelease | null> {
  let payload: unknown;
  try {
    payload = await requestGitHub(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/latest`,
      options,
    );
  } catch (error) {
    if (error instanceof GitHubHttpError && error.status === 404) return null;
    throw error;
  }

  const result = GitHubReleaseSchema.safeParse(payload);
  if (!result.success) throw new GitHubResponseValidationError();
  return result.data;
}
