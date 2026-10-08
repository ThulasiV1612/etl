import { matchPath } from "react-router-dom"
import { formatDateDdMmmYyyy } from "../../../common/utils/formatDateDisplay"
import { dealDisplayFieldText, type DealDetailApi } from "./api/dealsApi"
import {
  acceptedAmountForPayload,
  formatUsdDashboardAmount,
  fundedAmountForPayload,
  targetAmountNumberForDeal,
} from "./dealsDashboardMoney"
import type { DealInvestorsPayload } from "./types/deal-investors.types"
import type { DealInvestorClass } from "./types/deal-investor-class.types"
import {
  dealTypeDisplayLabel,
  secTypeDisplayLabel,
} from "./dealsListDisplay"
import {
  formatMoneyFieldDisplay,
  parseMoneyDigits,
} from "./utils/offeringMoneyFormat"

/** Matches backend `offeringPreviewCrypto` UUID check for legacy `preview=` links. */
export const DEAL_OFFERING_PREVIEW_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isDealUuidForOfferingPreview(id: string | undefined): boolean {
  return Boolean(id?.trim() && DEAL_OFFERING_PREVIEW_UUID_RE.test(id.trim()))
}

export { dealInvestNowPath } from "./utils/dealInvestNowPath"
export { dealWorkspacePath } from "./utils/dealWorkspacePath"

export function dealIdFromOfferingPortfolioPathname(
  pathname: string,
): string | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/"
  const m = matchPath(
    { path: "/deals/:dealId/offering-portfolio", end: true },
    normalized,
  )
  const id = m?.params.dealId
  return typeof id === "string" && id.trim() ? id.trim() : undefined
}

export const EMPTY_INVESTORS_PAYLOAD: DealInvestorsPayload = {
  kpis: {
    offeringSize: "—",
    committed: "—",
    remaining: "—",
    totalApproved: "—",
    totalPending: "—",
    totalFunded: "—",
    approvedCount: "—",
    pendingCount: "—",
    waitlistCount: "—",
    averageApproved: "—",
    nonAccreditedCount: "—",
  },
  investors: [],
}

export function previewTargetDisplay(
  detail: DealDetailApi,
  classes: DealInvestorClass[],
): string {
  const n = targetAmountNumberForDeal(detail.listRow, classes)
  if (Number.isFinite(n) && n > 0) return formatMoneyFieldDisplay(String(n))
  const raw =
    detail.offeringSize?.trim() ||
    detail.listRow.raiseTarget?.trim() ||
    ""
  if (raw && raw !== "—") return formatMoneyFieldDisplay(raw)
  return "—"
}

export function previewAcceptedDisplay(
  detail: DealDetailApi,
  payload: DealInvestorsPayload,
): string {
  const num = acceptedAmountForPayload(payload)
  if (Number.isFinite(num) && num > 0) return formatUsdDashboardAmount(num)
  const kpi = payload.kpis.committed?.trim()
  if (kpi && kpi !== "—") return kpi
  const lr = detail.listRow.totalAccepted?.trim()
  if (lr && lr !== "—") return lr
  return "—"
}

export function previewFundedDisplay(payload: DealInvestorsPayload): string {
  const n = fundedAmountForPayload(payload)
  if (Number.isFinite(n) && n > 0) return formatUsdDashboardAmount(n)
  const kpi = payload.kpis.totalFunded?.trim()
  if (kpi && kpi !== "—") return kpi
  return "—"
}

export type OfferingMetricChip = { label: string; value: string }

export type OfferingSidebarSummaryIconKey =
  | "minimum"
  | "offering_size"
  | "deal_type"
  | "sec_type"
  | "investment_type"
  | "close_date"

export type OfferingSidebarSummaryRow = {
  label: string
  value: string
  iconKey: OfferingSidebarSummaryIconKey
}

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  equity: "Equity",
  debt: "Debt",
  convertible: "Convertible",
  hybrid: "Hybrid",
  other: "Other",
}

/** City and state for the portfolio header (wireframe). */
export function formatOfferingPortfolioLocationLine(
  detail: DealDetailApi,
): string {
  const city = dealDisplayFieldText(detail.city)
  const state = dealDisplayFieldText(detail.state)
  const parts = [city, state].filter(Boolean)
  if (parts.length) return parts.join(", ")
  const country = dealDisplayFieldText(detail.country)
  if (city && country) return `${city}, ${country}`
  return country || city || "—"
}

export function hasOfferingPortfolioLocationLine(line: string): boolean {
  const t = line.trim()
  return Boolean(t) && t !== "—"
}

function investmentTypeFromClassJson(ic: DealInvestorClass): string | undefined {
  const raw = ic.advancedOptionsJson?.trim()
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as { investmentType?: unknown }
    const t =
      typeof parsed.investmentType === "string"
        ? parsed.investmentType.trim()
        : ""
    return t || undefined
  } catch {
    return undefined
  }
}

