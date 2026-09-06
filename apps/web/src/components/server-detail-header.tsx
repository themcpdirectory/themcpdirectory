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
    <header style={{ marginBottom: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
        <h1
          style={{
            fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {detail.title}
        </h1>

        {showOfficialRegistryBadge && (
          <span
            title="Listed in the Official MCP Registry"
            style={{
              fontSize: "0.6875rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.125rem 0.4rem",
              color: "var(--fg-muted)",
              fontFamily: "var(--font-mono)",
              alignSelf: "center",
              background: "var(--surface-2)",
            }}
          >
            official registry
          </span>
        )}

        <span
          style={{
            fontSize: "0.6875rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.125rem 0.4rem",
            color: detail.listingStatus === "active" ? "var(--success-fg)" : "var(--warn-fg)",
            background: detail.listingStatus === "active" ? "var(--success-bg)" : "var(--warn-bg)",
            alignSelf: "center",
          }}
        >
          {detail.listingStatus}
        </span>
      </div>

      <p
        style={{
          color: "var(--fg-muted)",
          fontSize: "0.9375rem",
          marginTop: "0.5rem",
          lineHeight: 1.5,
        }}
      >
        {detail.shortDescription}
      </p>

      {detail.publisherDisplayName && (
        <p style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", marginTop: "0.375rem" }}>
          Published by{" "}
          {publisherWebsiteUrl ? (
            <a
              href={publisherWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              {detail.publisherDisplayName}
            </a>
          ) : (
            <span>{detail.publisherDisplayName}</span>
          )}
          {detail.publisherVerified && (
            <span
              title="Publisher identity verified"
              style={{
                marginLeft: "0.375rem",
                color: "var(--success-fg)",
                fontSize: "0.75rem",
              }}
            >
              ✓ verified
            </span>
          )}
        </p>
      )}
    </header>
  );
}
