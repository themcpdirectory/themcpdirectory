import { createHash } from "node:crypto";
import type { SearchServersPageInput } from "./types.js";

export function createServerSearchFiltersHash(input: SearchServersPageInput): string {
  const canonical = JSON.stringify({
    q: input.q ?? null,
    category: input.category ?? null,
    publisher: input.publisher ?? null,
    client: input.client ?? null,
    transport: input.transport ?? null,
    registryType: input.registryType ?? null,
    verified: input.verified ?? null,
    openSource: input.openSource ?? null,
    status: input.status ?? null,
    sort: input.sort ?? "recent",
  });

  return createHash("sha256").update(canonical).digest("base64url");
}
