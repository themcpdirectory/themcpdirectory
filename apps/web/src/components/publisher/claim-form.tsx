"use client";

import { useState, type FormEvent } from "react";
import type { PublisherDashboard } from "@themcpdirectory/domain";
import { ErrorSummary } from "./error-summary";

const VERIFICATION_METHODS = [
  { value: "github_repository", label: "GitHub repository admin access" },
  { value: "github_organization", label: "GitHub organisation admin access" },
] as const;

type VerificationMethod = (typeof VERIFICATION_METHODS)[number]["value"];

interface ClaimFormProps {
  readonly publisherId: string;
  readonly listings: NonNullable<PublisherDashboard["activePublisher"]>["claimableListings"];
}

export function ClaimForm({ publisherId, listings }: ClaimFormProps) {
  const [listingId, setListingId] = useState("");
  const [method, setMethod] = useState<VerificationMethod>("github_repository");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [listingInvalid, setListingInvalid] = useState(false);
  const selectedListing = listings.find((listing) => listing.serverId === listingId);
  const availableMethods = VERIFICATION_METHODS.filter((option) =>
    selectedListing?.verificationMethods.includes(option.value),
  );

  async function readError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      return payload.error?.message ?? "Unable to continue claim verification.";
    } catch {
      return "Unable to continue claim verification.";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedListingId = listingId.trim();
    if (trimmedListingId.length === 0) {
      setStatus(null);
      setListingInvalid(true);
      setErrors(["Select a listing before you submit a claim."]);
      return;
    }

    setListingInvalid(false);
    setErrors([]);
    setSubmitting(true);
    try {
      const response = await fetch("/api/publisher/v1/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverId: trimmedListingId,
          publisherId,
          verificationMethod: method,
        }),
      });
      const payload = (await response.json()) as {
        claimId?: string;
        status?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        setStatus(null);
        setErrors([payload.error?.message ?? "Unable to submit the claim."]);
        return;
      }
      if (!payload.claimId) {
        throw new Error("The claim response did not include an identifier.");
      }

      const verificationResponse = await fetch(
        `/api/publisher/v1/claims/${payload.claimId}/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!verificationResponse.ok) {
        setErrors([await readError(verificationResponse)]);
        return;
      }

      const verification = (await verificationResponse.json()) as { redirectUrl?: string };
      if (!verification.redirectUrl) {
        throw new Error("The verification response did not include a redirect URL.");
      }
      window.location.assign(verification.redirectUrl);
    } catch {
      setStatus(null);
      setErrors(["Unable to continue claim verification. Check your connection and try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="claim-heading" className="publisher-panel">
      <h2 id="claim-heading" className="section-title">
        Claim a listing
      </h2>
      <p id="claim-auth-explainer" className="publisher-help-text">
        GitHub sign-in only reads your identity. Claim verification starts a separate GitHub App
        authorisation and then checks repository admin or organisation admin access before using a
        one-time installation token with only the read permissions required for the chosen
        verification method.
      </p>

      <ErrorSummary id="claim-error-summary" errors={errors} />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="form-field">
          <label htmlFor="claim-listing-id" className="form-label">
            Listing
          </label>
          <p id="claim-listing-hint" className="form-hint">
            Enter the directory ID of the listing you want to claim.
          </p>
          <select
            id="claim-listing-id"
            name="listingId"
            value={listingId}
            onChange={(event) => {
              setListingId(event.target.value);
              setMethod("github_repository");
              if (listingInvalid) setListingInvalid(false);
            }}
            aria-invalid={listingInvalid || undefined}
            aria-describedby={
              listingInvalid ? "claim-listing-hint claim-error-summary" : "claim-listing-hint"
            }
            className="form-control"
          >
            <option value="">Select a listing</option>
            {listings.map((listing) => (
              <option key={listing.serverId} value={listing.serverId}>
                {listing.serverTitle}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="claim-method" className="form-label">
            Verification method
          </label>
          <select
            id="claim-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as VerificationMethod)}
            className="form-control"
          >
            {availableMethods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="publisher-action publisher-primary-action"
          disabled={submitting}
        >
          {submitting ? "Submitting…" : "Submit claim"}
        </button>
      </form>

      {status && (
        <p role="status" className="form-status">
          {status}
        </p>
      )}
    </section>
  );
}
