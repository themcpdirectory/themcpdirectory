import type { getServerDetailBySlug } from "@themcpdirectory/domain";

type ListingStatus = NonNullable<
  Awaited<ReturnType<typeof getServerDetailBySlug>>
>["listingStatus"];

interface DeletedUpstreamBannerProps {
  readonly listingStatus: ListingStatus;
}

export function DeletedUpstreamBanner({ listingStatus }: DeletedUpstreamBannerProps) {
  if (listingStatus !== "deleted_upstream") return null;

  return (
    <section
      className="detail-status-alert"
      role="alert"
      aria-labelledby="deleted-upstream-heading"
    >
      <span className="detail-status-alert__icon" aria-hidden="true">
        !
      </span>
      <div>
        <h2 id="deleted-upstream-heading">Removed upstream</h2>
        <p>
          Installation is blocked because the Official MCP Registry marks this listing as removed
          upstream. This page remains available as a historical reference.
        </p>
      </div>
    </section>
  );
}
