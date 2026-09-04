import { z } from "zod";
import type { PublisherRole } from "@themcpdirectory/auth";
import { updatePublisherMembershipRole } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import {
  parseUuidRouteParam,
  parseWithSchema,
  privateJson,
  publisherRouteErrorResponse,
  requirePublisherRouteSession,
} from "../../_shared/route-helpers.js";

const PUBLISHER_ROLES = [
  "owner",
  "admin",
  "editor",
  "viewer",
] as const satisfies readonly PublisherRole[];

const updateMembershipBodySchema = z.object({
  role: z.enum(PUBLISHER_ROLES),
});

function parseUpdateMembershipBody(value: unknown): { readonly role: PublisherRole } {
  return parseWithSchema(updateMembershipBodySchema, value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
): Promise<Response> {
  try {
    const session = await requirePublisherRouteSession(request);
    const { membershipId: rawMembershipId } = await params;
    const membershipId = parseUuidRouteParam(rawMembershipId, "membershipId");
    const body = parseUpdateMembershipBody(await request.json());

    const member = await updatePublisherMembershipRole(getDb(), {
      actorUserId: session.user.id,
      membershipId,
      nextRole: body.role,
    });

    return privateJson(member);
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
