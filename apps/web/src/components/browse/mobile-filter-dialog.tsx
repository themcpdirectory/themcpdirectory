"use client";

import { MixerHorizontalIcon } from "@radix-ui/react-icons";
import { Dialog } from "@radix-ui/themes";
import Link from "next/link";
import { FilterPanel } from "@/components/browse/filter-panel";
import {
  buildBrowseHref,
  countActiveBrowseFilters,
  resetBrowseFilters,
  type BrowseQueryState,
} from "@/components/browse/query-state";
import type { DiscoveryCategorySummary } from "@themcpdirectory/domain";

interface MobileFilterDialogProps {
  readonly categories: readonly DiscoveryCategorySummary[];
  readonly state: BrowseQueryState;
}

export function MobileFilterDialog({ categories, state }: MobileFilterDialogProps) {
  const activeCount = countActiveBrowseFilters(state);
  const clearHref = buildBrowseHref(resetBrowseFilters(state));

  return (
    <div className="browse-mobile-filters">
      <div className="browse-mobile-filters__summary">
        <p className="browse-mobile-filters__count">
          {activeCount === 0
            ? "No filters applied"
            : `${activeCount} active filter${activeCount === 1 ? "" : "s"}`}
        </p>
        {activeCount > 0 ? (
          <Link href={clearHref} className="browse-mobile-filters__clear">
            Clear
          </Link>
        ) : null}
      </div>

      <Dialog.Root>
        <Dialog.Trigger className="browse-mobile-filters__trigger">
          <span className="browse-mobile-filters__trigger-content">
            <MixerHorizontalIcon aria-hidden="true" />
            <span>Filters</span>
          </span>
        </Dialog.Trigger>
        <Dialog.Content size="3" className="browse-mobile-filters__dialog" aria-label="Filters">
          <Dialog.Title>Filters</Dialog.Title>
          <Dialog.Description>
            Apply supported directory filters. Results stay server-rendered and pagination keeps the
            current filter state.
          </Dialog.Description>
          <FilterPanel categories={categories} state={state} />
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
