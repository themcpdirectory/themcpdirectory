export {
  AmbiguousIdentityError,
  synchronizeRegistryPage,
  type RegistrySyncContext,
  type RegistrySyncSource,
  type SyncPageResult,
} from "./registry/synchronize-registry-page.js";

export {
  SEARCH_RANKING_WEIGHTS,
  getCategoryServers,
  getCategories,
  getHomepageServers,
  getPublicSitemapEntries,
  getServerByIdentifier,
  getServerDetail,
  refreshServerSearchDocument,
  searchServers,
  type CategoryServersInput,
  type CategoryWithCount,
  type DirectoryServerListing,
  type IdentifierMatchType,
  type PublicSitemapEntries,
  type RecommendationQueryInput,
  type RefreshServerSearchDocumentInput,
  type SearchServerResult,
  type SearchServersInput,
  type ServerDetail,
  type ServerIdentifierMatch,
  type ServerPackageDetail,
  type ServerRemoteDetail,
} from "./servers/search.js";

export {
  GitHubEnrichmentServerNotFoundError,
  GitHubRepositoryChangedError,
  GitHubRepositoryIdentityConflictError,
  GitHubRepositoryUrlError,
  enrichGitHubRepository,
  type EnrichGitHubRepositoryOptions,
} from "./github/enrich-github-repository.js";

export {
  GitHubHttpError,
  GitHubRateLimitError,
  GitHubRepositoryUnavailableError,
  GitHubResponseValidationError,
  GitHubTimeoutError,
  fetchGitHubRepository,
  fetchLatestGitHubRelease,
  type GitHubRelease,
  type GitHubRepository,
  type GitHubRequestOptions,
} from "./github/github-client.js";

export {
  getServerDetailBySlug,
  loadServerDetailRow,
  projectEnvironmentVariable,
  projectPublicPackage,
  projectPublicRemote,
  type InstallManifestCompatibility,
  type ServerDetailRow,
  type ServerPackageRow,
  type ServerRemoteRow,
} from "./public-api/server-detail.js";

export {
  AmbiguousServerIdentifierError,
  lookupIdentifierMatches,
  resolveServerIdentifier,
  type AmbiguousServerMatchSummary,
  type IdentifierMatchRow,
} from "./public-api/resolve-server-identifier.js";

export {
  InstallManifestUnavailableError,
  ServerNotFoundError,
  UpstreamDeletedError,
  buildInstallManifest,
  filterVariantsForClient,
  projectPackageVariant,
  projectRemoteVariant,
  type InstallManifestPackageVariant,
  type InstallManifestRemoteVariant,
  type InstallManifestVariant,
} from "./public-api/install-manifest.js";

export { getPublicCategoryBySlug, listPublicCategories } from "./public-api/categories.js";

export { getPublicPublisherBySlug } from "./public-api/publishers.js";

export {
  getPublicClientById,
  listPublicClients,
  loadClientCompatibilityCounts,
} from "./public-api/clients.js";

export {
  decideRemoteProbeEligibility,
  type RemoteProbeEligibilityInput,
  type RemoteProbeEligibilityOptions,
  type RemoteProbeEligibilityResult,
} from "./health/remote-probe-eligibility.js";

export { getLatestRemoteHealthObservation } from "./health/get-latest-remote-health.js";

export {
  runRemoteHealthCheck,
  type ForbiddenStdioSideEffects,
  type PersistedRemoteHealthObservation,
  type RemoteHealthProbeOptions,
  type RunRemoteHealthCheckInput,
} from "./health/run-remote-health-check.js";

export { getCurrentTrustProfile } from "./trust/get-current-trust-profile.js";

export {
  TRUST_SIGNAL_ORDER,
  refreshTrustProfile,
  type RefreshTrustProfileInput,
} from "./trust/refresh-trust-profile.js";

export {
  getPublisherDashboard,
  type PublisherDashboard,
  type PublisherMemberSummary,
  type PublisherMembershipSummary,
} from "./publisher/dashboard.js";

export {
  removePublisherMembership,
  requirePublisherAccess,
  updatePublisherMembershipRole,
} from "./publisher/memberships.js";

export { appendAuditEvent, type AuditEventInput } from "./publisher/audit.js";
