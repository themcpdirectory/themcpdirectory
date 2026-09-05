import { createHmac, randomUUID } from "node:crypto";
import {
  authSessions,
  authUsers,
  publisherClaims,
  publisherMemberships,
  publishers,
  servers,
  createDatabase,
} from "@themcpdirectory/db";
import { and, asc, eq, isNotNull, like } from "drizzle-orm";
import { TEST_BETTER_AUTH_SECRET, TEST_DATABASE_URL } from "./test-database";

/** Better Auth's default cookie prefix + name (see `better-auth/dist/cookies`); not `session_token`. */
const SESSION_COOKIE_NAME = "better-auth.session_token";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface PublisherSessionCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly httpOnly: boolean;
  readonly sameSite: "Lax";
}

export interface SeededPublisherSession {
  readonly userId: string;
  readonly publisherId: string;
  readonly sessionToken: string;
  readonly claimedListingId: string;
  readonly unclaimedListingId: string;
  readonly cookie: PublisherSessionCookie;
}

/**
 * Reproduces better-call's signed-cookie format (`${value}.${base64(HMAC-SHA256)}`,
 * percent-encoded) so a session row inserted directly into the database is
 * accepted by Better Auth's `getSignedCookie` on the next request.
 */
function signSessionToken(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token, "utf8").digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

export async function seedPublisherSession(input: {
  readonly role: "owner" | "admin" | "editor" | "viewer";
}): Promise<SeededPublisherSession> {
  const db = createDatabase(TEST_DATABASE_URL);
  try {
    await db.delete(publishers).where(like(publishers.slug, "fixture-publisher-%"));

    const userId = randomUUID();
    const publisherId = randomUUID();
    const sessionToken = randomUUID();

    await db.insert(authUsers).values({
      id: userId,
      name: "Fixture Owner",
      email: `${userId}@example.test`,
      emailVerified: true,
    });

    await db.insert(publishers).values({
      id: publisherId,
      slug: `fixture-publisher-${publisherId}`,
      displayName: "Fixture Publisher",
    });

    await db.insert(publisherMemberships).values({
      publisherId,
      userId,
      role: input.role,
    });

    await db.insert(authSessions).values({
      token: sessionToken,
      userId,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    });

    const eligibleListings = await db
      .select({ id: servers.id })
      .from(servers)
      .where(and(isNotNull(servers.repositoryExternalId), isNotNull(servers.repositoryUrl)))
      .orderBy(asc(servers.id))
      .limit(2);
    const [claimedListing, unclaimedListing] = eligibleListings;
    if (!claimedListing || !unclaimedListing) {
      throw new Error("Publisher session fixture requires two seeded GitHub listings.");
    }

    await Promise.all([
      db
        .update(servers)
        .set({ repositoryExternalId: "1001" })
        .where(eq(servers.id, claimedListing.id)),
      db
        .update(servers)
        .set({ repositoryExternalId: "1002" })
        .where(eq(servers.id, unclaimedListing.id)),
    ]);

    await db.insert(publisherClaims).values([
      {
        serverId: claimedListing.id,
        publisherId,
        requesterUserId: userId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "1001",
        status: "withdrawn",
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        serverId: claimedListing.id,
        publisherId,
        requesterUserId: userId,
        verificationMethod: "github_repository",
        githubSubjectType: "repository",
        githubSubjectId: "1001",
        status: "pending",
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    return {
      userId,
      publisherId,
      sessionToken,
      claimedListingId: claimedListing.id,
      unclaimedListingId: unclaimedListing.id,
      cookie: {
        name: SESSION_COOKIE_NAME,
        value: signSessionToken(sessionToken, TEST_BETTER_AUTH_SECRET),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    };
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
