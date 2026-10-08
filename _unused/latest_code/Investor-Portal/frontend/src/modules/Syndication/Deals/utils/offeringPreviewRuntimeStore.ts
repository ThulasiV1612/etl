import type { OfferingPreviewDocument } from "./offeringPreviewDocuments"
import type {
  OfferingDetailsSectionId,
} from "./offeringPreviewInvestorVisibility"
import type { OfferingPreviewSection } from "./offeringPreviewDocSections"

const sectionsByDeal = new Map<string, OfferingPreviewSection[]>()
const flatDocsByDeal = new Map<string, OfferingPreviewDocument[]>()
const visibilityByDeal = new Map<
  string,
  Record<OfferingDetailsSectionId, boolean>
>()
const hydratedDeals = new Set<string>()

function dealKey(dealId: string | null | undefined): string {
  return dealId?.trim() ?? ""
}

export function isOfferingPreviewHydrated(dealId: string): boolean {
  const id = dealKey(dealId)
  return Boolean(id && hydratedDeals.has(id))
}

export function markOfferingPreviewHydrated(dealId: string): void {
  const id = dealKey(dealId)
  if (!id) return
  hydratedDeals.add(id)
}

export function clearOfferingPreviewRuntime(dealId: string): void {
  const id = dealKey(dealId)
  if (!id) return
  sectionsByDeal.delete(id)
  flatDocsByDeal.delete(id)
  visibilityByDeal.delete(id)
  hydratedDeals.delete(id)
}

export function getRuntimeOfferingPreviewSections(
  dealId: string,
): OfferingPreviewSection[] | undefined {
  const id = dealKey(dealId)
  if (!id) return undefined
  return sectionsByDeal.get(id)
}

export function setRuntimeOfferingPreviewSections(
  dealId: string,
  sections: OfferingPreviewSection[],
): void {
  const id = dealKey(dealId)
  if (!id) return
  sectionsByDeal.set(id, sections)
}

export function getRuntimeOfferingPreviewFlatDocuments(
  dealId: string,
): OfferingPreviewDocument[] | undefined {
  const id = dealKey(dealId)
  if (!id) return undefined
  return flatDocsByDeal.get(id)
}

export function setRuntimeOfferingPreviewFlatDocuments(
  dealId: string,
  docs: OfferingPreviewDocument[],
): void {
  const id = dealKey(dealId)
  if (!id) return
  flatDocsByDeal.set(id, docs)
}

export function getRuntimeOfferingPreviewVisibility(
  dealId: string,
): Record<OfferingDetailsSectionId, boolean> | undefined {
  const id = dealKey(dealId)
  if (!id) return undefined
  return visibilityByDeal.get(id)
}

export function setRuntimeOfferingPreviewVisibility(
  dealId: string,
  flags: Record<OfferingDetailsSectionId, boolean>,
): void {
  const id = dealKey(dealId)
  if (!id) return
  visibilityByDeal.set(id, flags)
}
