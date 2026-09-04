import { withdrawPublisherClaim } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import {
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

    const result = await withdrawPublisherClaim(getDb(), {
      claimId,
      requesterUserId: session.user.id,
    });

    return privateJson(result);
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
