import { afterEach, describe, expect, it, vi } from "vitest";
import { authAccounts, authVerification } from "@themcpdirectory/db";
import type { WebEnv } from "@themcpdirectory/config";
import { createAuth } from "../better-auth.js";
import { createTempDatabase } from "./postgres-test-db.js";

const BASE_URL = "https://app.example.test";
const realFetch = globalThis.fetch;

function getSetCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function cookieRequestHeader(setCookies: readonly string[]): string {
  return setCookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

function expectProtectedCookie(setCookie: string): void {
  expect(setCookie).toMatch(/; HttpOnly(?:;|$)/i);
  expect(setCookie).toMatch(/; Secure(?:;|$)/i);
  expect(setCookie).toMatch(/; SameSite=Lax(?:;|$)/i);
  expect(setCookie).toMatch(/; Path=\/(?:;|$)/i);
}

describe("GitHub OAuth flow", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("consumes database-backed OAuth state and creates a secure token-free identity session", async () => {
    const temp = await createTempDatabase("task10_github_oauth");
    const githubFetch = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json({
          access_token: "gho_synthetic_identity_token",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({
          id: 12345678,
          login: "octocat",
          name: "Octo Cat",
          email: null,
          avatar_url: "https://avatars.githubusercontent.com/u/12345678?v=4",
        });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([
          { email: "octocat@example.com", primary: true, verified: true },
        ]);
      }

      return Response.json({ message: `Unexpected URL: ${url}` }, { status: 500 });
    }) as typeof fetch;
    globalThis.fetch = githubFetch;

    try {
      const env = {
        DATABASE_URL: temp.databaseUrl,
        MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
        NEXT_PUBLIC_BASE_URL: BASE_URL,
        BETTER_AUTH_SECRET: "01234567890123456789012345678901",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_PRIVATE_KEY: "test-private-key",
        GITHUB_APP_SLUG: "themcpdirectory",
      } as WebEnv;
      const auth = createAuth({ db: temp.db, env, fetchImpl: githubFetch });

      const signInResponse = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE_URL,
          },
          body: JSON.stringify({ provider: "github", callbackURL: "/dashboard" }),
        }),
      );

      expect(signInResponse.status).toBe(200);
      const signIn = (await signInResponse.json()) as { url: string; redirect: boolean };
      const authorizationUrl = new URL(signIn.url);
      const state = authorizationUrl.searchParams.get("state");
      expect(signIn.redirect).toBe(true);
      expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
        "https://github.com/login/oauth/authorize",
      );
      expect(authorizationUrl.searchParams.get("scope")?.split(" ").sort()).toEqual([
        "read:user",
        "user:email",
      ]);
      expect(state).toBeTruthy();

      const signInCookies = getSetCookies(signInResponse);
      const stateCookie = signInCookies.find((cookie) => cookie.includes("better-auth.state="));
      expect(stateCookie).toBeDefined();
      expectProtectedCookie(stateCookie!);
      expect(await temp.db.select().from(authVerification)).toHaveLength(1);

      const callbackResponse = await auth.handler(
        new Request(
          `${BASE_URL}/api/auth/callback/github?code=synthetic-code&state=${encodeURIComponent(state!)}`,
          { headers: { cookie: cookieRequestHeader(signInCookies) } },
        ),
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe("/dashboard");
      expect(await temp.db.select().from(authVerification)).toHaveLength(0);

      const sessionCookie = getSetCookies(callbackResponse).find((cookie) =>
        cookie.includes("better-auth.session_token="),
      );
      expect(sessionCookie).toBeDefined();
      expectProtectedCookie(sessionCookie!);

      const accounts = await temp.db.select().from(authAccounts);
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({
        providerId: "github",
        accountId: "12345678",
        accessToken: null,
        refreshToken: null,
        idToken: null,
      });
    } finally {
      await temp.destroy();
    }
  });
});
