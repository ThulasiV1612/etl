import {
  emptyAssetStepDraft,
  type AssetStepDraft,
  type DealStepDraft,
} from "./types/deals.types"

/**
 * GET /deals/:id does not return street / state / zip (not stored on `add_deal_form`).
 * When opening `/deals/create?edit=:id`, merge the session wizard draft if it belongs
 * to the same deal so US state + city and address lines are not cleared.
 */
export function mergeStoredCreateDealDraftForEdit(
  editDealId: string,
  mappedDeal: DealStepDraft,
  mappedAsset: AssetStepDraft,
): { deal: DealStepDraft; asset: AssetStepDraft; step: 0 | 1 } {
  const id = editDealId.trim()
  if (!id) return { deal: mappedDeal, asset: mappedAsset, step: 0 }
  const session = loadCreateDealDraft()
  const bid = session?.backendDealId?.trim()
  if (!session || bid !== id)
    return { deal: mappedDeal, asset: mappedAsset, step: 0 }
  const sa = session.asset
  return {
    deal: mappedDeal,
    asset: {
      ...mappedAsset,
      streetAddress1: sa.streetAddress1 ?? mappedAsset.streetAddress1,
      streetAddress2: sa.streetAddress2 ?? mappedAsset.streetAddress2,
      state: sa.state ?? mappedAsset.state,
      zipCode: sa.zipCode ?? mappedAsset.zipCode,
      city: mappedAsset.city.trim()
        ? mappedAsset.city
        : (sa.city ?? ""),
    },
    step: session.step === 1 ? 1 : 0,
  }
}

const STORAGE_KEY = "portal_create_deal_wizard_draft"

/** Fired after `saveCreateDealDraft` / `clearCreateDealDraft` so the deals list can refresh the draft row. */
export const CREATE_DEAL_DRAFT_UPDATED_EVENT =
  "investor-portal:create-deal-draft-updated"

export interface CreateDealFormDraft {
  deal: DealStepDraft
  asset: AssetStepDraft
  step: 0 | 1
  /** Set after first successful backend autosave (create flow); list row comes from API. */
  backendDealId?: string | null
}

/** Fired after a deal is autosaved to the API so the deals table can refetch (if mounted). */
export const DEALS_LIST_REFETCH_EVENT = "investor-portal:deals-list-refetch"

export function notifyDealsListRefetch(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(DEALS_LIST_REFETCH_EVENT))
}

export function loadCreateDealDraft(): CreateDealFormDraft | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return null
    const p = JSON.parse(raw) as Partial<CreateDealFormDraft> & {
      deal?: Partial<DealStepDraft>
      asset?: Partial<AssetStepDraft>
      backend_deal_id?: string
    }
    if (p == null || typeof p !== "object") return null
    if (!p.deal || typeof p.deal !== "object") return null
    if (!p.asset || typeof p.asset !== "object") return null
    const step = p.step === 1 ? 1 : 0
    const rawBid = p.backendDealId ?? p.backend_deal_id
    const backendDealId =
      typeof rawBid === "string" && rawBid.trim() ? rawBid.trim() : null
    return {
      step,
      deal: p.deal as DealStepDraft,
      asset: p.asset as AssetStepDraft,
      ...(backendDealId ? { backendDealId } : {}),
    }
  } catch {
    return null
  }
}

let draftListNotifyTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced so the deals list DataTable does not re-render on every keystroke. */
function notifyDraftUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CREATE_DEAL_DRAFT_UPDATED_EVENT))
}

function scheduleDebouncedDraftListNotify(): void {
  if (typeof window === "undefined") return
  if (draftListNotifyTimer) clearTimeout(draftListNotifyTimer)
  draftListNotifyTimer = setTimeout(() => {
    draftListNotifyTimer = null
    notifyDraftUpdated()
  }, 900)
}

export function saveCreateDealDraft(draft: CreateDealFormDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    /* quota / private mode */
  }
  scheduleDebouncedDraftListNotify()
}

export function clearCreateDealDraft(): void {
  if (draftListNotifyTimer) {
    clearTimeout(draftListNotifyTimer)
    draftListNotifyTimer = null
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  notifyDraftUpdated()
}

function isNonEmpty(s: string | undefined): boolean {
  return String(s ?? "").trim().length > 0
}

/** True if the draft differs from empty defaults (worth restoring). */
export function createDealDraftHasContent(d: CreateDealFormDraft): boolean {
  if (d.step === 1) return true
  const ea = emptyAssetStepDraft()
  const deal = d.deal
  const asset = d.asset
  if (isNonEmpty(deal.dealName)) return true
  if (isNonEmpty(deal.dealType)) return true
  if (isNonEmpty(deal.dealStage)) return true
  if (isNonEmpty(deal.secType)) return true
  if (isNonEmpty(deal.closeDate)) return true
  if (isNonEmpty(deal.owningEntityName)) return true
  if (isNonEmpty(deal.fundsBeforeGpCountersigns)) return true
  if (isNonEmpty(deal.autoFundingAfterGpCountersigns)) return true
  if (isNonEmpty(asset.propertyName)) return true
  if (asset.country.trim() !== ea.country.trim()) return true
  if (isNonEmpty(asset.streetAddress1)) return true
  if (isNonEmpty(asset.streetAddress2)) return true
  if (isNonEmpty(asset.city)) return true
  if (isNonEmpty(asset.state)) return true
  if (isNonEmpty(asset.zipCode)) return true
  return false
}
