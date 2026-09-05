import type {
  PublicClientDetail,
  PublicClientSummary,
  SupportedClientId,
} from "@themcpdirectory/api-contract";
import { getSupportedClientById, SUPPORTED_CLIENTS } from "@themcpdirectory/client-adapters";
import { clientCompatibility, servers, type Database } from "@themcpdirectory/db";
import { searchServersPage, type SearchServersPageOptions } from "@themcpdirectory/search";
import { sql } from "drizzle-orm";

export async function loadClientCompatibilityCounts(
  db: Database,
): Promise<Map<SupportedClientId, number>> {
  const rows = await db.execute<{ clientId: string; serverCount: number }>(sql`
    select effective.client_id as "clientId", count(*)::integer as "serverCount"
    from (
      select distinct on (cc.server_id, lower(cc.client_id))
        cc.server_id,
        lower(cc.client_id) as client_id,
        cc.status
      from ${clientCompatibility} cc
      inner join ${servers} s on s.id = cc.server_id
      where s.moderation_status = 'normal'
        and s.listing_status <> 'deleted_upstream'
      order by
        cc.server_id,
        lower(cc.client_id),
        cc.updated_at desc,
        cc.created_at desc,
        case cc.status
          when 'unsupported' then 0
          when 'supported_with_configuration' then 1
          when 'unknown' then 2
          else 3
        end,
        cc.id asc
    ) effective
    where effective.status in ('supported', 'supported_with_configuration')
    group by effective.client_id
  `);

  const supportedIds = new Set(SUPPORTED_CLIENTS.map((client) => client.id));
  return new Map(
    rows
      .filter((row) => supportedIds.has(row.clientId as SupportedClientId))
      .map((row) => [row.clientId as SupportedClientId, Number(row.serverCount)]),
  );
}

export async function listPublicClients(db: Database): Promise<readonly PublicClientSummary[]> {
  const counts = await loadClientCompatibilityCounts(db);

  return SUPPORTED_CLIENTS.map((client) => ({
    id: client.id,
    name: client.name,
    capabilities: client.capabilities,
    serverCount: counts.get(client.id) ?? 0,
  }));
}

export async function getPublicClientById(
  db: Database,
  input: { id: SupportedClientId; cursor?: string; limit?: number },
  options: SearchServersPageOptions,
): Promise<PublicClientDetail | null> {
  const descriptor = getSupportedClientById(input.id);
  if (!descriptor) return null;

  const page = await searchServersPage(
    db,
    {
      client: descriptor.id,
      sort: "recent",
      limit: input.limit ?? 30,
      cursor: input.cursor,
    },
    options,
  );

  const client = {
    id: descriptor.id,
    name: descriptor.name,
    capabilities: descriptor.capabilities,
  };
  return { client, servers: [...page.items], nextCursor: page.nextCursor };
}
