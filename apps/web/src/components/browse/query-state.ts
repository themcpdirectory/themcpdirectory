import type { SupportedClientId } from "@themcpdirectory/api-contract";
import type { BrowseServersInput } from "@themcpdirectory/domain";
import type { Route } from "next";
import { z } from "zod";

const clientSchema = z.enum(["claude-code", "codex", "cursor", "vscode"]);
const sortSchema = z.enum(["relevance", "recent", "updated", "stars", "name"]);

const normalizedSearchParamsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  publisher: z.string().optional(),
  client: z.string().optional(),
  transport: z.string().optional(),
  registryType: z.string().optional(),
  officialRegistry: z.string().optional(),
  verified: z.string().optional(),
  sourceAvailable: z.string().optional(),
  openSource: z.string().optional(),
  healthy: z.string().optional(),
  sort: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export const BROWSE_PAGE_SIZE = 24;

export const BROWSE_CLIENT_OPTIONS = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code" },
] as const satisfies ReadonlyArray<{ value: SupportedClientId; label: string }>;

export const BROWSE_TRANSPORT_OPTIONS = [
  { value: "stdio", label: "stdio" },
  { value: "streamable-http", label: "Streamable HTTP" },
  { value: "http", label: "HTTP" },
  { value: "sse", label: "SSE" },
] as const;

export const BROWSE_SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "recent", label: "Recently added" },
  { value: "updated", label: "Recently updated" },
  { value: "stars", label: "Most starred" },
  { value: "name", label: "Name" },
] as const;

const TRUE_TOKENS = new Set(["1", "on", "true", "yes"]);

export type BrowseSortValue = (typeof BROWSE_SORT_OPTIONS)[number]["value"];

export interface BrowseQueryState {
  readonly query: string;
  readonly category: string | null;
  readonly publisher: string | null;
  readonly client: SupportedClientId | null;
  readonly transport: string | null;
  readonly registryType: string | null;
  readonly officialRegistry: boolean;
  readonly verified: boolean;
  readonly sourceAvailable: boolean;
  readonly openSource: boolean;
  readonly healthy: boolean;
  readonly sort: BrowseSortValue;
  readonly page: number;
  readonly pageSize: number;
}

export interface BrowseHiddenField {
  readonly name: string;
  readonly value: string;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOptionalText(value: string | undefined, maxLength?: number): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return maxLength === undefined ? normalized : normalized.slice(0, maxLength);
}

