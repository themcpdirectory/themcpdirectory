"use client";

import { useState } from "react";
import { ErrorSummary } from "./error-summary";

type PendingAction = "export" | "erasure" | null;

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function DangerZone() {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function exportAccount() {
    if (pendingAction) return;
    setPendingAction("export");
    setErrors([]);
    setStatus(null);
    try {
      const response = await fetch("/api/publisher/v1/account/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setErrors([await readError(response, "Unable to export your account data.")]);
        return;
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "account-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Your account export has been downloaded.");
    } catch {
      setErrors(["Unable to export your account data. Check your connection and try again."]);
    } finally {
      setPendingAction(null);
    }
  }

  async function requestErasure() {
    if (pendingAction) return;
    const confirmed = window.confirm(
      "Request account erasure? Your sessions and account data will be removed. Publishers left without an owner will be locked for manual review.",
    );
    if (!confirmed) return;

    setPendingAction("erasure");
    setErrors([]);
    setStatus(null);
    try {
      const response = await fetch("/api/publisher/v1/account/erasure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ successorAssignments: [] }),
      });
      if (!response.ok) {
        setErrors([await readError(response, "Unable to request account erasure.")]);
        return;
      }
      setStatus("Your account erasure request has been queued.");
    } catch {
      setErrors(["Unable to request account erasure. Check your connection and try again."]);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section aria-labelledby="danger-zone-heading" className="publisher-panel publisher-danger-zone">
      <h2 id="danger-zone-heading" style={{ margin: "0 0 0.75rem", fontSize: "1.0625rem" }}>
        Export and erasure
      </h2>
      <p id="account-erasure-description" className="publisher-help-text">
        Download your account data or request erasure. Erasure removes your access and can lock
        publishers without another owner for manual review.
      </p>
      <ErrorSummary id="account-action-error-summary" errors={errors} />
      <div className="publisher-claim-actions">
        <button
          type="button"
          className="publisher-action publisher-secondary-action"
          disabled={pendingAction !== null}
          onClick={() => void exportAccount()}
        >
          {pendingAction === "export" ? "Preparing export..." : "Export account data"}
        </button>
        <button
          type="button"
          className="publisher-action publisher-danger-action"
          aria-describedby="account-erasure-description"
          disabled={pendingAction !== null}
          onClick={() => void requestErasure()}
        >
          {pendingAction === "erasure" ? "Requesting erasure..." : "Request account erasure"}
        </button>
      </div>
      {status && (
        <p className="publisher-action-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}