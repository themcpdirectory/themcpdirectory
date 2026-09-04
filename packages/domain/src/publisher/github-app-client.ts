import { createSign } from "node:crypto";
import { z } from "zod";
import type { WebEnv } from "@themcpdirectory/config";

export type GitHubOrganisationMembershipState = "active" | "pending" | "none";
export type GitHubOrganisationRole = "admin" | "member" | "none";

export interface GitHubUserPermissionFacts {
  readonly githubUserId: string;
  readonly installationVisible: boolean;
  readonly repositoryId: number | null;
  readonly repositoryOwnerId: number | null;
  readonly repositoryAdmin: boolean;
  readonly organisationId: number | null;
  readonly organisationMembershipState: GitHubOrganisationMembershipState;
  readonly organisationRole: GitHubOrganisationRole;
}

export interface GitHubRepositoryCoordinates {
  readonly owner: string;
  readonly name: string;
  readonly id: number;
}

export interface GitHubInstallationFacts {
  readonly installationId: number;
  readonly targetType: "user" | "organization";
  readonly targetId: number;
  readonly repositoryIds: readonly number[];
  readonly repositorySelection: "all" | "selected";
  readonly repositoryAccessible: boolean;
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
    repository: GitHubRepositoryCoordinates;
  }): Promise<GitHubInstallationFacts>;
  revokeUserAccessToken(token: string): Promise<void>;
  revokeInstallationToken(token: string): Promise<void>;
}

type GitHubAppEnv = Pick<
  WebEnv,
  | "GITHUB_CLIENT_ID"
  | "GITHUB_CLIENT_SECRET"
  | "GITHUB_APP_ID"
  | "GITHUB_APP_PRIVATE_KEY"
  | "GITHUB_APP_SLUG"
>;

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
// GitHub App JWTs must expire within 10 minutes; stay inside that window with clock-skew slack.
const APP_JWT_LIFETIME_SECONDS = 540;
const REQUEST_TIMEOUT_MS = 10_000;
const GITHUB_PAGE_SIZE = 100;
const MAX_GITHUB_LIST_PAGES = 100;

// GitHub login rules: alphanumeric with single hyphens, at most 39 characters.
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$/;
const GITHUB_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export class GitHubAppRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`GITHUB_REQUEST_FAILED_${status}`);
    this.name = "GitHubAppRequestError";
    this.status = status;
  }
}

export class GitHubAppResponseError extends Error {
  constructor(resource: string) {
    super(`GITHUB_RESPONSE_INVALID_${resource}`);
    this.name = "GitHubAppResponseError";
  }
}

const OAuthTokenSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().int().positive().optional(),
  })
  .passthrough();

const AuthenticatedUserSchema = z
  .object({ id: z.number().int().nonnegative(), login: z.string().min(1) })
  .passthrough();

const UserInstallationsSchema = z
  .object({
    installations: z.array(z.object({ id: z.number().int() }).passthrough()),
  })
  .passthrough();

const RepositorySchema = z
  .object({
    id: z.number().int().nonnegative(),
    owner: z.object({ id: z.number().int().nonnegative() }).passthrough(),
    permissions: z.object({ admin: z.boolean() }).passthrough().optional(),
  })
  .passthrough();

const OrganisationSchema = z.object({ id: z.number().int().nonnegative() }).passthrough();

const OrganisationMembershipSchema = z
  .object({ state: z.string().min(1), role: z.string().min(1) })
  .passthrough();

const InstallationTokenSchema = z
  .object({
    token: z.string().min(1),
    expires_at: z.iso.datetime(),
    permissions: z.record(z.string(), z.string()),
  })
  .passthrough();

const InstallationRepositoriesSchema = z
  .object({
    repositories: z.array(z.object({ id: z.number().int().nonnegative() }).passthrough()),
    repository_selection: z.enum(["all", "selected"]),
  })
  .passthrough();

