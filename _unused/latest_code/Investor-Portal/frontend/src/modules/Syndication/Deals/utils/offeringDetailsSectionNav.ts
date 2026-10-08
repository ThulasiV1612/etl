import {
  OFFERING_DETAILS_ACCORDION_SECTION_ORDER,
  type OfferingDetailsSectionId,
} from "./offeringPreviewInvestorVisibility"

export const OFFERING_SECTION_QUERY_PARAM = "offeringSection"
export const DEAL_DETAIL_TAB_QUERY_PARAM = "tab"

/** Passed via `react-router` `location.state` from Offering details sub-flows. */
export type DealDetailReturnState = {
  returnTab?: string
  returnSection?: string
}

export const OFFERING_DETAILS_CLASSES_RETURN: DealDetailReturnState = {
  returnTab: "offering_details",
  returnSection: "offering_information",
}

export const OFFERING_DETAILS_ASSETS_RETURN: DealDetailReturnState = {
  returnTab: "offering_details",
  returnSection: "assets",
}

/** Legacy URL/state id for the Classes accordion (now `offering_information`). */
const LEGACY_CLASSES_SECTION_ID = "classes"

export function normalizeOfferingDetailsSectionId(
  value: string | null | undefined,
): OfferingDetailsSectionId | null {
  const v = String(value ?? "").trim()
  if (!v) return null
  if (v === LEGACY_CLASSES_SECTION_ID) return "offering_information"
  return OFFERING_DETAILS_ACCORDION_SECTION_ORDER.some((s) => s.id === v)
    ? (v as OfferingDetailsSectionId)
    : null
}

export function isOfferingDetailsSectionId(
  value: string | null | undefined,
): value is OfferingDetailsSectionId {
  const v = String(value ?? "").trim()
  if (!v) return false
  return OFFERING_DETAILS_ACCORDION_SECTION_ORDER.some((s) => s.id === v)
}

export function offeringSectionElementId(
  sectionId: OfferingDetailsSectionId,
): string {
  return `deal-offering-section-${sectionId}`
}

export function scrollToOfferingSection(
  sectionId: OfferingDetailsSectionId,
): void {
  if (typeof document === "undefined") return
  window.setTimeout(() => {
    document
      .getElementById(offeringSectionElementId(sectionId))
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, 0)
}

export function openSectionsFromUrlSection(
  sectionFromUrl: string | null,
): Record<OfferingDetailsSectionId, boolean> {
  const o = {} as Record<OfferingDetailsSectionId, boolean>
  const active = normalizeOfferingDetailsSectionId(sectionFromUrl)
  OFFERING_DETAILS_ACCORDION_SECTION_ORDER.forEach(({ id }, i) => {
    o[id] = active != null ? id === active : i === 0
  })
  return o
}

export function buildDealDetailReturnSearch(params: {
  tab?: string
  offeringSection?: string | null
}): string {
  const sp = new URLSearchParams()
  if (params.tab?.trim()) sp.set(DEAL_DETAIL_TAB_QUERY_PARAM, params.tab.trim())
  const section = normalizeOfferingDetailsSectionId(params.offeringSection)
  if (section) sp.set(OFFERING_SECTION_QUERY_PARAM, section)
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}
