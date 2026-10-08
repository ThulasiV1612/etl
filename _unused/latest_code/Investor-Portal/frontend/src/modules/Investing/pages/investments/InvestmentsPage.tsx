import {
  Archive,
  Briefcase,
  Clock,
  Download,
  Search,
  TrendingUp,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { dealInvestNowPath } from "@/modules/Syndication/Deals/utils/dealInvestNowPath"
import {
  DealAvatarIconRing,
} from "@/common/components/entity-avatar/EntityAvatarNameCell"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import { TableCompactAmountCell } from "@/common/components/card-compact-amount/CardCompactAmount"
import { toast } from "@/common/components/Toast"
import { syncInvestorInvestmentCheckout } from "@/modules/Investing/api/stripeInvestorPaymentsApi"
// import { DealsListPage } from "@/modules/Syndication/Deals/DealsListPage"
import { DealRowActions } from "@/modules/Syndication/Deals/components/DealRowActions"
import {
  dateSortValue,
  dealTypeDisplayLabel,
  formatDealListDateDisplay,
  secTypeDisplayLabel,
} from "@/modules/Syndication/Deals/dealsListDisplay"
import { dealStageLabel } from "@/modules/Syndication/dealsDashboardUtils"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deal-investors-tab.css"
import "@/modules/Syndication/Deals/deals-list.css"
import { DEALS_LIST_REFETCH_EVENT } from "@/modules/Syndication/Deals/createDealFormDraftStorage"
import { ExportInvestmentsModal } from "./ExportInvestmentsModal"
import {
  investmentRowMatchesOnboardingTab,
  resolveInvestmentOnboardingBucket,
} from "./investmentOnboardingBucket"
import type { InvestNowLocationState } from "@/modules/Investing/pages/invest/investNowLocationState"
import type { InvestNowDraftProgress } from "@/modules/Investing/pages/invest/investNowDraftProgress"
import type { InvestNowStepperPhase } from "@/modules/Investing/pages/invest/investNowFlowSteps"
import { getMergedInvestmentListRows } from "./investmentsRuntimeData"
import type { InvestmentListRow } from "./investments.types"
import {
  investmentRowArchivedForInvestorView,
} from "@/modules/Investing/utils/investorDealArchiveView"
import "@/common/components/data-table/data-table.css"
import "./investments-page.css"

export type { InvestmentListRow } from "./investments.types"

const INVESTMENTS_TAB_PARAM = "tab"

type InvestmentsPageTab = "in_progress" | "pending" | "archives"

const TAB_IDS: Record<InvestmentsPageTab, string> = {
  in_progress: "investments-tab-in-progress",
  pending: "investments-tab-pending",
  archives: "investments-tab-archives",
}

function parseInvestmentsTab(value: string | null): InvestmentsPageTab {
  if (value === "archives") return "archives"
  if (value === "pending") return "pending"
  // Legacy `?tab=investments` / `deals` — default to Active tab.
  return "in_progress"
}

/** Deal name cell — same avatar + link layout as {@link DealsListPage} `DealListNameCell`. */
function InvestmentDealNameCell({
  row,
  pendingOnboarding,
}: {
  row: InvestmentListRow
  pendingOnboarding?: boolean
}) {
  const { switchToInvesting } = usePortalMode()
  const dealId = (row.dealId ?? row.id ?? "").trim()
  const name = row.investmentName?.trim() || "—"
  const nameLink = dealId ? (
    <Link
      className="deals_table_name_link"
      to={`/investing/investments/${encodeURIComponent(dealId)}`}
      onClick={() => switchToInvesting()}
      state={
        pendingOnboarding
          ? { returnTo: "/investing/investments?tab=pending" }
          : undefined
      }
    >
      {name}
    </Link>
  ) : (
    <span className="deals_table_name_link">{name}</span>
  )

  return (
    <div className="deals_list_name_cell">
      <DealAvatarIconRing />
      <div className="deals_list_name_text">
        <div className="deals_list_name_primary">{nameLink}</div>
      </div>
    </div>
  )
}

function InvestmentProgressCell({
  progress,
}: {
  progress: InvestNowDraftProgress
}) {
  const { percent, phaseLabel } = progress
  const stepLabel = phaseLabel.trim() || "In progress"

  return (
    <div className="investments_table_progress_cell">
      <span className="investments_table_progress_step" title={stepLabel}>
        {stepLabel}
      </span>
      <div className="investments_table_progress">
        <div
          className="investments_table_progress_track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Onboarding progress: ${percent}% — ${stepLabel}`}
        >
          <div
            className="investments_table_progress_fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="investments_table_progress_pct">{percent}%</span>
      </div>
    </div>
  )
}

function InvestmentsEmptyDash() {
  return (
    <span className="investments_empty_dash" aria-hidden>
      —
    </span>
  )
}

function investmentsTextOrDash(value: string | null | undefined) {
  const t = String(value ?? "").trim()
  if (!t || t === "—") return <InvestmentsEmptyDash />
  return t
}

type InvestmentsTablePanelProps = {
  loading: boolean
  totalRows: number
  query: string
  onQueryChange: (value: string) => void
  onExport: () => void
  searchAriaLabel: string
  columns: DataTableColumn<InvestmentListRow>[]
  filtered: InvestmentListRow[]
  emptyMessage: string
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    onPageChange: (nextPage: number) => void
    onPageSizeChange: (nextSize: number) => void
    ariaLabel: string
  }
}

