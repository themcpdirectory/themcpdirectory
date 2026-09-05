import { z } from "zod";
import { requestAccountErasure } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import {
  parseWithSchema,
  privateJson,
  publisherRouteErrorResponse,
  requirePublisherRouteSession,
} from "../../_shared/route-helpers.js";

const erasureBodySchema = z.object({
  successorAssignments: z
    .array(
      z.object({
        publisherId: z.uuid(),
        successorUserId: z.uuid(),
      }),
    )
    .max(50),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requirePublisherRouteSession(request);
    const body = parseWithSchema(erasureBodySchema, await request.json());
    const result = await requestAccountErasure(getDb(), {
      userId: session.user.id,
      successorAssignments: body.successorAssignments,
      requestedAt: new Date(),
    });

    return privateJson(result, { status: 202 });
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}