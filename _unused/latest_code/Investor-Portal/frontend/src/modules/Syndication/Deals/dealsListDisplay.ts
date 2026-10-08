/** Display helpers for the Deals list table only */

import { SEC_TYPE_OPTIONS } from "./constants/sec-type-options"
import {
  DEAL_FORM_TYPE_OPTIONS,
  DEAL_TYPE_LABELS,
  type DealTypeOption,
} from "./types/deals.types"

export {
  formatDateDdMmmYyyy as formatDealListDateDisplay,
  dateSortValue,
} from "../../../common/utils/formatDateDisplay"

/** Strip “(most common)” suffix from option labels shown in the UI. */
export function stripMostCommonFromLabel(label: string): string {
  return label.replace(/\s*\(most common\)\s*/gi, "").trim() || label
}

/** Human-readable deal type for tables (wizard codes + legacy option keys). */
export function dealTypeDisplayLabel(code: string): string {
  if (!code || code === "—") return "—"
  const fromForm = DEAL_FORM_TYPE_OPTIONS.find((o) => o.value === code)
  if (fromForm) return stripMostCommonFromLabel(fromForm.label)
  const k = code as DealTypeOption
  const mapped = DEAL_TYPE_LABELS[k]
  return mapped ? stripMostCommonFromLabel(mapped) : code
}

/** SEC type dropdown value → label (deals list / dashboard cards). */
export function secTypeDisplayLabel(code: string): string {
  const t = String(code ?? "").trim()
  if (!t || t === "—") return "—"
  const hit = SEC_TYPE_OPTIONS.find((o) => o.value === t)
  const label = hit?.label ?? t
  return stripMostCommonFromLabel(label)
}

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Deals list amount cells: USD with `$`. */
export function formatCommittedCurrency(raw: string): string {
  if (raw == null) return "—"
  const s = String(raw).trim()
  if (s === "" || s === "—") return "—"
  const n = Number.parseFloat(s.replace(/[^0-9.-]/g, ""))
  if (!Number.isFinite(n)) return s
  return moneyFmt.format(n)
}

export function committedSortValue(raw: string): number {
  const n = Number.parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function parseInvestorCountFromCell(raw: string): number {
  const n = Number.parseInt(String(raw ?? "").replace(/\D/g, ""), 10)
  return Number.isFinite(n) ? n : 0
}

export function formatInvestorCountDisplay(raw: string): string {
  const s = String(raw ?? "").trim()
  if (s === "" || s === "—") return "—"
  return String(parseInvestorCountFromCell(raw))
}
