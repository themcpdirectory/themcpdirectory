import { loadWebEnv } from "@themcpdirectory/config";
import { completePublisherClaimVerification, createGitHubAppClient } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { getSiteOrigin } from "@/lib/site-url";
import { decryptPkceVerifierCiphertext, sha256Base64Url } from "../../../_shared/pkce-crypto.js";
import {
  parseClaimVerificationCallback,
  publisherRouteErrorResponse,
  requirePublisherCallbackSession,
} from "../../../_shared/route-helpers.js";

export async function GET(request: Request): Promise<Response> {
  try {
    // The GitHub redirect is cross-origin by nature; it is the one documented
    // exception to the same-origin JSON check, but a live session is still required.
    const session = await requirePublisherCallbackSession(request);
    const url = new URL(request.url);
    const callback = parseClaimVerificationCallback(url);
    const env = loadWebEnv();
    const redirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/publisher/v1/claims/verify/callback`;

    const result = await completePublisherClaimVerification(
      getDb(),
      {
        ...callback,
        requesterUserId: session.user.id,
        verifiedAt: new Date(),
      },
      {
        sha256: sha256Base64Url,
        decrypt: (value) => decryptPkceVerifierCiphertext(value, env.BETTER_AUTH_SECRET),
        redirectUri,
        // Explicitly narrowed so BETTER_AUTH_SECRET is never reachable from the GitHub App transport.
        githubApp: createGitHubAppClient({
          GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
          GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
          GITHUB_APP_ID: env.GITHUB_APP_ID,
          GITHUB_APP_PRIVATE_KEY: env.GITHUB_APP_PRIVATE_KEY,
          GITHUB_APP_SLUG: env.GITHUB_APP_SLUG,
        }),
      },
    );

    return new Response(null, {
      status: 303,
      headers: {
        // Always redirect to this app's own canonical origin, never the incoming
        // request's (potentially Host-header-influenced) origin.
        location: new URL(result.returnTo, getSiteOrigin()).toString(),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
