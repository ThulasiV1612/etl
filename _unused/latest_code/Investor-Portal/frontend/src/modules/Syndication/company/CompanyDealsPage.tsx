import { Download, Eye, MoreHorizontal, RefreshCw, Search, Upload } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom"
import { toast } from "../../../common/components/Toast"
import {
  TABLE_PAGE_SIZE_ID,
  usePersistedTablePageSize,
} from "@/common/hooks/usePersistedTablePageSize"
import { buildTableExportFilename } from "../../../common/utils/tableExportFilename"
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable"
import { notifyDealsExportAudit } from "../Deals/api/dealsExportNotifyApi"
import { fetchDealsListForOrganization } from "../Deals/api/dealsApi"
import { ExportDealsModal } from "../Deals/components/ExportDealsModal"
import { dealStageLabel } from "../dealsDashboardUtils"
import {
  dateSortValue,
  dealTypeDisplayLabel,
  formatDealListDateDisplay,
} from "../Deals/dealsListDisplay"
import type { DealListRow } from "../Deals/types/deals.types"
import {
  buildDealsListExportCsv,
  downloadDealsListExportCsv,
  exportAuditLinesForDealListRows,
} from "../Deals/utils/dealsListExportCsv"
import type { CustomerCompanyOutletContext } from "./CustomerCompanyLayout"
import "../Deals/deal-investors-tab.css"
import "../Deals/deals-list.css"
import "../usermanagement/user_management.css"
import "./company_page.css"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function CompanyDealsPage() {
  const { companyId = "" } = useParams<{ companyId: string }>()
  const navigate = useNavigate()
  const { companyDisplayName } = useOutletContext<CustomerCompanyOutletContext>()

  const [deals, setDeals] = useState<DealListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistedTablePageSize(
    TABLE_PAGE_SIZE_ID.deals,
  )

  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null)
  const [actionMenuRow, setActionMenuRow] = useState<DealListRow | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  )
  const kebabPortalRef = useRef<HTMLUListElement | null>(null)
  const kebabTriggerRef = useRef<HTMLButtonElement | null>(null)

  const closeActionMenu = useCallback(() => {
    setActionMenuRowId(null)
    setActionMenuRow(null)
    setMenuPos(null)
  }, [])

  const load = useCallback(async () => {
    const id = companyId.trim()
    if (!UUID_RE.test(id)) {
      setDeals([])
      setLoading(false)
      return
    }
    closeActionMenu()
    setLoading(true)
    setError("")
    setDeals([])
    try {
      const { deals: rows, error: apiErr } =
        await fetchDealsListForOrganization(id)
      if (apiErr) {
        setError(apiErr)
        setDeals([])
        return
      }
      setDeals(rows)
    } catch {
      setError("Unable to load deals.")
    } finally {
      setLoading(false)
    }
  }, [companyId, closeActionMenu])

  const updateKebabMenuPosition = useCallback(() => {
    if (!actionMenuRowId) {
      setMenuPos(null)
      return
    }
    const el = kebabTriggerRef.current
    if (!(el instanceof HTMLElement)) {
      setMenuPos(null)
      return
    }
    const r = el.getBoundingClientRect()
    const menuMinW = 168
    const margin = 8
    let left = r.right - menuMinW
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - menuMinW - margin),
    )
    setMenuPos({ top: r.bottom + 4, left })
  }, [actionMenuRowId])

  useLayoutEffect(() => {
    if (!actionMenuRowId) {
      setMenuPos(null)
      return
    }
    updateKebabMenuPosition()
    window.addEventListener("scroll", updateKebabMenuPosition, true)
    window.addEventListener("resize", updateKebabMenuPosition)
    return () => {
      window.removeEventListener("scroll", updateKebabMenuPosition, true)
      window.removeEventListener("resize", updateKebabMenuPosition)
    }
  }, [actionMenuRowId, updateKebabMenuPosition])

  useEffect(() => {
    if (actionMenuRowId == null) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (kebabTriggerRef.current?.contains(t)) return
      if (kebabPortalRef.current?.contains(t)) return
      closeActionMenu()
    }
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", onDoc)
    }
  }, [actionMenuRowId, closeActionMenu])

  useEffect(() => {
    if (actionMenuRowId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActionMenu()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [actionMenuRowId, closeActionMenu])

  useEffect(() => {
    if (!UUID_RE.test(companyId.trim())) {
      navigate("/customers", { replace: true })
      return
    }
    void load()
  }, [companyId, navigate, load])

  const titleCompany = companyDisplayName?.trim() || "Company"

  const openMenuContext =
    actionMenuRowId && actionMenuRow
      ? { row: actionMenuRow, rowId: actionMenuRowId }
      : null

  function exportDealRowCsv(row: DealListRow) {
    const csv = buildDealsListExportCsv([row])
    const filename = buildTableExportFilename({
      dealName: row.dealName?.trim() || row.id,
    })
    downloadDealsListExportCsv(csv, filename)
    void notifyDealsExportAudit({
      rowCount: 1,
      exportedDealLines: exportAuditLinesForDealListRows([row]),
    })
    closeActionMenu()
    toast.success("Deal exported", `Saved as ${filename}`)
  }

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return deals
    return deals.filter((r) =>
      (r.dealName ?? "").toLowerCase().includes(q),
    )
  }, [deals, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filteredDeals.length,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      ariaLabel: `Deals for ${titleCompany} table pagination`,
    }),
    [page, pageSize, filteredDeals.length, titleCompany],
  )

  const columns: DataTableColumn<DealListRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Deal",
        colWidth: "18rem",
        sortValue: (row) => (row.dealName ?? "").toLowerCase(),
        thClassName: "cp_company_deal_name_th",
        tdClassName: "cp_company_deal_name_td",
        cell: (row) => (
          <Link
            to={`/deals/${encodeURIComponent(row.id)}`}
            className="um_user_meta_username cp_company_deal_name_link"
          >
            {row.dealName?.trim() || "—"}
          </Link>
        ),
      },
      {
        id: "type",
        header: "Type",
        colWidth: "8rem",
        sortValue: (row) => dealTypeDisplayLabel(row.dealType).toLowerCase(),
        tdClassName: "cp_company_deal_meta_td",
        cell: (row) => (
          <span className="cp_company_cell_muted">
            {dealTypeDisplayLabel(row.dealType)}
          </span>
        ),
      },
      {
        id: "stage",
        header: "Stage",
        colWidth: "8rem",
        sortValue: (row) =>
          dealStageLabel(row.dealStage).toLowerCase(),
        tdClassName: "cp_company_deal_meta_td",
        cell: (row) => (
          <span className="cp_company_cell_muted">
            {dealStageLabel(row.dealStage)}
          </span>
        ),
      },
      {
        id: "start",
        header: "Start",
        colWidth: "7rem",
        align: "center",
        thClassName: "cp_company_deal_date_th",
        tdClassName: "cp_company_deal_date_td",
        sortValue: (row) =>
          dateSortValue(row.startDateDisplay ?? row.createdDateDisplay),
        cell: (row) =>
          formatDealListDateDisplay(
            row.startDateDisplay ?? row.createdDateDisplay,
          ),
      },
      {
        id: "close",
        header: "Close",
        colWidth: "7rem",
        align: "center",
        thClassName: "cp_company_deal_date_th",
        tdClassName: "cp_company_deal_date_td",
        sortValue: (row) => dateSortValue(row.closeDateDisplay),
        cell: (row) => formatDealListDateDisplay(row.closeDateDisplay),
      },
      {
        id: "location",
        header: "Location",
        colWidth: "10rem",
        sortValue: (row) => (row.locationDisplay ?? "").toLowerCase(),
        tdClassName: "cp_company_deal_meta_td",
        cell: (row) => (
          <span className="cp_company_cell_muted" title={row.locationDisplay}>
            {row.locationDisplay?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "investors",
        header: "Investors",
        colWidth: "6.5rem",
        align: "right",
        thClassName: "cp_company_deal_num_th",
        tdClassName: "cp_company_deal_num_td um_td_numeric",
        sortValue: (row) =>
          Number.parseInt(String(row.investors ?? "").replace(/\D/g, ""), 10) ||
          0,
        cell: (row) => row.investors?.trim() || "—",
      },
      {
        id: "actions",
        header: "Actions",
        colWidth: "5rem",
        align: "center",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions",
        cell: (row, rowIndex = 0) => {
          const rowKey = row.id || `deal-${rowIndex}`
          const dealLabel = row.dealName?.trim() || "Deal"
          const menuOpen = actionMenuRowId === rowKey
          return (
            <div className="um_kebab_root">
              <button
                type="button"
                className="um_kebab_trigger"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`Actions for ${dealLabel}`}
                ref={
                  menuOpen
                    ? (el) => {
                        kebabTriggerRef.current = el
                      }
                    : undefined
                }
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setActionMenuRowId((current) => {
                    if (current === rowKey) {
                      setActionMenuRow(null)
                      setMenuPos(null)
                      return null
                    }
                    setActionMenuRow(row)
                    return rowKey
                  })
                }}
              >
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </div>
          )
        },
      },
    ],
    [actionMenuRowId],
  )

  useEffect(() => {
    setPage(1)
  }, [deals.length, companyId])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(deals.length / pageSize))
    if (page > totalPages) setPage(totalPages)
  }, [deals.length, page, pageSize])

  return (
    <div
      className={`um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel${
        loading ? " deals_list_table_panel_loading" : ""
      }`}
      id="cp-company-panel-deals"
      role="tabpanel"
      aria-labelledby="cp-company-tab-deals"
      aria-busy={loading}
    >
      <div className="cp_company_tab_panel_inner">
        <div className="um_toolbar cp_company_tab_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
          <p className="cp_company_tab_toolbar_hint">
            Deals created for{" "}
            <strong className="cp_company_tab_toolbar_strong">
              {titleCompany}
            </strong>
            . Open a deal for full details.
          </p>
          <div className="um_toolbar_actions">
            <button
              type="button"
              className="um_toolbar_export_btn"
              disabled={loading || deals.length === 0}
              onClick={() => setExportModalOpen(true)}
            >
              <Download size={18} strokeWidth={2} aria-hidden />
              <span>Export All</span>
            </button>
            <button
              type="button"
              className="um_btn_toolbar"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={18} strokeWidth={2} aria-hidden />
              Refresh
            </button>
          </div>
          <div className="um_search_wrap">
            <Search className="um_search_icon" size={18} aria-hidden />
            <input
              type="search"
              className="um_search_input"
              placeholder="Search deals…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search deals for ${titleCompany}`}
              disabled={loading}
            />
          </div>
        </div>

        {error ? (
          <p className="um_msg_error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="cp_company_tab_table_wrap">
          <DataTable
            visualVariant="members"
            stickyFirstColumn={false}
            membersTableClassName="um_table_members deal_inv_table cp_company_deals_table"
            initialSort={{ columnId: "name", direction: "asc" }}
            columns={columns}
            rows={loading ? [] : filteredDeals}
            getRowKey={(row, i) => row.id || `deal-${i}`}
            isLoading={loading}
            emptyLabel={
              deals.length === 0
                ? ""
                : query.trim()
                  ? "No deals match your search."
                  : "No rows."
            }
            emptyStateRole={loading ? "status" : undefined}
            pagination={
              !loading && filteredDeals.length > 0 ? pagination : undefined
            }
          />
        </div>
      </div>

      <ExportDealsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        deals={deals}
      />

      {actionMenuRowId &&
      menuPos &&
      openMenuContext &&
      typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={kebabPortalRef}
              className="um_kebab_menu um_kebab_menu--portal"
              role="menu"
              aria-label="Row actions"
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
              }}
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => {
                    closeActionMenu()
                    navigate(
                      `/deals/${encodeURIComponent(openMenuContext.row.id)}`,
                    )
                  }}
                >
                  <Eye
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Open deal
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => exportDealRowCsv(openMenuContext.row)}
                >
                  <Upload
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Export
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
