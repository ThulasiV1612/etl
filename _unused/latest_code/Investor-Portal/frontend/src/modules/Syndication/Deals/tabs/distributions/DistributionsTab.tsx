import {
  ArrowRight,
  BarChart3,
  CircleHelp,
  Download,
  Landmark,
  Loader2,
  // Percent,
  Search,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import { TableCompactAmountCell } from "../../../../../common/components/card-compact-amount/CardCompactAmount"
import { TabsScrollStrip } from "../../../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import { fetchDealInvestors } from "../../api/dealsApi"
import {
  // clearPriorDistributions,
  deletePriorDistribution,
  fetchDistributionSetup,
} from "../../distribution-setup/api/distributionSetupApi"
import type {
  DistributionSetupBundle,
  DistributionSetupClass,
  PriorDistributionRecord,
} from "../../distribution-setup/types/distribution-setup.types"
import { ExportSelectableRowsModal } from "../../components/ExportSelectableRowsModal"
import { BulkDeleteReasonModal } from "../../../../../common/components/bulk-delete-reason-modal/BulkDeleteReasonModal"
import "../../../../../common/components/bulk-delete-reason-modal/bulk-delete-reason-modal.css"
import { toast } from "../../../../../common/components/Toast"
import {
  fetchDealDistributionFundingStatus,
  startDealDistributionFundingOnboarding,
  type DealDistributionFundingStatus,
} from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import type { DealInvestorRow } from "../../types/deal-investors.types"
// import { DistributionFeeTab } from "./DistributionFeeTab"
import { DistributionRowActions } from "./DistributionRowActions"
import { DistributionPeriodCell } from "./DistributionPeriodCell"
import { DistributionNameClassMenu } from "./DistributionNameClassMenu"
import { DistributionClassesPanel } from "./DistributionClassesPanel"
import { downloadDistributionsExportCsv } from "./utils/distributionsExportCsv"
import { sanitizePriorDistributions } from "./utils/investorPreferredAllocation"
import {
  classTableRowsForDistribution,
  computeDistributionListMetrics,
  deductsFromDisplayLabel,
  distributionDisplayName,
  formatPaymentDateLabel,
  formatPeriodCalendarLabel,
  sourceDisplayLabel,
  typeDisplayLabel,
  type DistributionListMetrics,
} from "./utils/distributionListDisplay"
import "../../../usermanagement/user_management.css"
import "../../deals-list.css"
import "./distributions-tab.css"

type DistributionsSubTab = "distributions" | "bank_account" | "distribution_fee"

type DistributionsTabProps = {
  dealId: string
  dealName?: string
}

type CompletedDistributionRow = PriorDistributionRecord & {
  metrics: DistributionListMetrics
}

function formatMoneyPlain(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fundingStatusSlug(status: string): string {
  const raw = status.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return raw || "not-started"
}

function fundingStatusLabel(status: string): string {
  const slug = fundingStatusSlug(status)
  const labels: Record<string, string> = {
    "not-sent": "Not sent",
    "not-started": "Not set up",
    "not-set-up": "Not set up",
    pending: "Pending",
    onboarding: "Onboarding",
    processing: "Processing",
    ready: "Ready",
    restricted: "Restricted",
  }
  if (labels[slug]) return labels[slug]
  return status
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function dealFundingStatusMeta(
  funding: DealDistributionFundingStatus | null,
): { label: string; tone: string } {
  if (!funding) return { label: "Unavailable", tone: "danger" }
  if (funding.fundingReady) return { label: "Ready", tone: "success" }
  const slug = fundingStatusSlug(funding.status || "not-started")
  if (slug === "not-started" || slug === "not-set-up") {
    return { label: "Not set up", tone: "neutral" }
  }
  if (slug === "onboarding" || slug === "pending") {
    return { label: fundingStatusLabel(funding.status), tone: "info" }
  }
  if (slug === "restricted") return { label: "Restricted", tone: "danger" }
  return { label: fundingStatusLabel(funding.status), tone: "neutral" }
}

function formatDealBankDetails(
  funding: DealDistributionFundingStatus | null,
): string | null {
  const bank = funding?.bankAccount
  if (!bank) return null
  const parts: string[] = []
  if (bank.bankName) parts.push(bank.bankName)
  if (bank.last4) parts.push(`···· ${bank.last4}`)
  if (bank.routingNumber) parts.push(`Routing ${bank.routingNumber}`)
  if (bank.accountHolderName) parts.push(bank.accountHolderName)
  if (bank.currency) parts.push(bank.currency)
  return parts.length ? parts.join(" · ") : null
}

/**
 * Deal Detail → Distributions: portal-style list (Woodland Ridge reference).
 */
export function DistributionsTab({ dealId, dealName }: DistributionsTabProps) {
  const id = dealId.trim()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const classSetupHref = `/deals/${encodeURIComponent(id)}/class-setup`
  const distributionSetupHref = `/deals/${encodeURIComponent(id)}/distribution-setup`
  const returnState = { returnTab: "distributions" as const }

  const [activeSubTab, setActiveSubTab] =
    useState<DistributionsSubTab>("distributions")
  const openedFundingReturnRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [priorDistributions, setPriorDistributions] = useState<
    PriorDistributionRecord[]
  >([])
  const [classes, setClasses] = useState<DistributionSetupClass[]>([])
  const [investors, setInvestors] = useState<DealInvestorRow[]>([])
  const [dealFunding, setDealFunding] =
    useState<DealDistributionFundingStatus | null>(null)
  const [fundingBusy, setFundingBusy] = useState(false)
  const fundingReturnKeyRef = useRef<string | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [exportOpen, setExportOpen] = useState(false)
  const [resolvedDealName, setResolvedDealName] = useState(dealName ?? "")
  // const [clearing, setClearing] = useState(false)
  const [deleteTarget, setDeleteTarget] =
    useState<PriorDistributionRecord | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [expandedDistributionId, setExpandedDistributionId] = useState<
    string | null
  >(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    try {
      const [bundle, invPack, funding] = await Promise.all([
        fetchDistributionSetup(id),
        fetchDealInvestors(id, { lpInvestorsOnly: false }),
        fetchDealDistributionFundingStatus(id).catch(() => null),
      ])
      setPriorDistributions(
        sanitizePriorDistributions(bundle.priorDistributions ?? []),
      )
      setClasses(bundle.classes ?? [])
      setInvestors(invPack.investors ?? [])
      setDealFunding(funding)
      if (bundle.dealName?.trim()) setResolvedDealName(bundle.dealName.trim())
    } catch (err) {
      setPriorDistributions([])
      setClasses([])
      setInvestors([])
      setDealFunding(null)
      setLoadError(
        err instanceof Error ? err.message : "Could not load distributions.",
      )
    } finally {
      setLoading(false)
    }
  }, [id])

  const refreshDistributionsQuietly = useCallback(async () => {
    if (!id) return
    try {
      const [bundle, invPack] = await Promise.all([
        fetchDistributionSetup(id),
        fetchDealInvestors(id, { lpInvestorsOnly: false }),
      ])
      setPriorDistributions(
        sanitizePriorDistributions(bundle.priorDistributions ?? []),
      )
      setClasses(bundle.classes ?? [])
      setInvestors(invPack.investors ?? [])
    } catch {
      /* keep the current table if a background refresh fails */
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const fundingReturn = searchParams.get("stripe_deal_funding")
    if (!fundingReturn || !id) return
    const returnKey = `${id}:${fundingReturn}`
    if (fundingReturnKeyRef.current === returnKey) return
    fundingReturnKeyRef.current = returnKey
    if (!openedFundingReturnRef.current) {
      openedFundingReturnRef.current = true
      setActiveSubTab("bank_account")
    }
    void (async () => {
      if (fundingReturn === "refresh") {
        try {
          const link = await startDealDistributionFundingOnboarding(id)
          window.location.assign(link.url)
          return
        } catch (err) {
          toast.error(
            "Bank setup needs attention",
            err instanceof Error ? err.message : "Please restart bank setup.",
          )
        }
      } else {
        try {
          const status = await fetchDealDistributionFundingStatus(id)
          setDealFunding(status)
          if (status.fundingReady) {
            const bankBits = [
              status.bankAccount?.bankName?.trim() || null,
              status.bankAccount?.last4
                ? `···· ${status.bankAccount.last4}`
                : null,
            ].filter(Boolean)
            toast.success(
              "Deal bank account ready",
              bankBits.length
                ? `${bankBits.join(" ")}. ACH distributions can be sent from this account.`
                : "ACH distributions can now be sent from this deal's bank account.",
            )
          } else {
            toast.warning(
              "Bank setup pending",
              "Finish adding the deal bank details before ACH distributions can be sent.",
            )
          }
        } catch (err) {
          toast.error(
            "Could not verify bank setup",
            err instanceof Error ? err.message : "Please try again.",
          )
        }
      }
      const next = new URLSearchParams(searchParams)
      next.delete("stripe_deal_funding")
      setSearchParams(next, { replace: true })
    })()
  }, [id, searchParams, setSearchParams])

  const startDealFundingSetup = useCallback(async () => {
    if (!id || fundingBusy || !dealFunding?.canManage) return
    setFundingBusy(true)
    try {
      const link = await startDealDistributionFundingOnboarding(id)
      window.location.assign(link.url)
    } catch (err) {
      toast.error(
        "Could not start bank setup",
        err instanceof Error ? err.message : "Please try again.",
      )
      setFundingBusy(false)
    }
  }, [id, fundingBusy, dealFunding?.canManage])

  const fundingStatus = useMemo(
    () => dealFundingStatusMeta(dealFunding),
    [dealFunding],
  )
  const dealBankDetailsLabel = useMemo(
    () => formatDealBankDetails(dealFunding),
    [dealFunding],
  )
  const fundingActionLabel = dealFunding?.fundingReady
    ? "Update bank account"
    : dealFunding?.accountId
      ? "Continue setup"
      : "Add bank account"

  const rows: CompletedDistributionRow[] = useMemo(
    () =>
      [...priorDistributions]
        .sort((a, b) => {
          const da = (a.paymentDate || a.date).localeCompare(
            b.paymentDate || b.date,
          )
          if (da !== 0) return -da
          return b.date.localeCompare(a.date)
        })
        .map((p) => ({
          ...p,
          metrics: computeDistributionListMetrics({
            row: p,
            investors,
            classes,
          }),
        })),
    [priorDistributions, investors, classes],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        distributionDisplayName(r),
        r.name ?? "",
        r.date,
        r.amount,
        sourceDisplayLabel(r.source),
        typeDisplayLabel(r),
        deductsFromDisplayLabel(r),
        r.period ?? "",
        r.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, query])

  useEffect(() => {
    setPage(1)
  }, [filtered.length, query])

  useEffect(() => {
    if (
      expandedDistributionId &&
      !filtered.some((r) => r.id === expandedDistributionId)
    ) {
      setExpandedDistributionId(null)
    }
  }, [filtered, expandedDistributionId])

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
      ariaLabel: "Distributions table pagination",
    }),
    [page, pageSize, filtered.length],
  )

  const totals = useMemo(() => {
    let paid = 0
    let unpaid = 0
    for (const r of filtered) {
      paid += r.metrics.paid
      unpaid += r.metrics.unpaid
    }
    return { paid, unpaid }
  }, [filtered])

  const exportRows = useMemo(
    () =>
      filtered.map((r) => ({
        key: r.id,
        label: distributionDisplayName(r),
        meta: `${formatPaymentDateLabel(r.metrics.paymentDate)} · ${sourceDisplayLabel(r.source)}`,
        searchText: [
          distributionDisplayName(r),
          r.date,
          r.amount,
          sourceDisplayLabel(r.source),
          r.notes ?? "",
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [filtered],
  )

  const handleExport = useCallback(
    (selectedKeys: string[]) => {
      const keySet = new Set(selectedKeys)
      const selected = filtered.filter((r) => keySet.has(r.id))
      downloadDistributionsExportCsv({
        rows: selected,
        dealName: resolvedDealName || dealName,
      })
      setExportOpen(false)
    },
    [filtered, resolvedDealName, dealName],
  )

  // const handleClearAll = useCallback(async () => {
  //   if (!id || clearing) return
  //   const ok = window.confirm(
  //     "Clear all completed distributions for this deal?\n\nThis removes the test/history rows only. Class Setup and Distribution Setup (waterfall) are kept.",
  //   )
  //   if (!ok) return
  //   setClearing(true)
  //   try {
  //     const saved = await clearPriorDistributions(id)
  //     setPriorDistributions(
  //       sanitizePriorDistributions(saved.priorDistributions ?? []),
  //     )
  //     toast.success(
  //       "Distributions cleared",
  //       "Complete Q1 / Q2 again from Distribution Setup with the correct dates.",
  //     )
  //   } catch (err) {
  //     toast.error(
  //       "Could not clear",
  //       err instanceof Error ? err.message : "Try again.",
  //     )
  //   } finally {
  //     setClearing(false)
  //   }
  // }, [id, clearing])

  const openEditSetup = useCallback(
    (row: PriorDistributionRecord) => {
      if (!id) return
      navigate(
        `/deals/${encodeURIComponent(id)}/distribution-setup?editDistributionId=${encodeURIComponent(row.id)}`,
        { state: { returnTab: "distributions" as const } },
      )
    },
    [id, navigate],
  )

  const handleExportOne = useCallback(
    (row: PriorDistributionRecord) => {
      downloadDistributionsExportCsv({
        rows: [row],
        dealName: resolvedDealName || dealName,
      })
      toast.success("Exported", `“${distributionDisplayName(row)}” downloaded.`)
    },
    [resolvedDealName, dealName],
  )

  const handleDeleteOne = useCallback((row: PriorDistributionRecord) => {
    setDeleteTarget(row)
  }, [])

  const confirmDeleteOne = useCallback(
    async (reason: string) => {
      if (!id || !deleteTarget) return
      setDeleteBusy(true)
      try {
        const saved = await deletePriorDistribution(id, deleteTarget.id, {
          reason,
        })
        setPriorDistributions(
          sanitizePriorDistributions(saved.priorDistributions ?? []),
        )
        setDeleteTarget(null)
        toast.success("Distribution deleted")
      } catch (err) {
        toast.error(
          "Could not delete",
          err instanceof Error ? err.message : "Try again.",
        )
      } finally {
        setDeleteBusy(false)
      }
    },
    [id, deleteTarget],
  )

  const handleClassInvestorSaved = useCallback(
    (
      saved: DistributionSetupBundle,
      investorId: string,
      nextPct?: number,
      nextDealPct?: number,
    ) => {
      setPriorDistributions(
        sanitizePriorDistributions(saved.priorDistributions ?? []),
      )
      if (saved.classes?.length) setClasses(saved.classes)
      if (nextPct == null && nextDealPct == null) return
      const pctLabel =
        nextPct != null
          ? `${(Math.round(nextPct * 100) / 100).toFixed(2)}%`
          : null
      const dealPctLabel =
        nextDealPct != null
          ? `${(Math.round(nextDealPct * 100) / 100).toFixed(2)}%`
          : null
      setInvestors((prev) =>
        prev.map((inv) =>
          inv.id === investorId
            ? {
                ...inv,
                ...(pctLabel
                  ? { percentOfClassDistributions: pctLabel }
                  : {}),
                ...(dealPctLabel
                  ? { entityOwnershipPercent: dealPctLabel }
                  : {}),
              }
            : inv,
        ),
      )
    },
    [],
  )

  // Visibility toggle — commented out for now
  // const setVisible = useCallback((distributionId: string, next: boolean) => {
  //   setPriorDistributions((prev) =>
  //     prev.map((p) =>
  //       p.id === distributionId ? { ...p, visible: next } : p,
  //     ),
  //   )
  // }, [])

  const columns: DataTableColumn<CompletedDistributionRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Distribution name",
        colWidth: "16rem",
        thClassName: "deal_dist_th_name",
        tdClassName: "deal_dist_td_name",
        sortValue: (row) => distributionDisplayName(row).toLowerCase(),
        cell: (row) => (
          <DistributionNameClassMenu
            name={distributionDisplayName(row)}
            expanded={expandedDistributionId === row.id}
            onToggle={() =>
              setExpandedDistributionId((prev) =>
                prev === row.id ? null : row.id,
              )
            }
          />
        ),
      },
      {
        id: "source",
        header: "Source",
        colWidth: "9.5rem",
        thClassName: "deal_dist_th_source",
        tdClassName: "deal_dist_td_source",
        sortValue: (row) => sourceDisplayLabel(row.source),
        cell: (row) => sourceDisplayLabel(row.source),
      },
      {
        id: "type",
        header: (
          <span className="deal_dist_th_with_help">
            Type
            <span
              className="deal_dist_help_icon_wrap"
              title="Preferred return uses capital × rate × days ÷ 365 (actual/365)."
            >
              <CircleHelp
                size={14}
                strokeWidth={2}
                className="deal_dist_help_icon"
                aria-hidden
              />
            </span>
          </span>
        ),
        colWidth: "9.5rem",
        thClassName: "deal_dist_th_type",
        tdClassName: "deal_dist_td_type",
        sortValue: (row) => typeDisplayLabel(row),
        cell: (row) => typeDisplayLabel(row),
      },
      {
        id: "deducts",
        header: (
          <span className="deal_dist_th_with_help">
            Deducts from
            <span
              className="deal_dist_help_icon_wrap"
              title="Cash paid reduces accrued preferred due for the period."
            >
              <CircleHelp
                size={14}
                strokeWidth={2}
                className="deal_dist_help_icon"
                aria-hidden
              />
            </span>
          </span>
        ),
        colWidth: "11rem",
        thClassName: "deal_dist_th_deducts",
        tdClassName: "deal_dist_td_deducts",
        sortValue: (row) => deductsFromDisplayLabel(row),
        cell: (row) => deductsFromDisplayLabel(row),
      },
      {
        id: "payments",
        header: (
          <span className="deal_dist_payments_head">
            <span className="deal_dist_payments_head_title">
              Distribution payments
            </span>
            <span className="deal_dist_payments_head_meta">
              Total paid out: {formatMoneyPlain(totals.paid)}
              <br />
              Total unpaid: {formatMoneyPlain(totals.unpaid)}
            </span>
          </span>
        ),
        align: "right",
        colWidth: "11rem",
        thClassName: "deals_th_align_right deal_dist_th_payments",
        tdClassName:
          "um_td_numeric deals_td_align_right deal_dist_td_payments",
        sortValue: (row) => row.metrics.paid,
        cell: (row) => (
          <div className="deal_dist_pay_card" title="Paid (share of preferred due)">
            <span className="deal_dist_pay_card_amt">
              <TableCompactAmountCell amount={String(row.metrics.paid)} />
            </span>
            <span className="deal_dist_pay_card_pct">
              (
              {row.metrics.paidPctOfRequired > 100.5
                ? "—"
                : `${row.metrics.paidPctOfRequired.toFixed(2)}%`}
              )
            </span>
          </div>
        ),
      },
      {
        id: "period",
        header: "Period",
        colWidth: "11.5rem",
        thClassName: "deal_dist_th_period",
        tdClassName: "deal_dist_td_period",
        sortValue: (row) => row.metrics.periodStart,
        cell: (row) => (
          <DistributionPeriodCell
            startIso={row.metrics.periodStart}
            endIso={row.metrics.periodEnd}
            periodName={formatPeriodCalendarLabel(
              row.metrics.periodStart,
              row.metrics.periodEnd,
              row.period,
            )}
          />
        ),
      },
      {
        id: "paymentDate",
        header: "Payment date",
        colWidth: "8.5rem",
        thClassName: "deal_dist_th_paydate",
        tdClassName: "deal_dist_td_paydate",
        sortValue: (row) => row.metrics.paymentDate,
        cell: (row) => formatPaymentDateLabel(row.metrics.paymentDate),
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: "5.5rem",
        thClassName: "um_th_actions deal_dist_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions deal_dist_td_actions",
        cell: (row) => (
          <DistributionRowActions
            rowLabel={distributionDisplayName(row)}
            onEdit={() => openEditSetup(row)}
            onExport={() => handleExportOne(row)}
            onDelete={() => handleDeleteOne(row)}
          />
        ),
      },
      // {
      //   id: "visibility",
      //   ...
      // },
    ],
    [
      expandedDistributionId,
      totals.paid,
      totals.unpaid,
      openEditSetup,
      handleExportOne,
      handleDeleteOne,
    ],
  )

  const emptyLabel = loading
    ? "Loading distributions…"
    : loadError
      ? loadError
      : query.trim()
        ? "No distributions match your search."
        : "No completed distributions yet. Complete a run in Distribution Setup to see it here."

  return (
    <div className="deal_dist_tab_shell">
      <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer deal_dist_subtabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row deal_dist_subtabs_row"
            role="tablist"
            aria-label="Distribution sections"
          >
            <button
              type="button"
              id="deal-dist-subtab-distributions"
              role="tab"
              aria-selected={activeSubTab === "distributions"}
              aria-controls="deal-dist-panel-distributions"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "distributions" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveSubTab("distributions")}
            >
              <BarChart3
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Distributions
              </span>
            </button>
            <button
              type="button"
              id="deal-dist-subtab-bank"
              role="tab"
              aria-selected={activeSubTab === "bank_account"}
              aria-controls="deal-dist-panel-bank"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "bank_account" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveSubTab("bank_account")}
            >
              <Landmark
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Bank account
              </span>
            </button>
            {/* <button
              type="button"
              id="deal-dist-subtab-fee"
              role="tab"
              aria-selected={activeSubTab === "distribution_fee"}
              aria-controls="deal-dist-panel-fee"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "distribution_fee"
                  ? " um_members_tab_active"
                  : ""
              }`}
              onClick={() => setActiveSubTab("distribution_fee")}
            >
              <Percent
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Acquisition Fee
              </span>
            </button> */}
          </div>
        </TabsScrollStrip>
      </div>

      <div
        id="deal-dist-panel-bank"
        role="tabpanel"
        aria-labelledby="deal-dist-subtab-bank"
        hidden={activeSubTab !== "bank_account"}
        className="deal_dist_subtab_panel"
      >
        {activeSubTab === "bank_account" ? (
          <div
            className="deal_dist_tab deal_dist_bank_tab"
            role="region"
            aria-label="Deal bank account"
          >
            <section
              className="um_panel deal_dist_funding_panel deal_dist_funding_panel--page"
              aria-labelledby="deal-dist-funding-title"
            >
              <div className="deal_dist_funding_page_header">
                <div className="deal_dist_funding_main">
                  <div className="deal_dist_funding_icon" aria-hidden>
                    <Landmark size={18} strokeWidth={1.75} />
                  </div>
                  <div className="deal_dist_funding_body">
                    <div className="deal_dist_funding_title_row">
                      <h2
                        id="deal-dist-funding-title"
                        className="deal_dist_funding_title"
                      >
                        Deal bank account
                      </h2>
                      <span
                        className={`deal_dist_ach_badge deal_dist_ach_badge--${fundingStatus.tone}`}
                      >
                        {fundingStatus.label}
                      </span>
                    </div>
                    <p className="deal_dist_funding_copy">
                      Add this deal’s bank account once. ACH distributions for
                      every run are paid from this account to investors.
                    </p>
                  </div>
                </div>
                {dealFunding?.canManage ? (
                  <button
                    type="button"
                    className={
                      dealFunding.fundingReady
                        ? "um_btn_secondary deal_dist_funding_action"
                        : "um_btn_primary deal_dist_funding_action"
                    }
                    disabled={fundingBusy || loading}
                    onClick={() => void startDealFundingSetup()}
                  >
                    {fundingBusy ? (
                      <Loader2
                        size={16}
                        className="deals_create_loading_icon"
                        aria-hidden
                      />
                    ) : (
                      <Landmark size={16} aria-hidden />
                    )}
                    {fundingBusy ? "Opening…" : fundingActionLabel}
                  </button>
                ) : null}
              </div>

              <div className="deal_dist_funding_page_body">
                {!dealFunding ? (
                  <p className="deal_dist_funding_hint" role="status">
                    Couldn’t load bank status. Refresh the page and try again.
                  </p>
                ) : !dealFunding.canManage && !dealBankDetailsLabel ? (
                  <p className="deal_dist_funding_hint" role="status">
                    Only the lead sponsor or admin sponsor can add or update
                    this deal’s bank account.
                  </p>
                ) : dealBankDetailsLabel ? (
                  <dl className="deal_dist_funding_details deal_dist_funding_details--page">
                    <div className="deal_dist_funding_detail_row">
                      <dt>Bank</dt>
                      <dd>
                        {dealFunding?.bankAccount?.bankName?.trim() || "—"}
                      </dd>
                    </div>
                    <div className="deal_dist_funding_detail_row">
                      <dt>Account</dt>
                      <dd>
                        {dealFunding?.bankAccount?.last4
                          ? `···· ${dealFunding.bankAccount.last4}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="deal_dist_funding_detail_row">
                      <dt>Routing</dt>
                      <dd>
                        {dealFunding?.bankAccount?.routingNumber?.trim() ||
                          "—"}
                      </dd>
                    </div>
                    <div className="deal_dist_funding_detail_row">
                      <dt>Name on account</dt>
                      <dd>
                        {dealFunding?.bankAccount?.accountHolderName?.trim() ||
                          "—"}
                      </dd>
                    </div>
                    {dealFunding?.bankAccount?.currency ? (
                      <div className="deal_dist_funding_detail_row">
                        <dt>Currency</dt>
                        <dd>
                          {dealFunding.bankAccount.currency
                            .trim()
                            .toUpperCase()}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : dealFunding.accountId ? (
                  <p className="deal_dist_funding_hint" role="status">
                    Bank details will appear here after Stripe finishes linking
                    the account. Use Continue setup if more steps remain.
                  </p>
                ) : (
                  <p className="deal_dist_funding_hint" role="status">
                    No bank account linked yet.
                    {dealFunding.canManage
                      ? " Use Add bank account to connect the deal funding account in Stripe."
                      : " Ask the lead or admin sponsor to add one."}
                  </p>
                )}
                {dealFunding?.canManage && dealBankDetailsLabel ? (
                  <p className="deal_dist_funding_hint deal_dist_funding_hint--footer">
                    Full account numbers stay masked. Use Update bank account to
                    change the linked account in Stripe.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <div
        id="deal-dist-panel-distributions"
        role="tabpanel"
        aria-labelledby="deal-dist-subtab-distributions"
        hidden={activeSubTab !== "distributions"}
        className="deal_dist_subtab_panel"
      >
        {activeSubTab === "distributions" ? (
          <div
            className="deal_dist_tab"
            role="region"
            aria-label="Classes and distributions"
          >
            <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_dist_panel">
              <div
                className="um_toolbar um_toolbar_export_then_search deal_dist_toolbar"
                role="toolbar"
                aria-label="Distribution setup"
              >
                <div className="deal_dist_toolbar_copy">
                  <h2 className="deal_dist_heading">Distributions</h2>
                </div>
                <div className="um_toolbar_actions deal_dist_toolbar_actions">
                  {/* <button
                    type="button"
                    className="um_toolbar_export_btn"
                    disabled={loading || filtered.length === 0 || clearing}
                    onClick={() => void handleClearAll()}
                    aria-label="Clear all distributions"
                    title="Remove all completed distribution rows for this deal (keeps waterfall setup)"
                  >
                    <span>{clearing ? "Clearing…" : "Clear all"}</span>
                  </button> */}
                  <button
                    type="button"
                    className="um_toolbar_export_btn"
                    disabled={loading || filtered.length === 0}
                    onClick={() => setExportOpen(true)}
                    aria-label="Export distributions"
                  >
                    <Download size={18} strokeWidth={2} aria-hidden />
                    <span>Export</span>
                  </button>
                  <Link
                    to={classSetupHref}
                    state={returnState}
                    className="um_toolbar_export_btn"
                  >
                    Class Setup
                  </Link>
                  <Link
                    to={distributionSetupHref}
                    state={returnState}
                    className="um_btn_primary deals_list_add_link"
                  >
                    Distribution Setup
                    <ArrowRight size={16} strokeWidth={2} aria-hidden />
                  </Link>
                </div>
                <div className="um_search_wrap deal_dist_search">
                  <Search className="um_search_icon" size={18} aria-hidden />
                  <input
                    type="search"
                    className="um_search_input"
                    placeholder="Search by name, source, period…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search distributions"
                  />
                </div>
              </div>

              <DataTable
                visualVariant="members"
                membersTableClassName="um_table_members deal_inv_table deal_dist_table deal_dist_portal_table"
                columns={columns}
                rows={loading ? [] : filtered}
                getRowKey={(row) => row.id}
                emptyLabel={emptyLabel}
                initialSort={{ columnId: "paymentDate", direction: "desc" }}
                getRowClassName={(row) =>
                  `deal_dist_table_row${
                    expandedDistributionId === row.id
                      ? " deal_dist_table_row_expanded"
                      : ""
                  }`
                }
                stickyFirstColumn
                forceHorizontalScroll
                pagination={pagination}
                renderExpandedContent={(row) =>
                  expandedDistributionId === row.id ? (
                    <DistributionClassesPanel
                      dealId={id}
                      distributionName={distributionDisplayName(row)}
                      distribution={row}
                      setupClasses={classes}
                      investors={investors}
                      rows={classTableRowsForDistribution({
                        row,
                        setupClasses: classes,
                        investors,
                      })}
                      fundingReady={Boolean(dealFunding?.fundingReady)}
                      onSaved={handleClassInvestorSaved}
                      onReload={refreshDistributionsQuietly}
                    />
                  ) : null
                }
              />
            </div>

            <ExportSelectableRowsModal
              open={exportOpen}
              onClose={() => setExportOpen(false)}
              title="Export distributions"
              hint="Choose which completed distribution runs to include in the Excel/CSV file."
              searchPlaceholder="Search runs…"
              searchAriaLabel="Search export rows"
              listAriaLabel="Distributions to export"
              rows={exportRows}
              onExportExcel={handleExport}
            />

            <BulkDeleteReasonModal
              open={deleteTarget != null}
              title="Delete distribution?"
              description={
                deleteTarget
                  ? `Remove “${distributionDisplayName(deleteTarget)}” from this deal? This cannot be undone.`
                  : "Remove this distribution? This cannot be undone."
              }
              reasonLabel="Reason for deletion"
              reasonPlaceholder="e.g. Created in error, duplicate run, wrong period…"
              busy={deleteBusy}
              onClose={() => {
                if (!deleteBusy) setDeleteTarget(null)
              }}
              onConfirm={confirmDeleteOne}
            />
          </div>
        ) : null}
      </div>

      {/* <div
        id="deal-dist-panel-fee"
        role="tabpanel"
        aria-labelledby="deal-dist-subtab-fee"
        hidden={activeSubTab !== "distribution_fee"}
        className="deal_dist_subtab_panel"
      >
        {activeSubTab === "distribution_fee" ? (
          <DistributionFeeTab dealId={id} dealName={resolvedDealName} />
        ) : null}
      </div> */}
    </div>
  )
}
