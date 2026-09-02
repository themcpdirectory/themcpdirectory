import type { PublicServerSort, SupportedClientId } from "@themcpdirectory/api-contract";

export interface SearchServersPageInput {
  readonly q?: string;
  readonly category?: string;
  readonly publisher?: string;
  readonly client?: SupportedClientId;
  readonly transport?: string;
  readonly registryType?: string;
  readonly verified?: boolean;
  readonly openSource?: boolean;
  readonly status?: "active" | "deprecated" | "deleted_upstream" | "unavailable";
  readonly sort?: PublicServerSort;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ServerSearchCursorPayload {
  readonly version: 1;
  readonly sort: PublicServerSort;
  readonly primary: string | number | null;
  readonly secondary: string | number | null;
  readonly serverId: string;
  readonly filtersHash: string;
}
