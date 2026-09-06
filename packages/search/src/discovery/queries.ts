import { and, sql, type SQL } from "drizzle-orm";
import { httpUrlSchema, type SupportedClientId } from "@themcpdirectory/api-contract";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  repositorySnapshots,
  serverCategories,
  serverHealthChecks,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import { DISCOVERY_COLLECTIONS, getDiscoveryCollectionBySlug } from "./collections.js";
import type {
  BrowseServersInput,
  BrowseServersResult,
  CollectionDetail,
  CollectionSummary,
  DiscoveryCategorySummary,
  DiscoverySections,
  DiscoveryServer,
  DiscoverySort,
  EcosystemFacts,
  PageInput,
  PublicPublisherDetail,
  SearchSuggestionsInput,
  SearchSuggestionsResult,
} from "./types.js";

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

const SUPPORTED_CLIENT_IDS = ["claude-code", "codex", "cursor", "vscode"] as const;
const SUPPORTED_CLIENT_ID_SET = new Set<SupportedClientId>(SUPPORTED_CLIENT_IDS);
const CLIENT_SUPPORTED_STATUSES = ["supported", "supported_with_configuration"] as const;
const SEARCH_SIMILARITY_THRESHOLD = 0.12;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const HOMEPAGE_SECTION_LIMIT = 6;
const SERVER_SUGGESTION_LIMIT = 5;
const CATEGORY_SUGGESTION_LIMIT = 3;
const COLLECTION_SUGGESTION_LIMIT = 3;
const HEALTH_OUTCOMES = [
  "healthy",
  "degraded",
  "unreachable",
  "timed_out",
  "unsafe_destination",
  "response_too_large",
  "unsupported",
  "unknown",
] as const;

interface DiscoveryBrowseCriteria extends BrowseServersInput {
  readonly requiresRemote?: boolean;
}

interface DiscoveryServerRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly publisherSlug: string | null;
  readonly publisherName: string | null;
  readonly publisherVerified: boolean;
  readonly categorySlugs: readonly string[];
  readonly officialRegistry: boolean;
  readonly sourceAvailable: boolean | null;
  readonly openSource: boolean | null;
  readonly supportedClients: readonly string[];
  readonly transports: readonly string[];
  readonly firstSeenAt: Date;
  readonly updatedAt: Date;
  readonly stars: number | null;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function clampPage(page: number | undefined): number {
  if (page === undefined || !Number.isFinite(page)) return DEFAULT_PAGE;
  return Math.max(1, Math.floor(page));
}

function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)));
}

