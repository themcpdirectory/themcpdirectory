import {
  HealthCheckOutcomeSchema,
  PUBLIC_API_ERROR_DEFINITIONS,
  TrustSignalKeySchema,
  TrustSignalStateSchema,
  listingStatusSchema,
  type HealthCheckOutcome,
  type TrustSignalState,
} from "@themcpdirectory/api-contract";
import type { ReleaseDocument } from "@/content/document-model";

const HEALTH_OUTCOME_DESCRIPTIONS = {
  healthy: "The endpoint responded successfully.",
  degraded: "The endpoint responded, but the observation was not fully healthy.",
  unreachable: "A network connection could not be established.",
  timed_out: "The bounded health check exceeded its deadline.",
  unsafe_destination: "The target or a redirect failed destination safety checks.",
  response_too_large: "The response exceeded the bounded read limit.",
  unsupported: "The listing cannot be probed with the supported remote health method.",
  unknown: "No conclusive remote health outcome is available.",
} as const satisfies Record<HealthCheckOutcome, string>;

const TRUST_STATE_DESCRIPTIONS = {
  positive: "Evidence supports the named signal.",
  neutral: "The observation is factual without a positive or negative conclusion.",
  warning: "The observation needs attention.",
  negative: "Evidence does not support the named signal.",
  unknown: "The evidence is absent or inconclusive.",
} as const satisfies Record<TrustSignalState, string>;

export function getTrustDocument(): ReleaseDocument {
  const deletedUpstream = listingStatusSchema.parse("deleted_upstream");
  const upstreamDeletedError = PUBLIC_API_ERROR_DEFINITIONS.UPSTREAM_DELETED;

  return {
    title: "Trust and health",
    description:
      "Factual trust signals, bounded remote health observations, and upstream-deletion behavior.",
    sections: [
      {
        id: "trust-model",
        heading: "Trust model",
        body: [
          "Trust signals are factual, independently observed indicators with a source and observation time.",
          "No aggregate trust score is emitted, and a signal is not a certification or endorsement.",
        ],
      },
      {
        id: "signal-keys",
        heading: "Signal keys",
        body: TrustSignalKeySchema.options,
      },
      {
        id: "signal-states",
        heading: "Signal states",
        body: TrustSignalStateSchema.options.map(
          (state) => `${state}: ${TRUST_STATE_DESCRIPTIONS[state]}`,
        ),
      },
      {
        id: "health-outcomes",
        heading: "Health outcomes",
        body: HealthCheckOutcomeSchema.options.map(
          (outcome) => `${outcome}: ${HEALTH_OUTCOME_DESCRIPTIONS[outcome]}`,
        ),
      },
      {
        id: "upstream-deletion",
        heading: "Upstream deletion",
        body: [
          `${deletedUpstream} listings remain visible on detail pages so their historical state is explicit.`,
          `Install requests fail with ${upstreamDeletedError.status} UPSTREAM_DELETED: ${upstreamDeletedError.message}.`,
        ],
      },
    ],
  };
}