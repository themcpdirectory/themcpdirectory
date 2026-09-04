"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublisherDashboard } from "@themcpdirectory/domain";
import { authClient } from "@/lib/auth-client";
import { ClaimForm } from "./claim-form";
import { ErrorSummary } from "./error-summary";
import { MemberTable } from "./member-table";
import { PublisherSwitcher } from "./publisher-switcher";

interface DashboardShellProps {
  readonly dashboard: PublisherDashboard;
}

type DashboardClaim = NonNullable<PublisherDashboard["activePublisher"]>["claims"][number];

function claimGuidance(claim: DashboardClaim): string {
  if (claim.requiresManualReview) {
    return "Another open claim exists for this listing. Verification is paused for manual review.";
  }
  if (claim.status === "pending") return "Ready for GitHub verification.";
  if (claim.status === "verifying") return "Verification was started but has not completed.";
  if (claim.status === "verified") return "Publisher control is verified.";
  if (claim.status === "withdrawn") return "This claim was withdrawn.";
  if (claim.status === "rejected") return "Verification was rejected. Submit a new claim to retry.";
  if (claim.status === "revoked") return "Verification has been revoked.";
  return "This claim is no longer active.";
}

export function DashboardShell({ dashboard }: DashboardShellProps) {
  const router = useRouter();
  const { viewer, memberships, activePublisher } = dashboard;
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [claimErrors, setClaimErrors] = useState<readonly string[]>([]);

  async function readError(response: Response, fallback: string): Promise<string> {
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      return payload.error?.message ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function verifyClaim(claimId: string) {
    setPendingClaimId(claimId);
    setClaimErrors([]);
    try {
      const response = await fetch(`/api/publisher/v1/claims/${claimId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setClaimErrors([await readError(response, "Unable to start claim verification.")]);
        return;
      }
      const payload = (await response.json()) as { redirectUrl?: string };
      if (!payload.redirectUrl) {
        throw new Error("Missing verification redirect.");
      }
      window.location.assign(payload.redirectUrl);
    } catch {
      setClaimErrors(["Unable to start claim verification. Check your connection and try again."]);
    } finally {
      setPendingClaimId(null);
    }
  }

  async function withdrawClaim(claimId: string) {
    if (!window.confirm("Withdraw this claim? You will need to submit a new claim to continue.")) {
      return;
    }

    setPendingClaimId(claimId);
    setClaimErrors([]);
    try {
      const response = await fetch(`/api/publisher/v1/claims/${claimId}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setClaimErrors([await readError(response, "Unable to withdraw this claim.")]);
        return;
      }
      window.location.reload();
    } catch {
      setClaimErrors(["Unable to withdraw this claim. Check your connection and try again."]);
    } finally {
      setPendingClaimId(null);
    }
  }

  return (
    <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <header className="publisher-dashboard-header">
        <div>
          <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem", fontWeight: 700 }}>
            Publisher dashboard
          </h1>
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "0.875rem" }}>
            Signed in as {viewer.name ?? viewer.email ?? "you"}
          </p>
        </div>
        <button
          type="button"
          className="publisher-action publisher-secondary-action"
          onClick={() => {
            void authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  router.push("/");
                  router.refresh();
                },
              },
            });
          }}
        >
          Sign out
        </button>
      </header>

      {memberships.length > 1 && (
        <PublisherSwitcher
          memberships={memberships}
          activePublisherId={activePublisher?.id ?? null}
        />
      )}

      {activePublisher ? (
        <div style={{ display: "grid", gap: "2rem" }}>
          <section aria-labelledby="claims-heading" className="publisher-panel">
            <h2 id="claims-heading" style={{ margin: "0 0 0.75rem", fontSize: "1.0625rem" }}>
              Claimed listings
            </h2>
            {activePublisher.claims.length === 0 ? (
              <p className="detail-empty-state">No listings claimed yet.</p>
            ) : (
              <>
                <ErrorSummary id="claim-list-error-summary" errors={claimErrors} />
                <ul className="publisher-claim-list">
                {activePublisher.claims.map((claim) => (
                  <li key={claim.claimId}>
                    <div className="publisher-claim-heading">
                      <Link href={`/dashboard/listings/${claim.serverId}`}>
                        {claim.serverTitle}
                      </Link>
                      <span className="trust-signal-state">{claim.status}</span>
                    </div>
                    <p>{claimGuidance(claim)}</p>
                    {activePublisher.capabilities.includes("claims.manage") &&
                      !claim.requiresManualReview &&
                      (claim.status === "pending" || claim.status === "verifying") && (
                        <div className="publisher-claim-actions">
                          <button
                            type="button"
                            className="publisher-action publisher-secondary-action"
                            disabled={pendingClaimId === claim.claimId}
                            onClick={() => void verifyClaim(claim.claimId)}
                          >
                            {claim.status === "verifying" ? "Retry verification" : "Verify with GitHub"}
                          </button>
                          <button
                            type="button"
                            className="publisher-action publisher-secondary-action"
                            disabled={pendingClaimId === claim.claimId}
                            onClick={() => void withdrawClaim(claim.claimId)}
                          >
                            Withdraw claim
                          </button>
                        </div>
                      )}
                  </li>
                ))}
                </ul>
              </>
            )}
          </section>

          {activePublisher.capabilities.includes("claims.manage") && (
            <ClaimForm
              publisherId={activePublisher.id}
              listings={activePublisher.claimableListings}
            />
          )}

          <MemberTable
            members={activePublisher.members}
            canManageMembers={activePublisher.capabilities.includes("members.manage")}
          />
        </div>
      ) : (
        <p className="detail-empty-state">You don&apos;t belong to a publisher yet.</p>
      )}
    </div>
  );
}