function normalizeSort(sort: DiscoverySort | undefined, hasQuery: boolean): DiscoverySort {
  if (sort === "relevance" && !hasQuery) return "recommended";
  if (sort) return sort;
  return hasQuery ? "relevance" : "recommended";
}

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
    from ${serverVersions} version
    inner join ${registrySources} source on source.id = version.registry_source_id
    where version.id = ${servers.currentVersionId}
      and source.key = 'official'
  ) then ${SEARCH_RANKING_WEIGHTS.officialRegistryBoost} else 0 end`;
}

function maintenanceBoostSql() {
  return sql<number>`case when exists (
    select 1
    from ${repositorySnapshots} snapshot
    where snapshot.server_id = ${servers.id}
      and coalesce(snapshot.is_archived, false) = false
      and snapshot.last_push_at >= now() - interval '180 days'
  ) then ${SEARCH_RANKING_WEIGHTS.maintenanceBoost} else 0 end`;
}

function publisherVerifiedBoostSql() {
  return sql<number>`case when ${publishers.verificationState} = 'verified'
    then ${SEARCH_RANKING_WEIGHTS.publisherVerifiedBoost}
    else 0
  end`;
}

export function recommendationScoreSql() {
  return sql<number>`(
    ${SEARCH_RANKING_WEIGHTS.activeVisibleBoost} +
    ${publisherVerifiedBoostSql()} +
    ${metadataCompletenessScoreSql()} +
    ${officialRegistryBoostSql()} +
    ${maintenanceBoostSql()}
  )`;
}

export function currentOfficialRegistrySql() {
  return sql<boolean>`exists (
    select 1
    from ${serverVersions} version
    inner join ${registrySources} source on source.id = version.registry_source_id
    where version.id = ${servers.currentVersionId}
      and source.key = 'official'
      and version.upstream_status = 'active'
      and ${servers.listingStatus} = 'active'
  )`;
}

export function visibilityWhereSql() {
  return sql<boolean>`${servers.listingStatus} = 'active' and ${servers.moderationStatus} = 'normal'`;
}

function latestRepositoryStarsSql() {
  return sql<number | null>`(
    select snapshot.stars
    from ${repositorySnapshots} snapshot
    where snapshot.server_id = ${servers.id}
    order by snapshot.checked_at desc, snapshot.id desc
    limit 1
  )`;
}

function latestRepositoryLastPushAtSql() {
  return sql<Date | null>`(
    select snapshot.last_push_at
    from ${repositorySnapshots} snapshot
    where snapshot.server_id = ${servers.id}
    order by snapshot.checked_at desc, snapshot.id desc
    limit 1
  )`;
}

function latestHealthOutcomeSql() {
  return sql<string | null>`(
    select health.status
    from ${serverHealthChecks} health
    where health.server_id = ${servers.id}
      and health.server_version_id = ${servers.currentVersionId}
      and health.check_type = 'remote_probe'
      and health.status in (${sql.join(
        HEALTH_OUTCOMES.map((status) => sql`${status}`),
        sql`, `,
      )})
    order by health.checked_at desc, health.created_at desc, health.id desc
    limit 1
  )`;
}

function updatedAtSql() {
  return sql<Date>`coalesce(${latestRepositoryLastPushAtSql()}, ${servers.lastSeenAt})`;
}

function categorySlugsSql() {
  return sql<readonly string[]>`coalesce((
    select array_agg(distinct category.slug order by category.slug)
    from ${serverCategories} membership
    inner join ${categories} category on category.id = membership.category_id
    where membership.server_id = ${servers.id}
  ), array[]::text[])`;
}

function supportedClientsSql() {
  return sql<readonly string[]>`coalesce((
    select array_agg(effective.client_id order by effective.client_id)
    from (
      select distinct on (lower(cc.client_id))
        lower(cc.client_id) as client_id,
        cc.status
      from ${clientCompatibility} cc
      where cc.server_id = ${servers.id}
        and lower(cc.client_id) in (${sql.join(
          SUPPORTED_CLIENT_IDS.map((clientId) => sql`${clientId}`),
          sql`, `,
        )})
      order by
        lower(cc.client_id),
        cc.checked_at desc nulls last,
        cc.updated_at desc,
        cc.created_at desc,
        cc.id desc
    ) effective
    where effective.status in (${sql.join(
      CLIENT_SUPPORTED_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    )})
  ), array[]::text[])`;
}

function transportsSql() {
  return sql<readonly string[]>`coalesce((
    select array_agg(transport_value.transport order by transport_value.transport)
    from (
      select distinct lower(pkg.transport_type) as transport
      from ${serverPackages} pkg
      where pkg.server_version_id = ${servers.currentVersionId}
      union
      select distinct lower(remote.transport_type) as transport
      from ${serverRemotes} remote
      where remote.server_version_id = ${servers.currentVersionId}
    ) transport_value
  ), array[]::text[])`;
}

function searchScoreSql(normalizedQuery: string) {
  const exactSlug = sql<number>`case when lower(${servers.slug}::text) = ${normalizedQuery} then ${SEARCH_RANKING_WEIGHTS.exactSlugBoost} else 0 end`;
  const exactTitle = sql<number>`case when lower(${servers.title}) = ${normalizedQuery} then ${SEARCH_RANKING_WEIGHTS.exactTitleBoost} else 0 end`;
  const aliasExact = sql<number>`case when exists (
    select 1
    from server_aliases alias
    where alias.server_id = ${servers.id}
      and lower(alias.alias) = ${normalizedQuery}
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
      select max(similarity(lower(alias.alias), ${normalizedQuery}))
      from server_aliases alias
      where alias.server_id = ${servers.id}
    ), 0)
  ) * ${SEARCH_RANKING_WEIGHTS.trigramMultiplier}`;

  return sql<number>`(${fts} + ${exactSlug} + ${exactTitle} + ${aliasExact} + ${trigram})`;
}

function searchPredicate(normalizedQuery: string): SQL<boolean> {
  return sql<boolean>`(
    ${servers.searchDocument} @@ websearch_to_tsquery('simple', ${normalizedQuery})
    or similarity(lower(coalesce(${servers.searchText}, '')), ${normalizedQuery}) > ${SEARCH_SIMILARITY_THRESHOLD}
    or lower(${servers.slug}::text) % ${normalizedQuery}
    or lower(${servers.title}) % ${normalizedQuery}
    or exists (
      select 1
      from server_aliases alias
      where alias.server_id = ${servers.id}
        and lower(alias.alias) % ${normalizedQuery}
    )
  )`;
}

function supportedClientWhereSql(clientId: SupportedClientId): SQL<boolean> {
  const normalizedClientId = clientId.toLowerCase();
  return sql<boolean>`exists (
    select 1
    from ${clientCompatibility} compatibility
    where compatibility.server_id = ${servers.id}
      and lower(compatibility.client_id) = ${normalizedClientId}
      and compatibility.status in (${sql.join(
        CLIENT_SUPPORTED_STATUSES.map((status) => sql`${status}`),
        sql`, `,
      )})
      and compatibility.id = (
        select effective.id
        from ${clientCompatibility} effective
        where effective.server_id = compatibility.server_id
          and lower(effective.client_id) = lower(compatibility.client_id)
        order by
          effective.checked_at desc nulls last,
          effective.updated_at desc,
          effective.created_at desc,
          effective.id desc
        limit 1
      )
  )`;
}

function currentTransportWhereSql(transport: string): SQL<boolean> {
  return sql<boolean>`exists (
    select 1
    from ${serverVersions} version
    left join ${serverPackages} pkg on pkg.server_version_id = version.id
    left join ${serverRemotes} remote on remote.server_version_id = version.id
    where version.id = ${servers.currentVersionId}
      and (lower(pkg.transport_type) = ${transport} or lower(remote.transport_type) = ${transport})
  )`;
}

function currentRegistryTypeWhereSql(registryType: string): SQL<boolean> {
  return sql<boolean>`exists (
    select 1
    from ${serverVersions} version
    inner join ${serverPackages} pkg on pkg.server_version_id = version.id
    where version.id = ${servers.currentVersionId}
      and lower(pkg.registry_type) = ${registryType}
  )`;
}

function requiresRemoteWhereSql(): SQL<boolean> {
  return sql<boolean>`exists (
    select 1
    from ${serverRemotes} remote
    where remote.server_version_id = ${servers.currentVersionId}
  )`;
}

function buildWhere(criteria: DiscoveryBrowseCriteria, normalizedQuery: string | undefined) {
  const whereClauses: SQL<boolean>[] = [visibilityWhereSql()];

  if (normalizedQuery) whereClauses.push(searchPredicate(normalizedQuery));

  const normalizedCategory = normalizeText(criteria.category);
  if (normalizedCategory) {
    whereClauses.push(sql`exists (
      select 1
      from ${serverCategories} membership
      inner join ${categories} category on category.id = membership.category_id
      where membership.server_id = ${servers.id}
        and lower(category.slug) = ${normalizedCategory}
    )`);
  }

  const normalizedPublisher = normalizeText(criteria.publisher);
  if (normalizedPublisher) {
    whereClauses.push(sql`lower(${publishers.slug}::text) = ${normalizedPublisher}`);
  }

  if (criteria.client) whereClauses.push(supportedClientWhereSql(criteria.client));

  const normalizedTransport = normalizeText(criteria.transport);
  if (normalizedTransport) whereClauses.push(currentTransportWhereSql(normalizedTransport));

  const normalizedRegistryType = normalizeText(criteria.registryType);
  if (normalizedRegistryType) {
    whereClauses.push(currentRegistryTypeWhereSql(normalizedRegistryType));
  }

  if (criteria.officialRegistry !== undefined) {
    whereClauses.push(
      criteria.officialRegistry
        ? currentOfficialRegistrySql()
        : sql`not ${currentOfficialRegistrySql()}`,
    );
  }

  if (criteria.verified !== undefined) {
    whereClauses.push(
      criteria.verified
        ? sql`${publishers.verificationState} = 'verified'`
        : sql`coalesce(${publishers.verificationState} = 'verified', false) = false`,
    );
  }

  if (criteria.sourceAvailable !== undefined) {
    whereClauses.push(
      criteria.sourceAvailable
        ? sql`${servers.sourceAvailable} is true`
        : sql`${servers.sourceAvailable} is false`,
    );
  }

  if (criteria.openSource !== undefined) {
    whereClauses.push(
      criteria.openSource
        ? sql`${servers.openSource} is true`
        : sql`${servers.openSource} is false`,
    );
  }

  if (criteria.healthy !== undefined) {
    whereClauses.push(
      criteria.healthy
        ? sql`${latestHealthOutcomeSql()} = 'healthy'`
        : sql`coalesce(${latestHealthOutcomeSql()} = 'healthy', false) = false`,
    );
  }

  if (criteria.requiresRemote) whereClauses.push(requiresRemoteWhereSql());

  return whereClauses;
}

function buildOrderBy(sort: DiscoverySort, score: ReturnType<typeof searchScoreSql>) {
  switch (sort) {
    case "relevance":
      return [
        sql`${score} desc`,
        sql`${recommendationScoreSql()} desc`,
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
        sql`${updatedAtSql()} desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
    case "stars":
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
    case "recommended":
      return [
        sql`${recommendationScoreSql()} desc`,
        sql`lower(${servers.slug}::text) asc`,
        sql`${servers.id} asc`,
      ] as const;
  }
}

