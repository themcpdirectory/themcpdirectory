import { sql } from "drizzle-orm";
import {
  categories,
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

export { InvalidCursorError, createServerSearchCursorCodec } from "./public-api/cursor.js";
export { createServerSearchFiltersHash } from "./public-api/query-fingerprint.js";
export {
  buildCursorPredicate,
  buildPrimarySortValue,
  runSearchServersPageQuery,
  searchServersPage,
} from "./public-api/search-servers-page.js";
export type { PublicServerSummary } from "./public-api/search-servers-page.js";
export type {
  SearchServersPageInput,
  SearchServersPageOptions,
  SearchServersPageResult,
  SearchServersPageRow,
  ServerSearchCursorPayload,
} from "./public-api/types.js";

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

const SEARCH_SIMILARITY_THRESHOLD = 0.12;

type QueryDatabase = Pick<Database, "select" | "execute">;

export interface SearchServersInput {
  readonly query: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SearchServerResult {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly canonicalRegistryName: string | null;
  readonly isOfficialRegistry: boolean;
  readonly publisherDisplayName: string | null;
  readonly publisherSlug: string | null;
  readonly categorySlugs: readonly string[];
  readonly aliases: readonly string[];
  readonly score: number;
}

export interface RefreshServerSearchDocumentInput {
  readonly serverId?: string;
}

export interface RecommendationQueryInput {
  readonly limit?: number;
  readonly offset?: number;
}

export interface CategoryServersInput extends RecommendationQueryInput {
  readonly categorySlug: string;
}

export interface DirectoryServerListing {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly canonicalRegistryName: string | null;
  readonly isOfficialRegistry: boolean;
  readonly publisherDisplayName: string | null;
  readonly publisherSlug: string | null;
  readonly categorySlugs: readonly string[];
  readonly recommendationScore: number;
}

export type IdentifierMatchType =
  "slug" | "alias" | "canonical_registry_name" | "package_identifier";

export interface ServerIdentifierMatch {
  readonly server: DirectoryServerListing;
  readonly canonicalSlug: string;
  readonly matchedBy: IdentifierMatchType;
  readonly matchedValue: string;
  readonly needsRedirect: boolean;
}

export class AmbiguousServerIdentifierError extends Error {
  readonly identifier: string;
  readonly matchedBy: IdentifierMatchType;

  constructor(identifier: string, matchedBy: IdentifierMatchType, matches: number) {
    super(`Ambiguous identifier '${identifier}' matched ${matches} servers via ${matchedBy}.`);
    this.name = "AmbiguousServerIdentifierError";
    this.identifier = identifier;
    this.matchedBy = matchedBy;
  }
}

function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function normalizeIdentifier(input: string): string {
  return normalizeWhitespace(input).toLowerCase();
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return 20;
  if (!Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
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
		from ${serverVersions} sv
		inner join ${registrySources} rs on rs.id = sv.registry_source_id
		where sv.id = ${servers.currentVersionId}
			and rs.key = 'official'
	) then ${SEARCH_RANKING_WEIGHTS.officialRegistryBoost} else 0 end`;
}

function isCurrentOfficialRegistrySql() {
  return sql<boolean>`exists (
		select 1
		from ${serverVersions} sv
		inner join ${registrySources} rs on rs.id = sv.registry_source_id
		where sv.id = ${servers.currentVersionId}
			and rs.key = 'official'
			and sv.upstream_status = 'active'
			and ${servers.listingStatus} = 'active'
	)`;
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

function categorySlugsSql() {
  return sql<readonly string[]>`coalesce((
		select array_agg(distinct c.slug order by c.slug)
		from ${serverCategories} sc
		inner join ${categories} c on c.id = sc.category_id
		where sc.server_id = ${servers.id}
	), array[]::text[])`;
}

function aliasesSql() {
  return sql<readonly string[]>`coalesce((
		select array_agg(distinct sa.alias order by sa.alias)
		from ${serverAliases} sa
		where sa.server_id = ${servers.id}
	), array[]::text[])`;
}

function recommendationScoreSql() {
  return sql<number>`(
		${SEARCH_RANKING_WEIGHTS.activeVisibleBoost} +
		${publisherVerifiedBoostSql()} +
		${metadataCompletenessScoreSql()} +
		${officialRegistryBoostSql()} +
		${maintenanceBoostSql()}
	)`;
}

function publicListingColumns() {
  return {
    id: servers.id,
    slug: sql<string>`${servers.slug}::text`,
    title: servers.title,
    shortDescription: servers.shortDescription,
    canonicalRegistryName: servers.canonicalRegistryName,
    isOfficialRegistry: isCurrentOfficialRegistrySql(),
    publisherDisplayName: publishers.displayName,
    publisherSlug: sql<string | null>`${publishers.slug}::text`,
    categorySlugs: categorySlugsSql(),
    recommendationScore: recommendationScoreSql(),
  };
}

function mapListingRow(row: {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  canonicalRegistryName: string | null;
  isOfficialRegistry: boolean;
  publisherDisplayName: string | null;
  publisherSlug: string | null;
  categorySlugs: readonly string[];
  recommendationScore: number;
}): DirectoryServerListing {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription,
    canonicalRegistryName: row.canonicalRegistryName,
    isOfficialRegistry: Boolean(row.isOfficialRegistry),
    publisherDisplayName: row.publisherDisplayName,
    publisherSlug: row.publisherSlug,
    categorySlugs: row.categorySlugs,
    recommendationScore: Number(row.recommendationScore),
  };
}

function searchScoreSql(normalizedQuery: string) {
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

function visibilityWhereSql() {
  return sql<boolean>`${servers.listingStatus} = 'active' and ${servers.moderationStatus} = 'normal'`;
}

export async function refreshServerSearchDocument(
  db: QueryDatabase,
  input?: RefreshServerSearchDocumentInput,
): Promise<void> {
  const scopedWhere = input?.serverId !== undefined ? sql`where s.id = ${input.serverId}` : sql``;

  await db.execute(sql`
		with target as (
			select s.id
			from ${servers} s
			${scopedWhere}
		),
		assembled as (
			select
				s.id,
				trim(regexp_replace(lower(concat_ws(' ',
					s.title,
					s.slug::text,
					s.short_description,
					coalesce(s.long_description, ''),
					coalesce(s.canonical_registry_name, ''),
					coalesce(p.display_name, ''),
					coalesce(p.slug::text, ''),
					coalesce((
						select string_agg(distinct lower(sa.alias), ' ' order by lower(sa.alias))
						from ${serverAliases} sa
						where sa.server_id = s.id
					), ''),
					coalesce((
						select string_agg(distinct lower(sp.identifier), ' ' order by lower(sp.identifier))
						from ${serverVersions} sv
						inner join ${serverPackages} sp on sp.server_version_id = sv.id
						where sv.id = s.current_version_id
					), ''),
					coalesce((
						select string_agg(distinct lower(c.slug || ' ' || c.name), ' ' order by lower(c.slug || ' ' || c.name))
						from ${serverCategories} sc
						inner join ${categories} c on c.id = sc.category_id
						where sc.server_id = s.id
					), '')
				)), '\\s+', ' ', 'g')) as computed_search_text
			from ${servers} s
			inner join target t on t.id = s.id
			left join ${publishers} p on p.id = s.publisher_id
		)
		update ${servers} s
		set
			search_text = a.computed_search_text,
			search_document = to_tsvector('simple', a.computed_search_text),
			updated_at = s.updated_at
		from assembled a
		where s.id = a.id
			and (
				s.search_text is distinct from a.computed_search_text
				or s.search_document is distinct from to_tsvector('simple', a.computed_search_text)
			)
	`);
}

export async function searchServers(
  db: QueryDatabase,
  input: SearchServersInput,
): Promise<readonly SearchServerResult[]> {
  const normalizedQuery = normalizeIdentifier(input.query);
  if (normalizedQuery.length === 0) return [];

  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const score = searchScoreSql(normalizedQuery);

  const rows = await db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      canonicalRegistryName: servers.canonicalRegistryName,
      isOfficialRegistry: isCurrentOfficialRegistrySql(),
      publisherDisplayName: publishers.displayName,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      categorySlugs: categorySlugsSql(),
      aliases: aliasesSql(),
      score,
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(
      sql`
			${visibilityWhereSql()}
			and (
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
			)
		`,
    )
    .orderBy(sql`${score} desc`, sql`${servers.slug} asc`, sql`${servers.id} asc`)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription,
    canonicalRegistryName: row.canonicalRegistryName,
    isOfficialRegistry: Boolean(row.isOfficialRegistry),
    publisherDisplayName: row.publisherDisplayName,
    publisherSlug: row.publisherSlug,
    categorySlugs: row.categorySlugs,
    aliases: row.aliases,
    score: Number(row.score),
  }));
}

export async function getHomepageServers(
  db: QueryDatabase,
  input: RecommendationQueryInput = {},
): Promise<readonly DirectoryServerListing[]> {
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const rows = await db
    .select(publicListingColumns())
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(visibilityWhereSql())
    .orderBy(
      sql`${recommendationScoreSql()} desc`,
      sql`${servers.slug} asc`,
      sql`${servers.id} asc`,
    )
    .limit(limit)
    .offset(offset);

  return rows.map(mapListingRow);
}

export async function getCategoryServers(
  db: QueryDatabase,
  input: CategoryServersInput,
): Promise<readonly DirectoryServerListing[]> {
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const normalizedCategory = normalizeIdentifier(input.categorySlug);

  const rows = await db
    .select(publicListingColumns())
    .from(servers)
    .innerJoin(serverCategories, sql`${serverCategories.serverId} = ${servers.id}`)
    .innerJoin(categories, sql`${categories.id} = ${serverCategories.categoryId}`)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(sql`${visibilityWhereSql()} and lower(${categories.slug}) = ${normalizedCategory}`)
    .groupBy(
      servers.id,
      servers.slug,
      servers.title,
      servers.shortDescription,
      servers.canonicalRegistryName,
      publishers.displayName,
      publishers.slug,
      publishers.verificationState,
      servers.repositoryUrl,
      servers.homepageUrl,
      servers.documentationUrl,
      servers.licenseSpdx,
      servers.longDescription,
      servers.currentVersionId,
    )
    .orderBy(
      sql`${recommendationScoreSql()} desc`,
      sql`${servers.slug} asc`,
      sql`${servers.id} asc`,
    )
    .limit(limit)
    .offset(offset);

  return rows.map(mapListingRow);
}

function directLookupWhereSql(identifier: string) {
  return sql<boolean>`lower(${servers.slug}::text) = ${identifier}
		and ${servers.moderationStatus} not in ('hidden', 'blocked')`;
}

async function resolveSingleDirectLookup(
  db: QueryDatabase,
  identifier: string,
): Promise<ServerIdentifierMatch | null> {
  const rows = await db
    .select(publicListingColumns())
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(directLookupWhereSql(identifier))
    .limit(2);

  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new AmbiguousServerIdentifierError(identifier, "slug", rows.length);
  }

  const row = rows[0];
  if (!row) return null;
  const server = mapListingRow(row);
  return {
    server,
    canonicalSlug: server.slug,
    matchedBy: "slug",
    matchedValue: identifier,
    needsRedirect: false,
  };
}

async function resolveAliasLookup(
  db: QueryDatabase,
  identifier: string,
): Promise<ServerIdentifierMatch | null> {
  const rows = await db
    .select({
      ...publicListingColumns(),
      matchedAlias: serverAliases.alias,
    })
    .from(serverAliases)
    .innerJoin(servers, sql`${servers.id} = ${serverAliases.serverId}`)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(
      sql`
			lower(${serverAliases.alias}) = ${identifier}
			and ${servers.moderationStatus} not in ('hidden', 'blocked')
		`,
    )
    .limit(2);

  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new AmbiguousServerIdentifierError(identifier, "alias", rows.length);
  }

  const row = rows[0];
  if (!row) return null;
  const server = mapListingRow(row);
  return {
    server,
    canonicalSlug: server.slug,
    matchedBy: "alias",
    matchedValue: row.matchedAlias,
    needsRedirect: true,
  };
}

async function resolveCanonicalRegistryLookup(
  db: QueryDatabase,
  identifier: string,
): Promise<ServerIdentifierMatch | null> {
  const rows = await db
    .select(publicListingColumns())
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(
      sql`
			lower(${servers.canonicalRegistryName}) = ${identifier}
			and ${servers.moderationStatus} not in ('hidden', 'blocked')
		`,
    )
    .limit(2);

  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new AmbiguousServerIdentifierError(identifier, "canonical_registry_name", rows.length);
  }

  const row = rows[0];
  if (!row) return null;
  const server = mapListingRow(row);
  return {
    server,
    canonicalSlug: server.slug,
    matchedBy: "canonical_registry_name",
    matchedValue: identifier,
    needsRedirect: true,
  };
}

async function resolvePackageLookup(
  db: QueryDatabase,
  identifier: string,
): Promise<ServerIdentifierMatch | null> {
  const rows = await db
    .select(publicListingColumns())
    .from(servers)
    .innerJoin(serverVersions, sql`${serverVersions.serverId} = ${servers.id}`)
    .innerJoin(serverPackages, sql`${serverPackages.serverVersionId} = ${serverVersions.id}`)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .where(
      sql`
			lower(${serverPackages.identifier}) = ${identifier}
			and ${servers.moderationStatus} not in ('hidden', 'blocked')
		`,
    )
    .groupBy(
      servers.id,
      servers.slug,
      servers.title,
      servers.shortDescription,
      servers.canonicalRegistryName,
      publishers.displayName,
      publishers.slug,
      publishers.verificationState,
      servers.repositoryUrl,
      servers.homepageUrl,
      servers.documentationUrl,
      servers.licenseSpdx,
      servers.longDescription,
      servers.currentVersionId,
    )
    .limit(2);

  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new AmbiguousServerIdentifierError(identifier, "package_identifier", rows.length);
  }

  const row = rows[0];
  if (!row) return null;
  const server = mapListingRow(row);
  return {
    server,
    canonicalSlug: server.slug,
    matchedBy: "package_identifier",
    matchedValue: identifier,
    needsRedirect: true,
  };
}

export interface ServerPackageDetail {
  readonly id: string;
  readonly registryType: string;
  readonly identifier: string;
  readonly version: string | null;
  readonly runtimeHint: string | null;
  readonly transportType: string;
  readonly environmentVariables: unknown;
}

export interface ServerRemoteDetail {
  readonly id: string;
  readonly transportType: string;
  readonly urlTemplate: string;
  readonly variables: unknown;
  readonly headers: unknown;
}

export interface ServerDetail {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly longDescription: string | null;
  readonly canonicalRegistryName: string | null;
  readonly listingStatus: string;
  readonly repositoryUrl: string | null;
  readonly homepageUrl: string | null;
  readonly documentationUrl: string | null;
  readonly licenseSpdx: string | null;
  readonly sourceAvailable: boolean | null;
  readonly openSource: boolean | null;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly publisherDisplayName: string | null;
  readonly publisherSlug: string | null;
  readonly publisherVerified: boolean;
  readonly publisherWebsiteUrl: string | null;
  readonly currentVersion: string | null;
  readonly registrySourceKey: string | null;
  readonly currentUpstreamStatus: string | null;
  readonly packages: readonly ServerPackageDetail[];
  readonly remotes: readonly ServerRemoteDetail[];
  readonly aliases: readonly string[];
  readonly categorySlugs: readonly string[];
  readonly categoryNames: readonly string[];
}

export async function getServerDetail(
  db: QueryDatabase,
  slug: string,
): Promise<ServerDetail | null> {
  const normalized = normalizeIdentifier(slug);
  if (normalized.length === 0) return null;

  const rows = await db
    .select({
      id: servers.id,
      slug: sql<string>`${servers.slug}::text`,
      title: servers.title,
      shortDescription: servers.shortDescription,
      longDescription: servers.longDescription,
      canonicalRegistryName: servers.canonicalRegistryName,
      listingStatus: servers.listingStatus,
      repositoryUrl: servers.repositoryUrl,
      homepageUrl: servers.homepageUrl,
      documentationUrl: servers.documentationUrl,
      licenseSpdx: servers.licenseSpdx,
      sourceAvailable: servers.sourceAvailable,
      openSource: servers.openSource,
      firstSeenAt: servers.firstSeenAt,
      lastSeenAt: servers.lastSeenAt,
      currentVersionId: servers.currentVersionId,
      publisherDisplayName: publishers.displayName,
      publisherSlug: sql<string | null>`${publishers.slug}::text`,
      publisherVerified: sql<boolean>`${publishers.verificationState} = 'verified'`,
      publisherWebsiteUrl: publishers.websiteUrl,
      currentVersion: serverVersions.version,
      registrySourceKey: registrySources.key,
      currentUpstreamStatus: serverVersions.upstreamStatus,
    })
    .from(servers)
    .leftJoin(publishers, sql`${publishers.id} = ${servers.publisherId}`)
    .leftJoin(serverVersions, sql`${serverVersions.id} = ${servers.currentVersionId}`)
    .leftJoin(registrySources, sql`${registrySources.id} = ${serverVersions.registrySourceId}`)
    .where(
      sql`lower(${servers.slug}::text) = ${normalized} and ${servers.moderationStatus} not in ('hidden', 'blocked')`,
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const packages = row.currentVersionId
    ? await db
        .select({
          id: serverPackages.id,
          registryType: serverPackages.registryType,
          identifier: serverPackages.identifier,
          version: serverPackages.version,
          runtimeHint: serverPackages.runtimeHint,
          transportType: serverPackages.transportType,
          environmentVariables: serverPackages.environmentVariables,
        })
        .from(serverPackages)
        .where(sql`${serverPackages.serverVersionId} = ${row.currentVersionId}`)
        .orderBy(serverPackages.id)
    : [];

  const remotes = row.currentVersionId
    ? await db
        .select({
          id: serverRemotes.id,
          transportType: serverRemotes.transportType,
          urlTemplate: serverRemotes.urlTemplate,
          variables: serverRemotes.variables,
          headers: serverRemotes.headers,
        })
        .from(serverRemotes)
        .where(sql`${serverRemotes.serverVersionId} = ${row.currentVersionId}`)
        .orderBy(serverRemotes.id)
    : [];

  const aliasRows = await db
    .select({ alias: serverAliases.alias })
    .from(serverAliases)
    .where(sql`${serverAliases.serverId} = ${row.id}`)
    .orderBy(serverAliases.alias);

  const categoryRows = await db
    .select({ slug: categories.slug, name: categories.name })
    .from(serverCategories)
    .innerJoin(categories, sql`${categories.id} = ${serverCategories.categoryId}`)
    .where(sql`${serverCategories.serverId} = ${row.id}`)
    .orderBy(categories.sortOrder);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    canonicalRegistryName: row.canonicalRegistryName,
    listingStatus: row.listingStatus,
    repositoryUrl: row.repositoryUrl,
    homepageUrl: row.homepageUrl,
    documentationUrl: row.documentationUrl,
    licenseSpdx: row.licenseSpdx,
    sourceAvailable: row.sourceAvailable,
    openSource: row.openSource,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    publisherDisplayName: row.publisherDisplayName,
    publisherSlug: row.publisherSlug,
    publisherVerified: Boolean(row.publisherVerified),
    publisherWebsiteUrl: row.publisherWebsiteUrl,
    currentVersion: row.currentVersion,
    registrySourceKey: row.registrySourceKey,
    currentUpstreamStatus: row.currentUpstreamStatus,
    packages: packages.map((pkg) => ({
      id: pkg.id,
      registryType: pkg.registryType,
      identifier: pkg.identifier,
      version: pkg.version,
      runtimeHint: pkg.runtimeHint,
      transportType: pkg.transportType,
      environmentVariables: pkg.environmentVariables,
    })),
    remotes: remotes.map((remote) => ({
      id: remote.id,
      transportType: remote.transportType,
      urlTemplate: remote.urlTemplate,
      variables: remote.variables,
      headers: remote.headers,
    })),
    aliases: aliasRows.map(({ alias }) => alias),
    categorySlugs: categoryRows.map(({ slug: categorySlug }) => categorySlug),
    categoryNames: categoryRows.map(({ name }) => name),
  };
}

export interface CategoryWithCount {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly serverCount: number;
}

export interface PublicSitemapEntries {
  readonly serverSlugs: readonly string[];
  readonly categorySlugs: readonly string[];
}

export async function getCategories(db: QueryDatabase): Promise<readonly CategoryWithCount[]> {
  const rows = await db
    .select({
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      sortOrder: categories.sortOrder,
      serverCount: sql<number>`count(distinct ${servers.id})::integer`,
    })
    .from(categories)
    .leftJoin(serverCategories, sql`${serverCategories.categoryId} = ${categories.id}`)
    .leftJoin(
      servers,
      sql`${servers.id} = ${serverCategories.serverId} and ${servers.listingStatus} = 'active' and ${servers.moderationStatus} = 'normal'`,
    )
    .groupBy(
      categories.id,
      categories.slug,
      categories.name,
      categories.description,
      categories.sortOrder,
    )
    .orderBy(categories.sortOrder);

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    serverCount: Number(row.serverCount),
  }));
}

export async function getPublicSitemapEntries(db: QueryDatabase): Promise<PublicSitemapEntries> {
  const serverRows = await db
    .select({ slug: sql<string>`${servers.slug}::text` })
    .from(servers)
    .where(visibilityWhereSql())
    .orderBy(servers.slug);

  const categoryRows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .innerJoin(serverCategories, sql`${serverCategories.categoryId} = ${categories.id}`)
    .innerJoin(servers, sql`${servers.id} = ${serverCategories.serverId}`)
    .where(visibilityWhereSql())
    .groupBy(categories.slug)
    .orderBy(categories.slug);

  return {
    serverSlugs: serverRows.map(({ slug: serverSlug }) => serverSlug),
    categorySlugs: categoryRows.map(({ slug: categorySlug }) => categorySlug),
  };
}

export async function getServerByIdentifier(
  db: QueryDatabase,
  identifier: string,
): Promise<ServerIdentifierMatch | null> {
  const normalized = normalizeIdentifier(identifier);
  if (normalized.length === 0) return null;

  const direct = await resolveSingleDirectLookup(db, normalized);
  if (direct) return direct;

  const alias = await resolveAliasLookup(db, normalized);
  if (alias) return alias;

  const canonical = await resolveCanonicalRegistryLookup(db, normalized);
  if (canonical) return canonical;

  return resolvePackageLookup(db, normalized);
}
