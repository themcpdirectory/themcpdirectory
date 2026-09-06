import type { DiscoveryCategorySummary } from "@themcpdirectory/domain";
import Link from "next/link";
import { Button } from "@radix-ui/themes";
import {
  BROWSE_CLIENT_OPTIONS,
  BROWSE_TRANSPORT_OPTIONS,
  buildBrowseHiddenFields,
  buildBrowseHref,
  resetBrowseFilters,
  type BrowseQueryState,
} from "@/components/browse/query-state";

interface FilterPanelProps {
  readonly categories: readonly DiscoveryCategorySummary[];
  readonly state: BrowseQueryState;
}

export function FilterPanel({ categories, state }: FilterPanelProps) {
  const hiddenFields = buildBrowseHiddenFields(state, {
    exclude: [
      "category",
      "publisher",
      "client",
      "transport",
      "registryType",
      "officialRegistry",
      "verified",
      "sourceAvailable",
      "openSource",
      "healthy",
      "page",
    ],
    overrides: { page: 1 },
  });
  const clearHref = buildBrowseHref(resetBrowseFilters(state));

  return (
    <form action="/browse" method="GET" className="browse-filter-panel">
      {hiddenFields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}

      <div className="form-field">
        <label htmlFor="browse-filter-category" className="form-label">
          Category
        </label>
        <select
          id="browse-filter-category"
          name="category"
          defaultValue={state.category ?? ""}
          className="form-control"
        >
          <option value="">All active categories</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="browse-filter-publisher" className="form-label">
          Publisher slug
        </label>
        <input
          id="browse-filter-publisher"
          name="publisher"
          type="text"
          defaultValue={state.publisher ?? ""}
          className="form-control"
          autoComplete="off"
        />
      </div>

      <div className="form-field">
        <label htmlFor="browse-filter-client" className="form-label">
          Client
        </label>
        <select
          id="browse-filter-client"
          name="client"
          defaultValue={state.client ?? ""}
          className="form-control"
        >
          <option value="">All supported clients</option>
          {BROWSE_CLIENT_OPTIONS.map((client) => (
            <option key={client.value} value={client.value}>
              {client.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="browse-filter-transport" className="form-label">
          Transport
        </label>
        <select
          id="browse-filter-transport"
          name="transport"
          defaultValue={state.transport ?? ""}
          className="form-control"
        >
          <option value="">Any transport</option>
          {BROWSE_TRANSPORT_OPTIONS.map((transport) => (
            <option key={transport.value} value={transport.value}>
              {transport.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="browse-filter-registry" className="form-label">
          Package registry
        </label>
        <input
          id="browse-filter-registry"
          name="registryType"
          type="text"
          defaultValue={state.registryType ?? ""}
          className="form-control"
          autoComplete="off"
        />
      </div>

      <fieldset className="browse-checkbox-group">
        <legend className="form-label">Evidence filters</legend>

        <label className="browse-checkbox">
          <input
            type="checkbox"
            name="officialRegistry"
            value="true"
            defaultChecked={state.officialRegistry}
          />
          <span>Official Registry</span>
        </label>

        <label className="browse-checkbox">
          <input type="checkbox" name="verified" value="true" defaultChecked={state.verified} />
          <span>Verified publisher</span>
        </label>

        <label className="browse-checkbox">
          <input
            type="checkbox"
            name="sourceAvailable"
            value="true"
            defaultChecked={state.sourceAvailable}
          />
          <span>Source available</span>
        </label>

        <label className="browse-checkbox">
          <input type="checkbox" name="openSource" value="true" defaultChecked={state.openSource} />
          <span>Open source</span>
        </label>

        <label className="browse-checkbox">
          <input type="checkbox" name="healthy" value="true" defaultChecked={state.healthy} />
          <span>Healthy remote endpoint</span>
        </label>
      </fieldset>

      <div className="browse-filter-panel__actions">
        <Button type="submit" size="3">
          Apply filters
        </Button>
        <Link href={clearHref} className="text-link-action">
          Clear filters
        </Link>
      </div>
    </form>
  );
}
