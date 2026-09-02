import { and, sql, type SQL } from "drizzle-orm";
import {
  serverCollectionQuerySchema,
  type PublicServerSort,
  type PublicServerSummary,
} from "@themcpdirectory/api-contract";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  repositorySnapshots,
  serverAliases,
  serverCategories,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { InvalidCursorError } from "./cursor.js";
import { createServerSearchFiltersHash } from "./query-fingerprint.js";
import { mapServerSummaryRow } from "./server-projections.js";
import type {
  SearchServersPageInput,
  SearchServersPageOptions,
  SearchServersPageResult,
  SearchServersPageRow,
  ServerSearchCursorPayload,
} from "./types.js";

export type { PublicServerSummary };
export type { SearchServersPageInput, SearchServersPageOptions, SearchServersPageResult };

const SEARCH_SIMILARITY_THRESHOLD = 0.12;
const CLIENT_SUPPORTED_STATUSES = ["supported", "supported_with_configuration"] as const;

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function latestRepositoryStarsSql() {
  return sql<number | null>`(
    select rs.stars
    from ${repositorySnapshots} rs
    where rs.server_id = ${servers.id}
    order by rs.checked_at desc, rs.id desc
    limit 1
  )`;
}

function latestRepositoryLastPushAtSql() {
  return sql<string | null>`(
    select rs.last_push_at::text
    from ${repositorySnapshots} rs
    where rs.server_id = ${servers.id}
    order by rs.checked_at desc, rs.id desc
    limit 1
  )`;
}

function sortUpdatedAtSql() {
  return sql<string>`coalesce(
    ${latestRepositoryLastPushAtSql()}::timestamptz,
    ${servers.lastSeenAt}
  )::text`;
}

function searchScoreSql(normalizedQuery: string) {
  const exactSlug = sql<number>`case when lower(${servers.slug}::text) = ${normalizedQuery} then 120 else 0 end`;
  const exactTitle = sql<number>`case when lower(${servers.title}) = ${normalizedQuery} then 100 else 0 end`;
  const aliasExact = sql<number>`case when exists (
    select 1
    from ${serverAliases} sa
    where sa.server_id = ${servers.id}
      and lower(sa.alias) = ${normalizedQuery}
  ) then 90 else 0 end`;
  const fts = sql<number>`coalesce(
    ts_rank_cd(${servers.searchDocument}, websearch_to_tsquery('simple', ${normalizedQuery})),
    0
  ) * 40`;
  const trigram = sql<number>`greatest(
    similarity(lower(${servers.slug}::text), ${normalizedQuery}),
    similarity(lower(${servers.title}), ${normalizedQuery}),
    similarity(lower(coalesce(${servers.searchText}, '')), ${normalizedQuery}),
    coalesce((
      select max(similarity(lower(sa.alias), ${normalizedQuery}))
      from ${serverAliases} sa
      where sa.server_id = ${servers.id}
    ), 0)
  ) * 25`;

  return sql<number>`(${fts} + ${exactSlug} + ${exactTitle} + ${aliasExact} + ${trigram})`;
}

function searchPredicate(normalizedQuery: string): SQL {
  return sql`(
    ${servers.searchDocument} @@ websearch_to_tsquery('simple', ${normalizedQuery})
    or similarity(lower(coalesce(${servers.searchText}, '')), ${normalizedQuery}) > ${SEARCH_SIMILARITY_THRESHOLD}
    or lower(${servers.slug}::text) % ${normalizedQuery}
    or lower(${servers.title}) % ${normalizedQuery}
    or exists (
      select 1
      from ${serverAliases} sa
      where sa.server_id = ${servers.id}
        and lower(sa.alias) % ${normalizedQuery}
    )
  )`;
}

