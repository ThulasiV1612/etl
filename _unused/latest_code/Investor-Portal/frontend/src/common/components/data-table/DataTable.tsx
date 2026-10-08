import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DataTablePagination } from "../DataTablePagination/DataTablePagination";
import { attachHorizontalScrollBehavior } from "../../utils/horizontalScrollRegion";
import { FloatingTableHScroll } from "./FloatingTableHScroll";
import "./data-table.css";

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  sortValue?: (row: T) => string | number;
  /** `rowIndex` is the index in the current page (sorted + paginated slice). */
  cell: (row: T, rowIndex?: number) => ReactNode;
  align?: "left" | "right" | "center";
  thClassName?: string;
  tdClassName?: string;
  /** Fixed width for `<colgroup>` / `table-layout: fixed` alignment. */
  colWidth?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, rowIndex: number) => string;
  emptyLabel: string;
  /** `role` on the empty-state message when `visualVariant` is `members` (e.g. `status` while loading). */
  emptyStateRole?: "status" | "presentation";
  /**
   * Members variant: show a single body row with a centered spinner (table headers still visible).
   * Use instead of a separate loading block above the table.
   */
  isLoading?: boolean;
  /** Use Members page table chrome (`.um_table`, sort headers, wrap). */
  visualVariant?: "default" | "members";
  /** Extra classes on `<table>` when `visualVariant` is `members` (e.g. `um_table_members`). */
  membersTableClassName?: string;
  /**
   * When `visualVariant` is `members`: `plain` matches the main Members page — a single
   * `.um_table_wrap` with no inner `.data_table_shell` / scroll region. Default keeps the
   * tab/shell layout used elsewhere (e.g. company Deals list).
   */
  membersShell?: "default" | "plain";
  /** Client-side pagination after sort. `totalItems` should match `rows.length`. */
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (nextPage: number) => void;
    onPageSizeChange?: (nextSize: number) => void;
    ariaLabel?: string;
  };
  /**
   * Optional extra `class` on each body row (e.g. suspended state).
   * `rowIndex` is the index in the current view (sorted + paginated slice), 0-based.
   */
  getRowClassName?: (row: T, rowIndex: number) => string | undefined;
  /** Default sort when the table first mounts (members-style sortable tables). */
  initialSort?: { columnId: string; direction: "asc" | "desc" };
  /**
   * Row click (e.g. draft “continue editing”). Ignored when the event target is inside
   * a link, button, or menu item so actions stay usable.
   */
  onBodyRowClick?: (row: T, rowIndex: number) => void;
  /**
   * When `visualVariant` is `members`: keep the first column visible during horizontal
   * scroll (`position: sticky; left: 0`). Defaults to `true` for members-style tables.
   */
  stickyFirstColumn?: boolean;
  /**
   * Number of leading columns to pin during horizontal scroll (e.g. deal name + progress).
   * Defaults to `1` when sticky columns are enabled, unless `stickyFirstColumn` is `false`.
   */
  stickyColumnCount?: number;
  /**
   * Alternating row backgrounds by visible index (sorted + paginated). Uses
   * `.data_table_row_odd` / `.data_table_row_even` in `data-table.css`.
   */
  stripedRows?: boolean;
  /**
   * Enable horizontal scroll class / gestures. Defaults to `true` for
   * `visualVariant="members"` so Investors, Contacts, Distributions, etc. scroll.
   * Skipped when the table body is empty. Pass `false` to opt out.
   */
  forceHorizontalScroll?: boolean;
  /**
   * Documents-style left/right arrows + drag track. Defaults to `true`.
   * Hidden when the table does not overflow. Pass `false` to opt out.
   */
  floatingHorizontalScroll?: boolean;
  /** Accessible name for the floating left/right control group. */
  floatingHorizontalScrollLabel?: string;
  /**
   * Optional content rendered in a full-width row immediately under that body
   * row (e.g. nested class details under a distribution).
   */
  renderExpandedContent?: (row: T, rowIndex: number) => ReactNode;
  /**
   * Rendered between the table scroll region and pagination
   * (e.g. column totals that should stay visible while the table scrolls).
   */
  tableFooter?: ReactNode;
};

