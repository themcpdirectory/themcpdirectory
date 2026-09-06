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
    <div className="publisher-switcher form-field">
      <label htmlFor="publisher-switcher" className="form-label">
        Publisher
      </label>
      <select
        id="publisher-switcher"
        value={activePublisherId ?? ""}
        onChange={(event) => {
          router.push(`/dashboard?publisher=${event.target.value}`);
        }}
        className="form-control"
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
