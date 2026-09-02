import type {
  PublicServerSort,
  PublicServerSummary,
  serverCollectionQuerySchema,
} from "@themcpdirectory/api-contract";
import type { z } from "zod";
import type { createServerSearchCursorCodec } from "./cursor.js";

export type SearchServersPageInput = z.infer<typeof serverCollectionQuerySchema>;

export interface ServerSearchCursorPayload {
  readonly version: 1;
  readonly sort: PublicServerSort;
  readonly primary: string | number | null;
  readonly secondary: string | number | null;
  readonly serverId: string;
  readonly filtersHash: string;
}

export interface SearchServersPageOptions {
  readonly cursorCodec: ReturnType<typeof createServerSearchCursorCodec>;
}

export interface SearchServersPageRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly currentVersion: string | null;
  readonly listingStatus: "active" | "deprecated" | "deleted_upstream" | "unavailable";
  readonly repositoryUrl: string | null;
  readonly publisherSlug: string | null;
  readonly publisherDisplayName: string | null;
  readonly publisherVerified: boolean;
  readonly officialRegistry: boolean;
  readonly sourceAvailable: boolean | null;
  readonly openSource: boolean | null;
  readonly firstSeenAt: string;
  readonly sortUpdatedAt: string | null;
  readonly repositoryStars: number | null;
  readonly relevanceScore: number | null;
  readonly nameSortKey: string;
}

export interface SearchServersPageResult {
  readonly items: readonly PublicServerSummary[];
  readonly nextCursor: string | null;
}
