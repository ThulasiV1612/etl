import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  FileText,
  Home,
  MapPin,
  Percent,
  Search,
  IdCard,
  Banknote,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { dealInvestNowPath } from "@/modules/Syndication/Deals/utils/dealInvestNowPath"
import type { InvestNowLocationState } from "@/modules/Investing/pages/invest/investNowLocationState"
import {
  findInvestorRowForInvestNowScope,
  isInvestNowDraftInvestorRow,
} from "@/modules/Investing/pages/invest/investNowDraftUtils"
import { investNowDraftProgressFromInvestorRow } from "@/modules/Investing/pages/invest/investNowDraftProgress"
import { fetchDealInvestors } from "@/modules/Syndication/Deals/api/dealsApi"
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { EntityAvatarNameCell } from "@/common/components/entity-avatar/EntityAvatarNameCell"
import {
  CardCompactAmount,
  TableCompactAmountCell,
} from "@/common/components/card-compact-amount/CardCompactAmount"
import { ViewReadonlyField } from "@/common/components/ViewReadonlyField"
import { formatCardCompactUsdExact } from "@/common/utils/cardCompactUsdAmount"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import { setAppDocumentTitle } from "@/common/utils/appDocumentTitle"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/contacts/contacts.css"
import "@/modules/Investing/pages/profiles/investing-profiles.css"
import { loadInvestmentDetailFromDeal } from "./investmentsListFromDeals"
import {
  getInvestmentDetail,
  mergeServerInvestmentDetailWithLocal,
} from "./investmentsRuntimeData"
import {
  enrichInvestmentListRow,
  fetchUserInvestorProfileNameMap,
} from "./investedAsDisplay"
import type {
  InvestmentBreakdownLine,
  InvestmentDetailRecord,
} from "./investments.types"
import { InvestmentDetailDocumentsTab } from "./InvestmentDetailDocumentsTab"
import { InvestmentDetailDistributionsTab } from "./InvestmentDetailDistributionsTab"
import { InvestmentProfileBreakdownRowActions } from "./InvestmentProfileBreakdownRowActions"
import { resolveInvestmentDealId } from "./utils/resolveInvestmentDealId"
import { countVisibleDocumentsForInvestmentDetail } from "./utils/countInvestmentDetailDocuments"
import { bindInvestmentOfferingDocumentsAutoRefresh } from "./utils/bindInvestmentOfferingDocumentsAutoRefresh"
import "./investment-detail.css"

function formatInvDetailUsd(n: number): string {
  return formatCardCompactUsdExact(n)
}

