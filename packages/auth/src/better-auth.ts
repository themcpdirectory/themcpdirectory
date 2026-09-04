import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { GithubProfile } from "better-auth/social-providers";
import { createDatabase, type Database } from "@themcpdirectory/db";
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
  const primaryEmail =
    emails.find((email) => email.primary && email.verified)?.email ?? profile.email ?? null;

  return {
    user: {
      name: profile.name ?? profile.login,
      email: primaryEmail,
      image: profile.avatar_url ?? undefined,
      emailVerified: primaryEmail !== null,
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
    database: drizzleAdapter(db, { provider: "pg", camelCase: false }),
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

const env = loadWebEnv();
const db = createDatabase(env.DATABASE_URL);

export const auth = createAuth({ db, env });