function mapDiscoveryServerRow(row: DiscoveryServerRow): DiscoveryServer {
  const supportedClients = row.supportedClients.filter((clientId): clientId is SupportedClientId =>
    SUPPORTED_CLIENT_ID_SET.has(clientId as SupportedClientId),
  );

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription,
    publisher:
      row.publisherSlug && row.publisherName
        ? {
            slug: row.publisherSlug,
            name: row.publisherName,
            verified: row.publisherVerified,
          }
        : null,
    categorySlugs: row.categorySlugs,
    officialRegistry: Boolean(row.officialRegistry),
    sourceAvailable: row.sourceAvailable,
    openSource: row.openSource,
    supportedClients,
    transports: row.transports,
    firstSeenAt: new Date(row.firstSeenAt),
    updatedAt: new Date(row.updatedAt),
    stars: row.stars === null ? null : Number(row.stars),
  };
}

async function browseServersInternal(
  db: Database,
  input: DiscoveryBrowseCriteria = {},
): Promise<BrowseServersResult> {
  const normalizedQuery = normalizeText(input.query);
  const sort = normalizeSort(input.sort, normalizedQuery !== undefined);
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const offset = (page - 1) * pageSize;
  const whereClauses = buildWhere(input, normalizedQuery);
  const score = normalizedQuery ? searchScoreSql(normalizedQuery) : sql<number>`0`;

  const countRows = await db
    .select({ total: sql<number>`count(*)::integer` })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(and(...whereClauses));

  const rows = await db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherName: publishers.displayName,
      publisherVerified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      categorySlugs: categorySlugsSql(),
      officialRegistry: currentOfficialRegistrySql(),
      sourceAvailable: servers.sourceAvailable,
      openSource: servers.openSource,
      supportedClients: supportedClientsSql(),
      transports: transportsSql(),
      firstSeenAt: servers.firstSeenAt,
      updatedAt: updatedAtSql(),
      stars: latestRepositoryStarsSql(),
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(and(...whereClauses))
    .orderBy(...buildOrderBy(sort, score))
    .limit(pageSize)
    .offset(offset);

  const parsedTotal = Number(countRows[0]?.total ?? 0);
  return {
    items: rows.map(mapDiscoveryServerRow),
    page,
    pageSize,
    total: parsedTotal,
    totalPages: parsedTotal === 0 ? 0 : Math.ceil(parsedTotal / pageSize),
  };
}

