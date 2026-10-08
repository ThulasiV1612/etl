/** Stored API values for PATCH /deals/:id/offering-overview (`offering_status` column). */

import {
  allowedStatusesForStage,
  canEditFundraisingStatus,
  defaultStatusForStage,
  normalizeDealStageCanonical,
  type DealStatus,
} from "../constants/deal-lifecycle"
import {
  getOfferingStatusMeta,
  OFFERING_STATUS_OPTIONS_LIST,
} from "./offeringStatusCatalog"

export {
  getOfferingStatusMeta,
  OFFERING_STATUS_CATALOG,
  OFFERING_STATUS_OPTIONS_LIST,
  type OfferingStatusMeta,
  type OfferingStatusTone,
} from "./offeringStatusCatalog"

/** @deprecated Use `OFFERING_STATUS_OPTIONS_LIST` — kept for callers expecting `{ value, label }[]`. */
export const OFFERING_STATUS_OPTIONS = OFFERING_STATUS_OPTIONS_LIST.map((m) => ({
  value: m.value,
  label: m.label,
}))

export type OfferingStatusValue = DealStatus

export type OfferingStatusSelectOption = {
  value: OfferingStatusValue | string
  label: string
}

export const DEFAULT_OFFERING_STATUS: OfferingStatusValue = "draft_hidden"

export const OFFERING_VISIBILITY_OPTIONS = [
  {
    value: "show_on_dashboard",
    label: "Show on dashboard",
  },
  {
    value: "show_on_deal_investors_dashboard",
    label: "Show on deal investors' dashboard",
    optionHint:
      "Offering is only visible to existing investors on this deal.",
  },
  {
    value: "only_visible_with_link",
    label: "Only visible with link",
  },
] as const

export type OfferingVisibilityValue =
  (typeof OFFERING_VISIBILITY_OPTIONS)[number]["value"]

export const DEFAULT_OFFERING_VISIBILITY: OfferingVisibilityValue =
  "show_on_dashboard"

/** Status choices allowed for the deal's current stage (full list; no forward-only trimming). */
export function offeringStatusOptionsForDealStage(
  dealStage: string | null | undefined,
): OfferingStatusSelectOption[] {
  const stage = normalizeDealStageCanonical(dealStage)
  if (!stage) {
    return OFFERING_STATUS_OPTIONS_LIST.map((m) => ({
      value: m.value,
      label: m.label,
    }))
  }
  const allowed = new Set<DealStatus>(allowedStatusesForStage(stage))
  return OFFERING_STATUS_OPTIONS_LIST.filter((m) => allowed.has(m.value)).map(
    (m) => ({ value: m.value, label: m.label }),
  )
}

/** True when the overview status dropdown should be editable (draft or capital raising). */
export function isOfferingStatusFieldEditable(
  dealStage: string | null | undefined,
): boolean {
  return canEditFundraisingStatus(dealStage)
}

/** Human-readable label for overview display; empty API value shows "—". */
export function offeringStatusLabelFromRaw(
  raw: string | null | undefined,
): string {
  const v = String(raw ?? "").trim()
  if (!v) return "—"
  return getOfferingStatusMeta(v)?.label ?? v
}

/** Raw `offering_status` from the deal — no stage default injection. */
export function offeringStatusFromApi(
  raw: string | null | undefined,
): string {
  return String(raw ?? "").trim()
}

/** Human-readable label for overview visibility; empty API value shows "—". */
export function offeringVisibilityLabelFromRaw(
  raw: string | null | undefined,
): string {
  const mapped = mapLegacyOfferingVisibility(String(raw ?? ""))
  if (!mapped.trim()) return "—"
  const opt = OFFERING_VISIBILITY_OPTIONS.find((o) => o.value === mapped)
  if (opt) return opt.label
  return mapped
}

/** Select options for overview; keeps the stored value visible even when stage-locked. */
export function offeringStatusOptionsForOverview(
  dealStage: string | null | undefined,
  currentOfferingStatus?: string | null,
): OfferingStatusSelectOption[] {
  const cur = offeringStatusFromApi(currentOfferingStatus)
  const opts = offeringStatusOptionsForDealStage(dealStage)
  if (!cur) return opts
  if (opts.some((o) => o.value === cur)) return opts
  return [{ value: cur, label: offeringStatusLabelFromRaw(cur) }, ...opts]
}

/** Coerce to a valid status for the stage, or the stage default. */
export function normalizeOfferingStatusForStage(
  dealStage: string | null | undefined,
  raw: string | undefined,
): OfferingStatusValue {
  const stage = normalizeDealStageCanonical(dealStage)
  const v = String(raw ?? "").trim()
  if (stage) {
    const allowed = allowedStatusesForStage(stage)
    if (allowed.includes(v as DealStatus)) return v as OfferingStatusValue
    return defaultStatusForStage(stage) as OfferingStatusValue
  }
  if (getOfferingStatusMeta(v)) return v as OfferingStatusValue
  return DEFAULT_OFFERING_STATUS
}

/** Map pre–mockup API/DB values to current visibility codes. */
export function mapLegacyOfferingVisibility(raw: string): string {
  const v = String(raw ?? "").trim()
  switch (v) {
    case "eligible_investors":
      return "show_on_dashboard"
    case "link_only":
    case "hidden":
      return "only_visible_with_link"
    default:
      return v
  }
}

export function dealHasOfferingShareLink(
  detail: { offeringVisibility?: string | null } | null | undefined,
): boolean {
  if (!detail) return false
  return (
    mapLegacyOfferingVisibility(String(detail.offeringVisibility ?? "")) ===
    "only_visible_with_link"
  )
}