function buildOrderBy(sort: PublicServerSort, score: SQL<number>) {
  switch (sort) {
    case "relevance":
      return [
        sql`${score} desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "recent":
      return [
        sql`${servers.firstSeenAt} desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "updated":
      return [
        sql`${sortUpdatedAtSql()}::timestamptz desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "popular":
      return [
        sql`coalesce(${latestRepositoryStarsSql()}, 0) desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "name":
      return [
        sql`lower(${servers.title}) asc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
  }
}

export function buildCursorPredicate(
  sort: PublicServerSort,
  cursor: ServerSearchCursorPayload,
  score: SQL<number>,
): SQL {
  switch (sort) {
    case "relevance":
      return sql`(
        ${score} < ${cursor.primary}
        or (${score} = ${cursor.primary} and lower(${servers.slug}::text) > ${cursor.secondary})
        or (${score} = ${cursor.primary} and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "recent":
      return sql`(
        ${servers.firstSeenAt} < ${cursor.primary}::timestamptz
        or (${servers.firstSeenAt} = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) > ${cursor.secondary})
        or (${servers.firstSeenAt} = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "updated":
      return sql`(
        ${sortUpdatedAtSql()}::timestamptz < ${cursor.primary}::timestamptz
        or (${sortUpdatedAtSql()}::timestamptz = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) > ${cursor.secondary})
        or (${sortUpdatedAtSql()}::timestamptz = ${cursor.primary}::timestamptz and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "popular":
      return sql`(
        coalesce(${latestRepositoryStarsSql()}, 0) < ${cursor.primary}
        or (coalesce(${latestRepositoryStarsSql()}, 0) = ${cursor.primary} and lower(${servers.slug}::text) > ${cursor.secondary})
        or (coalesce(${latestRepositoryStarsSql()}, 0) = ${cursor.primary} and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
    case "name":
      return sql`(
        lower(${servers.title}) > ${cursor.primary}
        or (lower(${servers.title}) = ${cursor.primary} and lower(${servers.slug}::text) > ${cursor.secondary})
        or (lower(${servers.title}) = ${cursor.primary} and lower(${servers.slug}::text) = ${cursor.secondary} and ${servers.id} > ${cursor.serverId})
      )`;
  }
}

export function buildPrimarySortValue(
  sort: PublicServerSort,
  row: SearchServersPageRow,
): string | number | null {
  switch (sort) {
    case "relevance":
      return row.relevanceScore;
    case "recent":
      return row.firstSeenAt;
    case "updated":
      return row.sortUpdatedAt ?? row.firstSeenAt;
    case "popular":
      return row.repositoryStars ?? 0;
    case "name":
      return row.nameSortKey;
  }
}

export async function runSearchServersPageQuery(
  db: Database,
  input: SearchServersPageInput,
  cursor: ServerSearchCursorPayload | null,
  fetchLimit: number,
): Promise<readonly SearchServersPageRow[]> {
  const normalizedQuery = input.q ? normalized(input.q) : null;
  const score = normalizedQuery ? searchScoreSql(normalizedQuery) : sql<number>`0`;
  const where: SQL[] = [sql`${servers.moderationStatus} = 'normal'`];

  if (input.status) {
    where.push(sql`${servers.listingStatus} = ${input.status}`);
  } else {
    where.push(sql`${servers.listingStatus} <> 'deleted_upstream'`);
  }
  if (normalizedQuery) where.push(searchPredicate(normalizedQuery));
  if (input.category) {
    const categorySlug = normalized(input.category);
    where.push(sql`exists (
      select 1
      from ${serverCategories} sc
      inner join ${categories} c on c.id = sc.category_id
      where sc.server_id = ${servers.id}
        and lower(c.slug) = ${categorySlug}
    )`);
  }
  if (input.publisher) {
    where.push(sql`lower(${publishers.slug}::text) = ${normalized(input.publisher)}`);
  }
  if (input.client) {
    where.push(sql`exists (
      select 1
      from ${clientCompatibility} cc
      where cc.server_id = ${servers.id}
        and lower(cc.client_id) = ${normalized(input.client)}
        and cc.status in (${sql.join(
          CLIENT_SUPPORTED_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )})
    )`);
  }
  if (input.transport) {
    const transport = normalized(input.transport);
    where.push(sql`exists (
      select 1
      from ${serverVersions} sv
      left join ${serverPackages} sp on sp.server_version_id = sv.id
      left join ${serverRemotes} sr on sr.server_version_id = sv.id
      where sv.id = ${servers.currentVersionId}
        and (lower(sp.transport_type) = ${transport} or lower(sr.transport_type) = ${transport})
    )`);
  }
  if (input.registryType) {
    const registryType = normalized(input.registryType);
    where.push(sql`exists (
      select 1
      from ${serverVersions} sv
      inner join ${serverPackages} sp on sp.server_version_id = sv.id
      where sv.id = ${servers.currentVersionId}
        and lower(sp.registry_type) = ${registryType}
    )`);
  }
  if (input.verified !== undefined) {
    where.push(
      input.verified
        ? sql`${publishers.verificationState} = 'verified'`
        : sql`coalesce(${publishers.verificationState} = 'verified', false) = false`,
    );
  }
  if (input.openSource !== undefined) {
    where.push(
      input.openSource ? sql`${servers.openSource} is true` : sql`${servers.openSource} is false`,
    );
  }
  if (cursor) where.push(buildCursorPredicate(input.sort, cursor, score));

  return db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      currentVersion: serverVersions.version,
      listingStatus: sql<SearchServersPageRow["listingStatus"]>`${servers.listingStatus}`,
      repositoryUrl: servers.repositoryUrl,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherDisplayName: publishers.displayName,
      publisherVerified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      officialRegistry: sql<boolean>`coalesce(${registrySources.key} = 'official', false)`,
      sourceAvailable: servers.sourceAvailable,
      openSource: servers.openSource,
      firstSeenAt: sql<string>`${servers.firstSeenAt}::text`,
      sortUpdatedAt: sortUpdatedAtSql(),
      repositoryStars: latestRepositoryStarsSql(),
      relevanceScore: normalizedQuery ? score : sql<number | null>`null`,
      nameSortKey: sql<string>`lower(${servers.title})`,
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .leftJoin(serverVersions, sql`${serverVersions.id} = ${servers.currentVersionId}`)
    .leftJoin(registrySources, sql`${registrySources.id} = ${serverVersions.registrySourceId}`)
    .where(and(...where))
    .orderBy(...buildOrderBy(input.sort, score))
    .limit(fetchLimit);
}

export async function searchServersPage(
  db: Database,
  input: SearchServersPageInput,
  options: SearchServersPageOptions,
): Promise<SearchServersPageResult> {
  const parsed = serverCollectionQuerySchema.parse(input);
  const filtersHash = createServerSearchFiltersHash(parsed);
  const cursor = parsed.cursor ? options.cursorCodec.decode(parsed.cursor, filtersHash) : null;
  if (cursor && cursor.sort !== parsed.sort) throw new InvalidCursorError();

  const rows = await runSearchServersPageQuery(db, parsed, cursor, parsed.limit + 1);
  const pageRows = rows.slice(0, parsed.limit);
  const items = pageRows.map(mapServerSummaryRow);
  const lastRow = pageRows.at(-1);
  const nextCursor =
    rows.length > parsed.limit && lastRow
      ? options.cursorCodec.encode({
          version: 1,
          sort: parsed.sort,
          primary: buildPrimarySortValue(parsed.sort, lastRow),
          secondary: lastRow.slug.toLowerCase(),
          serverId: lastRow.id,
          filtersHash,
        })
      : null;

  return { items, nextCursor };
}