const InstallationSchema = z
  .object({
    target_type: z.enum(["User", "Organization"]),
    target_id: z.number().int().nonnegative(),
    permissions: z.record(z.string(), z.string()),
  })
  .passthrough();

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signAppJwt(env: GitHubAppEnv, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const unsigned = `${base64UrlEncodeJson({ alg: "RS256", typ: "JWT" })}.${base64UrlEncodeJson({
    iat: issuedAt,
    exp: issuedAt + APP_JWT_LIFETIME_SECONDS,
    iss: env.GITHUB_APP_ID,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .end()
    .sign(env.GITHUB_APP_PRIVATE_KEY, "base64url");
  return `${unsigned}.${signature}`;
}

function githubHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
}

function assertRepositoryCoordinates(owner: string, name: string): void {
  if (!GITHUB_LOGIN_PATTERN.test(owner) || !GITHUB_REPOSITORY_NAME_PATTERN.test(name)) {
    throw new Error("GITHUB_REPOSITORY_COORDINATES_INVALID");
  }
}

function assertOrganisationLogin(login: string): void {
  if (!GITHUB_LOGIN_PATTERN.test(login)) {
    throw new Error("GITHUB_ORGANISATION_LOGIN_INVALID");
  }
}

async function requestGitHub(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  return fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  resource: string,
): Promise<T> {
  const response = await requestGitHub(fetchImpl, url, init);
  if (!response.ok) {
    throw new GitHubAppRequestError(response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GitHubAppResponseError(resource);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new GitHubAppResponseError(resource);
  }
  return parsed.data;
}

async function requestNoContent(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<void> {
  const response = await requestGitHub(fetchImpl, url, init);
  if (!response.ok) {
    throw new GitHubAppRequestError(response.status);
  }
}

function paginatedGitHubUrl(pathname: string, page: number): string {
  const url = new URL(pathname, GITHUB_API_BASE_URL);
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function isUserInstallationVisible(
  fetchImpl: typeof fetch,
  token: string,
  installationId: number,
): Promise<boolean> {
  for (let page = 1; page <= MAX_GITHUB_LIST_PAGES; page += 1) {
    const result = await requestJson(
      fetchImpl,
      paginatedGitHubUrl("/user/installations", page),
      { headers: githubHeaders(token) },
      UserInstallationsSchema,
      "USER_INSTALLATIONS",
    );

    if (result.installations.some((installation) => installation.id === installationId)) {
      return true;
    }
    if (result.installations.length < GITHUB_PAGE_SIZE) return false;
  }

  throw new GitHubAppResponseError("USER_INSTALLATIONS_PAGINATION_LIMIT");
}

async function loadInstallationRepositories(
  fetchImpl: typeof fetch,
  token: string,
): Promise<z.infer<typeof InstallationRepositoriesSchema>> {
  const repositories: Array<{ id: number }> = [];
  let repositorySelection: "all" | "selected" | null = null;

  for (let page = 1; page <= MAX_GITHUB_LIST_PAGES; page += 1) {
    const result = await requestJson(
      fetchImpl,
      paginatedGitHubUrl("/installation/repositories", page),
      { headers: githubHeaders(token) },
      InstallationRepositoriesSchema,
      "INSTALLATION_REPOSITORIES",
    );

    repositorySelection ??= result.repository_selection;
    if (repositorySelection !== result.repository_selection) {
      throw new GitHubAppResponseError("INSTALLATION_REPOSITORIES_SELECTION_CHANGED");
    }
    repositories.push(...result.repositories);
    if (result.repositories.length < GITHUB_PAGE_SIZE) {
      return { repositories, repository_selection: repositorySelection };
    }
  }

  throw new GitHubAppResponseError("INSTALLATION_REPOSITORIES_PAGINATION_LIMIT");
}

function neutralPermissionFacts(
  githubUserId: string,
  installationVisible: boolean,
): GitHubUserPermissionFacts {
  return {
    githubUserId,
    installationVisible,
    repositoryId: null,
    repositoryOwnerId: null,
    repositoryAdmin: false,
    organisationId: null,
    organisationMembershipState: "none",
    organisationRole: "none",
  };
}

// A token-scoped lookup answers "can this installation reach exactly this repository" without
// paginating /installation/repositories, which silently truncates for `all`-selection installs.
async function probeInstallationRepositoryAccess(
  fetchImpl: typeof fetch,
  token: string,
  repository: GitHubRepositoryCoordinates,
): Promise<boolean> {
  try {
    const found = await requestJson(
      fetchImpl,
      `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`,
      { headers: githubHeaders(token) },
      RepositorySchema,
      "INSTALLATION_REPOSITORY",
    );
    return found.id === repository.id;
  } catch (error) {
    if (error instanceof GitHubAppRequestError) return false;
    throw error;
  }
}

export function createGitHubAppClient(
  env: GitHubAppEnv,
  fetchImpl: typeof fetch = fetch,
): GitHubAppClient {
  const basicAuthorisation = `Basic ${Buffer.from(
    `${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`,
  ).toString("base64")}`;

  return {
    async exchangeUserCodeForToken(input) {
      const body = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      });
      if (input.repositoryId !== undefined) {
        body.set("repository_id", String(input.repositoryId));
      }

      const result = await requestJson(
        fetchImpl,
        GITHUB_OAUTH_TOKEN_URL,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        },
        OAuthTokenSchema,
        "OAUTH_TOKEN",
      );

      return {
        accessToken: result.access_token,
        expiresAt:
          result.expires_in === undefined ? null : new Date(Date.now() + result.expires_in * 1000),
      };
    },

    async getAuthenticatedUser(input) {
      const result = await requestJson(
        fetchImpl,
        `${GITHUB_API_BASE_URL}/user`,
        { headers: githubHeaders(input.userAccessToken) },
        AuthenticatedUserSchema,
        "USER",
      );

      return { githubUserId: String(result.id), login: result.login };
    },

    async getUserPermissionFacts(input) {
      if (input.repositoryOwner && input.repositoryName) {
        assertRepositoryCoordinates(input.repositoryOwner, input.repositoryName);
      }
      if (input.subjectType === "organization" && input.organisationLogin) {
        assertOrganisationLogin(input.organisationLogin);
      }

      const [installationVisible, authenticatedUser] = await Promise.all([
        isUserInstallationVisible(fetchImpl, input.userAccessToken, input.installationId),
        requestJson(
          fetchImpl,
          `${GITHUB_API_BASE_URL}/user`,
          { headers: githubHeaders(input.userAccessToken) },
          AuthenticatedUserSchema,
          "USER",
        ),
      ]);
      const githubUserId = String(authenticatedUser.id);
      let facts = neutralPermissionFacts(githubUserId, installationVisible);

      // Both claim types are anchored to the server's repository, so the repository payload is
      // read for either subject: it carries the stable repository id and its owner's stable id.
      if (input.repositoryOwner && input.repositoryName) {
        const repository = await requestJson(
          fetchImpl,
          `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(input.repositoryOwner)}/${encodeURIComponent(input.repositoryName)}`,
          { headers: githubHeaders(input.userAccessToken) },
          RepositorySchema,
          "REPOSITORY",
        );

        facts = {
          ...facts,
          repositoryId: repository.id,
          repositoryOwnerId: repository.owner.id,
          repositoryAdmin: repository.permissions?.admin === true,
        };
      }

      if (input.subjectType === "repository" || !input.organisationLogin) {
        return facts;
      }

      const organisationSegment = encodeURIComponent(input.organisationLogin);
      const [organisation, membership] = await Promise.all([
        requestJson(
          fetchImpl,
          `${GITHUB_API_BASE_URL}/orgs/${organisationSegment}`,
          { headers: githubHeaders(input.userAccessToken) },
          OrganisationSchema,
          "ORGANISATION",
        ),
        requestJson(
          fetchImpl,
          `${GITHUB_API_BASE_URL}/user/memberships/orgs/${organisationSegment}`,
          { headers: githubHeaders(input.userAccessToken) },
          OrganisationMembershipSchema,
          "ORGANISATION_MEMBERSHIP",
        ),
      ]);

      return {
        ...facts,
        organisationId: organisation.id,
        organisationMembershipState:
          membership.state === "active" || membership.state === "pending"
            ? membership.state
            : "none",
        organisationRole:
          membership.role === "admin" || membership.role === "member" ? membership.role : "none",
      };
    },

    async createInstallationToken(input) {
      const result = await requestJson(
        fetchImpl,
        `${GITHUB_API_BASE_URL}/app/installations/${encodeURIComponent(String(input.installationId))}/access_tokens`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${signAppJwt(env, new Date())}`,
            accept: "application/vnd.github+json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...(input.repositoryIds ? { repository_ids: [...input.repositoryIds] } : {}),
            permissions: input.permissions,
          }),
        },
        InstallationTokenSchema,
        "INSTALLATION_TOKEN",
      );

      return {
        token: result.token,
        expiresAt: new Date(result.expires_at),
        permissions: result.permissions,
      };
    },

    async getInstallationFacts(input) {
      assertRepositoryCoordinates(input.repository.owner, input.repository.name);

      const [repositories, installation, repositoryAccessible] = await Promise.all([
        loadInstallationRepositories(fetchImpl, input.token),
        requestJson(
          fetchImpl,
          `${GITHUB_API_BASE_URL}/app/installations/${encodeURIComponent(String(input.installationId))}`,
          {
            headers: {
              authorization: `Bearer ${signAppJwt(env, new Date())}`,
              accept: "application/vnd.github+json",
            },
          },
          InstallationSchema,
          "INSTALLATION",
        ),
        probeInstallationRepositoryAccess(fetchImpl, input.token, input.repository),
      ]);

      return {
        installationId: input.installationId,
        targetType: installation.target_type === "Organization" ? "organization" : "user",
        targetId: installation.target_id,
        repositoryIds: repositories.repositories.map((repository) => repository.id),
        repositorySelection: repositories.repository_selection,
        repositoryAccessible,
        permissions: installation.permissions,
      };
    },

    async revokeUserAccessToken(token) {
      // Revokes only this ephemeral token, leaving the user's app authorisation intact.
      await requestNoContent(
        fetchImpl,
        `${GITHUB_API_BASE_URL}/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`,
        {
          method: "DELETE",
          headers: {
            authorization: basicAuthorisation,
            accept: "application/vnd.github+json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ access_token: token }),
        },
      );
    },

    async revokeInstallationToken(token) {
      await requestNoContent(fetchImpl, `${GITHUB_API_BASE_URL}/installation/token`, {
        method: "DELETE",
        headers: githubHeaders(token),
      });
    },
  };
}