/** Same table shell as {@link DealsListPage} investing list (`deal_inv_table_panel`). */
function InvestmentsTablePanel({
  loading,
  totalRows,
  query,
  onQueryChange,
  onExport,
  searchAriaLabel,
  columns,
  filtered,
  emptyMessage,
  pagination,
}: InvestmentsTablePanelProps) {
  const isInitialLoad = loading && totalRows === 0

  return (
    <div
      className={`um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel investments_table_panel${
        isInitialLoad ? " investments_page_loading_panel" : ""
      }${loading ? " deals_list_table_panel_loading" : ""}`}
      aria-busy={loading}
    >
      {isInitialLoad ? (
        <div
          className="investments_page_loading"
          role="status"
          aria-live="polite"
          aria-label="Loading investments"
        >
          <div className="data_table_loader_spinner" aria-hidden />
          <span className="investments_page_loading_text">Loading investments…</span>
        </div>
      ) : (
        <>
          <div className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
            <div className="um_toolbar_actions deal_inv_table_toolbar_actions deals_list_toolbar_actions">
              <button
                type="button"
                className="um_toolbar_export_btn"
                onClick={onExport}
              >
                <Download size={18} strokeWidth={2} aria-hidden />
                <span>Export All</span>
              </button>
            </div>
            <div className="um_search_wrap">
              <Search className="um_search_icon" size={18} aria-hidden />
              <input
                type="search"
                className="um_search_input"
                placeholder="Search investments…"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                aria-label={searchAriaLabel}
              />
            </div>
          </div>
          <DataTable<InvestmentListRow>
            visualVariant="members"
            membersTableClassName="um_table_members deal_inv_table"
            stickyColumnCount={2}
            columns={columns}
            rows={filtered}
            isLoading={loading}
            getRowKey={(r, i) =>
              (r.dealId && r.dealId.trim()) || r.id || `inv-row-${i}`
            }
            emptyLabel={
              query.trim()
                ? "No investments match your search."
                : emptyMessage
            }
            initialSort={{ columnId: "dealName", direction: "asc" }}
            pagination={filtered.length > 0 ? pagination : undefined}
          />
        </>
      )}
    </div>
  )
}

function useMergedInvestmentRows() {
  const [rows, setRows] = useState<InvestmentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    void (async () => {
      setLoading(true)
      try {
        setRows(await getMergedInvestmentListRows())
      } finally {
        setLoading(false)
      }
    })()
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => {
    function onRefetch() {
      void (async () => {
        setRows(await getMergedInvestmentListRows())
      })()
    }
    window.addEventListener(DEALS_LIST_REFETCH_EVENT, onRefetch)
    return () =>
      window.removeEventListener(DEALS_LIST_REFETCH_EVENT, onRefetch)
  }, [])
  return { rows, setRows, loading, reload }
}

/** Column widths — keep in sync with `--data-table-sticky-col-*-width` in investments-page.css */
const INVESTMENTS_TABLE_COL_WIDTH = {
  dealName: "13rem",
  progress: "10rem",
  sponsor: "9.5rem",
  dealType: "9rem",
  secType: "7rem",
  propertyName: "10rem",
  owningEntity: "9rem",
  startDate: "7.5rem",
  closeDate: "7.5rem",
  investedAs: "8rem",
  invested: "7.5rem",
  distributed: "8rem",
  valuation: "8rem",
  actions: "5rem",
} as const

