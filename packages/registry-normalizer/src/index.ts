import { createHash } from "node:crypto";
import type { RegistryServerResponse } from "@themcpdirectory/registry-client";
import { normalizeHttpUrl } from "@themcpdirectory/security";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface NormalizedRepository {
  url?: string;
  source?: string;
  externalId?: string;
  subfolder?: string;
}

export interface NormalizedIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

export interface NormalizedPackage {
  registryType: string;
  identifier: string;
  transportType: string;
  registryBaseUrl?: string;
  version?: string;
  fileSha256?: string;
  runtimeHint?: string;
  runtimeArguments: Array<Record<string, unknown>>;
  packageArguments: Array<Record<string, unknown>>;
  environmentVariables: Array<Record<string, unknown>>;
}

export interface NormalizedRemote {
  transportType: string;
  headers: Array<Record<string, unknown>>;
  variables: Record<string, unknown>;
  urlTemplate?: string;
}

export interface NormalizedUpstreamState {
  status?: string;
  statusChangedAt?: string;
  statusMessage?: string;
  publishedAt?: string;
  updatedAt?: string;
  isLatest?: boolean;
}

export interface NormalizedRegistryServer {
  canonicalRegistryName: string;
  version: string;
  schemaUri: string;
  description: string;
  packages: NormalizedPackage[];
  remotes: NormalizedRemote[];
  icons: NormalizedIcon[];
  upstream: NormalizedUpstreamState;
  normalizedPayload: RegistryServerResponse;
  payloadHash: string;
  title?: string;
  websiteUrl?: string;
  repository?: NormalizedRepository;
}

export interface CurrentVersionCandidate {
  version: string;
  upstreamStatus?: string;
  publishedAt?: string;
}

type RegistryServer = RegistryServerResponse["server"];
type RegistryPackage = NonNullable<RegistryServer["packages"]>[number];
type RegistryRemote = NonNullable<RegistryServer["remotes"]>[number];
type RegistryIcon = NonNullable<RegistryServer["icons"]>[number];
type OfficialRegistryMeta = NonNullable<
  NonNullable<RegistryServerResponse["_meta"]>["io.modelcontextprotocol.registry/official"]
>;

interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeToCanonical(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeToCanonical(item));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => compareOrdinal(a, b));

    const out: { [key: string]: JsonValue } = {};
    for (const [key, entryValue] of entries) {
      out[key] = normalizeToCanonical(entryValue);
    }
    return out;
  }
  return null;
}

export function hashRegistryPayload(input: unknown): string {
  const canonical = JSON.stringify(normalizeToCanonical(input));
  return createHash("sha256").update(canonical).digest("hex");
}

