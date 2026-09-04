import { getPublisherDashboard } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import {
  parseUuidRouteParam,
  privateJson,
  publisherRouteErrorResponse,
  requirePublisherRouteSession,
} from "../_shared/route-helpers.js";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requirePublisherRouteSession(request);
    const url = new URL(request.url);
    const preferredPublisherIdParam = url.searchParams.get("publisherId");
    const preferredPublisherId = preferredPublisherIdParam
      ? parseUuidRouteParam(preferredPublisherIdParam, "publisherId")
      : null;

    const dashboard = await getPublisherDashboard(getDb(), {
      userId: session.user.id,
      preferredPublisherId,
    });

    return privateJson(dashboard);
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
