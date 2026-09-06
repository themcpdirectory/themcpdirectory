import type { SupportedClientId } from "@themcpdirectory/api-contract";

export type DiscoverySort = "recommended" | "relevance" | "recent" | "updated" | "stars" | "name";

export interface BrowseServersInput {
  readonly query?: string;
  readonly category?: string;
  readonly publisher?: string;
  readonly client?: SupportedClientId;
  readonly transport?: string;
  readonly registryType?: string;
  readonly officialRegistry?: boolean;
  readonly verified?: boolean;
  readonly sourceAvailable?: boolean;
  readonly openSource?: boolean;
  readonly healthy?: boolean;
  readonly sort?: DiscoverySort;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PageInput {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface DiscoveryPublisherSummary {
  readonly slug: string;
  readonly name: string;
  readonly verified: boolean;
}

export interface DiscoveryServer {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly publisher: DiscoveryPublisherSummary | null;
  readonly categorySlugs: readonly string[];
  readonly officialRegistry: boolean;
  readonly sourceAvailable: boolean | null;
  readonly openSource: boolean | null;
  readonly supportedClients: readonly SupportedClientId[];
  readonly transports: readonly string[];
  readonly firstSeenAt: Date;
  readonly updatedAt: Date;
  readonly stars: number | null;
}

export interface BrowseServersResult {
  readonly items: readonly DiscoveryServer[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface SearchSuggestionsInput {
  readonly query: string;
}

export interface SearchSuggestionServer {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
}

export interface SearchSuggestionsResult {
  readonly servers: readonly SearchSuggestionServer[];
  readonly categories: readonly DiscoveryCategorySummary[];
  readonly collections: readonly CollectionSummary[];
}

export interface EcosystemFacts {
  readonly activeServers: number;
  readonly officialServers: number;
  readonly verifiedPublishers: number;
  readonly supportedClientTargets: number;
}

export interface CollectionSummary {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly serverCount: number;
}

export interface CollectionDetail extends CollectionSummary {
  readonly inclusionRule: string;
  readonly items: readonly DiscoveryServer[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface DiscoveryCategorySummary {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly serverCount: number;
}

export interface DiscoverySections {
  readonly recommended: readonly DiscoveryServer[];
  readonly recentlyAdded: readonly DiscoveryServer[];
  readonly collections: readonly CollectionSummary[];
  readonly categories: readonly DiscoveryCategorySummary[];
}

export interface PublicPublisherDetail {
  readonly publisher: {
    readonly slug: string;
    readonly name: string;
    readonly verified: boolean;
    readonly websiteUrl: string | null;
  };
  readonly items: readonly DiscoveryServer[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}