function sortHeaderLabel(header: ReactNode, columnId: string): string {
  if (typeof header === "string" || typeof header === "number") {
    return String(header);
  }
  return columnId;
}

/** Members variant: omit inline text-align when `align` is unset so `.um_td_numeric` etc. apply. */
function membersThTdTextAlign(
  visualVariant: "default" | "members",
  col: { align?: "left" | "right" | "center" },
): "left" | "right" | "center" | undefined {
  if (visualVariant === "members" && col.align === undefined) {
    return undefined;
  }
  if (col.align === "right") return "right";
  if (col.align === "center") return "center";
  return "left";
}

function isCheckboxColumn(col: {
  thClassName?: string;
  tdClassName?: string;
}): boolean {
  return (
    col.thClassName?.includes("um_th_checkbox") === true ||
    col.tdClassName?.includes("um_td_checkbox") === true
  );
}

function stickyColClasses(
  colIndex: number,
  stickyColumnCount: number,
  col: { thClassName?: string; tdClassName?: string },
): string {
  if (colIndex >= stickyColumnCount) return "";
  const parts = [
    "data_table_col_sticky",
    `data_table_col_sticky--${colIndex}`,
  ];
  if (colIndex === stickyColumnCount - 1 && !isCheckboxColumn(col)) {
    parts.push("data_table_col_sticky_edge");
  }
  return parts.join(" ");
}

