import { getAuth } from "./better-auth.js";
import { AuthRequiredError } from "./errors.js";

type BetterAuthSessionResult = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>
>;

export interface AuthenticatedSession {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly image: string | null;
  };
  readonly session: {
    readonly id: string;
    readonly token: string;
    readonly userId: string;
    readonly expiresAt: Date;
  };
}

function projectSession(raw: BetterAuthSessionResult): AuthenticatedSession {
  return {
    user: {
      id: raw.user.id,
      email: raw.user.email,
      name: raw.user.name,
      image: raw.user.image ?? null,
    },
    session: {
      id: raw.session.id,
      token: raw.session.token,
      userId: raw.session.userId,
      expiresAt: raw.session.expiresAt,
    },
  };
}

export async function getSessionOrNull(headers: Headers): Promise<AuthenticatedSession | null> {
  const result = await getAuth().api.getSession({ headers });
  return result ? projectSession(result) : null;
}

export async function requireSession(headers: Headers): Promise<AuthenticatedSession> {
  const session = await getSessionOrNull(headers);
  if (!session) {
    throw new AuthRequiredError();
  }
  return session;
}
