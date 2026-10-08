import { ChevronLeft, ChevronRight } from "lucide-react";
import "./data_table_pagination.css";

export type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
  pageSizeOptions?: number[];
  /** e.g. "Companies table" */
  ariaLabel?: string;
  className?: string;
};

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function DataTablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  ariaLabel = "Table pagination",
  className = "",
}: DataTablePaginationProps) {
  if (totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  const pageNumbers: number[] = [];
  const maxButtons = 5;
  let from = Math.max(1, safePage - 2);
  let to = Math.min(totalPages, from + maxButtons - 1);
  if (to - from + 1 < maxButtons) {
    from = Math.max(1, to - maxButtons + 1);
  }
  for (let n = from; n <= to; n += 1) pageNumbers.push(n);

  return (
    <nav
      className={`um_table_pagination ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <p className="um_table_pagination_range">
        Showing <strong>{start}</strong>–<strong>{end}</strong> of{" "}
        <strong>{totalItems}</strong>
      </p>
      <div className="um_table_pagination_controls">
        <button
          type="button"
          className="um_table_pagination_btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          Prev
        </button>
        {pageNumbers.map((n) => (
          <button
            key={n}
            type="button"
            className={`um_table_pagination_btn${n === safePage ? " um_table_pagination_btn_active" : ""}`}
            onClick={() => onPageChange(n)}
            aria-current={n === safePage ? "page" : undefined}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className="um_table_pagination_btn"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </button>
        {onPageSizeChange ? (
          <label className="um_table_pagination_page_size">
            <span className="um_table_pagination_page_size_label">Rows per page</span>
            <select
              className="um_table_pagination_select"
              value={String(pageSize)}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((sz) => (
                <option key={sz} value={String(sz)}>
                  {sz} / page
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </nav>
  );
}
