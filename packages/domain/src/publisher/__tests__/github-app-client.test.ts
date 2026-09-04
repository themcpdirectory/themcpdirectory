import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGitHubAppClient } from "../github-app-client.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ENV = {
  GITHUB_CLIENT_ID: "Iv1.client",
  GITHUB_CLIENT_SECRET: "client-secret",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_APP_SLUG: "themcpdirectory",
} as const;

interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function makeFetch(responder: (url: string, init: RequestInit | undefined) => Response): {
  fetchImpl: typeof fetch;
  calls: RecordedRequest[];
} {
  const calls: RecordedRequest[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createGitHubAppClient", () => {
  it("fails closed when GitHub returns a partial user payload", async () => {
    const { fetchImpl } = makeFetch(() => json({ login: "octocat" }));
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(client.getAuthenticatedUser({ userAccessToken: "ghu_x" })).rejects.toThrow(
      /GITHUB_RESPONSE_INVALID/,
    );
  });

  it("fails closed when the token exchange omits the access token", async () => {
    const { fetchImpl } = makeFetch(() => json({ error: "bad_verification_code" }));
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(
      client.exchangeUserCodeForToken({
        code: "code",
        redirectUri: "https://example.test/callback",
        codeVerifier: "verifier",
      }),
    ).rejects.toThrow(/GITHUB_RESPONSE_INVALID/);
  });

  it("fails closed when an installation token response omits its expiry", async () => {
    const { fetchImpl } = makeFetch(() => json({ token: "ghs_x" }));
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(
      client.createInstallationToken({
        installationId: 42,
        permissions: { metadata: "read", administration: "read" },
      }),
    ).rejects.toThrow(/GITHUB_RESPONSE_INVALID/);
  });

  it("does not default installation target or repository selection when GitHub omits them", async () => {
    const { fetchImpl } = makeFetch((url) =>
      url.includes("/installation/repositories")
        ? json({ repositories: [{ id: 1 }], repository_selection: "selected" })
        : json({ target_type: "Organization" }),
    );
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(
      client.getInstallationFacts({
        installationId: 42,
        token: "ghs_x",
        subjectType: "repository",
        repository: { owner: "octo-org", name: "repo-tool", id: 1 },
      }),
    ).rejects.toThrow(/GITHUB_RESPONSE_INVALID/);
  });

  it("proves installation access with a token-scoped repository lookup instead of a paged list", async () => {
    const { fetchImpl, calls } = makeFetch((url) => {
      if (url.includes("/installation/repositories")) {
        return json({ repositories: [{ id: 999 }], repository_selection: "all" });
      }
      if (url.includes("/app/installations/")) {
        return json({
          target_type: "Organization",
          target_id: 77,
          permissions: { metadata: "read" },
        });
      }
      return json({ id: 1, owner: { id: 77 } });
    });
    const client = createGitHubAppClient(ENV, fetchImpl);

    const facts = await client.getInstallationFacts({
      installationId: 42,
      token: "ghs_x",
      subjectType: "organization",
      repository: { owner: "octo-org", name: "repo-tool", id: 1 },
    });

    expect(facts.repositoryAccessible).toBe(true);
    expect(facts.repositoryIds).toEqual([999]);
    expect(calls.some((call) => call.url.endsWith("/repos/octo-org/repo-tool"))).toBe(true);

    const denied = makeFetch((url) =>
      url.includes("/repos/")
        ? new Response(null, { status: 404 })
        : url.includes("/installation/repositories")
          ? json({ repositories: [], repository_selection: "all" })
          : json({ target_type: "Organization", target_id: 77, permissions: { metadata: "read" } }),
    );

    await expect(
      createGitHubAppClient(ENV, denied.fetchImpl).getInstallationFacts({
        installationId: 42,
        token: "ghs_x",
        subjectType: "organization",
        repository: { owner: "octo-org", name: "repo-tool", id: 1 },
      }),
    ).resolves.toMatchObject({ repositoryAccessible: false });
  });

  it("reads the repository owner's stable id for organisation permission facts", async () => {
    const { fetchImpl } = makeFetch((url) => {
      if (url.includes("/user/installations")) return json({ installations: [{ id: 42 }] });
      if (url.endsWith("/user")) return json({ id: 5, login: "octocat" });
      if (url.includes("/user/memberships/orgs/")) return json({ state: "active", role: "admin" });
      if (url.includes("/orgs/")) return json({ id: 77 });
      return json({ id: 1, owner: { id: 77 }, permissions: { admin: false } });
    });
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(
      client.getUserPermissionFacts({
        userAccessToken: "ghu_x",
        installationId: 42,
        subjectType: "organization",
        repositoryOwner: "octo-org",
        repositoryName: "repo-tool",
        organisationLogin: "octo-org",
      }),
    ).resolves.toMatchObject({
      installationVisible: true,
      repositoryId: 1,
      repositoryOwnerId: 77,
      organisationId: 77,
      organisationMembershipState: "active",
      organisationRole: "admin",
    });
  });

  it("finds the callback installation and repository beyond the first results page", async () => {
    const firstPageInstallations = Array.from({ length: 100 }, (_, index) => ({ id: index + 100 }));
    const firstPageRepositories = Array.from({ length: 100 }, (_, index) => ({ id: index + 100 }));
    const { fetchImpl } = makeFetch((url, init) => {
      if (url.includes("/user/installations")) {
        return json({
          installations: url.includes("page=2") ? [{ id: 42 }] : firstPageInstallations,
        });
      }
      if (url.includes("/installation/repositories")) {
        return json({
          repositories: url.includes("page=2") ? [{ id: 1 }] : firstPageRepositories,
          repository_selection: "selected",
        });
      }
      if (url.endsWith("/user")) return json({ id: 5, login: "octocat" });
      if (url.includes("/app/installations/")) {
        return json({
          target_type: "Organization",
          target_id: 77,
          permissions: { metadata: "read", administration: "read" },
        });
      }
      if (url.includes("/repos/octo-org/repo-tool")) {
        const token = new Headers(init?.headers).get("authorization");
        return json({ id: 1, owner: { id: 77 }, permissions: { admin: token === "Bearer ghu_x" } });
      }
      return json({});
    });
    const client = createGitHubAppClient(ENV, fetchImpl);

    const userFacts = await client.getUserPermissionFacts({
      userAccessToken: "ghu_x",
      installationId: 42,
      subjectType: "repository",
      repositoryOwner: "octo-org",
      repositoryName: "repo-tool",
      organisationLogin: null,
    });
    const installationFacts = await client.getInstallationFacts({
      installationId: 42,
      token: "ghs_x",
      subjectType: "repository",
      repository: { owner: "octo-org", name: "repo-tool", id: 1 },
    });

    expect(userFacts).toMatchObject({ installationVisible: true, repositoryAdmin: true });
    expect(installationFacts).toMatchObject({ repositoryIds: expect.arrayContaining([1]) });
  });

  it("rejects crafted repository coordinates instead of injecting them into the API path", async () => {
    const { fetchImpl, calls } = makeFetch(() => json({}));
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(
      client.getUserPermissionFacts({
        userAccessToken: "ghu_x",
        installationId: 42,
        subjectType: "repository",
        repositoryOwner: "../../orgs",
        repositoryName: "repo",
        organisationLogin: null,
      }),
    ).rejects.toThrow(/GITHUB_REPOSITORY_COORDINATES_INVALID/);

    expect(calls.every((call) => !call.url.includes(".."))).toBe(true);
  });

  it("rejects crafted organisation logins", async () => {
    const { fetchImpl } = makeFetch(() => json({}));
    const client = createGitHubAppClient(ENV, fetchImpl);

    await expect(
      client.getUserPermissionFacts({
        userAccessToken: "ghu_x",
        installationId: 42,
        subjectType: "organization",
        repositoryOwner: null,
        repositoryName: null,
        organisationLogin: "acme/../evil",
      }),
    ).rejects.toThrow(/GITHUB_ORGANISATION_LOGIN_INVALID/);
  });

  it("revokes the individual user token and surfaces non-2xx revoke responses", async () => {
    const okFetch = makeFetch(() => new Response(null, { status: 204 }));
    const client = createGitHubAppClient(ENV, okFetch.fetchImpl);
    await client.revokeUserAccessToken("ghu_x");

    expect(okFetch.calls[0]?.url).toBe(
      `https://api.github.com/applications/${ENV.GITHUB_CLIENT_ID}/token`,
    );
    expect(okFetch.calls[0]?.init?.method).toBe("DELETE");

    const failingFetch = makeFetch(() => new Response(null, { status: 422 }));
    const failingClient = createGitHubAppClient(ENV, failingFetch.fetchImpl);

    await expect(failingClient.revokeUserAccessToken("ghu_x")).rejects.toThrow(/422/);
    await expect(failingClient.revokeInstallationToken("ghs_x")).rejects.toThrow(/422/);
  });

  it("bounds every request with an abort signal", async () => {
    const { fetchImpl, calls } = makeFetch(() => new Response(null, { status: 204 }));
    const client = createGitHubAppClient(ENV, fetchImpl);

    await client.revokeInstallationToken("ghs_x");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
