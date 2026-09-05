import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { GithubProfile } from "better-auth/social-providers";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerification,
  createDatabase,
  type Database,
} from "@themcpdirectory/db";
import { loadWebEnv, resolveWebUrls, type WebEnv } from "@themcpdirectory/config";

interface GitHubEmailRecord {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface CreateAuthInput {
  readonly db: Database;
  readonly env: WebEnv;
  readonly fetchImpl?: typeof fetch;
}

async function fetchGitHubUserInfo(fetchImpl: typeof fetch, accessToken: string) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
  };

  const [profileResponse, emailResponse] = await Promise.all([
    fetchImpl("https://api.github.com/user", { headers }),
    fetchImpl("https://api.github.com/user/emails", { headers }),
  ]);

  if (!profileResponse.ok || !emailResponse.ok) {
    return null;
  }

  const profile = (await profileResponse.json()) as GithubProfile;
  const emails = (await emailResponse.json()) as GitHubEmailRecord[];
  const verifiedEmail =
    emails.find((email) => email.primary && email.verified)?.email ??
    emails.find((email) => email.verified)?.email ??
    null;

  return {
    user: {
      name: profile.name ?? profile.login,
      email: verifiedEmail,
      image: profile.avatar_url ?? undefined,
      emailVerified: verifiedEmail !== null,
    },
    data: profile,
  };
}

export function createAuth({ db, env, fetchImpl = fetch }: CreateAuthInput) {
  const { authBaseURL, trustedOrigins } = resolveWebUrls(env);

  return betterAuth({
    baseURL: authBaseURL,
    basePath: "/api/auth",
    trustedOrigins: [...trustedOrigins],
    secret: env.BETTER_AUTH_SECRET,
    // This package's table export names (authUsers, authSessions, ...) don't match Better
    // Auth's internal model names (user, session, ...); without an explicit mapping, every
    // adapter lookup throws "model was not found in the schema object" at request time.
    database: drizzleAdapter(db, {
      provider: "pg",
      camelCase: false,
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerification,
      },
    }),
    advanced: {
      database: {
        generateId: "uuid",
        joins: true,
      },
    },
    account: {
      storeStateStrategy: "database",
      storeAccountCookie: false,
      accountLinking: {
        disableImplicitLinking: true,
        trustedProviders: ["github"],
        allowDifferentEmails: false,
      },
    },
    verification: {
      storeIdentifier: "hashed",
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        disableDefaultScope: true,
        scope: ["read:user", "user:email"],
        getUserInfo: async (token) => {
          if (!token.accessToken) {
            return null;
          }

          return fetchGitHubUserInfo(fetchImpl, token.accessToken);
        },
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => ({
            data: {
              ...account,
              accessToken: null,
              refreshToken: null,
              idToken: null,
            },
          }),
        },
        update: {
          before: async (account) => ({
            data: {
              ...account,
              accessToken: null,
              refreshToken: null,
              idToken: null,
            },
          }),
        },
      },
    },
  } satisfies BetterAuthOptions);
}

export type Auth = ReturnType<typeof createAuth>;

let cachedAuth: Auth | undefined;

// Explicit accessor: memoizes a real Better Auth instance on first call so
// importing this module (for `roleHasCapability`, error classes, or the
// request guard) never forces `loadWebEnv()` / `createDatabase()` to run.
// Returning a genuine object — rather than a lazy Proxy — keeps `"handler"
// in getAuth()` truthy for `toNextJsHandler`, preserves iterable own keys,
// and lets Better Auth plugins introspect the surface normally.
export function getAuth(): Auth {
  if (!cachedAuth) {
    const env = loadWebEnv();
    const db = createDatabase(env.DATABASE_URL);
    cachedAuth = createAuth({ db, env });
  }
  return cachedAuth;
}