function parseSemVer(value: string): ParsedSemVer | null {
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    );
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;

  return {
    major,
    minor,
    patch,
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareSemVer(a: ParsedSemVer, b: ParsedSemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  const aEmpty = a.prerelease.length === 0;
  const bEmpty = b.prerelease.length === 0;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const maxLen = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < maxLen; index++) {
    const left = a.prerelease[index];
    const right = b.prerelease[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftNum = /^\d+$/.test(left);
    const rightNum = /^\d+$/.test(right);
    if (leftNum && rightNum) {
      const delta = Number(left) - Number(right);
      if (delta !== 0) return delta;
      continue;
    }
    if (leftNum && !rightNum) return -1;
    if (!leftNum && rightNum) return 1;
    return compareOrdinal(left, right);
  }

  return 0;
}

function parsePublishedAtTimestamp(value: string | undefined): number | null {
  if (value === undefined) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function selectBySemVerWhenComparable<T extends CurrentVersionCandidate>(
  candidates: Array<{ candidate: T; index: number }>,
): T {
  const semverCandidates = candidates.map(({ candidate, index }) => ({
    candidate,
    index,
    semver: parseSemVer(candidate.version),
  }));

  const allSemVer = semverCandidates.every((candidate) => candidate.semver !== null);
  if (!allSemVer) {
    return candidates[0]!.candidate;
  }

  const comparableSemVers = semverCandidates as Array<{
    candidate: T;
    index: number;
    semver: ParsedSemVer;
  }>;

  comparableSemVers.sort((left, right) => {
    const semverCmp = compareSemVer(right.semver, left.semver);
    if (semverCmp !== 0) return semverCmp;
    return left.index - right.index;
  });

  return comparableSemVers[0]!.candidate;
}

export function selectCurrentVersion<T extends CurrentVersionCandidate>(
  versions: readonly T[],
): T | null {
  if (versions.length === 0) return null;

  const activeVersions = versions.filter((version) => version.upstreamStatus === "active");
  const candidates = (activeVersions.length > 0 ? activeVersions : [...versions]).map(
    (candidate, index) => ({ candidate, index }),
  );

  const withTimestamps = candidates.map(({ candidate, index }) => ({
    candidate,
    index,
    timestamp: parsePublishedAtTimestamp(candidate.publishedAt),
  }));
  const validTimestampCandidates = withTimestamps.filter(
    (candidate): candidate is { candidate: T; index: number; timestamp: number } =>
      candidate.timestamp !== null,
  );

  if (validTimestampCandidates.length > 0) {
    let newestTimestamp = validTimestampCandidates[0]!.timestamp;
    for (const candidate of validTimestampCandidates.slice(1)) {
      if (candidate.timestamp > newestTimestamp) {
        newestTimestamp = candidate.timestamp;
      }
    }

    const newestCandidates = validTimestampCandidates
      .filter((candidate) => candidate.timestamp === newestTimestamp)
      .map(({ candidate, index }) => ({ candidate, index }));

    if (newestCandidates.length === 1) {
      return newestCandidates[0]!.candidate;
    }

    return selectBySemVerWhenComparable(newestCandidates);
  }

  return selectBySemVerWhenComparable(candidates);
}

function normalizeRepository(
  repository: RegistryServer["repository"],
): NormalizedRepository | undefined {
  if (!repository) return undefined;
  const url = repository.url === undefined ? null : normalizeHttpUrl(repository.url);
  const normalized: NormalizedRepository = {
    ...(url !== null ? { url } : {}),
    ...(repository.source !== undefined ? { source: repository.source } : {}),
    ...(repository.id !== undefined ? { externalId: repository.id } : {}),
    ...(repository.subfolder !== undefined ? { subfolder: repository.subfolder } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizePackage(pkg: RegistryPackage): NormalizedPackage {
  return {
    registryType: pkg.registryType,
    identifier: pkg.identifier,
    transportType: pkg.transport.type,
    ...(pkg.registryBaseUrl !== undefined ? { registryBaseUrl: pkg.registryBaseUrl } : {}),
    ...(pkg.version !== undefined ? { version: pkg.version } : {}),
    ...(pkg.fileSha256 !== undefined ? { fileSha256: pkg.fileSha256 } : {}),
    ...(pkg.runtimeHint !== undefined ? { runtimeHint: pkg.runtimeHint } : {}),
    runtimeArguments: (pkg.runtimeArguments ?? []).map((arg: Record<string, unknown>) =>
      structuredClone(arg),
    ),
    packageArguments: (pkg.packageArguments ?? []).map((arg: Record<string, unknown>) =>
      structuredClone(arg),
    ),
    environmentVariables: (pkg.environmentVariables ?? []).map((item: Record<string, unknown>) =>
      structuredClone(item),
    ),
  };
}

function normalizeRemote(remote: RegistryRemote): NormalizedRemote {
  return {
    transportType: remote.type,
    ...(remote.url !== undefined ? { urlTemplate: remote.url } : {}),
    headers: (remote.headers ?? []).map((header: Record<string, unknown>) =>
      structuredClone(header),
    ),
    variables: structuredClone(remote.variables ?? {}),
  };
}

function normalizeIcon(icon: RegistryIcon): NormalizedIcon {
  return {
    src: icon.src,
    ...(icon.mimeType !== undefined ? { mimeType: icon.mimeType } : {}),
    ...(icon.sizes !== undefined ? { sizes: structuredClone(icon.sizes) } : {}),
    ...(icon.theme !== undefined ? { theme: icon.theme } : {}),
  };
}

function normalizeUpstreamState(
  upstream: OfficialRegistryMeta | undefined,
): NormalizedUpstreamState {
  if (!upstream) return {};
  return {
    ...(upstream.status !== undefined ? { status: upstream.status } : {}),
    ...(upstream.statusChangedAt !== undefined
      ? { statusChangedAt: upstream.statusChangedAt }
      : {}),
    ...(upstream.statusMessage !== undefined ? { statusMessage: upstream.statusMessage } : {}),
    ...(upstream.publishedAt !== undefined ? { publishedAt: upstream.publishedAt } : {}),
    ...(upstream.updatedAt !== undefined ? { updatedAt: upstream.updatedAt } : {}),
    ...(upstream.isLatest !== undefined ? { isLatest: upstream.isLatest } : {}),
  };
}

export function normalizeRegistryServer(input: RegistryServerResponse): NormalizedRegistryServer {
  const normalizedPayload = structuredClone(input);
  const server = normalizedPayload.server;
  const upstream = normalizeUpstreamState(
    normalizedPayload._meta?.["io.modelcontextprotocol.registry/official"],
  );
  const repository = normalizeRepository(server.repository);
  const websiteUrl = server.websiteUrl === undefined ? null : normalizeHttpUrl(server.websiteUrl);

  return {
    canonicalRegistryName: server.name,
    version: server.version,
    schemaUri: server.$schema,
    description: server.description,
    ...(server.title !== undefined ? { title: server.title } : {}),
    ...(websiteUrl !== null ? { websiteUrl } : {}),
    ...(repository !== undefined ? { repository } : {}),
    icons: (server.icons ?? []).map((icon) => normalizeIcon(icon)),
    packages: (server.packages ?? []).map((pkg) => normalizePackage(pkg)),
    remotes: (server.remotes ?? []).map((remote) => normalizeRemote(remote)),
    upstream,
    normalizedPayload,
    payloadHash: hashRegistryPayload(normalizedPayload),
  };
}
