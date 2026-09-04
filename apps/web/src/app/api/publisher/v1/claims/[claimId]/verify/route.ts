import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { publisherClaims } from "@themcpdirectory/db";
import { loadWebEnv } from "@themcpdirectory/config";
import {
  PublisherClaimTransitionError,
  beginPublisherClaimVerification,
} from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { encryptPkceVerifierCiphertext, sha256Base64Url } from "../../../_shared/pkce-crypto.js";
import {
  buildGitHubUserAuthorisationUrl,
  parseUuidRouteParam,
  privateJson,
  publisherRouteErrorResponse,
  requirePublisherRouteSession,
} from "../../../_shared/route-helpers.js";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ claimId: string }> },
): Promise<Response> {
  try {
    const session = await requirePublisherRouteSession(request);
    const { claimId: rawClaimId } = await params;
    const claimId = parseUuidRouteParam(rawClaimId, "claimId");
    const env = loadWebEnv();
    const redirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/publisher/v1/claims/verify/callback`;

    // Deriving returnTo from the claim's own server keeps the redirect target trustworthy
    // without accepting a caller-supplied path.
    const [claim] = await getDb()
      .select({ serverId: publisherClaims.serverId })
      .from(publisherClaims)
      .where(eq(publisherClaims.id, claimId))
      .limit(1);
    if (!claim) {
      throw new PublisherClaimTransitionError(claimId, null, "NOT_FOUND");
    }

    const result = await beginPublisherClaimVerification(
      getDb(),
      {
        claimId,
        requesterUserId: session.user.id,
        returnTo: `/dashboard/listings/${claim.serverId}`,
        now: new Date(),
      },
      {
        sha256: sha256Base64Url,
        randomId: () => randomUUID(),
        randomSecret: () => randomBytes(32).toString("base64url"),
        encrypt: (value) => encryptPkceVerifierCiphertext(value, env.BETTER_AUTH_SECRET),
        redirectUri,
        buildUserAuthorisationUrl: ({
          state,
          redirectUri: authorisationRedirectUri,
          codeChallenge,
        }) =>
          buildGitHubUserAuthorisationUrl({
            clientId: env.GITHUB_CLIENT_ID,
            state,
            redirectUri: authorisationRedirectUri,
            codeChallenge,
          }),
      },
    );

    return privateJson({
      claimId: result.claimId,
      redirectUrl: result.redirectUrl,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
