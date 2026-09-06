import type { getServerDetailBySlug } from "@themcpdirectory/domain";
import { HealthObservation } from "./health-observation";
import { TrustProfile } from "./trust-profile";

type PublicServerDetail = NonNullable<Awaited<ReturnType<typeof getServerDetailBySlug>>>;
type Compatibility = PublicServerDetail["compatibility"];
type CompatibilityStatus = NonNullable<Compatibility["cursor"]>;

const CLIENT_ORDER: ReadonlyArray<{ readonly id: keyof Compatibility; readonly label: string }> = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
];

const COMPATIBILITY_STATUS_LABELS: Record<CompatibilityStatus, string> = {
  supported: "Supported",
  supported_with_configuration: "Supported with configuration",
  unsupported: "Not supported",
  unknown: "Not observed",
};

interface ServerEvidenceSummaryProps {
  readonly trustProfile: PublicServerDetail["trustProfile"];
  readonly health: PublicServerDetail["latestHealth"];
  readonly compatibility: Compatibility;
}

export function ServerEvidenceSummary({
  trustProfile,
  health,
  compatibility,
}: ServerEvidenceSummaryProps) {
  const observedClients = CLIENT_ORDER.flatMap(({ id, label }) => {
    const status = compatibility[id];
    return status ? [{ label, status }] : [];
  });

  return (
    <div className="detail-observations">
      <section className="detail-observation" aria-labelledby="trust-profile-heading">
        <h2 id="trust-profile-heading">Trust profile</h2>
        <TrustProfile trustProfile={trustProfile} />
      </section>

      <section className="detail-observation" aria-labelledby="health-observation-heading">
        <h2 id="health-observation-heading">Latest remote health</h2>
        <HealthObservation health={health} />
      </section>

      <section className="detail-observation" aria-labelledby="supported-clients-heading">
        <h2 id="supported-clients-heading">Supported clients</h2>
        {observedClients.length > 0 ? (
          <dl className="detail-facts">
            {observedClients.map(({ label, status }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{COMPATIBILITY_STATUS_LABELS[status]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="detail-empty-state">No client compatibility has been observed.</p>
        )}
      </section>
    </div>
  );
}