function investmentTypeDisplay(detail: DealDetailApi, classes: DealInvestorClass[]): string {
  const fromList = detail.listRow?.investmentType?.trim()
  if (fromList && fromList !== "—") {
    return INVESTMENT_TYPE_LABELS[fromList.toLowerCase()] ?? fromList
  }
  for (const ic of classes) {
    const raw = investmentTypeFromClassJson(ic)
    if (!raw) continue
    return INVESTMENT_TYPE_LABELS[raw.toLowerCase()] ?? raw
  }
  return "—"
}

/** Offering overview — investment type for selected class, else deal-level fallback. */
export function investmentTypeLabelForOverview(
  detail: DealDetailApi,
  classRow: DealInvestorClass | undefined,
  allClasses: DealInvestorClass[],
): string {
  if (classRow) {
    const raw = investmentTypeFromClassJson(classRow)
    if (raw) return INVESTMENT_TYPE_LABELS[raw.toLowerCase()] ?? raw
  }
  return investmentTypeDisplay(detail, allClasses)
}

/** Investor class highlighted on offering overview (by id), else earliest-created class. */
export function resolveOfferingOverviewInvestorClass(
  classes: readonly DealInvestorClass[],
  offeringOverviewClassId?: string | null,
): DealInvestorClass | null {
  const id = offeringOverviewClassId?.trim()
  if (id) {
    const match = classes.find((c) => c.id === id)
    if (match) return match
  }
  return firstCreatedInvestorClass(classes)
}

/** Minimum investment for the offering overview class (or lowest across classes). */
export function offeringOverviewMinimumInvestmentDisplay(
  classes: DealInvestorClass[],
  offeringOverviewClassId?: string | null,
): string {
  const cls = resolveOfferingOverviewInvestorClass(
    classes,
    offeringOverviewClassId,
  )
  if (cls) return minimumInvestmentDisplayForClass(cls)
  return previewMinimumInvestmentDisplay(classes)
}

/** Lowest class minimum for the sticky summary column. */
export function previewMinimumInvestmentDisplay(
  classes: DealInvestorClass[],
): string {
  let best: number | null = null
  let fallback = ""
  for (const ic of classes) {
    const raw = ic.minimumInvestment?.trim()
    if (!raw) continue
    const n = parseMoneyDigits(raw)
    if (Number.isFinite(n) && n > 0) {
      if (best === null || n < best) best = n
    } else if (!fallback) fallback = raw
  }
  if (best !== null) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(best)
  }
  if (fallback) return formatMoneyFieldDisplay(fallback)
  return "—"
}

/** Minimum investment for one deal class (Invest Now amount validation). */
export function minimumInvestmentDisplayForClass(
  cls: DealInvestorClass | undefined,
): string {
  if (!cls) return "—"
  const raw = cls.minimumInvestment?.trim()
  if (!raw) return "—"
  const n = parseMoneyDigits(raw)
  if (Number.isFinite(n) && n >= 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n)
  }
  return formatMoneyFieldDisplay(raw)
}

/** Sticky sidebar rows (wireframe Section 2). */
export function buildOfferingSidebarSummaryRows(
  detail: DealDetailApi,
  classes: DealInvestorClass[],
  _investorsPayload: DealInvestorsPayload,
): OfferingSidebarSummaryRow[] {
  const offeringSize = previewTargetDisplay(detail, classes)
  const close = formatDateDdMmmYyyy(detail.closeDate?.trim())
  return [
    {
      label: "Minimum investment",
      value: offeringOverviewMinimumInvestmentDisplay(
        classes,
        detail.offeringOverviewClassId,
      ),
      iconKey: "minimum",
    },
    { label: "Offering size", value: offeringSize, iconKey: "offering_size" },
    {
      label: "Deal type",
      value: dealTypeDisplayLabel(detail.dealType?.trim() ?? ""),
      iconKey: "deal_type",
    },
    {
      label: "SEC type",
      value: secTypeDisplayLabel(detail.secType?.trim() ?? ""),
      iconKey: "sec_type",
    },
    {
      label: "Investment type",
      value: investmentTypeDisplay(detail, classes),
      iconKey: "investment_type",
    },
    { label: "Close date", value: close, iconKey: "close_date" },
  ]
}

/** KPI chips for the offering bento metrics row (investor / preview). */
export function buildOfferingMetricChips(
  detail: DealDetailApi,
  classes: DealInvestorClass[],
  payload: DealInvestorsPayload,
): OfferingMetricChip[] {
  const chips: OfferingMetricChip[] = []
  const target = previewTargetDisplay(detail, classes)
  if (target !== "—") chips.push({ label: "Offering target", value: target })

  const funded = previewFundedDisplay(payload)
  if (funded !== "—") chips.push({ label: "Total funded", value: funded })

  const inv = detail.listRow.investors?.trim()
  if (inv && inv !== "—") chips.push({ label: "Investors", value: inv })

  if (detail.dealType?.trim()) {
    const dealType = dealTypeDisplayLabel(detail.dealType.trim())
    if (dealType !== "—") chips.push({ label: "Deal type", value: dealType })
  }
  if (detail.secType?.trim()) {
    const sec = secTypeDisplayLabel(detail.secType.trim())
    if (sec !== "—") chips.push({ label: "Security type", value: sec })
  }

  const close = formatDateDdMmmYyyy(detail.closeDate?.trim())
  if (close !== "—") chips.push({ label: "Target close", value: close })

  return chips
}