async function listActiveCategories(db: Database): Promise<readonly DiscoveryCategorySummary[]> {
  const rows = await db
    .select({
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      sortOrder: categories.sortOrder,
      serverCount: sql<number>`count(distinct ${servers.id})::integer`,
    })
    .from(categories)
    .innerJoin(serverCategories, sql`${serverCategories.categoryId} = ${categories.id}`)
    .innerJoin(
      servers,
      sql`${servers.id} = ${serverCategories.serverId} and ${visibilityWhereSql()}`,
    )
    .groupBy(
      categories.id,
      categories.slug,
      categories.name,
      categories.description,
      categories.sortOrder,
    )
    .orderBy(categories.sortOrder, categories.slug);

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    serverCount: Number(row.serverCount),
  }));
}

export async function browseServers(
  db: Database,
  input: BrowseServersInput = {},
): Promise<BrowseServersResult> {
  return browseServersInternal(db, input);
}

export async function getEcosystemFacts(db: Database): Promise<EcosystemFacts> {
  const [[activeRow], [officialRow], [verifiedRow]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(servers)
      .where(visibilityWhereSql()),
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(servers)
      .where(and(visibilityWhereSql(), currentOfficialRegistrySql())),
    db
      .select({ count: sql<number>`count(distinct ${publishers.id})::integer` })
      .from(publishers)
      .innerJoin(servers, sql`${servers.publisherId} = ${publishers.id}`)
      .where(and(visibilityWhereSql(), sql`${publishers.verificationState} = 'verified'`)),
  ]);

  return {
    activeServers: Number(activeRow?.count ?? 0),
    officialServers: Number(officialRow?.count ?? 0),
    verifiedPublishers: Number(verifiedRow?.count ?? 0),
    supportedClientTargets: SUPPORTED_CLIENT_IDS.length,
  };
}

