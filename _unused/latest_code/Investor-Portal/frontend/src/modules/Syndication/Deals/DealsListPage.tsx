import {
  Archive,
  Ban,
  Briefcase,
  CircleDot,
  Download,
  FilePenLine,
  Plus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react"
import { DealAvatarIconRing } from "../../../common/components/entity-avatar/EntityAvatarNameCell"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  TABLE_PAGE_SIZE_ID,
  usePersistedTablePageSize,
} from "@/common/hooks/usePersistedTablePageSize"
import {
  applyDealsSearchToParams,
  readDealsSearchQuery,
} from "@/common/deals/dealsSearchQuery"
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import {
  isDealSponsorSessionUser,
  isSponsorWorkspaceInvestingViewer,
} from "@/common/auth/roleUtils"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import {
  dealRowSupportsRosterApiPrefetch,
  filterDealListRowsVisibleToInvestors,
  filterDealListToInvestingDealsPage,
  formatViewerInvestingDealRolesLabel,
  resolveViewerInvestingDealRoles,
} from "@/modules/Investing/utils/investingViewerDealScope"
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable"
import { TabsScrollStrip } from "../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import { toast } from "../../../common/components/Toast"
import {
  deleteDeal,
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealMembers,
  fetchDealsList,
  isDealListRowIncomplete,
  patchDealArchived,
} from "./api/dealsApi"
import {
  clearCreateDealDraft,
  CREATE_DEAL_DRAFT_UPDATED_EVENT,
  DEALS_LIST_REFETCH_EVENT,
  notifyDealsListRefetch,
} from "./createDealFormDraftStorage"
import {
  CREATE_DEAL_DRAFT_ROW_ID,
  buildCreateDealDraftListRow,
} from "./createDealDraftListRow"
import { dealStageLabel } from "../dealsDashboardUtils"
import type { DealListRow } from "./types/deals.types"
import { dealStageChipCompactClassName } from "./utils/dealStageChip"
import {
  dealSaasPaywallFromListRow,
  isDealListRowSaasLocked,
  type DealSaasPaywallDeal,
} from "./utils/dealSaasAccess"
import { DealPreviewModal } from "./components/DealPreviewModal"
import { DealRowActions } from "./components/DealRowActions"
import { DealSaasPaywallModal } from "./components/DealSaasPaywallModal"
import { ExportDealsModal } from "./components/ExportDealsModal"
import {
  FormTooltip,
  type FormTooltipPanelAlign,
} from "../../../common/components/form-tooltip/FormTooltip"
import { TableCompactAmountCell } from "../../../common/components/card-compact-amount/CardCompactAmount"
import {
  committedSortValue,
  dateSortValue,
  dealTypeDisplayLabel,
  formatDealListDateDisplay,
  secTypeDisplayLabel,
} from "./dealsListDisplay"
// import { DealInvestorRoleBadge } from "./tabs/investors/DealInvestorRoleBadge"
import "../usermanagement/user_management.css"
import "./tabs/deal_members/add-investment/add_deal_modal.css"
import "./deal-investors-tab.css"
import "./deals-list.css"

type DealsListTab = "deals" | "archives"

