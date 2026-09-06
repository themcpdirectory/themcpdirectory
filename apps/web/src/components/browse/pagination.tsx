import Link from "next/link";
import { buildBrowseHref, type BrowseQueryState } from "@/components/browse/query-state";

interface BrowsePaginationProps {
  readonly state: BrowseQueryState;
  readonly totalPages: number;
}

function getPageNumbers(page: number, totalPages: number): readonly number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
  return [...candidates]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
}

export function BrowsePagination({ state, totalPages }: BrowsePaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(state.page, totalPages);

  return (
    <nav aria-label="Browse pagination" className="browse-pagination">
      {state.page > 1 ? (
        <Link href={buildBrowseHref(state, { page: state.page - 1 })} className="text-link-action">
          Previous
        </Link>
      ) : (
        <span className="browse-pagination__spacer" aria-hidden="true" />
      )}

      <ol className="browse-pagination__pages">
        {pages.map((page) => (
          <li key={page}>
            {page === state.page ? (
              <span aria-current="page" className="browse-pagination__current">
                {page}
              </span>
            ) : (
              <Link href={buildBrowseHref(state, { page })} className="browse-pagination__link">
                {page}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {state.page < totalPages ? (
        <Link href={buildBrowseHref(state, { page: state.page + 1 })} className="text-link-action">
          Next
        </Link>
      ) : (
        <span className="browse-pagination__spacer" aria-hidden="true" />
      )}
    </nav>
  );
}