export async function getDiscoverySections(db: Database): Promise<DiscoverySections> {
  const [recommended, recentlyAdded, collections, categories] = await Promise.all([
    browseServersInternal(db, { sort: "recommended", page: 1, pageSize: HOMEPAGE_SECTION_LIMIT }),
    browseServersInternal(db, { sort: "recent", page: 1, pageSize: HOMEPAGE_SECTION_LIMIT }),
    getVisibleCollections(db),
    listActiveCategories(db),
  ]);

  return {
    recommended: recommended.items,
    recentlyAdded: recentlyAdded.items,
    collections,
    categories,
  };
}

export async function getSearchSuggestions(
  db: Database,
  input: SearchSuggestionsInput,
): Promise<SearchSuggestionsResult> {
  const query = input.query.trim();
  if (query.length === 0) {
    return {
      servers: [],
      categories: [],
      collections: [],
    };
  }

  const normalizedQuery = query.toLowerCase();
  const { searchServers } = await import("../index.js");
  const [serverResults, categories, collections] = await Promise.all([
    searchServers(db, {
      query,
      limit: SERVER_SUGGESTION_LIMIT,
      offset: 0,
    }),
    listActiveCategories(db),
    getVisibleCollections(db),
  ]);

  return {
    servers: serverResults.slice(0, SERVER_SUGGESTION_LIMIT).map((server) => ({
      id: server.id,
      slug: server.slug,
      title: server.title,
      shortDescription: server.shortDescription,
    })),
    categories: categories
      .filter((category) => {
        const haystack =
          `${category.slug} ${category.name} ${category.description ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, CATEGORY_SUGGESTION_LIMIT),
    collections: collections
      .filter((collection) => {
        const haystack =
          `${collection.slug} ${collection.name} ${collection.description}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, COLLECTION_SUGGESTION_LIMIT),
  };
}

export async function getRelatedServers(
  db: Database,
  slug: string,
  limit = HOMEPAGE_SECTION_LIMIT,
): Promise<readonly DiscoveryServer[]> {
  const normalizedSlug = normalizeText(slug);
  if (!normalizedSlug) return [];

  const [subject] = await db
    .select({ id: servers.id, publisherId: servers.publisherId })
    .from(servers)
    .where(and(visibilityWhereSql(), sql`lower(${servers.slug}::text) = ${normalizedSlug}`))
    .limit(1);
  if (!subject) return [];

  const subjectCategories = await db
    .select({ categoryId: serverCategories.categoryId })
    .from(serverCategories)
    .where(sql`${serverCategories.serverId} = ${subject.id}`);

  const categoryIds = subjectCategories.map((row) => row.categoryId);
  if (categoryIds.length === 0 && !subject.publisherId) return [];

  const sharedCategoryCountSql =
    categoryIds.length === 0
      ? sql<number>`0`
      : sql<number>`(
          select count(distinct membership.category_id)::integer
          from ${serverCategories} membership
          where membership.server_id = ${servers.id}
            and membership.category_id in (${sql.join(
              categoryIds.map((categoryId) => sql`${categoryId}`),
              sql`, `,
            )})
        )`;
  const samePublisherSql = subject.publisherId
    ? sql<boolean>`coalesce(${servers.publisherId} = ${subject.publisherId}, false)`
    : sql<boolean>`false`;

  const rows = await db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherName: publishers.displayName,
      publisherVerified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      categorySlugs: categorySlugsSql(),
      officialRegistry: currentOfficialRegistrySql(),
      sourceAvailable: servers.sourceAvailable,
      openSource: servers.openSource,
      supportedClients: supportedClientsSql(),
      transports: transportsSql(),
      firstSeenAt: servers.firstSeenAt,
      updatedAt: updatedAtSql(),
      stars: latestRepositoryStarsSql(),
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(
      and(
        visibilityWhereSql(),
        sql`${servers.id} <> ${subject.id}`,
        sql`(${sharedCategoryCountSql} > 0 or ${samePublisherSql})`,
      ),
    )
    .orderBy(
      sql`${sharedCategoryCountSql} desc`,
      sql`${samePublisherSql} desc`,
      sql`${recommendationScoreSql()} desc`,
      sql`lower(${servers.slug}::text) asc`,
      sql`${servers.id} asc`,
    )
    .limit(Math.max(1, Math.floor(limit)));

  return rows.map(mapDiscoveryServerRow);
}

export async function getVisibleCollections(db: Database): Promise<readonly CollectionSummary[]> {
  const collections = await Promise.all(
    DISCOVERY_COLLECTIONS.map(async (definition) => {
      const result = await browseServersInternal(db, {
        ...definition.browse,
        page: 1,
        pageSize: 1,
        ...(definition.requiresRemote ? { requiresRemote: true } : {}),
      });

      if (result.total === 0) return null;

      return {
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        serverCount: result.total,
      } satisfies CollectionSummary;
    }),
  );

  return collections.filter((collection): collection is CollectionSummary => collection !== null);
}

export async function getCollection(
  db: Database,
  slug: string,
  input: PageInput = {},
): Promise<CollectionDetail | null> {
  const definition = getDiscoveryCollectionBySlug(slug);
  if (!definition) return null;

  const page = await browseServersInternal(db, {
    ...definition.browse,
    ...(input.page !== undefined ? { page: input.page } : {}),
    ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
    ...(definition.requiresRemote ? { requiresRemote: true } : {}),
  });

  if (page.total === 0) return null;

  return {
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    inclusionRule: definition.inclusionRule,
    serverCount: page.total,
    items: page.items,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages,
  };
}

export async function getPublicPublisher(
  db: Database,
  slug: string,
): Promise<PublicPublisherDetail | null> {
  const normalizedSlug = normalizeText(slug);
  if (!normalizedSlug) return null;

  const [row] = await db
    .select({
      slug: sql<string>`${publishers.slug}::text`,
      name: publishers.displayName,
      verified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      websiteUrl: publishers.websiteUrl,
    })
    .from(publishers)
    .where(sql`lower(${publishers.slug}::text) = ${normalizedSlug}`)
    .limit(1);
  if (!row) return null;

  const page = await browseServersInternal(db, {
    publisher: row.slug,
    sort: "recommended",
  });
  if (page.total === 0) return null;

  const websiteUrl = httpUrlSchema.safeParse(row.websiteUrl);

  return {
    publisher: {
      slug: row.slug,
      name: row.name,
      verified: Boolean(row.verified),
      websiteUrl: websiteUrl.success ? websiteUrl.data : null,
    },
    items: page.items,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages,
  };
}