export default function InvestmentsPage() {
  const navigate = useNavigate()
  const { switchToInvesting } = usePortalMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseInvestmentsTab(searchParams.get(INVESTMENTS_TAB_PARAM))
  const { rows, loading } = useMergedInvestmentRows()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const checkoutReturnHandledRef = useRef(false)

  useEffect(() => {
    if (checkoutReturnHandledRef.current) return
    const result = searchParams.get("investment_payment")
    if (!result) return
    checkoutReturnHandledRef.current = true
    const sessionId = searchParams.get("session_id")?.trim() ?? ""
    const clearReturnParams = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete("investment_payment")
          next.delete("session_id")
          return next
        },
        { replace: true },
      )
    }
    if (result === "cancel") {
      toast.warning(
        "Payment canceled",
        "Your commitment is saved; no payment was submitted.",
      )
      clearReturnParams()
      return
    }
    if (result !== "success" || !sessionId) {
      clearReturnParams()
      return
    }
    void (async () => {
      try {
        const synced = await syncInvestorInvestmentCheckout(sessionId)
        if (synced.paymentStatus === "succeeded") {
          toast.success(
            "Investment funded",
            "Stripe confirmed your investment payment.",
          )
        } else {
          toast.warning(
            "Payment processing",
            "ACH payments can take several business days. We’ll update the investment after Stripe confirms settlement.",
          )
        }
        window.dispatchEvent(new Event(DEALS_LIST_REFETCH_EVENT))
      } catch (err) {
        toast.error(
          "Could not verify payment",
          err instanceof Error ? err.message : "The webhook will retry shortly.",
        )
      } finally {
        clearReturnParams()
      }
    })()
  }, [searchParams, setSearchParams])

  const setActiveTab = useCallback(
    (tab: InvestmentsPageTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (tab === "in_progress") {
            next.delete(INVESTMENTS_TAB_PARAM)
          } else {
            next.set(INVESTMENTS_TAB_PARAM, tab)
          }
          return next
        },
        { replace: true },
      )
      setQuery("")
    },
    [setSearchParams],
  )

  const { inProgressCount, pendingCount, archivedCount } = useMemo(() => {
    let inProgress = 0
    let pending = 0
    let archived = 0
    for (const r of rows) {
      if (investmentRowArchivedForInvestorView(r)) {
        archived++
        continue
      }
      if (investmentRowMatchesOnboardingTab(r, "pending")) pending++
      if (investmentRowMatchesOnboardingTab(r, "in_progress")) inProgress++
    }
    return {
      inProgressCount: inProgress,
      pendingCount: pending,
      archivedCount: archived,
    }
  }, [rows])

  const rowsForTab = useMemo(() => {
    if (activeTab === "archives") {
      return rows.filter((r) => investmentRowArchivedForInvestorView(r))
    }
    return rows.filter((r) => {
      if (investmentRowArchivedForInvestorView(r)) return false
      return investmentRowMatchesOnboardingTab(
        r,
        activeTab === "pending" ? "pending" : "in_progress",
      )
    })
  }, [rows, activeTab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...rowsForTab]
    return rowsForTab.filter((r) => {
      const haystack = [
        r.investmentName,
        r.offeringName,
        r.investmentProfile,
        r.viewerRolesLabel,
        r.dealType,
        r.secType,
        r.propertyName,
        r.owningEntityName,
        r.dealSponsorName,
        dealStageLabel(r.status ?? ""),
      ]
        .map((s) => String(s ?? "").toLowerCase())
        .join(" ")
      return haystack.includes(q)
    })
  }, [query, rowsForTab])

  useEffect(() => {
    setPage(1)
  }, [activeTab, query])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    if (page > totalPages) setPage(totalPages)
  }, [filtered.length, pageSize, page])

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filtered.length,
      onPageChange: setPage,
      onPageSizeChange: (n: number) => {
        setPageSize(n)
        setPage(1)
      },
      ariaLabel: "Investments table pagination",
    }),
    [page, pageSize, filtered.length],
  )

  // const openDealPreview = useCallback(
  //   (dealId: string, returnTab?: InvestmentsPageTab) => {
  //     const id = dealId.trim()
  //     if (!id) return
  //     switchToInvesting()
  //     const returnTo =
  //       returnTab === "pending"
  //         ? "/investing/investments?tab=pending"
  //         : "/investing/investments"
  //     navigate(dealWorkspacePath(id), { state: { returnTo } })
  //   },
  //   [navigate, switchToInvesting],
  // )

  const investNowReturnTo =
    activeTab === "pending"
      ? "/investing/investments?tab=pending"
      : "/investing/investments"

  const openInvestNowFresh = useCallback(
    (dealId: string) => {
      const id = dealId.trim()
      if (!id) return
      switchToInvesting()
      navigate(dealInvestNowPath(id), {
        state: {
          returnTo: investNowReturnTo,
          mode: "fresh",
        } satisfies InvestNowLocationState,
      })
    },
    [navigate, switchToInvesting, investNowReturnTo],
  )

  const openInvestNowResume = useCallback(
    (
      dealId: string,
      scope?: InvestmentListRow["investNowResumeScope"],
      phaseId?: InvestNowStepperPhase["id"],
    ) => {
      const id = dealId.trim()
      if (!id) return
      switchToInvesting()
      navigate(dealInvestNowPath(id), {
        state: {
          returnTo: investNowReturnTo,
          mode: "resume",
          investmentId: scope?.investmentId,
          userInvestorProfileId: scope?.userInvestorProfileId,
          profileId: scope?.profileId,
          phaseId,
        } satisfies InvestNowLocationState,
      })
    },
    [navigate, switchToInvesting, investNowReturnTo],
  )

  const columns: DataTableColumn<InvestmentListRow>[] = useMemo(
    () => [
      {
        id: "dealName",
        header: "Deal name",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.dealName,
        thClassName: "investments_col_deal_name",
        tdClassName: "um_td_user investments_col_deal_name",
        sortValue: (r) => (r.investmentName ?? "").toLowerCase(),
        cell: (r) => (
          <InvestmentDealNameCell
            row={r}
            pendingOnboarding={
              activeTab === "pending" ||
              resolveInvestmentOnboardingBucket(r) === "pending"
            }
          />
        ),
      },
      {
        id: "investNowProgress",
        header: "Progress",
        align: "center",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.progress,
        thClassName: "investments_col_progress deals_th_align_center",
        tdClassName: "investments_col_progress",
        sortValue: (r) => r.investNowDraftProgress?.percent ?? -1,
        cell: (r) => {
          if (!r.investNowDraftProgress) return <InvestmentsEmptyDash />
          return <InvestmentProgressCell progress={r.investNowDraftProgress} />
        },
      },
      // {
      //   id: "dealStage",
      //   header: "Deal stage",
      //   sortValue: (r) => dealStageLabel(r.status ?? "").toLowerCase(),
      //   cell: (r) => {
      //     const label = dealStageLabel(r.status ?? "").trim() || "—"
      //     if (label === "—") {
      //       return <span className="um_status_muted">—</span>
      //     }
      //     return (
      //       <span
      //         className={dealStageChipCompactClassName(r.status)}
      //         title={`Stage: ${label}`}
      //       >
      //         <span className="deals_list_stage_badge_icon" aria-hidden>
      //           <CircleDot size={12} strokeWidth={2} />
      //         </span>
      //         <span>{label}</span>
      //       </span>
      //     )
      //   },
      // },
      // {
      //   id: "yourRole",
      //   header: "Your role",
      //   sortValue: (r) => (r.viewerRolesLabel ?? "").toLowerCase(),
      //   cell: (r) => {
      //     const label = (r.viewerRolesLabel ?? "").trim() || "—"
      //     if (label === "—") {
      //       return <span className="um_status_muted">—</span>
      //     }
      //     return <span className="deals_list_viewer_role_label">{label}</span>
      //   },
      // },
      {
        id: "dealSponsorName",
        header: "Sponsor",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.sponsor,
        sortValue: (r) => (r.dealSponsorName ?? "").toLowerCase(),
        cell: (r) => investmentsTextOrDash(r.dealSponsorName),
      },
      {
        id: "dealType",
        header: "Deal type",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.dealType,
        sortValue: (r) => (r.dealType ?? "").toLowerCase(),
        cell: (r) => investmentsTextOrDash(dealTypeDisplayLabel(r.dealType ?? "")),
      },
      {
        id: "secType",
        header: "SEC type",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.secType,
        sortValue: (r) => secTypeDisplayLabel(r.secType ?? "").toLowerCase(),
        cell: (r) => investmentsTextOrDash(secTypeDisplayLabel(r.secType ?? "")),
      },
      {
        id: "propertyName",
        header: "Property name",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.propertyName,
        sortValue: (r) => (r.propertyName ?? "").toLowerCase(),
        cell: (r) => investmentsTextOrDash(r.propertyName),
      },
      {
        id: "owningEntity",
        header: "Owning entity",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.owningEntity,
        sortValue: (r) => (r.owningEntityName ?? "").toLowerCase(),
        cell: (r) => investmentsTextOrDash(r.owningEntityName),
      },
      {
        id: "start",
        header: "Start date",
        align: "center",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.startDate,
        thClassName: "deals_th_align_center investments_col_start_date",
        tdClassName: "investments_col_start_date",
        sortValue: (r) => dateSortValue(r.startDateDisplay),
        cell: (r) =>
          investmentsTextOrDash(formatDealListDateDisplay(r.startDateDisplay)),
      },
      {
        id: "close",
        header: "Close date",
        align: "center",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.closeDate,
        thClassName: "deals_th_align_center investments_col_date",
        tdClassName: "investments_col_date",
        sortValue: (r) => dateSortValue(r.dealCloseDate),
        cell: (r) =>
          investmentsTextOrDash(formatDealListDateDisplay(r.dealCloseDate)),
      },
      {
        id: "investmentProfile",
        header: "Invested as",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.investedAs,
        thClassName: "investments_col_invested_as",
        tdClassName: "investments_col_invested_as investments_col_profile_name",
        sortValue: (r) => (r.investmentProfile ?? "").toLowerCase(),
        cell: (r) => {
          const investedAs = r.investmentProfile?.trim() || ""
          if (!investedAs || investedAs === "—") return <InvestmentsEmptyDash />
          return (
            <span
              className="investments_invested_as_name investments_profile_name_text"
              title={investedAs}
            >
              {investedAs}
            </span>
          )
        },
      },
      {
        id: "investedAmount",
        header: "Investment",
        align: "right",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.invested,
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric",
        sortValue: (r) => r.investedAmount,
        cell: (r) =>
          r.investedAmount > 0 ? (
            <TableCompactAmountCell amount={r.investedAmount} />
          ) : (
            <InvestmentsEmptyDash />
          ),
      },
      {
        id: "distributedAmount",
        header: "Distributed",
        align: "right",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.distributed,
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric",
        sortValue: (r) => r.distributedAmount,
        cell: (r) =>
          r.distributedAmount > 0 ? (
            <TableCompactAmountCell amount={r.distributedAmount} />
          ) : (
            <InvestmentsEmptyDash />
          ),
      },
      {
        id: "currentValuation",
        header: "Valuation",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.valuation,
        sortValue: (r) => (r.currentValuation ?? "").toLowerCase(),
        cell: (r) => investmentsTextOrDash(r.currentValuation),
      },
      // {
      //   id: "actionRequired",
      //   header: "Action",
      //   sortValue: (r) => (r.actionRequired ?? "").toLowerCase(),
      //   cell: (r) => r.actionRequired || "—",
      // },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: INVESTMENTS_TABLE_COL_WIDTH.actions,
        thClassName: "um_th_actions deals_th_actions_head",
        tdClassName: "um_td_actions deal_inv_td_actions",
        cell: (r) => {
          const dealId = (r.dealId ?? r.id ?? "").trim()
          if (!dealId) return null
          const onPendingTab = activeTab === "pending"
          const investorArchived = investmentRowArchivedForInvestorView(r)
          const showResume =
            !investorArchived &&
            onPendingTab &&
            Boolean(r.hasInvestNowDraft && r.investNowResumeScope)
          const showInvestNow =
            !investorArchived &&
            (onPendingTab ? !showResume : activeTab === "in_progress")
          const actionsDisabled =
            investorArchived || (!showResume && !showInvestNow)
          return (
            <div className="deal_members_actions_cell">
              {/* Preview deal action disabled for investments table */}
              <DealRowActions
                readOnlyActions
                dealId={dealId}
                dealName={r.investmentName}
                dealStage={r.status}
                archived={investorArchived}
                actionsDisabled={actionsDisabled}
                onInvestNow={
                  showInvestNow ? () => openInvestNowFresh(dealId) : undefined
                }
                onResumeInvesting={
                  showResume
                    ? () =>
                        openInvestNowResume(
                          dealId,
                          r.investNowResumeScope,
                          r.investNowDraftProgress?.phaseId,
                        )
                    : undefined
                }
              />
            </div>
          )
        },
      },
    ],
    [activeTab, openInvestNowFresh, openInvestNowResume],
  )

  const investmentsEmptyMessage =
    activeTab === "archives"
      ? "No archived deals or investments here yet."
      : activeTab === "pending"
        ? "No deals awaiting investor onboarding."
        : "No active investments in your portfolio yet."

  const investmentsTablePanelProps = {
    loading,
    totalRows: rows.length,
    query,
    onQueryChange: setQuery,
    onExport: () => setExportModalOpen(true),
    columns,
    filtered,
    emptyMessage: investmentsEmptyMessage,
    pagination,
  } as const

  // const pageLead =
  //   activeTab === "deals"
  //     ? "Deals in your investing scope — organization deals and deals where you are on the roster."
  //     : activeTab === "archives"
  //       ? "Archived investments and deals."
  //       : "Your commitments by deal. Select a row to see property details, cash flow, and debt information."
  const pageLead = ""

  return (
    <section
      className="um_page deals_list_page investments_page"
      aria-labelledby="investments-page-title"
    >
      <div className="um_members_header_block investments_page_header">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon" id="investments-page-title">
            <Briefcase
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            Investments
          </h2>
        </div>
        {pageLead ? (
          <p className="investments_page_lead">{pageLead}</p>
        ) : null}
      </div>

      <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Investment views"
          >
            {/* Deals tab merged into Investments — same columns, single table. */}
            {/* <button
              type="button"
              id="investments-tab-deals"
              role="tab"
              aria-selected={false}
              aria-controls="investments-list-tabpanel"
              className="um_members_tab deals_tabs_tab um_segmented_tab"
              onClick={() => setActiveTab("deals")}
            >
              <Briefcase
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">Deals</span>
            </button> */}
            <button
              type="button"
              id={TAB_IDS.in_progress}
              role="tab"
              aria-selected={activeTab === "in_progress"}
              aria-controls="investments-list-tabpanel"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "in_progress" ? " um_members_tab_active" : ""}`}
              onClick={() => setActiveTab("in_progress")}
            >
              <TrendingUp
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Active
              </span>
              <span className="deals_tabs_count">({inProgressCount})</span>
            </button>
            <button
              type="button"
              id={TAB_IDS.pending}
              role="tab"
              aria-selected={activeTab === "pending"}
              aria-controls="investments-list-tabpanel"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "pending" ? " um_members_tab_active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              <Clock
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Pending
              </span>
              <span className="deals_tabs_count">({pendingCount})</span>
            </button>
            <button
              type="button"
              id={TAB_IDS.archives}
              role="tab"
              aria-selected={activeTab === "archives"}
              aria-controls="investments-list-tabpanel"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "archives" ? " um_members_tab_active" : ""}`}
              onClick={() => setActiveTab("archives")}
            >
              <Archive
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Archives
              </span>
              <span className="deals_tabs_count">({archivedCount})</span>
            </button>
          </div>
        </TabsScrollStrip>
      </div>

      <div className="um_members_tab_content">
        <div
          id="investments-list-tabpanel"
          role="tabpanel"
          aria-labelledby={TAB_IDS[activeTab]}
        >
          {/* Former Deals tab — embedded list commented out; deal columns live on Investments. */}
          {/* <div hidden aria-hidden>
            <DealsListPage
              dealsListContext="investing"
              embedded
            />
          </div> */}
          <InvestmentsTablePanel
            {...investmentsTablePanelProps}
            searchAriaLabel={
              activeTab === "archives"
                ? "Search archived investments"
                : activeTab === "pending"
                  ? "Search pending investments"
                  : "Search active investments"
            }
          />
        </div>
      </div>

      <ExportInvestmentsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        investments={rowsForTab}
      />
    </section>
  )
}