/** True when Offering details → Summary has saved rich text (not empty Quill HTML). */
export function hasMeaningfulInvestorSummaryHtml(
  html: string | null | undefined,
): boolean {
  const raw = String(html ?? "").trim()
  if (!raw) return false
  const text = raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 0
}

export function buildSummaryBits(
  detail: DealDetailApi,
  classes: DealInvestorClass[],
  payload: DealInvestorsPayload,
): string[] {
  const bits: string[] = []
  const target = previewTargetDisplay(detail, classes)
  if (target !== "—") bits.push(`Offering target: ${target}`)

  const accepted = previewAcceptedDisplay(detail, payload)
  if (accepted !== "—") bits.push(`Total accepted: ${accepted}`)

  const funded = previewFundedDisplay(payload)
  if (funded !== "—") bits.push(`Total funded: ${funded}`)

  const inv = detail.listRow.investors?.trim()
  if (inv && inv !== "—") bits.push(`Investors: ${inv}`)

  if (detail.dealType?.trim()) {
    const dealType = dealTypeDisplayLabel(detail.dealType.trim())
    if (dealType !== "—") bits.push(`Deal type: ${dealType}`)
  }
  if (detail.secType?.trim()) {
    const sec = secTypeDisplayLabel(detail.secType.trim())
    if (sec !== "—") bits.push(`Security type: ${sec}`)
  }
  const close = formatDateDdMmmYyyy(detail.closeDate?.trim())
  if (close !== "—") bits.push(`Target close: ${close}`)
  return bits
}

export type KeyHighlightPreviewRow = { metric: string; newClass: string }

/** Same preset metrics as Offering details → Key Highlights (`KeyHighlightsSection`). */
export const OFFERING_KEY_HIGHLIGHT_PRESET_METRICS = [
  "Annualized return",
  "Average cash-on-cash",
  "Equity multiple",
  "IRR",
  "Holding period",
] as const

export function defaultKeyHighlightPreviewRows(): KeyHighlightPreviewRow[] {
  return OFFERING_KEY_HIGHLIGHT_PRESET_METRICS.map((metric) => ({
    metric,
    newClass: "—",
  }))
}

export function keyHighlightRowsFromJson(
  raw: string | null | undefined,
): KeyHighlightPreviewRow[] {
  const t = raw?.trim()
  if (!t) return []
  try {
    const parsed = JSON.parse(t) as unknown
    if (!Array.isArray(parsed)) return []
    const out: KeyHighlightPreviewRow[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const o = item as Record<string, unknown>
      const metric = typeof o.metric === "string" ? o.metric.trim() : ""
      const nc = typeof o.newClass === "string" ? o.newClass.trim() : ""
      if (!metric && !nc) continue
      out.push({ metric: metric || "—", newClass: nc || "—" })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Investor class created earliest on the deal (by `createdAt`, then list order).
 * Uses the earliest `createdAt`; if dates are missing, uses the first class from the API list.
 */
export function firstCreatedInvestorClass(
  classes: readonly DealInvestorClass[],
): DealInvestorClass | null {
  if (!classes.length) return null
  const dated = classes
    .map((c, index) => ({
      c,
      index,
      t: Date.parse(c.createdAt ?? ""),
    }))
    .filter((x) => Number.isFinite(x.t))
  if (dated.length > 0) {
    dated.sort((a, b) => a.t - b.t || a.index - b.index)
    return dated[0]?.c ?? null
  }
  return classes[0] ?? null
}

/**
 * Investor class name for the Key Highlights value column (Offering details + preview).
 */
export function firstCreatedInvestorClassName(
  classes: DealInvestorClass[],
): string {
  const first = firstCreatedInvestorClass(classes)
  if (!first) return "Class"
  const name = first.name?.trim()
  return name || "Class"
}

export interface KeyHighlightPreviewOptions {
  /** Sponsor preview: show all metrics from Offering details, including empty values. */
  includeEmptyClassValues?: boolean
}

/**
 * Key Highlights for portfolio preview — mirrors Offering details data.
 * Uses saved `keyHighlightsJson`, or default preset metrics when nothing saved yet.
 */
export function keyHighlightRowsForOfferingPreview(
  raw: string | null | undefined,
  options?: KeyHighlightPreviewOptions,
): KeyHighlightPreviewRow[] {
  const fromJson = keyHighlightRowsFromJson(raw)
  const rows =
    fromJson.length > 0 ? fromJson : defaultKeyHighlightPreviewRows()
  if (options?.includeEmptyClassValues) return rows
  return rows.filter(
    (row) => row.newClass.trim() && row.newClass !== "—",
  )
}
