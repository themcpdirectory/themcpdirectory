import { sql, type SQL } from "drizzle-orm";
import {
  publishers,
  registrySources,
  repositorySnapshots,
  serverAliases,
  serverVersions,
  servers,
} from "@themcpdirectory/db";

export const SEARCH_RANKING_WEIGHTS = {
  exactSlugBoost: 120,
  exactTitleBoost: 100,
  aliasExactBoost: 90,
  ftsMultiplier: 40,
  trigramMultiplier: 25,
  activeVisibleBoost: 4,
  publisherVerifiedBoost: 4,
  maxMetadataCompletenessBoost: 6,
  officialRegistryBoost: 5,
  maintenanceBoost: 3,
} as const;

export const SEARCH_SIMILARITY_THRESHOLD = 0.12;

function metadataCompletenessScoreSql() {
  return sql<number>`(
    (
      case when ${servers.repositoryUrl} is not null then 1 else 0 end +
      case when ${servers.homepageUrl} is not null then 1 else 0 end +
      case when ${servers.documentationUrl} is not null then 1 else 0 end +
      case when ${servers.licenseSpdx} is not null then 1 else 0 end +
      case when ${servers.longDescription} is not null then 1 else 0 end +
      case when ${servers.canonicalRegistryName} is not null then 1 else 0 end
    )::double precision / 6.0
  ) * ${SEARCH_RANKING_WEIGHTS.maxMetadataCompletenessBoost}`;
}

function officialRegistryBoostSql() {
  return sql<number>`case when exists (
    select 1
    from ${serverVersions} sv
    inner join ${registrySources} rs on rs.id = sv.registry_source_id
    where sv.id = ${servers.currentVersionId}
      and rs.key = 'official'
  ) then ${SEARCH_RANKING_WEIGHTS.officialRegistryBoost} else 0 end`;
}

function maintenanceBoostSql() {
  return sql<number>`case when exists (
    select 1
    from ${repositorySnapshots} r
    where r.server_id = ${servers.id}
      and coalesce(r.is_archived, false) = false
      and r.last_push_at >= now() - interval '180 days'
  ) then ${SEARCH_RANKING_WEIGHTS.maintenanceBoost} else 0 end`;
}

function publisherVerifiedBoostSql() {
  return sql<number>`case when ${publishers.verificationState} = 'verified'
    then ${SEARCH_RANKING_WEIGHTS.publisherVerifiedBoost}
    else 0
  end`;
}

export function recommendationScoreSql(): SQL<number> {
  return sql<number>`(
    ${SEARCH_RANKING_WEIGHTS.activeVisibleBoost} +
    ${publisherVerifiedBoostSql()} +
    ${metadataCompletenessScoreSql()} +
    ${officialRegistryBoostSql()} +
    ${maintenanceBoostSql()}
  )`;
}

export function searchScoreSql(normalizedQuery: string): SQL<number> {
  const exactSlug = sql<number>`case when lower(${servers.slug}::text) = ${normalizedQuery}
    then ${SEARCH_RANKING_WEIGHTS.exactSlugBoost} else 0 end`;
  const exactTitle = sql<number>`case when lower(${servers.title}) = ${normalizedQuery}
    then ${SEARCH_RANKING_WEIGHTS.exactTitleBoost} else 0 end`;
  const aliasExact = sql<number>`case when exists (
    select 1
    from ${serverAliases} sa
    where sa.server_id = ${servers.id}
      and lower(sa.alias) = ${normalizedQuery}
  ) then ${SEARCH_RANKING_WEIGHTS.aliasExactBoost} else 0 end`;
  const fts = sql<number>`coalesce(
    ts_rank_cd(${servers.searchDocument}, websearch_to_tsquery('simple', ${normalizedQuery})),
    0
  ) * ${SEARCH_RANKING_WEIGHTS.ftsMultiplier}`;
  const trigram = sql<number>`greatest(
    similarity(lower(${servers.slug}::text), ${normalizedQuery}),
    similarity(lower(${servers.title}), ${normalizedQuery}),
    similarity(lower(coalesce(${servers.searchText}, '')), ${normalizedQuery}),
    coalesce((
      select max(similarity(lower(sa.alias), ${normalizedQuery}))
      from ${serverAliases} sa
      where sa.server_id = ${servers.id}
    ), 0)
  ) * ${SEARCH_RANKING_WEIGHTS.trigramMultiplier}`;

  return sql<number>`(
    ${fts} +
    ${exactSlug} +
    ${exactTitle} +
    ${aliasExact} +
    ${recommendationScoreSql()} +
    ${trigram}
  )`;
}

export function searchPredicateSql(normalizedQuery: string): SQL {
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
