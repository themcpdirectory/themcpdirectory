import type { getServerDetailBySlug } from "@themcpdirectory/domain";

type PublicServerDetail = NonNullable<Awaited<ReturnType<typeof getServerDetailBySlug>>>;
type HealthObservation = NonNullable<PublicServerDetail["latestHealth"]>;

const HEALTH_OUTCOME_COPY: Record<
  HealthObservation["outcome"],
  { sentence: string; label: string }
> = {
  healthy: { sentence: "Remote responded", label: "Healthy response" },
  degraded: { sentence: "Remote responded with a degraded result", label: "Degraded response" },
  unreachable: { sentence: "Remote could not be reached", label: "Unreachable" },
  timed_out: { sentence: "Remote probe timed out", label: "Timed out" },
  unsafe_destination: {
    sentence: "Remote probe was blocked by destination safety checks",
    label: "Probe blocked by destination safety checks",
  },
  response_too_large: {
    sentence: "Remote response exceeded the probe limit",
    label: "Response exceeded probe limit",
  },
  unsupported: {
    sentence: "Remote could not be probed with a supported method",
    label: "Unsupported probe method",
  },
  unknown: { sentence: "Remote probe returned an unknown result", label: "Unknown result" },
};

interface HealthObservationProps {
  readonly health: PublicServerDetail["latestHealth"];
}

export function HealthObservation({ health }: HealthObservationProps) {
  if (!health) {
    return <p className="detail-empty-state">No remote health observation is available.</p>;
  }

  const observedOn = formatObservationDate(health.checkedAt);
  const outcomeCopy = HEALTH_OUTCOME_COPY[health.outcome];
  const responseDetails = [
    `${health.durationMs.toLocaleString("en-US")} ms`,
    health.httpStatus === null ? null : `HTTP ${health.httpStatus}`,
  ].filter((detail): detail is string => detail !== null);

  return (
    <div className="health-observation">
      <p>
        {outcomeCopy.sentence} on <time dateTime={health.checkedAt}>{observedOn}</time>
        {responseDetails.length > 0 ? ` (${responseDetails.join(", ")})` : ""}.
      </p>
      <dl className="detail-facts">
        <div>
          <dt>Outcome</dt>
          <dd>{outcomeCopy.label}</dd>
        </div>
        <div>
          <dt>Redirects</dt>
          <dd>{health.redirectCount}</dd>
        </div>
        {health.finalOrigin ? (
          <div>
            <dt>Final origin</dt>
            <dd className="detail-breakable">{health.finalOrigin}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function formatObservationDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
