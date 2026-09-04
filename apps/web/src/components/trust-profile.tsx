import type { getServerDetailBySlug } from "@themcpdirectory/domain";

type PublicServerDetail = NonNullable<Awaited<ReturnType<typeof getServerDetailBySlug>>>;

interface TrustProfileProps {
  readonly trustProfile: PublicServerDetail["trustProfile"];
}

export function TrustProfile({ trustProfile }: TrustProfileProps) {
  const facts = [
    [
      "Official registry",
      trustProfile.officialRegistry
        ? "Listed in the Official MCP Registry"
        : "Official Registry listing not available",
    ],
    [
      "Publisher identity",
      trustProfile.publisherVerified
        ? "Publisher verified"
        : "Publisher verification not available",
    ],
    ["Source", factLabel(trustProfile.sourceAvailable, "Available", "Unavailable")],
    ["Open-source license", factLabel(trustProfile.openSource, "Confirmed", "Not confirmed")],
  ] as const;

  return (
    <>
      <dl className="detail-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {trustProfile.signals.length > 0 ? (
        <ul className="trust-signal-list" aria-label="Observed trust signals">
          {trustProfile.signals.map((signal) => (
            <li key={`${signal.key}-${signal.checkedAt ?? "undated"}`}>
              <span className={`trust-signal-state trust-signal-state--${signal.status}`}>
                {signal.status}
              </span>
              <span>{signal.summary ?? signal.key.replaceAll("_", " ")}</span>
              {signal.checkedAt ? (
                <time dateTime={signal.checkedAt}>{formatObservationDate(signal.checkedAt)}</time>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="detail-empty-state">No additional trust signals have been observed.</p>
      )}
    </>
  );
}

function factLabel(value: boolean | null, positive: string, negative: string): string {
  return value === null ? "Unknown" : value ? positive : negative;
}

function formatObservationDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
