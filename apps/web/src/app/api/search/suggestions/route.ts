import { getSearchSuggestions } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";

const SERVER_LIMIT = 5;
const CATEGORY_LIMIT = 3;
const COLLECTION_LIMIT = 3;
const MAX_QUERY_LENGTH = 200;

function normalizeQuery(request: Request): string {
  const url = new URL(request.url);
  const [firstQuery = ""] = url.searchParams.getAll("q");
  return firstQuery.trim().slice(0, MAX_QUERY_LENGTH);
}

export async function GET(request: Request): Promise<Response> {
  const query = normalizeQuery(request);

  if (query.length === 0) {
    return Response.json({ servers: [], categories: [], collections: [] });
  }

  const suggestions = await getSearchSuggestions(getDb(), { query });

  return Response.json({
    servers: suggestions.servers.slice(0, SERVER_LIMIT),
    categories: suggestions.categories.slice(0, CATEGORY_LIMIT),
    collections: suggestions.collections.slice(0, COLLECTION_LIMIT),
  });
}
