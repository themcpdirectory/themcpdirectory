import { describe, expect, it } from "vitest";
import { createAuth, roleHasCapability } from "../index.js";
import { createDatabase } from "@themcpdirectory/db";
import type { WebEnv } from "@themcpdirectory/config";

const TEST_ENV: WebEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
  NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a".repeat(32),
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_PRIVATE_KEY: "test-private-key",
  GITHUB_APP_SLUG: "themcpdirectory",
} as WebEnv;

function buildAuth() {
  return createAuth({ db: createDatabase(TEST_ENV.DATABASE_URL), env: TEST_ENV });
}

describe("auth configuration", () => {
  it("scopes GitHub account linking to a single trusted provider identity", () => {
    const auth = buildAuth();

    expect(auth.options.account?.accountLinking).toEqual({
      disableImplicitLinking: true,
      trustedProviders: ["github"],
      allowDifferentEmails: false,
    });
    expect(auth.options.socialProviders?.github?.scope).toEqual(["read:user", "user:email"]);
  });

  it("strips provider token material before an account row is created", async () => {
    const auth = buildAuth();

    const hook = auth.options.databaseHooks?.account?.create?.before;
    const result = await hook?.({
      providerId: "github",
      accountId: "gh-12345",
      accessToken: "gho_secret",
      refreshToken: "ghr_secret",
      idToken: "jwt_secret",
    } as never);

    expect(result).toEqual({
      data: expect.objectContaining({
        accessToken: null,
        refreshToken: null,
        idToken: null,
      }),
    });
  });

  it("strips provider token material before an account row is updated", async () => {
    const auth = buildAuth();

    const hook = auth.options.databaseHooks?.account?.update?.before;
    const result = await hook?.({
      providerId: "github",
      accountId: "gh-12345",
      accessToken: "gho_refreshed",
      refreshToken: "ghr_refreshed",
      idToken: "jwt_refreshed",
    } as never);

    expect(result).toEqual({
      data: expect.objectContaining({
        accessToken: null,
        refreshToken: null,
        idToken: null,
      }),
    });
  });

  it("does not treat an unverified GitHub profile email as verified", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url === "https://api.github.com/user") {
        return Response.json({
          id: 12345678,
          login: "octocat",
          name: "Octo Cat",
          email: "public@example.com",
          avatar_url: "https://avatars.githubusercontent.com/u/12345678?v=4",
        });
      }

      return Response.json([{ email: "public@example.com", primary: true, verified: false }]);
    };
    const auth = createAuth({
      db: createDatabase(TEST_ENV.DATABASE_URL),
      env: TEST_ENV,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const getUserInfo = auth.options.socialProviders?.github?.getUserInfo;
    const result = await getUserInfo?.({ accessToken: "synthetic-token" } as never);

    expect(result?.user).toMatchObject({ email: null, emailVerified: false });
  });

  it("re-exports the publisher capability matrix from the package barrel", () => {
    expect(roleHasCapability("owner", "ownership.transfer")).toBe(true);
    expect(roleHasCapability("admin", "ownership.transfer")).toBe(false);
  });
});