function parseBooleanFlag(value: string | undefined): boolean {
  return value !== undefined && TRUE_TOKENS.has(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function getDefaultBrowseSort(query: string): BrowseSortValue {
  return query.trim().length > 0 ? "relevance" : "recent";
}

export function parseBrowseSearchParams(rawSearchParams: RawSearchParams): BrowseQueryState {
  const parsed = normalizedSearchParamsSchema.parse({
    q: firstValue(rawSearchParams.q),
    category: firstValue(rawSearchParams.category),
    publisher: firstValue(rawSearchParams.publisher),
    client: firstValue(rawSearchParams.client),
    transport: firstValue(rawSearchParams.transport),
    registryType: firstValue(rawSearchParams.registryType),
    officialRegistry: firstValue(rawSearchParams.officialRegistry),
    verified: firstValue(rawSearchParams.verified),
    sourceAvailable: firstValue(rawSearchParams.sourceAvailable),
    openSource: firstValue(rawSearchParams.openSource),
    healthy: firstValue(rawSearchParams.healthy),
    sort: firstValue(rawSearchParams.sort),
    page: firstValue(rawSearchParams.page),
    pageSize: firstValue(rawSearchParams.pageSize),
  });

  const query = normalizeOptionalText(parsed.q, 200) ?? "";
  const client = parsed.client ? (clientSchema.safeParse(parsed.client).data ?? null) : null;
  const sort = parsed.sort ? sortSchema.safeParse(parsed.sort).data : undefined;

  return {
    query,
    category: normalizeOptionalText(parsed.category),
    publisher: normalizeOptionalText(parsed.publisher),
    client,
    transport: normalizeOptionalText(parsed.transport),
    registryType: normalizeOptionalText(parsed.registryType),
    officialRegistry: parseBooleanFlag(parsed.officialRegistry),
    verified: parseBooleanFlag(parsed.verified),
    sourceAvailable: parseBooleanFlag(parsed.sourceAvailable),
    openSource: parseBooleanFlag(parsed.openSource),
    healthy: parseBooleanFlag(parsed.healthy),
    sort: sort ?? getDefaultBrowseSort(query),
    page: parsePositiveInteger(parsed.page, 1),
    pageSize: parsePositiveInteger(parsed.pageSize, BROWSE_PAGE_SIZE),
  };
}

export function toBrowseServersInput(state: BrowseQueryState): BrowseServersInput {
  return {
    ...(state.query ? { query: state.query } : {}),
    ...(state.category ? { category: state.category } : {}),
    ...(state.publisher ? { publisher: state.publisher } : {}),
    ...(state.client ? { client: state.client } : {}),
    ...(state.transport ? { transport: state.transport } : {}),
    ...(state.registryType ? { registryType: state.registryType } : {}),
    ...(state.officialRegistry ? { officialRegistry: true } : {}),
    ...(state.verified ? { verified: true } : {}),
    ...(state.sourceAvailable ? { sourceAvailable: true } : {}),
    ...(state.openSource ? { openSource: true } : {}),
    ...(state.healthy ? { healthy: true } : {}),
    sort: state.sort,
    page: state.page,
    pageSize: state.pageSize,
  };
}

function buildEntries(state: BrowseQueryState): BrowseHiddenField[] {
  const entries: BrowseHiddenField[] = [];

  if (state.query) entries.push({ name: "q", value: state.query });
  if (state.category) entries.push({ name: "category", value: state.category });
  if (state.publisher) entries.push({ name: "publisher", value: state.publisher });
  if (state.client) entries.push({ name: "client", value: state.client });
  if (state.transport) entries.push({ name: "transport", value: state.transport });
  if (state.registryType) entries.push({ name: "registryType", value: state.registryType });
  if (state.officialRegistry) entries.push({ name: "officialRegistry", value: "true" });
  if (state.verified) entries.push({ name: "verified", value: "true" });
  if (state.sourceAvailable) entries.push({ name: "sourceAvailable", value: "true" });
  if (state.openSource) entries.push({ name: "openSource", value: "true" });
  if (state.healthy) entries.push({ name: "healthy", value: "true" });
  if (state.sort !== getDefaultBrowseSort(state.query))
    entries.push({ name: "sort", value: state.sort });
  if (state.page > 1) entries.push({ name: "page", value: String(state.page) });
  if (state.pageSize !== BROWSE_PAGE_SIZE)
    entries.push({ name: "pageSize", value: String(state.pageSize) });

  return entries;
}

export function buildBrowseHiddenFields(
  state: BrowseQueryState,
  options: {
    readonly exclude?: readonly string[];
    readonly overrides?: Partial<BrowseQueryState>;
  } = {},
): readonly BrowseHiddenField[] {
  const exclude = new Set(options.exclude ?? []);
  const nextState = { ...state, ...options.overrides } satisfies BrowseQueryState;

  return buildEntries(nextState).filter((entry) => !exclude.has(entry.name));
}

export function buildBrowseHref(
  state: BrowseQueryState,
  overrides: Partial<BrowseQueryState> = {},
): Route {
  const nextState = { ...state, ...overrides } satisfies BrowseQueryState;
  const searchParams = new URLSearchParams();

  for (const entry of buildEntries(nextState)) {
    searchParams.set(entry.name, entry.value);
  }

  const queryString = searchParams.toString();
  return (queryString.length > 0 ? `/browse?${queryString}` : "/browse") as Route;
}

export function countActiveBrowseFilters(state: BrowseQueryState): number {
  return [
    state.category,
    state.publisher,
    state.client,
    state.transport,
    state.registryType,
    state.officialRegistry ? "officialRegistry" : null,
    state.verified ? "verified" : null,
    state.sourceAvailable ? "sourceAvailable" : null,
    state.openSource ? "openSource" : null,
    state.healthy ? "healthy" : null,
  ].filter(Boolean).length;
}

export function resetBrowseFilters(state: BrowseQueryState): BrowseQueryState {
  return {
    ...state,
    category: null,
    publisher: null,
    client: null,
    transport: null,
    registryType: null,
    officialRegistry: false,
    verified: false,
    sourceAvailable: false,
    openSource: false,
    healthy: false,
    page: 1,
  };
}
