import { z } from "zod";
import { createPublisherClaim } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import {
  parseWithSchema,
  privateJson,
  publisherRouteErrorResponse,
  requirePublisherRouteSession,
} from "../_shared/route-helpers.js";

const VERIFICATION_METHODS = ["github_repository", "github_organization"] as const;

const createClaimBodySchema = z.object({
  serverId: z.uuid(),
  publisherId: z.uuid(),
  verificationMethod: z.enum(VERIFICATION_METHODS),
});

type CreateClaimBody = z.infer<typeof createClaimBodySchema>;

function parseCreateClaimBody(value: unknown): CreateClaimBody {
  return parseWithSchema(createClaimBodySchema, value);
}

export async function POST(
  request: Request,
  _context?: { params: Promise<Record<string, never>> },
): Promise<Response> {
  try {
    const session = await requirePublisherRouteSession(request);
    const payload = parseCreateClaimBody(await request.json());

    const result = await createPublisherClaim(getDb(), {
      requesterUserId: session.user.id,
      serverId: payload.serverId,
      publisherId: payload.publisherId,
      verificationMethod: payload.verificationMethod,
    });

    return privateJson({ claimId: result.claimId, status: result.status }, { status: 201 });
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
