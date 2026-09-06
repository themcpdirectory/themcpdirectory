import type { PublicServerDetail } from "@themcpdirectory/api-contract";
import type { ServerDetail } from "@themcpdirectory/domain";

const INSTALL_CLIENT_LABELS: ReadonlyArray<{
  readonly id: keyof PublicServerDetail["installs"]["clients"];
  readonly label: string;
}> = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
];

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
  readonly installs: PublicServerDetail["installs"];
  readonly publisherWebsiteUrl: string | null;
}

export function ServerDetailHeader({
  detail,
  installs,
  publisherWebsiteUrl,
}: ServerDetailHeaderProps) {
  const showOfficialRegistryBadge =
    detail.registrySourceKey === "official" &&
    detail.currentUpstreamStatus === "active" &&
    detail.listingStatus === "active";
  const installsByClient = INSTALL_CLIENT_LABELS.flatMap(({ id, label }) => {
    const count = installs.clients[id];
    return count > 0 ? [{ count, label }] : [];
  });

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

      <div className="server-detail-installs">
        <p className="server-detail-installs__total">
          {installs.total.toLocaleString("en-US")} CLI-reported{" "}
          {installs.total === 1 ? "install" : "installs"}
        </p>
        {installsByClient.length > 0 && (
          <ul aria-label="CLI-reported installs by client">
            {installsByClient.map(({ count, label }) => (
              <li key={label}>
                <span>{label}</span>
                <span className="server-detail-installs__count">
                  {count.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="server-detail-installs__note">
          Anonymous, abuse-limited reports; not verified unique installations.
        </p>
      </div>
    </header>
  );
}
