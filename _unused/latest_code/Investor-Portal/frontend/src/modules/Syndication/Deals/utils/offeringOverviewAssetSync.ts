import type { DealDetailApi } from "../api/dealsApi"
import {
  computeDealAssetRowsFromClientStorage,
  dealAssetsFullStorageKey,
} from "../types/deal-asset.types"

const EXCLUDED_PREFIX = "ip_overview_excluded_asset_ids:v1:"
const MERGE_PENDING_PREFIX = "ip_overview_assets_merge_pending:v1:"

/** Fired when Assets “Make it visible to Investors” is turned on (same tab). */
export const OFFERING_OVERVIEW_ASSETS_MERGE_EVENT =
  "ip-offering-overview-assets-merge"

export function offeringOverviewAssetsMergeStorageKey(dealId: string): string {
  return dealAssetsFullStorageKey(dealId)
}

function excludedStorageKey(dealId: string): string {
  return `${EXCLUDED_PREFIX}${dealId.trim()}`
}

function mergePendingStorageKey(dealId: string): string {
  return `${MERGE_PENDING_PREFIX}${dealId.trim()}`
}

function readJsonStringArray(raw: string | null): string[] {
  if (!raw?.trim()) return []
  try {
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter((x): x is string => typeof x === "string" && x.trim() !== "")
  } catch {
    return []
  }
}

/** Asset ids the sponsor removed from Overview and saved (do not auto-add again). */
export function readOverviewExcludedAssetIds(dealId: string): Set<string> {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return new Set()
  return new Set(readJsonStringArray(localStorage.getItem(excludedStorageKey(id))))
}

export function writeOverviewExcludedAssetIds(
  dealId: string,
  assetIds: Iterable<string>,
): void {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return
  try {
    localStorage.setItem(
      excludedStorageKey(id),
      JSON.stringify([...new Set(assetIds)]),
    )
  } catch {
    /* quota / private mode */
  }
}

/** Cleared when Assets investor visibility is turned on (fresh sync). */
export function clearOverviewExcludedAssetIds(dealId: string): void {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return
  try {
    localStorage.removeItem(excludedStorageKey(id))
  } catch {
    /* ignore */
  }
}

export function markOverviewAssetsMergePending(dealId: string): void {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return
  try {
    localStorage.setItem(mergePendingStorageKey(id), "1")
  } catch {
    /* ignore */
  }
}

export function consumeOverviewAssetsMergePending(dealId: string): boolean {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return false
  try {
    const key = mergePendingStorageKey(id)
    if (!localStorage.getItem(key)) return false
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function dispatchOverviewAssetsMergeEvent(dealId: string): void {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(OFFERING_OVERVIEW_ASSETS_MERGE_EVENT, {
      detail: { dealId: id },
    }),
  )
}

/** Non-archived asset row ids from the deal Assets section (client storage). */
export function activeDealAssetIdsForOverview(
  detail: Pick<
    DealDetailApi,
    "id" | "propertyName" | "city" | "country" | "assetImagePath"
  >,
): string[] {
  return computeDealAssetRowsFromClientStorage(detail)
    .filter((r) => !r.archived)
    .map((r) => r.id)
}

/** Union `selectedIds` with `toAdd`, preserving order. */
export function mergeOverviewAssetIds(
  selectedIds: readonly string[],
  toAdd: readonly string[],
): string[] {
  const seen = new Set(selectedIds)
  const out = [...selectedIds]
  for (const id of toAdd) {
    if (!seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  return out
}

export type MergeOverviewAssetsOptions = {
  /** When true, add every active asset (except excluded), e.g. visibility just turned on. */
  mergeAllActive?: boolean
  /** When true, only add active assets not in `savedSelectedIds` and not excluded. */
  mergeNewOnly?: boolean
}

/**
 * Returns merged selection for Overview “Assets”, or `null` if unchanged.
 */
export function computeMergedOverviewAssetSelection(params: {
  dealId: string
  detail: Pick<
    DealDetailApi,
    "id" | "propertyName" | "city" | "country" | "assetImagePath"
  >
  selectedIds: readonly string[]
  savedSelectedIds: readonly string[]
  options: MergeOverviewAssetsOptions
}): string[] | null {
  const excluded = readOverviewExcludedAssetIds(params.dealId)
  const active = activeDealAssetIdsForOverview(params.detail).filter(
    (id) => !excluded.has(id),
  )
  if (active.length === 0) return null

  let toAdd: string[] = []
  if (params.options.mergeAllActive) {
    toAdd = active
  } else if (params.options.mergeNewOnly) {
    const saved = new Set(params.savedSelectedIds)
    toAdd = active.filter((id) => !saved.has(id))
  }
  if (toAdd.length === 0) return null

  const merged = mergeOverviewAssetIds(params.selectedIds, toAdd)
  const before = [...params.selectedIds].sort().join("\0")
  const after = [...merged].sort().join("\0")
  return before === after ? null : merged
}

/** After Save: remember assets removed from Overview so they are not auto-added again. */
export function persistOverviewExcludedFromSave(params: {
  dealId: string
  detail: Pick<
    DealDetailApi,
    "id" | "propertyName" | "city" | "country" | "assetImagePath"
  >
  savedSelectedIds: readonly string[]
}): void {
  const active = new Set(activeDealAssetIdsForOverview(params.detail))
  const selected = new Set(params.savedSelectedIds)
  const removed: string[] = []
  for (const id of active) {
    if (!selected.has(id)) removed.push(id)
  }
  writeOverviewExcludedAssetIds(params.dealId, removed)
}
