import type { ServerDetail } from "@themcpdirectory/domain";

export interface ServerDetailHeaderProps {
  readonly detail: Pick<
    ServerDetail,
    | "title"
    | "listingStatus"
    | "registrySourceKey"
    | "currentUpstreamStatus"
    | "shortDescription"
    | "publisherDisplayName"
    | "publisherVerified"
  >;
  readonly publisherWebsiteUrl: string | null;
}

export function ServerDetailHeader({ detail, publisherWebsiteUrl }: ServerDetailHeaderProps) {
  const showOfficialRegistryBadge =
    detail.registrySourceKey === "official" &&
    detail.currentUpstreamStatus === "active" &&
    detail.listingStatus === "active";

  return (
    <header className="detail-header">
      <div className="detail-header__identity">
        <h1 className="page-title">{detail.title}</h1>

        {showOfficialRegistryBadge && (
          <span title="Listed in the Official MCP Registry" className="detail-status-badge">
            official registry
          </span>
        )}

        <span
          className={`detail-status-badge detail-status-badge--${detail.listingStatus === "active" ? "positive" : "warning"}`}
        >
          {detail.listingStatus}
        </span>
      </div>

      <p className="detail-header__description">{detail.shortDescription}</p>

      {detail.publisherDisplayName && (
        <p className="detail-header__publisher">
          Published by{" "}
          {publisherWebsiteUrl ? (
            <a href={publisherWebsiteUrl} target="_blank" rel="noopener noreferrer">
              {detail.publisherDisplayName}
            </a>
          ) : (
            <span>{detail.publisherDisplayName}</span>
          )}
          {detail.publisherVerified && (
            <span title="Publisher identity verified" className="detail-verified">
              ✓ verified
            </span>
          )}
        </p>
      )}
    </header>
  );
}
