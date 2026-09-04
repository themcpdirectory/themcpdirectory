import type { PublicServerSummary } from "@themcpdirectory/api-contract";
import type { SearchServersPageRow } from "./types.js";

export function mapServerSummaryRow(row: SearchServersPageRow): PublicServerSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.shortDescription,
    publisher:
      row.publisherSlug && row.publisherDisplayName
        ? {
            slug: row.publisherSlug,
            name: row.publisherDisplayName,
            verified: row.publisherVerified,
          }
        : null,
    version: row.currentVersion,
    repository: row.repositoryUrl ? { url: row.repositoryUrl } : null,
    listingStatus: row.listingStatus,
    publisherVerified: row.publisherVerified,
    latestHealthOutcome: row.latestHealthOutcome,
    installAvailability:
      row.listingStatus === "deleted_upstream"
        ? "upstream_deleted"
        : row.currentVersionId === null
          ? "install_unavailable"
          : "available",
    signals: {
      officialRegistry: row.officialRegistry,
      publisherVerified: row.publisherVerified,
      sourceAvailable: row.sourceAvailable,
      openSource: row.openSource,
    },
  };
}
