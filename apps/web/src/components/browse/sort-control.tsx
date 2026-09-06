import { Button } from "@radix-ui/themes";
import {
  BROWSE_SORT_OPTIONS,
  buildBrowseHiddenFields,
  type BrowseQueryState,
} from "@/components/browse/query-state";

interface SortControlProps {
  readonly state: BrowseQueryState;
}

export function SortControl({ state }: SortControlProps) {
  const hiddenFields = buildBrowseHiddenFields(state, {
    exclude: ["sort", "page"],
    overrides: { page: 1 },
  });

  return (
    <form action="/browse" method="GET" className="browse-sort-control">
      {hiddenFields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <label htmlFor="browse-sort" className="form-label browse-sort-control__label">
        Sort
      </label>
      <select id="browse-sort" name="sort" defaultValue={state.sort} className="form-control">
        {BROWSE_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="2">
        Apply
      </Button>
    </form>
  );
}
