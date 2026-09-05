import { buildAccountExport } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import {
  privateJson,
  publisherRouteErrorResponse,
  requirePublisherRouteSession,
} from "../../_shared/route-helpers.js";

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requirePublisherRouteSession(request);
    const accountExport = await buildAccountExport(getDb(), session.user.id);

    return privateJson(accountExport, {
      headers: { "content-disposition": 'attachment; filename="account-export.json"' },
    });
  } catch (error) {
    return publisherRouteErrorResponse(error);
  }
}