function formatInvDetailDateTime(iso: string | undefined): string {
  const raw = String(iso ?? "").trim()
  if (!raw) return "—"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function InvestmentDetailCenterDash() {
  return <span className="investment_detail_cell_dash">—</span>
}

/** Narrow columns: ellipsis + themed tooltip with full text on hover. */
function InvestmentDetailHoverTruncCell({ text }: { text: string }) {
  const value = text.trim()
  if (!value) {
    return <span className="investment_detail_cell_dash investment_detail_cell_dash--left">—</span>
  }
  return (
    <span
      className="investment_detail_hover_trunc"
      title={value}
      tabIndex={0}
    >
      <span className="investment_detail_hover_trunc_label">{value}</span>
      <span className="investment_detail_hover_trunc_tip" role="tooltip">
        {value}
      </span>
    </span>
  )
}

function InvestmentDetailApprovedByCell({ value }: { value?: string }) {
  const text = String(value ?? "").trim()
  if (!text) return <InvestmentDetailCenterDash />
  return <span className="investment_detail_cell_text">{text}</span>
}

function InvestmentDetailApprovedOnCell({ iso }: { iso?: string }) {
  const raw = String(iso ?? "").trim()
  if (!raw) return <InvestmentDetailCenterDash />
  const formatted = formatInvDetailDateTime(iso)
  if (formatted === "—") return <InvestmentDetailCenterDash />
  return <span className="investment_detail_cell_text">{formatted}</span>
}

/** Column widths — keep in sync with investment-detail.css profile breakdown table. */
const PROFILE_BREAKDOWN_COL_WIDTH = {
  profileName: "14rem",
  profileType: "11rem",
  invested: "7.5rem",
  investedOn: "9rem",
  approvedBy: "7.75rem",
  approvedOn: "9.25rem",
  actions: "6.5rem",
} as const

type DebtInfoFields = {
  outstandingLoans: string
  debtService: string
  loanType: string
  ioOrAmortizing: string
  maturityDate: string
  lender: string
  interestRatePct: string
}

const PROPERTY_STATUSES = [
  "Stabilized",
  "Leased",
  "Renovation",
  "Lease-up",
  "Other",
] as const

const LOAN_TYPES = [
  "Senior mortgage",
  "CMBS",
  "Bridge",
  "Mezzanine",
  "Other",
] as const

const IO_AMORT = ["Interest-only", "Amortizing", "Split"] as const

const PROPERTY_STATUS_STORAGE_KEY = (investmentDetailId: string) =>
  `investing:inv:propertyStatus:${investmentDetailId}`

function coercePropertyStatus(raw: string): (typeof PROPERTY_STATUSES)[number] {
  return (PROPERTY_STATUSES as readonly string[]).includes(raw) ? (raw as (typeof PROPERTY_STATUSES)[number]) : "Other"
}

function readPropertyStatusForDetail(
  id: string,
  serverValue: string,
): (typeof PROPERTY_STATUSES)[number] {
  try {
    const saved = localStorage.getItem(PROPERTY_STATUS_STORAGE_KEY(id))
    if (saved && (PROPERTY_STATUSES as readonly string[]).includes(saved)) {
      return coercePropertyStatus(saved)
    }
  } catch {
    /* localStorage may be blocked */
  }
  return coercePropertyStatus(serverValue)
}

const GENERAL_COMMENTS_STORAGE_KEY = (id: string) =>
  `investing:inv:generalComments:${id}`

function readStoredString(
  id: string,
  key: (i: string) => string,
  serverValue: string,
): string {
  try {
    const s = localStorage.getItem(key(id))
    if (s != null) return s
  } catch {
    /* ignore */
  }
  return serverValue
}

const DEBT_INFO_STORAGE_KEY = (id: string) => `investing:inv:debtInfo:${id}`

function debtFromRecord(d: InvestmentDetailRecord): DebtInfoFields {
  return {
    outstandingLoans: d.outstandingLoans ?? "0",
    debtService: d.debtService ?? "0",
    loanType: (d.loanType || "Other").trim() || "Other",
    ioOrAmortizing: (d.ioOrAmortizing || "Amortizing").trim() || "Amortizing",
    maturityDate: d.maturityDate ?? "—",
    lender: d.lender ?? "—",
    interestRatePct: d.interestRatePct ?? "—",
  }
}

function normalizeDebtFields(v: DebtInfoFields): DebtInfoFields {
  return {
    ...v,
    loanType: (LOAN_TYPES as readonly string[]).includes(v.loanType)
      ? v.loanType
      : "Other",
    ioOrAmortizing: (IO_AMORT as readonly string[]).includes(v.ioOrAmortizing)
      ? v.ioOrAmortizing
      : "Amortizing",
  }
}

function readDebtInfoForDetail(d: InvestmentDetailRecord): DebtInfoFields {
  const base = debtFromRecord(d)
  try {
    const raw = localStorage.getItem(DEBT_INFO_STORAGE_KEY(d.id))
    if (raw) {
      const p = JSON.parse(raw) as Partial<DebtInfoFields>
      return normalizeDebtFields({ ...base, ...p })
    }
  } catch {
    /* ignore */
  }
  return normalizeDebtFields(base)
}

function displayOrDash(v: string): string {
  const t = String(v ?? "").trim()
  return t || "—"
}

function displayPct(v: string): string {
  const t = String(v ?? "").trim()
  if (!t) return "—"
  return t.endsWith("%") ? t : `${t}%`
}

function DetailReadonly({
  Icon,
  label,
  value,
  spanFull,
}: {
  Icon: LucideIcon
  label: string
  value: string
  spanFull?: boolean
}) {
  return (
    <ViewReadonlyField
      Icon={Icon}
      label={label}
      value={displayOrDash(value)}
      fieldClassName={spanFull ? "um_view_field_span_full" : undefined}
    />
  )
}

function DetailReadonlyCurrency({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const t = String(value ?? "").trim()
  if (!t) {
    return <ViewReadonlyField Icon={DollarSign} label={label} value="—" />
  }
  return (
    <ViewReadonlyField
      Icon={DollarSign}
      label={label}
      value={<CardCompactAmount amount={t} />}
    />
  )
}

function DetailReadonlyPct({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <ViewReadonlyField
      Icon={Percent}
      label={label}
      value={displayPct(value)}
    />
  )
}

function DetailEditableText({
  label,
  value,
  onChange,
  multiline,
  spanFull,
  inputMode,
  placeholder,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  multiline?: boolean
  spanFull?: boolean
  inputMode?: "decimal" | "text" | "numeric"
  placeholder?: string
}) {
  const controlId = useId()
  return (
    <div
      className={`um_field${spanFull ? " um_view_field_span_full" : ""}`.trim()}
    >
      <label htmlFor={controlId}>{label}</label>
      {multiline ? (
        <textarea
          id={controlId}
          className="um_field_textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      ) : (
        <input
          id={controlId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

function DetailEditableSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (next: string) => void
}) {
  const selectId = useId()
  return (
    <div className="um_field">
      <label htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        className="um_field_select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function DetailEditablePct({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const inputId = useId()
  return (
    <div className="um_field">
      <label htmlFor={inputId}>{label}</label>
      <div className="investment_detail_pct_wrap">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          aria-label={label}
        />
        <span className="investment_detail_pct_suffix" aria-hidden>
          %
        </span>
      </div>
    </div>
  )
}

function DetailForm({ d }: { d: InvestmentDetailRecord }) {
  const navigate = useNavigate()
  const { switchToInvesting } = usePortalMode()
  const list = d.list
  const investedAmountNode = (
    <CardCompactAmount amount={list.investedAmount} />
  )

  const [propertyStatus, setPropertyStatus] = useState(() =>
    readPropertyStatusForDetail(d.id, d.propertyStatus),
  )
  useEffect(() => {
    setPropertyStatus(readPropertyStatusForDetail(d.id, d.propertyStatus))
  }, [d.id, d.propertyStatus])

  const onPropertyStatusChange = (next: string) => {
    setPropertyStatus(coercePropertyStatus(next))
    try {
      localStorage.setItem(PROPERTY_STATUS_STORAGE_KEY(d.id), coercePropertyStatus(next))
    } catch {
      /* ignore */
    }
  }

  const [investedAsLine, setInvestedAsLine] = useState(d.investedAs)
  const [generalComments, setGeneralComments] = useState(() =>
    readStoredString(
      d.id,
      GENERAL_COMMENTS_STORAGE_KEY,
      d.generalComments,
    ),
  )
  const hasRoleBreakdownTable = (d.investedAsBreakdown?.length ?? 0) > 0
  const [profileBreakdownQuery, setProfileBreakdownQuery] = useState("")
  const filteredProfileBreakdown = useMemo(() => {
    const rows = d.investedAsBreakdown
    if (!rows?.length) return []
    const q = profileBreakdownQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const name = (r.profileName ?? "").toLowerCase()
      const invType = (r.investorType ?? "").toLowerCase()
      const amt = formatInvDetailUsd(r.investedAmount).toLowerCase()
      return (
        name.includes(q) ||
        invType.includes(q) ||
        amt.includes(q) ||
        String(r.investedAmount).includes(q)
      )
    })
  }, [d.investedAsBreakdown, profileBreakdownQuery])
  useEffect(() => {
    setProfileBreakdownQuery("")
  }, [d.id])
  useEffect(() => {
    setInvestedAsLine(d.investedAs)
  }, [d.investedAs, d.id])
  useEffect(() => {
    if (hasRoleBreakdownTable) return
    let cancelled = false
    void (async () => {
      const nameMap = await fetchUserInvestorProfileNameMap()
      if (cancelled) return
      setInvestedAsLine(
        enrichInvestmentListRow(d.list, nameMap).investmentProfile,
      )
    })()
    return () => {
      cancelled = true
    }
  }, [
    hasRoleBreakdownTable,
    d.id,
    d.list.investmentProfile,
    d.list.commitmentProfileId,
    d.list.userInvestorProfileId,
  ])
  useEffect(() => {
    setGeneralComments(
      readStoredString(d.id, GENERAL_COMMENTS_STORAGE_KEY, d.generalComments),
    )
  }, [d.id, d.generalComments])

  const onGeneralCommentsChange = (next: string) => {
    setGeneralComments(next)
    try {
      localStorage.setItem(GENERAL_COMMENTS_STORAGE_KEY(d.id), next)
    } catch {
      /* ignore */
    }
  }

  const [debt, setDebt] = useState(() => readDebtInfoForDetail(d))
  useEffect(() => {
    setDebt(readDebtInfoForDetail(d))
  }, [d.id])

  const profileBreakdownColumns: DataTableColumn<InvestmentBreakdownLine>[] = useMemo(
    () => [
      {
        id: "profileName",
        header: "Profile name",
        colWidth: PROFILE_BREAKDOWN_COL_WIDTH.profileName,
        sortValue: (r) => (r.profileName ?? "").toLowerCase(),
        thClassName: "investment_detail_col_profile_name",
        tdClassName: "um_td_user investment_detail_td_profile_name",
        cell: (r) => (
          <EntityAvatarNameCell
            displayName={r.profileName ?? ""}
            linkClassName="investment_detail_profile_name_text um_user_meta_username"
            cellClassName="investment_detail_profile_name_cell"
          />
        ),
      },
      {
        id: "investorType",
        header: "Profile type",
        colWidth: PROFILE_BREAKDOWN_COL_WIDTH.profileType,
        sortValue: (r) => (r.investorType ?? "").toLowerCase(),
        thClassName: "investment_detail_col_profile_type",
        tdClassName: "investment_detail_col_profile_type",
        cell: (r) => (
          <InvestmentDetailHoverTruncCell text={r.investorType ?? ""} />
        ),
      },
      {
        id: "invested",
        header: "Investment",
        align: "right",
        colWidth: PROFILE_BREAKDOWN_COL_WIDTH.invested,
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric",
        sortValue: (r) => r.investedAmount,
        cell: (r) => <TableCompactAmountCell amount={r.investedAmount} />,
      },
      {
        id: "investedOn",
        header: "Invested on",
        colWidth: PROFILE_BREAKDOWN_COL_WIDTH.investedOn,
        sortValue: (r) => String(r.investedAtIso ?? ""),
        tdClassName: "investment_detail_col_invested_on",
        cell: (r) => formatInvDetailDateTime(r.investedAtIso),
      },
      {
        id: "approvedBy",
        header: "Approved by",
        align: "center",
        colWidth: PROFILE_BREAKDOWN_COL_WIDTH.approvedBy,
        sortValue: (r) => String(r.approvedBy ?? "").toLowerCase(),
        thClassName: "deals_th_align_center investment_detail_col_approved_by",
        tdClassName: "investment_detail_col_approved_by investment_detail_td_center",
        cell: (r) => <InvestmentDetailApprovedByCell value={r.approvedBy} />,
      },
      {
        id: "approvedOn",
        header: "Approved on",
        align: "center",
        colWidth: PROFILE_BREAKDOWN_COL_WIDTH.approvedOn,
        sortValue: (r) => String(r.approvedAtIso ?? ""),
        thClassName: "deals_th_align_center investment_detail_col_approved_on",
        tdClassName: "investment_detail_col_approved_on investment_detail_td_center",
        cell: (r) => <InvestmentDetailApprovedOnCell iso={r.approvedAtIso} />,
      },
    ],
    [],
  )

  const patchDebt = useCallback(
    (partial: Partial<DebtInfoFields>) => {
      setDebt((prev) => {
        const next = normalizeDebtFields({ ...prev, ...partial })
        try {
          localStorage.setItem(DEBT_INFO_STORAGE_KEY(d.id), JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [d.id],
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const activeTab: "details" | "profile" | "documents" | "distributions" =
    tabParam === "profile"
      ? "profile"
      : tabParam === "documents"
        ? "documents"
        : tabParam === "distributions"
          ? "distributions"
          : "details"
  const setActiveTab = (
    tab: "details" | "profile" | "documents" | "distributions",
  ) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (tab === "details") p.delete("tab")
        else p.set("tab", tab)
        return p
      },
      { replace: true },
    )
  }
  const profileLineCount = d.investedAsBreakdown?.length ?? 0
  const dealId = resolveInvestmentDealId(d)
  const [documentsCount, setDocumentsCount] = useState(0)
  const [dealInvestorRows, setDealInvestorRows] = useState<
    import("@/modules/Syndication/Deals/types/deal-investors.types").DealInvestorRow[]
  >([])

  useEffect(() => {
    if (!dealId) return
    let cancelled = false
    void fetchDealInvestors(dealId, { lpInvestorsOnly: false })
      .then((payload) => {
        if (!cancelled) setDealInvestorRows(payload.investors ?? [])
      })
      .catch(() => {
        if (!cancelled) setDealInvestorRows([])
      })
    return () => {
      cancelled = true
    }
  }, [dealId])

  useEffect(() => {
    const id = dealId?.trim() ?? ""
    if (!id) {
      setDocumentsCount(0)
      return
    }
    let cancelled = false
    const loadCount = () => {
      void countVisibleDocumentsForInvestmentDetail(id).then((n) => {
        if (!cancelled) setDocumentsCount(n)
      })
    }
    loadCount()
    const unbind = bindInvestmentOfferingDocumentsAutoRefresh(id, loadCount)
    return () => {
      cancelled = true
      unbind()
    }
  }, [dealId])

  const openResumeForLine = useCallback(
    (line: InvestmentBreakdownLine) => {
      const id = dealId?.trim()
      if (!id) return
      const draftRow = dealInvestorRows.find(
        (row) => row.id === line.investmentRowId,
      )
      const phaseId = draftRow
        ? investNowDraftProgressFromInvestorRow(draftRow).phaseId
        : undefined
      switchToInvesting()
      navigate(dealInvestNowPath(id), {
        state: {
          returnTo: `/investing/investments/${encodeURIComponent(d.id)}?tab=profile`,
          mode: "resume",
          investmentId: line.investmentRowId,
          userInvestorProfileId: line.userInvestorProfileId,
          profileId: line.commitmentProfileId,
          phaseId,
        } satisfies InvestNowLocationState,
      })
    },
    [dealId, d.id, dealInvestorRows, navigate, switchToInvesting],
  )

  const profileBreakdownColumnsWithActions: DataTableColumn<InvestmentBreakdownLine>[] =
    useMemo(() => {
      const em = getSessionUserEmail()?.trim().toLowerCase() ?? ""
      return [
        ...profileBreakdownColumns,
        {
          id: "actions",
          header: "Actions",
          align: "center",
          colWidth: PROFILE_BREAKDOWN_COL_WIDTH.actions,
          thClassName: "um_th_actions deals_th_actions_head",
          tdClassName: "um_td_actions deal_inv_td_actions",
          cell: (line) => {
            const row =
              dealInvestorRows.find(
                (r) => String(r.id ?? "") === String(line.investmentRowId ?? ""),
              ) ??
              (em
                ? findInvestorRowForInvestNowScope(dealInvestorRows, {
                    email: em,
                    investmentId: line.investmentRowId,
                    userInvestorProfileId: line.userInvestorProfileId,
                    profileId: line.commitmentProfileId,
                  })
                : undefined)
            const canResume =
              Boolean(row && em && isInvestNowDraftInvestorRow(row, em))
            return (
              <InvestmentProfileBreakdownRowActions
                profileLabel={line.profileName?.trim() || "Profile"}
                disabled={!canResume}
                onResumeInvesting={
                  canResume ? () => openResumeForLine(line) : undefined
                }
              />
            )
          },
        },
      ]
    }, [profileBreakdownColumns, dealInvestorRows, openResumeForLine])

  return (
    <>
      <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer investment_detail_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Investment detail views"
          >
            <button
              type="button"
              id="inv-detail-tab-details"
              role="tab"
              aria-selected={activeTab === "details"}
              aria-controls="inv-detail-panel-details"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeTab === "details" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveTab("details")}
            >
              <Building2
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Details
              </span>
            </button>
            <button
              type="button"
              id="inv-detail-tab-profile"
              role="tab"
              aria-selected={activeTab === "profile"}
              aria-controls="inv-detail-panel-profile"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeTab === "profile" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveTab("profile")}
            >
              <IdCard
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Profile and investment
              </span>
              {profileLineCount > 0 ? (
                <span className="deals_tabs_count">({profileLineCount})</span>
              ) : null}
            </button>
            <button
              type="button"
              id="inv-detail-tab-documents"
              role="tab"
              aria-selected={activeTab === "documents"}
              aria-controls="inv-detail-panel-documents"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeTab === "documents" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveTab("documents")}
            >
              <FileText
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Documents
              </span>
              {documentsCount > 0 ? (
                <span className="deals_tabs_count">({documentsCount})</span>
              ) : null}
            </button>
            <button
              type="button"
              id="inv-detail-tab-distributions"
              role="tab"
              aria-selected={activeTab === "distributions"}
              aria-controls="inv-detail-panel-distributions"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeTab === "distributions" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveTab("distributions")}
            >
              <Banknote
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Distributions
              </span>
            </button>
          </div>
        </TabsScrollStrip>
      </div>

      <div
        className="um_members_tab_content investment_detail_tab_panels"
        id="inv-detail-tab-panels"
      >
        {activeTab === "details" ? (
          <div
            id="inv-detail-panel-details"
            role="tabpanel"
            aria-labelledby="inv-detail-tab-details"
            className="investment_detail_tab_panel"
          >
            <div className="um_panel um_members_tab_panel deals_list_card_surface investment_detail_details_card">
              <section aria-labelledby="inv-sec-property">
                <h2 id="inv-sec-property" className="um_section_title">
                  Property information
                </h2>
                <div className="um_view_grid investment_detail_form_grid">
                  <DetailReadonly
                    Icon={Home}
                    label="Name"
                    value={d.propertyName}
                  />
                  <DetailReadonly
                    Icon={Building2}
                    label="Property type"
                    value={d.propertyType}
                  />
                  <DetailEditableSelect
                    label="Status"
                    value={propertyStatus}
                    options={PROPERTY_STATUSES}
                    onChange={onPropertyStatusChange}
                  />
                  <DetailReadonly Icon={MapPin} label="City" value={d.city} />
                  <DetailReadonly Icon={MapPin} label="State" value={d.state} />
                  <DetailReadonly
                    Icon={Building2}
                    label="Number of units"
                    value={d.numberOfUnits}
                  />
                  <DetailReadonlyPct
                    label="Occupancy"
                    value={d.occupancyPct}
                  />
                  <DetailReadonly
                    Icon={Calendar}
                    label="Owned since"
                    value={d.ownedSince}
                  />
                  <DetailReadonly
                    Icon={Calendar}
                    label="Year built"
                    value={d.yearBuilt}
                  />
                </div>
              </section>

              <section aria-labelledby="inv-sec-general">
                <h2 id="inv-sec-general" className="um_section_title">
                  General
                </h2>
                <div className="um_view_grid investment_detail_form_grid">
                  <ViewReadonlyField
                    Icon={DollarSign}
                    label="Invested amount"
                    value={investedAmountNode}
                  />
                  {!hasRoleBreakdownTable ? (
                    <ViewReadonlyField
                      Icon={IdCard}
                      label="Invested as"
                      value={displayOrDash(investedAsLine)}
                    />
                  ) : null}
                  <DetailReadonlyPct
                    label="Ownership percentage"
                    value={d.ownershipPct}
                  />
                  <DetailEditableText
                    label="General comments"
                    value={generalComments}
                    onChange={onGeneralCommentsChange}
                    multiline
                    spanFull
                  />
                </div>
              </section>

              <section aria-labelledby="inv-sec-cashflow">
                <h2 id="inv-sec-cashflow" className="um_section_title">
                  Cash flow and valuation
                </h2>
                <div className="um_view_grid investment_detail_form_grid">
                  <DetailReadonlyCurrency
                    label="Overall asset value"
                    value={d.overallAssetValue}
                  />
                  <DetailReadonlyCurrency
                    label="Net operating income"
                    value={d.netOperatingIncome}
                  />
                </div>
              </section>

              <section aria-labelledby="inv-sec-debt">
                <h2 id="inv-sec-debt" className="um_section_title">
                  Debt info
                </h2>
                <div className="um_view_grid investment_detail_form_grid">
                  <DetailEditableText
                    label="Outstanding loans"
                    value={debt.outstandingLoans}
                    onChange={(next) =>
                      patchDebt({ outstandingLoans: next })
                    }
                    inputMode="decimal"
                  />
                  <DetailEditableText
                    label="Debt service"
                    value={debt.debtService}
                    onChange={(next) => patchDebt({ debtService: next })}
                    inputMode="decimal"
                  />
                  <DetailEditableSelect
                    label="Loan type"
                    value={debt.loanType}
                    options={LOAN_TYPES}
                    onChange={(next) => patchDebt({ loanType: next })}
                  />
                  <DetailEditableSelect
                    label="IO or Amortizing"
                    value={debt.ioOrAmortizing}
                    options={IO_AMORT}
                    onChange={(next) => patchDebt({ ioOrAmortizing: next })}
                  />
                  <DetailEditableText
                    label="Maturity date"
                    value={debt.maturityDate}
                    onChange={(next) => patchDebt({ maturityDate: next })}
                    placeholder="e.g. 12/31/2030 or description"
                  />
                  <DetailEditableText
                    label="Lender"
                    value={debt.lender}
                    onChange={(next) => patchDebt({ lender: next })}
                  />
                  <DetailEditablePct
                    label="Interest rate"
                    value={debt.interestRatePct}
                    onChange={(next) =>
                      patchDebt({ interestRatePct: next })
                    }
                  />
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "profile" ? (
          <div
            id="inv-detail-panel-profile"
            role="tabpanel"
            aria-labelledby="inv-detail-tab-profile"
            className="investment_detail_tab_panel"
          >
            <div
              className="investment_detail_inv_profile_card um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel"
            >
              <div className="um_members_header_block contacts_inner_header">
                <h2
                  id="inv-sec-profile-inv"
                  className="investing_profiles_title investing_profiles_sr_only"
                >
                  Profile and investment
                </h2>
              </div>
              {hasRoleBreakdownTable && d.investedAsBreakdown ? (
                <>
                  <div
                    className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search investment_detail_inv_profile_table_toolbar"
                    aria-label="Table tools"
                  >
                    <div className="um_toolbar_actions deal_inv_table_toolbar_actions">
                      <span
                        className="investment_detail_inv_profile_totals"
                        aria-live="polite"
                      >
                        <DollarSign
                          className="investment_detail_inv_profile_totals_icon"
                          size={14}
                          strokeWidth={2}
                          aria-hidden
                        />
                        Invested: {investedAmountNode}
                      </span>
                    </div>
                    <div className="um_search_wrap">
                      <Search className="um_search_icon" size={18} aria-hidden />
                      <input
                        type="search"
                        className="um_search_input"
                        placeholder="Search by profile, type, or amount…"
                        value={profileBreakdownQuery}
                        onChange={(e) => setProfileBreakdownQuery(e.target.value)}
                        aria-label="Filter profile commitments"
                      />
                    </div>
                  </div>
                  <DataTable<InvestmentBreakdownLine>
                    visualVariant="members"
                    membersTableClassName="um_table_members deal_inv_table"
                    columns={profileBreakdownColumnsWithActions}
                    rows={filteredProfileBreakdown}
                    getRowKey={(_r, i) => `inv-breakdown-${i}`}
                    emptyLabel={
                      profileBreakdownQuery.trim()
                        ? "No lines match this filter."
                        : "No investment lines for this deal."
                    }
                    initialSort={{ columnId: "profileName", direction: "asc" }}
                  />
                </>
              ) : (
                <div className="investment_detail_inv_profile_solo">
                  <p className="investing_profiles_lead" aria-live="polite">
                    <strong>Invested amount</strong> {investedAmountNode}
                  </p>
                  <p className="investing_profiles_lead" aria-live="polite">
                    <strong>Invested as</strong> {investedAsLine}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "documents" ? (
          dealId ? (
            <InvestmentDetailDocumentsTab dealId={dealId} />
          ) : (
            <div
              id="inv-detail-panel-documents"
              role="tabpanel"
              aria-labelledby="inv-detail-tab-documents"
              className="investment_detail_tab_panel"
            >
              <p className="investment_detail_lead">
                Documents are not available for this investment record.
              </p>
            </div>
          )
        ) : null}

        {activeTab === "distributions" ? (
          dealId ? (
            <InvestmentDetailDistributionsTab
              dealId={dealId}
              investmentId={d.id}
            />
          ) : (
            <div
              id="inv-detail-panel-distributions"
              role="tabpanel"
              aria-labelledby="inv-detail-tab-distributions"
              className="investment_detail_tab_panel"
            >
              <p className="investment_detail_lead">
                Distributions are not available for this investment record.
              </p>
            </div>
          )
        ) : null}
      </div>
    </>
  )
}

export default function InvestmentDetailPage() {
  const { investmentId = "" } = useParams<{ investmentId: string }>()
  const decodedId = useMemo(
    () => decodeURIComponent(investmentId.trim()),
    [investmentId],
  )
  const fromLocal = useMemo(
    () => (decodedId ? getInvestmentDetail(decodedId) : undefined),
    [decodedId],
  )
  const [fromApi, setFromApi] = useState<InvestmentDetailRecord | null | undefined>(
    undefined,
  )
  const [loadPending, setLoadPending] = useState(false)

  useEffect(() => {
    if (!decodedId) {
      setFromApi(null)
      return
    }
    // Always load server deal + investors for this investment so the Profile and investment
    // table can list every book profile and amount (not only a single "Invested as" line
    // from local/runtime storage when both exist).
    let cancelled = false
    setLoadPending(true)
    void (async () => {
      try {
        const d = await loadInvestmentDetailFromDeal(decodedId)
        if (!cancelled) setFromApi(d ?? null)
      } catch {
        if (!cancelled) setFromApi(null)
      } finally {
        if (!cancelled) setLoadPending(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [decodedId])

  const detail = useMemo((): InvestmentDetailRecord | null => {
    if (fromApi) {
      return fromLocal
        ? mergeServerInvestmentDetailWithLocal(fromApi, fromLocal)
        : fromApi
    }
    return fromLocal ?? null
  }, [fromApi, fromLocal])

  useEffect(() => {
    if (loadPending && !fromLocal) {
      setAppDocumentTitle("Investment")
      return
    }
    if (!detail) {
      setAppDocumentTitle(
        decodedId ? "Investment not found" : "Investment",
      )
      return
    }
    const t =
      detail.list.investmentName?.trim() ||
      detail.propertyName?.trim() ||
      "Investment"
    setAppDocumentTitle(t)
  }, [detail, decodedId, loadPending, fromLocal])

  if (!decodedId) {
    return (
      <div className="um_page deals_list_page deals_detail_page investment_detail_page">
        <p className="deals_list_not_found">Missing investment.</p>
      </div>
    )
  }

  if (loadPending && !fromLocal) {
    return (
      <div className="um_page deals_list_page deals_detail_page investment_detail_page">
        <p className="deals_list_not_found" role="status">
          Loading investment…
        </p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="um_page deals_list_page deals_detail_page investment_detail_page">
        <p className="deals_list_not_found">
          Investment not found.{" "}
          <Link to="/investing/investments" className="deals_list_inline_back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            Back to investments
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="um_page deals_list_page deals_detail_page investment_detail_page">
      <Link to="/investing/investments" className="investment_detail_back">
        <ArrowLeft size={18} strokeWidth={2} aria-hidden />
        Back to investments
      </Link>
      <h1 className="investment_detail_title">
        {detail.list.investmentName || detail.propertyName}
      </h1>
      <DetailForm d={detail} />
    </div>
  )
}
