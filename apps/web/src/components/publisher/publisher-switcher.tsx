"use client";

import { useRouter } from "next/navigation";
import type { PublisherMembershipSummary } from "@themcpdirectory/domain";

interface PublisherSwitcherProps {
  readonly memberships: readonly PublisherMembershipSummary[];
  readonly activePublisherId: string | null;
}

export function PublisherSwitcher({ memberships, activePublisherId }: PublisherSwitcherProps) {
  const router = useRouter();

  return (
    <div style={{ marginBottom: "1.5rem", maxWidth: "24rem" }}>
      <label
        htmlFor="publisher-switcher"
        style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}
      >
        Publisher
      </label>
      <select
        id="publisher-switcher"
        value={activePublisherId ?? ""}
        onChange={(event) => {
          router.push(`/dashboard?publisher=${event.target.value}`);
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "0.5rem 0.75rem",
          border: "1px solid var(--control-border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontSize: "0.9375rem",
          minHeight: "2.75rem",
        }}
      >
        {memberships.map((membership) => (
          <option key={membership.publisherId} value={membership.publisherId}>
            {membership.publisherDisplayName}
          </option>
        ))}
      </select>
    </div>
  );
}
