import { PUBLISHER_CAPABILITY_MATRIX, PUBLISHER_ROLES } from "@themcpdirectory/auth";
import {
  ACCOUNT_ERASURE_STATUSES,
  PUBLISHER_CLAIM_STATUSES,
  type PublisherClaimStatus,
} from "@themcpdirectory/domain";
import type { ReleaseDocument } from "@/content/document-model";

const CLAIM_STATUS_DESCRIPTIONS = {
  pending: "The claim exists and verification has not started.",
  verifying: "The separate GitHub App authorization flow is in progress.",
  verified: "Ownership evidence was accepted and publisher access was granted.",
  rejected: "Verification evidence was rejected.",
  withdrawn: "The requester withdrew the claim.",
  superseded: "A newer verified claim replaced this claim.",
  revoked:
    "The claim was stopped by the system before verification was completed, or previously verified authority was removed.",
} as const satisfies Record<PublisherClaimStatus, string>;

export function getPublisherDocument(): ReleaseDocument {
  return {
    title: "Publisher reference",
    description:
      "Dashboard access, publisher roles, claim states, account export, and account erasure.",
    sections: [
      {
        id: "dashboard-access",
        heading: "Dashboard access",
        body: [
          "The authenticated publisher dashboard is available at /dashboard.",
          "Visible publishers and available actions are derived from the signed-in user's memberships; GitHub sign-in establishes identity but does not grant publisher authority.",
        ],
      },
      {
        id: "roles-and-capabilities",
        heading: "Roles and capabilities",
        body: PUBLISHER_ROLES.map(
          (role) => `${role}: ${PUBLISHER_CAPABILITY_MATRIX[role].join(", ")}`,
        ),
      },
      {
        id: "claim-statuses",
        heading: "Claim statuses",
        body: PUBLISHER_CLAIM_STATUSES.map(
          (status) => `${status}: ${CLAIM_STATUS_DESCRIPTIONS[status]}`,
        ),
      },
      {
        id: "claim-verification",
        heading: "Claim verification",
        body: [
          "For an established publisher, owners and admins can manage claims. Editors and viewers cannot.",
          "A signed-in user can bootstrap a publisher with no memberships and manage that claim while they remain its original requester.",
          "Repository and organization claims use a separate GitHub App authorization flow with one-time state; provider tokens are not stored as publisher authority.",
        ],
      },
      {
        id: "account-data",
        heading: "Account data",
        body: [
          "POST /api/publisher/v1/account/export returns a private JSON attachment containing the account profile, publisher memberships, claims, and account audit summaries; provider credentials are excluded.",
          "POST /api/publisher/v1/account/erasure accepts successor assignments and creates a persisted erasure request with HTTP 202.",
          `Erasure request statuses: ${ACCOUNT_ERASURE_STATUSES.join(", ")}.`,
          "Active legal holds can block erasure. Publisher ownership is transferred to an eligible successor or locked for manual review before local account data is removed.",
        ],
      },
    ],
  };
}