function DealTableColumnHeader({
  label,
  hint,
  icon: HeaderIcon,
  headerAlign = "left",
  tooltipPlacement = "bottom",
  tooltipPanelAlign,
  hintOpenOnHover = true,
}: {
  label: string
  hint: string
  icon?: LucideIcon
  headerAlign?: "left" | "center" | "right"
  tooltipPlacement?: "top" | "bottom"
  /** When set, overrides alignment derived from headerAlign (helps narrow columns). */
  tooltipPanelAlign?: FormTooltipPanelAlign
  /** When false, the (i) hint opens on click only, not on hover. */
  hintOpenOnHover?: boolean
}) {
  const headerAlignClass =
    headerAlign === "right"
      ? " deals_table_col_header_end"
      : headerAlign === "center"
        ? " deals_table_col_header_center"
        : ""
  const panelAlign: FormTooltipPanelAlign =
    tooltipPanelAlign ??
    (headerAlign === "right"
      ? "end"
      : headerAlign === "center"
        ? "center"
        : "start")
  return (
    <span className={`deals_table_col_header${headerAlignClass}`}>
      {HeaderIcon ? (
        <HeaderIcon
          className="deals_table_col_header_icon"
          size={14}
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
      <span>{label}</span>
      <span
        className="deals_table_header_tooltip_anchor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FormTooltip
          label={`More information: ${label}`}
          content={<p className="deals_table_header_tooltip_p">{hint}</p>}
          placement={tooltipPlacement}
          panelAlign={panelAlign}
          openOnHover={hintOpenOnHover}
          nativeButtonTrigger={false}
        />
      </span>
    </span>
  )
}

function DealListNameCell({
  row,
  onOpenDeal,
}: {
  row: DealListRow
  onOpenDeal?: (row: DealListRow) => void
}) {
  const isSessionDraft = row.id === CREATE_DEAL_DRAFT_ROW_ID
  /** Pen icon while create wizard is in progress or required deal fields are still incomplete. */
  const showDraftMarker =
    isSessionDraft || isDealListRowIncomplete(row)

  const nameLink = isSessionDraft ? (
    <Link className="deals_table_name_link" to="/deals/create?resume=1">
      {row.dealName || "—"}
    </Link>
  ) : onOpenDeal ? (
    <a
      className="deals_table_name_link"
      href={`/deals/${row.id}`}
      onClick={(e) => {
        e.preventDefault()
        onOpenDeal(row)
      }}
    >
      {row.dealName || "—"}
    </a>
  ) : (
    <Link className="deals_table_name_link" to={`/deals/${row.id}`}>
      {row.dealName || "—"}
    </Link>
  )

  return (
    <div className="deals_list_name_cell">
      <DealAvatarIconRing />
      <div className="deals_list_name_text">
        <div
          className={[
            "deals_list_name_primary",
            showDraftMarker ? "deals_list_name_with_draft" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {nameLink}
          {showDraftMarker ? (
            <span
              className="deals_list_draft_icon deals_list_draft_icon--draft"
              title="Incomplete draft"
            >
              <FilePenLine size={14} strokeWidth={2} aria-hidden />
              <span className="deals_list_sr_only">Draft</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DealsSuspendAllConfirmModal({
  open,
  dealCount,
  onCancel,
  onConfirm,
}: {
  open: boolean
  dealCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  if (!open) return null

  const n = dealCount
  return (
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
      role="presentation"
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel deals_suspend_all_modal_panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head">
          <h3 id={titleId} className="um_modal_title">
            Suspend all deals?
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="deals_suspend_all_modal_body">
          <p className="deals_suspend_all_modal_message">
            Move {n} deal{n === 1 ? "" : "s"} to Archives? You can restore them
            from the Archives tab.
          </p>
        </div>
        <div className="um_modal_actions add_contact_modal_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={onCancel}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <button
            type="button"
            className="um_btn_primary"
            onClick={onConfirm}
          >
            <Archive size={16} strokeWidth={2} aria-hidden />
            Move to Archives
          </button>
        </div>
      </div>
    </div>
  )
}

export type DealsListPageContext = "syndicating" | "investing"

export type InvestingDealsArchiveView = "active" | "archived"

export type DealsListPageProps = {
  /**
   * `investing`: same table as syndicating, loads org + participant deals; hides
   * add-deal / suspend-all / draft row / destructive row actions.
   */
  dealsListContext?: DealsListPageContext
  /** When true, omits page title and outer chrome (for Investing → Investments tabs). */
  embedded?: boolean
  /**
   * Investing list only: which archived state to show when embedded in Investments.
   * Defaults to active (non-archived) deals.
   */
  investingArchiveView?: InvestingDealsArchiveView
  /** Embedded investing list: report active/archived totals for parent tab badges. */
  onTabCountsChange?: (counts: {
    active: number
    archived: number
  }) => void
}

export function DealsListPage({
  dealsListContext = "syndicating",
  embedded = false,
  investingArchiveView = "active",
  onTabCountsChange,
}: DealsListPageProps = {}) {
  const { mode } = usePortalMode()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const hideCreateDraftRow =
    location.pathname === "/deals/create" ||
    dealsListContext === "investing"
  const urlDealsQuery =
    dealsListContext === "syndicating" && !embedded
      ? readDealsSearchQuery(searchParams)
      : ""
  const [query, setQuery] = useState(urlDealsQuery)

  useEffect(() => {
    if (dealsListContext !== "syndicating" || embedded) return
    setQuery(urlDealsQuery)
  }, [dealsListContext, embedded, urlDealsQuery])

  function handleDealsQueryChange(value: string) {
    setQuery(value)
    if (dealsListContext !== "syndicating" || embedded) return
    setSearchParams(applyDealsSearchToParams(searchParams, value), {
      replace: true,
    })
  }
  const [activeTab, setActiveTab] = useState<DealsListTab>("deals")
  const [dealsPage, setDealsPage] = useState(1)
  const [dealsPageSize, setDealsPageSize] = usePersistedTablePageSize(
    TABLE_PAGE_SIZE_ID.deals,
  )
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [previewDealId, setPreviewDealId] = useState<string | null>(null)
  const [saasPaywallDeal, setSaasPaywallDeal] =
    useState<DealSaasPaywallDeal | null>(null)
  const [suspendAllOpen, setSuspendAllOpen] = useState(false)
  const [suspendAllIds, setSuspendAllIds] = useState<string[]>([])
  const [rows, setRows] = useState<DealListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createDealDraftTick, setCreateDealDraftTick] = useState(0)
  /**
   * Same sources as deal detail: investors KPI + rows, and investor-classes
   * (Offering Information) for the Investor Class column.
   */
  const [investorMetricsByDealId, setInvestorMetricsByDealId] = useState<
    Record<
      string,
      {
        committedRaw: string
        fundedRaw: string
        remainingRaw: string
        investorCount: number
        investorClassesLine: string
        /** Investing deals tab: Sponsor / LP Investor / both. */
        viewerRolesLabel: string
      }
    >
  >({})

  const loadDealsList = useCallback(() => {
    return dealsListContext === "investing"
      ? fetchDealsList({ includeParticipantDeals: true })
      : fetchDealsList()
  }, [dealsListContext])

  useEffect(() => {
    if (dealsListContext === "investing" && mode !== "investing") return
    let cancelled = false
    void (async () => {
      setLoading(true)
      let list = await loadDealsList()
      if (dealsListContext === "investing" && list.length > 0) {
        if (isDealSponsorSessionUser())
          list = filterDealListRowsVisibleToInvestors(list)
        else if (!isSponsorWorkspaceInvestingViewer())
          list = await filterDealListToInvestingDealsPage(list)
      }
      if (!cancelled) {
        setRows(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealsListContext, mode, loadDealsList])

  useEffect(() => {
    if (dealsListContext === "investing") return
    function onDraftUpdated() {
      setCreateDealDraftTick((t) => t + 1)
    }
    window.addEventListener(CREATE_DEAL_DRAFT_UPDATED_EVENT, onDraftUpdated)
    return () =>
      window.removeEventListener(
        CREATE_DEAL_DRAFT_UPDATED_EVENT,
        onDraftUpdated,
      )
  }, [dealsListContext])

  useEffect(() => {
    function onDealsRefetch() {
      void (async () => {
        let list = await loadDealsList()
        if (dealsListContext === "investing" && list.length > 0) {
          if (isDealSponsorSessionUser())
            list = filterDealListRowsVisibleToInvestors(list)
          else if (!isSponsorWorkspaceInvestingViewer())
            list = await filterDealListToInvestingDealsPage(list)
        }
        setRows(list)
      })()
    }
    window.addEventListener(DEALS_LIST_REFETCH_EVENT, onDealsRefetch)
    return () =>
      window.removeEventListener(DEALS_LIST_REFETCH_EVENT, onDealsRefetch)
  }, [loadDealsList, dealsListContext])

  const sessionCreateDealDraftRow = useMemo((): DealListRow | null => {
    void createDealDraftTick
    return buildCreateDealDraftListRow()
  }, [createDealDraftTick])

  const { activeDealsCount, archivedDealsCount } = useMemo(() => {
    let active = 0
    let archived = 0
    for (const r of rows) {
      if (r.archived) archived++
      else active++
    }
    return { activeDealsCount: active, archivedDealsCount: archived }
  }, [rows])

  useEffect(() => {
    if (!embedded || !onTabCountsChange) return
    onTabCountsChange({
      active: activeDealsCount,
      archived: archivedDealsCount,
    })
  }, [
    embedded,
    onTabCountsChange,
    activeDealsCount,
    archivedDealsCount,
  ])

  const rowsForTab = useMemo(() => {
    if (dealsListContext === "investing") {
      const showArchived = investingArchiveView === "archived"
      return rows.filter((r) =>
        showArchived ? Boolean(r.archived) : !r.archived,
      )
    }
    return rows.filter((r) =>
      activeTab === "archives" ? Boolean(r.archived) : !r.archived,
    )
  }, [rows, activeTab, dealsListContext, investingArchiveView])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...rowsForTab]
    return rowsForTab.filter((r) =>
      (r.dealName ?? "").toLowerCase().includes(q),
    )
  }, [query, rowsForTab])

  useEffect(() => {
    setDealsPage(1)
  }, [activeTab, query])

  useEffect(() => {
    const ids = filtered.map((r) => r.id)
    if (ids.length === 0) {
      setInvestorMetricsByDealId({})
      return
    }
    let cancelled = false
    void (async () => {
      const sessionEmail = getSessionUserEmail() ?? ""
      const em = sessionEmail.trim().toLowerCase()
      const investFetchOpts =
        dealsListContext === "investing"
          ? ({ lpInvestorsOnly: false } as const)
          : undefined
      const entries = await Promise.all(
        ids.map(async (id) => {
          const row = filtered.find((r) => r.id === id)
          if (row && !dealRowSupportsRosterApiPrefetch(row)) {
            return [
              id,
              {
                committedRaw: "—",
                fundedRaw: "—",
                remainingRaw: "—",
                investorCount: 0,
                investorClassesLine: "",
                viewerRolesLabel: "—",
              },
            ] as const
          }
          try {
            const [{ kpis, investors }, classes, membersResult] =
              await Promise.all([
                fetchDealInvestors(id, investFetchOpts),
                dealsListContext === "investing"
                  ? Promise.resolve([] as Awaited<
                      ReturnType<typeof fetchDealInvestorClasses>
                    >)
                  : fetchDealInvestorClasses(id),
                fetchDealMembers(id),
              ])
            const membersRoster = membersResult.members
            const investorClassesLine = classes
              .map((c) => String(c.name ?? "").trim())
              .filter(Boolean)
              .join(", ")
            const investorPayload = { kpis, investors }
            const viewerRolesLabel =
              dealsListContext === "investing" && em && em.includes("@")
                ? formatViewerInvestingDealRolesLabel(
                    resolveViewerInvestingDealRoles(
                      membersRoster,
                      investors,
                      em,
                      investorPayload,
                    ),
                  )
                : "—"
            return [
              id,
              {
                committedRaw: kpis.committed,
                fundedRaw: kpis.totalFunded,
                remainingRaw: kpis.remaining,
                investorCount: investors.length,
                investorClassesLine,
                viewerRolesLabel,
              },
            ] as const
          } catch {
            return [
              id,
              {
                committedRaw: "—",
                fundedRaw: "—",
                remainingRaw: "—",
                investorCount: 0,
                investorClassesLine: "",
                viewerRolesLabel: "—",
              },
            ] as const
          }
        }),
      )
      if (!cancelled)
        setInvestorMetricsByDealId(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [filtered, dealsListContext])

  useEffect(() => {
    const id =
      activeTab === "deals" ? "deals-tab-deals" : "deals-tab-archives"
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    })
  }, [activeTab])

  const displayRows = useMemo(() => {
    if (loading && rows.length === 0) return []
    const base = filtered
    if (activeTab !== "deals" || hideCreateDraftRow || !sessionCreateDealDraftRow)
      return base
    const q = query.trim().toLowerCase()
    if (
      q &&
      !(sessionCreateDealDraftRow.dealName ?? "").toLowerCase().includes(q)
    )
      return base
    return [...base, sessionCreateDealDraftRow]
  }, [
    loading,
    rows.length,
    filtered,
    activeTab,
    hideCreateDraftRow,
    sessionCreateDealDraftRow,
    query,
  ])

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(displayRows.length / dealsPageSize),
    )
    if (dealsPage > totalPages) setDealsPage(totalPages)
  }, [displayRows.length, dealsPageSize, dealsPage])

  const dealsPagination = useMemo(
    () => ({
      page: dealsPage,
      pageSize: dealsPageSize,
      totalItems: displayRows.length,
      onPageChange: setDealsPage,
      onPageSizeChange: setDealsPageSize,
      ariaLabel: "Deals table pagination",
    }),
    [dealsPage, dealsPageSize, displayRows.length],
  )

  function handleSuspendAllClick() {
    if (activeTab !== "deals") return
    const ids = filtered.map((r) => r.id)
    if (ids.length === 0) return
    setSuspendAllIds(ids)
    setSuspendAllOpen(true)
  }

  function handleSuspendAllCancel() {
    setSuspendAllOpen(false)
    setSuspendAllIds([])
  }

  function handleSuspendAllConfirm() {
    void (async () => {
      const ids = [...suspendAllIds]
      const n = ids.length
      const results = await Promise.all(
        ids.map((id) => patchDealArchived(id, true)),
      )
      const failed = results.find((r) => !r.ok)
      if (failed) {
        toast.error("Could not archive deals", failed.message)
        const list = await loadDealsList()
        setRows(list)
        handleSuspendAllCancel()
        return
      }
      setRows((prev) =>
        prev.map((r) =>
          ids.includes(r.id) ? { ...r, archived: true } : r,
        ),
      )
      handleSuspendAllCancel()
      toast.success(
        "Deals archived",
        `Moved ${n} deal${n === 1 ? "" : "s"} to Archives.`,
      )
    })()
  }

  const openSyndicatingDeal = useCallback(
    (row: DealListRow) => {
      navigate(`/deals/${encodeURIComponent(row.id)}`)
    },
    [navigate],
  )

  const columns: DataTableColumn<DealListRow>[] = useMemo(() => {
    const nameColumn: DataTableColumn<DealListRow> = {
      id: "name",
      header: (
        <DealTableColumnHeader
          label="Deal Name"
          hint="Legal or marketing name of the offering."
        />
      ),
      colWidth: "15rem",
      thClassName: "deals_col_deal_name",
      tdClassName: "um_td_user deals_col_deal_name",
      sortValue: (row) => (row.dealName ?? "").toLowerCase(),
      cell: (row) => (
        <DealListNameCell
          row={row}
          onOpenDeal={
            row.id === CREATE_DEAL_DRAFT_ROW_ID ? undefined : openSyndicatingDeal
          }
        />
      ),
    }

    const dealStageColumn: DataTableColumn<DealListRow> = {
      id: "dealStage",
      colWidth: "9.5rem",
      header: (
        <DealTableColumnHeader
          label="Deal stage"
          hint="Current lifecycle stage for this offering."
        />
      ),
      thClassName: "deals_col_deal_stage",
      tdClassName: "deals_col_deal_stage",
      sortValue: (row) => dealStageLabel(row.dealStage ?? "").toLowerCase(),
      cell: (row) => {
        const label = dealStageLabel(row.dealStage ?? "").trim() || "—"
        return (
          <span
            className={dealStageChipCompactClassName(row.dealStage)}
            title={`Stage: ${label}`}
          >
            <span className="deals_list_stage_badge_icon" aria-hidden>
              <CircleDot size={12} strokeWidth={2} />
            </span>
            <span>{label}</span>
          </span>
        )
      },
    }

    // const yourRoleColumn: DataTableColumn<DealListRow> = {
    //   id: "yourRole",
    //   header: (
    //     <DealTableColumnHeader
    //       label="Your role"
    //       hint="Your role on this deal’s roster (for example lead sponsor, co-sponsor, or LP investor)."
    //     />
    //   ),
    //   align: "center",
    //   thClassName: "deals_th_align_center",
    //   sortValue: (row) => {
    //     const m = investorMetricsByDealId[row.id]?.viewerRoleMatch
    //     if (!m) return ""
    //     const s =
    //       m.memberRoleLabels?.find((t) => String(t ?? "").trim())?.trim() ??
    //       String(m.investorRole ?? "").trim()
    //     if (!s || s === "—") return ""
    //     return s.toLowerCase()
    //   },
    //   cell: (row) => {
    //     const m = investorMetricsByDealId[row.id]?.viewerRoleMatch
    //     if (!m) {
    //       return <span className="um_status_muted">—</span>
    //     }
    //     return (
    //       <DealInvestorRoleBadge
    //         investorRole={m.investorRole}
    //         memberRoleLabels={m.memberRoleLabels}
    //       />
    //     )
    //   },
    // }

    const startColumn: DataTableColumn<DealListRow> = {
      id: "start",
      colWidth: "8.25rem",
      header: (
        <DealTableColumnHeader
          label="Start Date"
          hint="Date the deal opened or went live."
          headerAlign="center"
        />
      ),
      align: "center",
      thClassName: "deals_th_align_center",
      tdClassName: "deals_td_align_center",
      sortValue: (row) =>
        dateSortValue(row.startDateDisplay ?? row.createdDateDisplay),
      cell: (row) =>
        formatDealListDateDisplay(
          row.startDateDisplay ?? row.createdDateDisplay,
        ),
    }

    const closeColumn: DataTableColumn<DealListRow> = {
      id: "close",
      colWidth: "8.25rem",
      header: (
        <DealTableColumnHeader
          label="Close Date"
          hint="Target or actual close date for the deal."
          headerAlign="center"
        />
      ),
      align: "center",
      thClassName: "deals_th_align_center",
      tdClassName: "deals_td_align_center",
      sortValue: (row) => dateSortValue(row.closeDateDisplay),
      cell: (row) => formatDealListDateDisplay(row.closeDateDisplay),
    }

    const nextBillingColumn: DataTableColumn<DealListRow> = {
      id: "nextBilling",
      colWidth: "9.25rem",
      header: (
        <DealTableColumnHeader
          label="Next billing"
          hint="Until the platform billing start date the deal stays fully accessible. After you pay, this is the next Stripe renewal. Draft, archived, and liquidated deals are not billed."
          headerAlign="center"
        />
      ),
      align: "center",
      thClassName: "deals_th_align_center deals_col_next_billing",
      tdClassName: "deals_td_align_center deals_col_next_billing",
      sortValue: (row) => dateSortValue(row.nextBillingDate ?? ""),
      cell: (row) => {
        if (row.id === CREATE_DEAL_DRAFT_ROW_ID) {
          return <span className="um_status_muted">—</span>
        }
        if (isDealListRowSaasLocked(row)) {
          if (row.nextBillingDate) {
            const expired =
              Date.parse(row.nextBillingDate) < Date.now() ||
              row.billingLockReason === "expired" ||
              row.billingLockReason === "past_due"
            return (
              <span className="um_status_muted">
                {expired
                  ? `Past due · ${formatDealListDateDisplay(row.nextBillingDate)}`
                  : "Payment due"}
              </span>
            )
          }
          return <span className="um_status_muted">Payment due</span>
        }
        if (row.nextBillingDate) {
          return formatDealListDateDisplay(row.nextBillingDate)
        }
        const stage = (row.dealStage ?? "").trim().toLowerCase()
        const notBilled =
          row.archived ||
          stage === "draft" ||
          stage === "liquidated"
        return (
          <span className="um_status_muted">
            {notBilled ? "Not billed" : "Pending"}
          </span>
        )
      },
    }

    const investingYourRoleColumn: DataTableColumn<DealListRow> = {
      id: "yourRole",
      colWidth: "10rem",
      header: (
        <DealTableColumnHeader
          label="Your role"
          hint="Your relationship to this deal: Lead Sponsor, Admin Sponsor, Co-Sponsor, LP Investor, or a combination."
        />
      ),
      sortValue: (row) =>
        (investorMetricsByDealId[row.id]?.viewerRolesLabel ?? "").toLowerCase(),
      cell: (row) => {
        const label = investorMetricsByDealId[row.id]?.viewerRolesLabel ?? "—"
        if (!label || label === "—") {
          return <span className="um_status_muted">—</span>
        }
        return <span className="deals_list_viewer_role_label">{label}</span>
      },
    }

    const investingPreviewColumns: DataTableColumn<DealListRow>[] = [
      investingYourRoleColumn,
      {
        id: "dealType",
        colWidth: "10rem",
        header: (
          <DealTableColumnHeader
            label="Deal type"
            hint="Same field as Deal details preview (wizard / deal type)."
          />
        ),
        sortValue: (row) => (row.dealType ?? "").toLowerCase(),
        cell: (row) => dealTypeDisplayLabel(row.dealType ?? ""),
      },
      {
        id: "secType",
        colWidth: "10rem",
        header: (
          <DealTableColumnHeader
            label="SEC type"
            hint="Regulatory classification shown in Deal details preview."
          />
        ),
        sortValue: (row) =>
          secTypeDisplayLabel(row.secType ?? "").toLowerCase(),
        cell: (row) => secTypeDisplayLabel(row.secType ?? ""),
      },
      {
        id: "propertyName",
        colWidth: "11rem",
        header: (
          <DealTableColumnHeader
            label="Property name"
            hint="Property or asset name from Deal details preview."
          />
        ),
        sortValue: (row) => (row.propertyName ?? "").toLowerCase(),
        cell: (row) => {
          const t = String(row.propertyName ?? "").trim()
          return t || "—"
        },
      },
      {
        id: "owningEntity",
        colWidth: "11rem",
        header: (
          <DealTableColumnHeader
            label="Owning entity"
            hint="Owning entity from Deal details preview."
          />
        ),
        sortValue: (row) => (row.owningEntityName ?? "").toLowerCase(),
        cell: (row) => {
          const t = String(row.owningEntityName ?? "").trim()
          return t || "—"
        },
      },
    ]

    const syndicatingFinancialColumns: DataTableColumn<DealListRow>[] = [
      {
        id: "targetRaised",
        header: (
          <DealTableColumnHeader
            label="Target Raised"
            hint="Total raise target configured for this deal."
            headerAlign="right"
          />
        ),
        align: "right",
        colWidth: "10.75rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => committedSortValue(row.raiseTarget),
        cell: (row) => <TableCompactAmountCell amount={row.raiseTarget} />,
      },
      {
        id: "softCommitted",
        header: (
          <DealTableColumnHeader
            label="Soft Committed"
            hint="In-progress committed amount for the deal."
            headerAlign="right"
          />
        ),
        align: "right",
        colWidth: "10.75rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => committedSortValue(row.totalInProgress),
        cell: (row) => <TableCompactAmountCell amount={row.totalInProgress} />,
      },
      {
        id: "funded",
        header: (
          <DealTableColumnHeader
            label="Funded"
            hint="Funded amount from the Investors KPI for this deal."
            headerAlign="right"
          />
        ),
        align: "right",
        colWidth: "10.75rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => {
          const m = investorMetricsByDealId[row.id]
          return committedSortValue(m?.fundedRaw ?? row.totalAccepted)
        },
        cell: (row) => {
          const m = investorMetricsByDealId[row.id]
          return (
            <TableCompactAmountCell
              amount={m?.fundedRaw ?? row.totalAccepted}
            />
          )
        },
      },
      {
        id: "gap",
        header: (
          <DealTableColumnHeader
            label="Gap"
            hint="Remaining amount to reach target raise."
            headerAlign="right"
          />
        ),
        align: "right",
        colWidth: "10.75rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => {
          const m = investorMetricsByDealId[row.id]
          return committedSortValue(m?.remainingRaw ?? "0")
        },
        cell: (row) => {
          const m = investorMetricsByDealId[row.id]
          return (
            <TableCompactAmountCell amount={m?.remainingRaw ?? "0"} />
          )
        },
      },
      {
        id: "committed",
        header: (
          <DealTableColumnHeader
            label="Committed"
            hint="Committed amount from the deal Investors tab (same KPI as when you open the deal)."
            headerAlign="right"
          />
        ),
        align: "right",
        colWidth: "10.75rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => {
          const m = investorMetricsByDealId[row.id]
          return committedSortValue(m?.committedRaw ?? row.totalAccepted)
        },
        cell: (row) => {
          const m = investorMetricsByDealId[row.id]
          const raw = m?.committedRaw ?? row.totalAccepted
          return <TableCompactAmountCell amount={raw} />
        },
      },
    ]

    const dataCols: DataTableColumn<DealListRow>[] = [
      nameColumn,
      dealStageColumn,
      // yourRoleColumn,
      ...(dealsListContext === "investing" ? investingPreviewColumns : []),
      startColumn,
      closeColumn,
      ...(dealsListContext === "syndicating" ? [nextBillingColumn] : []),
      ...(dealsListContext === "syndicating" ? syndicatingFinancialColumns : []),
      {
        id: "actions",
        colWidth: "5rem",
        header: "Actions",
        align: "center",
        thClassName: "um_th_actions deals_th_actions_head",
        tdClassName: "um_td_actions deal_inv_td_actions",
        cell: (row) => (
          <div className="deal_members_actions_cell">
            <DealRowActions
              draftRow={row.id === CREATE_DEAL_DRAFT_ROW_ID}
              readOnlyActions={dealsListContext === "investing"}
              canEditDeal={row.viewerCanEditDeal !== false}
              dealId={row.id}
              dealName={row.dealName}
              dealStage={row.dealStage}
              archived={Boolean(row.archived)}
              saasAccessLocked={
                dealsListContext === "syndicating" &&
                isDealListRowSaasLocked(row)
              }
              onSaasLocked={() =>
                setSaasPaywallDeal(dealSaasPaywallFromListRow(row))
              }
              onPreviewDeal={
                row.id === CREATE_DEAL_DRAFT_ROW_ID ||
                dealsListContext === "investing"
                  ? undefined
                  : () => setPreviewDealId(row.id)
              }
              onArchived={() => {
                void (async () => {
                  const name = row.dealName?.trim() || "Deal"
                  const result = await patchDealArchived(row.id, true)
                  if (!result.ok) {
                    toast.error("Could not archive deal", result.message)
                    return
                  }
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, archived: true } : r,
                    ),
                  )
                  toast.success("Deal archived", `${name} moved to Archives.`)
                })()
              }}
              onRestored={() => {
                void (async () => {
                  const name = row.dealName?.trim() || "Deal"
                  const result = await patchDealArchived(row.id, false)
                  if (!result.ok) {
                    toast.error("Could not restore deal", result.message)
                    return
                  }
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, archived: false } : r,
                    ),
                  )
                  toast.success("Deal restored", `${name} is active again.`)
                })()
              }}
              onDeleted={async () => {
                if (row.id === CREATE_DEAL_DRAFT_ROW_ID) {
                  clearCreateDealDraft()
                  return
                }
                const result = await deleteDeal(row.id)
                if (!result.ok) {
                  toast.error("Could not delete deal", result.message)
                  return
                }
                setRows((prev) => prev.filter((r) => r.id !== row.id))
                notifyDealsListRefetch()
                toast.success("Deal deleted")
              }}
            />
          </div>
        ),
      },
    ]

    return dataCols
  }, [investorMetricsByDealId, dealsListContext, rows, openSyndicatingDeal])

  function handleOpenExportModal() {
    setExportModalOpen(true)
  }

  const emptyMessage =
    dealsListContext === "investing"
      ? investingArchiveView === "archived"
        ? "No archived deals."
        : "No deal to display."
      : activeTab === "archives"
        ? "No archived deals."
        : "No deal to display."

  const dealsListTablePanel = (
    <div
      id={embedded ? undefined : "deals-list-tabpanel"}
      role={dealsListContext === "investing" ? "region" : "tabpanel"}
      aria-label={
        dealsListContext === "investing"
          ? investingArchiveView === "archived"
            ? "Archived deals list"
            : "My deals list"
          : undefined
      }
      aria-labelledby={
        dealsListContext === "investing"
          ? undefined
          : activeTab === "deals"
            ? "deals-tab-deals"
            : "deals-tab-archives"
      }
      className={`um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel${loading ? " deals_list_table_panel_loading" : ""}`}
      aria-busy={loading}
    >
      <div className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
        <div className="um_toolbar_actions deal_inv_table_toolbar_actions deals_list_toolbar_actions">
          {dealsListContext === "syndicating" && activeTab === "deals" ? (
            <button
              type="button"
              className="deals_suspend_all_btn"
              onClick={handleSuspendAllClick}
            >
              <Ban size={18} strokeWidth={2} aria-hidden />
              <span>Suspend All</span>
            </button>
          ) : null}
          <button
            type="button"
            className="um_toolbar_export_btn"
            onClick={handleOpenExportModal}
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
            placeholder="Search deals…"
            value={query}
            onChange={(e) => handleDealsQueryChange(e.target.value)}
            disabled={loading}
            aria-label="Search deals"
          />
        </div>
      </div>
      <DataTable
        visualVariant="members"
        membersTableClassName="um_table_members deal_inv_table"
        columns={columns}
        rows={displayRows}
        getRowKey={(row, rowIndex) => row.id || `deal-row-${rowIndex}`}
        getRowClassName={(row) =>
          row.id === CREATE_DEAL_DRAFT_ROW_ID ||
          isDealListRowIncomplete(row)
            ? "deals_list_row_draft"
            : undefined
        }
        isLoading={loading && rows.length === 0}
        emptyLabel={
          query.trim() ? "No deals match your search." : emptyMessage
        }
        emptyStateRole={loading ? "status" : undefined}
        pagination={
          !loading && displayRows.length > 0 ? dealsPagination : undefined
        }
      />
    </div>
  )

  const tablePanel = (
    <div
      className={
        dealsListContext === "investing"
          ? "um_members_tab_content deals_list_investing_no_tabs"
          : "um_members_tab_content"
      }
    >
      {dealsListTablePanel}
    </div>
  )

  if (embedded) {
    return (
      <>
        {dealsListTablePanel}
        <ExportDealsModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          deals={rows}
        />
        <DealPreviewModal
          dealId={previewDealId}
          listContext={dealsListContext}
          onClose={() => setPreviewDealId(null)}
        />
        <DealSaasPaywallModal
          deal={saasPaywallDeal}
          onClose={() => setSaasPaywallDeal(null)}
        />
      </>
    )
  }

  return (
    <section className="um_page deals_list_page">
      <div className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <Briefcase
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            My deals
          </h2>
          {dealsListContext === "syndicating" ? (
            <Link className="um_btn_primary deals_list_add_link" to="/deals/create">
              <Plus size={18} aria-hidden />
              Add deal
            </Link>
          ) : null}
        </div>
      </div>

      {/* Deals / Archives tabs — syndicating only. */}
      {dealsListContext === "syndicating" ? (
        <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
          <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
            <div
              className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
              role="tablist"
              aria-label="Deals views"
            >
              <button
                type="button"
                id="deals-tab-deals"
                role="tab"
                aria-selected={activeTab === "deals"}
                aria-controls="deals-list-tabpanel"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  activeTab === "deals" ? " um_members_tab_active" : ""
                }`}
                onClick={() => setActiveTab("deals")}
              >
                <Briefcase
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">Deals</span>
                <span className="deals_tabs_count">({activeDealsCount})</span>
              </button>
              <button
                type="button"
                id="deals-tab-archives"
                role="tab"
                aria-selected={activeTab === "archives"}
                aria-controls="deals-list-tabpanel"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  activeTab === "archives" ? " um_members_tab_active" : ""
                }`}
                onClick={() => setActiveTab("archives")}
              >
                <Archive
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">Archives</span>
                <span className="deals_tabs_count">({archivedDealsCount})</span>
              </button>
            </div>
          </TabsScrollStrip>
        </div>
      ) : null}

      {tablePanel}

      <ExportDealsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        deals={rows}
      />

      <DealPreviewModal
        dealId={previewDealId}
        listContext={dealsListContext}
        onClose={() => setPreviewDealId(null)}
      />

      <DealSaasPaywallModal
        deal={saasPaywallDeal}
        onClose={() => setSaasPaywallDeal(null)}
      />

      <DealsSuspendAllConfirmModal
        open={suspendAllOpen}
        dealCount={suspendAllIds.length}
        onCancel={handleSuspendAllCancel}
        onConfirm={handleSuspendAllConfirm}
      />
    </section>
  )
}
