import type { SupportedClientId } from "@themcpdirectory/api-contract";
import type { BrowseServersInput } from "./types.js";

export interface DiscoveryCollectionDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inclusionRule: string;
  readonly browse: BrowseServersInput;
  readonly requiresRemote?: boolean;
}

const CLIENT_COLLECTIONS: readonly {
  readonly id: SupportedClientId;
  readonly name: string;
}[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "cursor", name: "Cursor" },
  { id: "vscode", name: "VS Code" },
] as const;

const BASE_COLLECTIONS: readonly DiscoveryCollectionDefinition[] = [
  {
    slug: "official-registry-essentials",
    name: "Official Registry essentials",
    description: "Active Official Registry listings in recommendation order.",
    inclusionRule:
      "Active, normally moderated listings whose current version is from the Official Registry.",
    browse: { officialRegistry: true, sort: "recommended" },
  },
  {
    slug: "recently-added",
    name: "Recently added",
    description: "Newest active listings ordered by first discovery time.",
    inclusionRule: "Active, normally moderated listings ordered by firstSeenAt descending.",
    browse: { sort: "recent" },
  },
  {
    slug: "remote-mcps",
    name: "Remote MCPs",
    description: "Current versions that expose at least one remote endpoint.",
    inclusionRule:
      "Active, normally moderated listings whose current version defines at least one remote endpoint.",
    browse: { sort: "recommended" },
    requiresRemote: true,
  },
  {
    slug: "open-source",
    name: "Open source",
    description: "Listings that explicitly publish open-source availability.",
    inclusionRule: "Active, normally moderated listings with openSource set to true.",
    browse: { openSource: true, sort: "recommended" },
  },
  {
    slug: "source-available",
    name: "Source available",
    description: "Listings that explicitly expose their source code.",
    inclusionRule: "Active, normally moderated listings with sourceAvailable set to true.",
    browse: { sourceAvailable: true, sort: "recommended" },
  },
] as const;

export const DISCOVERY_COLLECTIONS: readonly DiscoveryCollectionDefinition[] = [
  ...BASE_COLLECTIONS,
  ...CLIENT_COLLECTIONS.map(
    (client) =>
      ({
        slug: `works-with-${client.id}`,
        name: `Works with ${client.name}`,
        description: `Listings whose latest compatibility observation supports ${client.name}.`,
        inclusionRule:
          `Active, normally moderated listings whose latest compatibility observation for ${client.name} is supported or supported_with_configuration.`,
        browse: { client: client.id, sort: "recommended" as const },
      }) satisfies DiscoveryCollectionDefinition,
  ),
] as const;

export function getDiscoveryCollectionBySlug(
  slug: string,
): DiscoveryCollectionDefinition | undefined {
  const normalizedSlug = slug.trim().toLowerCase();
  return DISCOVERY_COLLECTIONS.find((collection) => collection.slug === normalizedSlug);
}