function TableScrollRegion({
  className,
  children,
  measureKey,
  forceHorizontalScroll = false,
  floatingHorizontalScroll = true,
  floatingHorizontalScrollLabel = "Columns",
}: {
  className: string;
  children: ReactNode;
  measureKey: string;
  forceHorizontalScroll?: boolean;
  floatingHorizontalScroll?: boolean;
  floatingHorizontalScrollLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowX, setOverflowX] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      setOverflowX(false);
      return;
    }
    const measure = () => {
      const regionWidth = el.clientWidth;
      el.style.setProperty(
        "--data-table-scroll-port-width",
        regionWidth > 0 ? `${regionWidth}px` : "100%",
      );
      const table = el.querySelector("table");
      if (!table || regionWidth <= 0) {
        setOverflowX(false);
        return;
      }
      // Sticky column divider only when the table is wider than its scroll region.
      const tableWidth = table.scrollWidth;
      setOverflowX(tableWidth - regionWidth > 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const table = el.querySelector("table");
    if (table) ro.observe(table);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measureKey]);

  /** Horizontal gestures / Shift+wheel / drag pan — never steals vertical page scroll. */
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    return attachHorizontalScrollBehavior(scroller, {
      hoverVerticalToHorizontal: false,
      edgeScroll: false,
    });
  }, [measureKey, overflowX, forceHorizontalScroll]);

  const regionClass = [
    className,
    overflowX || forceHorizontalScroll
      ? "data_table_scroll_region--overflow-x"
      : "",
    floatingHorizontalScroll ? "data_table_scroll_region--floating-hscroll" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div ref={ref} className={regionClass}>
        {children}
      </div>
      {floatingHorizontalScroll ? (
        <FloatingTableHScroll
          scrollerRef={ref}
          syncKey={measureKey}
          active={overflowX || forceHorizontalScroll}
          ariaLabel={floatingHorizontalScrollLabel}
        />
      ) : null}
    </>
  );
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyLabel,
  emptyStateRole,
  visualVariant = "default",
  membersTableClassName = "",
  membersShell = "default",
  pagination,
  getRowClassName,
  initialSort,
  onBodyRowClick,
  stickyFirstColumn: stickyFirstColumnProp,
  stickyColumnCount: stickyColumnCountProp,
  isLoading = false,
  stripedRows = true,
  forceHorizontalScroll: forceHorizontalScrollProp,
  floatingHorizontalScroll = true,
  floatingHorizontalScrollLabel = "Columns",
  renderExpandedContent,
  tableFooter,
}: DataTableProps<T>) {
  const forceHorizontalScroll =
    forceHorizontalScrollProp ?? visualVariant === "members";
  const stickyColumnCount =
    stickyColumnCountProp ??
    (stickyFirstColumnProp === false
      ? 0
      : stickyFirstColumnProp === true || visualVariant === "members"
        ? 1
        : 0);
  const stickyColumnsEnabled = stickyColumnCount > 0;
  /** Match Investors tab: same table classes when callers omit `membersTableClassName`. */
  const membersTableClassResolved =
    visualVariant === "members" &&
    !String(membersTableClassName ?? "").trim()
      ? "um_table_members deal_inv_table"
      : (membersTableClassName ?? "");
  const [sortCol, setSortCol] = useState<string | null>(
    () => initialSort?.columnId ?? null,
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    () => initialSort?.direction ?? "asc",
  );

  function onSortColumn(id: string) {
    const col = columns.find((c) => c.id === id);
    if (!col?.sortValue) return;
    if (sortCol === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(id);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const col = columns.find((c) => c.id === sortCol);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sortCol, sortDir]);

  const displayRows = useMemo(() => {
    if (!pagination) return sortedRows;
    const start = (pagination.page - 1) * pagination.pageSize;
    return sortedRows.slice(start, start + pagination.pageSize);
  }, [sortedRows, pagination]);

  if (rows.length === 0 && visualVariant !== "members") {
    return (
      <div className="data_table_empty" role="status">
        {emptyLabel}
      </div>
    );
  }

  const wrapClass =
    visualVariant === "members"
      ? membersShell === "plain"
        ? "um_table_wrap"
        : "um_table_wrap data_table_shell"
      : "data_table_scroll";
  const tableClass =
    visualVariant === "members"
      ? [
          "um_table",
          "um_table_sortable",
          membersTableClassResolved,
          stickyColumnsEnabled ? "data_table_sticky_first" : "",
        ]
          .filter(Boolean)
          .join(" ")
      : stickyColumnsEnabled
        ? "data_table data_table_sticky_first"
        : "data_table";

  const tableEl = (
    <table className={tableClass}>
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.id}
              className={col.thClassName || undefined}
              style={
                col.colWidth
                  ? { width: col.colWidth, minWidth: col.colWidth }
                  : undefined
              }
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col, colIndex) => {
              const textAlign = membersThTdTextAlign(visualVariant, col);
              const thStyle =
                textAlign !== undefined ? { textAlign } : undefined;
              const active = sortCol === col.id;
              const ariaSort = col.sortValue
                ? active
                  ? sortDir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
                : undefined;

              const stickyClass = stickyColClasses(colIndex, stickyColumnCount, col);
              const thClass = [
                col.thClassName,
                visualVariant === "default" && active ? "data_table_th_sorted" : "",
                stickyClass,
              ]
                .filter(Boolean)
                .join(" ");

              const labelForSort = sortHeaderLabel(col.header, col.id);

              if (visualVariant === "members" && col.sortValue) {
                const btnClass = [
                  "um_sort_header_ctl",
                  col.align === "right"
                    ? "um_sort_header_ctl_align_end"
                    : col.align === "center"
                      ? "um_sort_header_ctl_align_center"
                      : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={thClass || undefined}
                    style={thStyle}
                    aria-sort={ariaSort}
                  >
                    <button
                      type="button"
                      className={btnClass || undefined}
                      onClick={() => onSortColumn(col.id)}
                      aria-label={
                        active
                          ? `${labelForSort}, sorted ${sortDir === "asc" ? "ascending" : "descending"}. Click to reverse.`
                          : `Sort by ${labelForSort}`
                      }
                    >
                      <span className="um_sort_header_label">{col.header}</span>
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUp
                            size={14}
                            className="um_sort_header_icon"
                            aria-hidden
                          />
                        ) : (
                          <ArrowDown
                            size={14}
                            className="um_sort_header_icon"
                            aria-hidden
                          />
                        )
                      ) : (
                        <ArrowUpDown
                          size={14}
                          className="um_sort_header_icon um_sort_header_icon_idle"
                          aria-hidden
                        />
                      )}
                    </button>
                  </th>
                );
              }

              if (visualVariant === "members") {
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={thClass || undefined}
                    style={thStyle}
                  >
                    {col.header}
                  </th>
                );
              }

              return (
                <th
                  key={col.id}
                  className={thClass || undefined}
                  style={thStyle}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      className="data_table_sort_btn"
                      onClick={() => onSortColumn(col.id)}
                    >
                      {col.header}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading && visualVariant === "members" ? (
            <tr>
              <td
                colSpan={columns.length}
                className="data_table_empty_members_cell data_table_members_loading_cell"
                role="status"
                aria-label={emptyLabel?.trim() || "Loading"}
              >
                <div className="data_table_members_loading_inner">
                  <div
                    className="data_table_loader_spinner"
                    aria-hidden
                  />
                  <p className="data_table_members_loading_label">
                    {emptyLabel?.trim() || "Loading…"}
                  </p>
                </div>
              </td>
            </tr>
          ) : rows.length === 0 && visualVariant === "members" ? (
            <tr>
              <td
                colSpan={columns.length}
                className="data_table_empty_members_cell"
              >
                <p
                  className="um_hint"
                  role={emptyStateRole ?? "status"}
                >
                  {emptyLabel}
                </p>
              </td>
            </tr>
          ) : (
            displayRows.map((row, i) => {
              const stripeClass = stripedRows
                ? i % 2 === 0
                  ? "data_table_row_odd"
                  : "data_table_row_even"
                : "";
              const extraClass = getRowClassName?.(row, i);
              const rowClass = [
                stripeClass,
                extraClass,
                onBodyRowClick ? "data_table_row_clickable" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined;
              function handleRowClick(e: MouseEvent<HTMLTableRowElement>) {
                if (!onBodyRowClick) return;
                const t = e.target as HTMLElement | null;
                if (!t) return;
                if (t.closest("a[href], button, [role='menuitem'], input, label"))
                  return;
                onBodyRowClick(row, i);
              }
              const rowKey = getRowKey(row, i);
              const expandedContent = renderExpandedContent?.(row, i);
              return (
              <Fragment key={rowKey}>
              <tr
                className={rowClass || undefined}
                onClick={onBodyRowClick ? handleRowClick : undefined}
              >
                {columns.map((col, colIndex) => {
                  const textAlign = membersThTdTextAlign(visualVariant, col);
                  const tdStyle =
                    textAlign !== undefined ? { textAlign } : undefined;
                  const stickyClass = stickyColClasses(colIndex, stickyColumnCount, col);
                  const tdClass = [
                    col.tdClassName,
                    stickyClass,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td
                      key={col.id}
                      className={tdClass || undefined}
                      style={tdStyle}
                    >
                      {col.cell(row, i)}
                    </td>
                  );
                })}
              </tr>
              {expandedContent ? (
                <tr className="data_table_expanded_row">
                  <td
                    className="data_table_expanded_cell"
                    colSpan={columns.length}
                  >
                    {expandedContent}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
            })
          )}
        </tbody>
    </table>
  );

  const scrollRegionClass = [
    "data_table_scroll_region",
    stickyColumnsEnabled ? "data_table_scroll_region_sticky_first" : "",
    rows.length === 0 ? "data_table_scroll_region--empty" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const scrollMeasureKey = [
    rows.length,
    displayRows.length,
    columns.length,
    pagination?.page ?? 0,
    pagination?.pageSize ?? 0,
    isLoading ? 1 : 0,
    stickyColumnCount,
  ].join("|");

  const scrollRegion = (className: string) => (
    <TableScrollRegion
      className={className}
      measureKey={scrollMeasureKey}
      forceHorizontalScroll={
        forceHorizontalScroll && rows.length > 0 && !isLoading
      }
      floatingHorizontalScroll={
        floatingHorizontalScroll && rows.length > 0 && !isLoading
      }
      floatingHorizontalScrollLabel={floatingHorizontalScrollLabel}
    >
      {tableEl}
    </TableScrollRegion>
  );

  if (visualVariant === "members") {
    const tableBlock = scrollRegion(scrollRegionClass)
    return (
      <div className={wrapClass}>
        {tableBlock}
        {tableFooter}
        {pagination && pagination.totalItems > 0 ? (
          <DataTablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
            ariaLabel={pagination.ariaLabel}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {scrollRegion(scrollRegionClass)}
      {tableFooter}
      {pagination && pagination.totalItems > 0 ? (
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          ariaLabel={pagination.ariaLabel}
        />
      ) : null}
    </div>
  );
}
