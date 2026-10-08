import { normalizeDealGallerySrc } from "../../../../common/utils/apiBaseUrl"
import { getUsStateDisplayName } from "../constants/usLocations"
import {
  blurFormatMoneyInputTwoDecimals,
  moneyAmountOnBlurTwoDecimals,
} from "../utils/offeringMoneyFormat"
import {
  COUNTRY_OPTIONS,
  emptyAssetStepDraft,
  type AssetStepDraft,
} from "./deals.types"

/** Maximum property images allowed per asset (Add/Edit asset and create-deal Assets step). */
export const ASSET_MAX_IMAGE_COUNT = 10

/** Legacy key for one-shot pending row (migrated into full map) */
export function dealAssetPendingStorageKey(dealId: string): string {
  return `portal_deal_asset_pending_${dealId}`
}

/** Full asset payloads persisted per deal (`localStorage`, keyed by deal id) */
export function dealAssetsFullStorageKey(dealId: string): string {
  return `portal_deal_assets_full_${dealId}`
}

function migrateDealAssetsFullMapFromSession(dealId: string): void {
  if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined")
    return
  try {
    const key = dealAssetsFullStorageKey(dealId)
    if (localStorage.getItem(key)) return
    const fromSession = sessionStorage.getItem(key)
    if (fromSession) {
      localStorage.setItem(key, fromSession)
      sessionStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

export interface DealAssetPersisted {
  id: string
  row: DealAssetRow
  draft: AssetStepDraft
  attrRows: AssetAttributeRow[]
  /** Data URLs for images saved from this form (restored on edit). */
  imagePreviewDataUrls?: string[]
}

export function readDealAssetsFullMap(
  dealId: string,
): Record<string, DealAssetPersisted> {
  if (typeof localStorage === "undefined") return {}
  migrateDealAssetsFullMapFromSession(dealId)
  try {
    const raw = localStorage.getItem(dealAssetsFullStorageKey(dealId))
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== "object" || Array.isArray(p)) return {}
    return p as Record<string, DealAssetPersisted>
  } catch {
    return {}
  }
}

export const DEAL_ASSETS_STORAGE_CHANGED_EVENT =
  "ip-deal-assets-storage-changed"

export function writeDealAssetsFullMap(
  dealId: string,
  map: Record<string, DealAssetPersisted>,
): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(
      dealAssetsFullStorageKey(dealId),
      JSON.stringify(map),
    )
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(DEAL_ASSETS_STORAGE_CHANGED_EVENT, {
          detail: { dealId: dealId.trim() },
        }),
      )
    }
  } catch {
    /* quota / private mode */
  }
}

export function upsertDealAssetPersisted(
  dealId: string,
  entry: DealAssetPersisted,
): void {
  const map = readDealAssetsFullMap(dealId)
  map[entry.id] = entry
  writeDealAssetsFullMap(dealId, map)
}

export function getDealAssetPersisted(
  dealId: string,
  assetId: string,
): DealAssetPersisted | undefined {
  return readDealAssetsFullMap(dealId)[assetId]
}

/** Primary asset row id used in the offering Assets table */
export function primaryDealAssetRowId(dealId: string): string {
  return `primary-${dealId}`
}

/**
 * @param useDealWideImageCount When true, derive `imageCount` from `detail.assetImagePath`
 *   (all semicolon paths on the deal). Only valid when this deal has **no extra assets**
 *   in client storage — that path list is shared across every asset’s uploads, so using
 *   it for the primary row would count other assets’ images on asset one.
 */
export function buildPrimaryDealAssetRowFromDetail(
  detail: {
    id: string
    propertyName: string
    city: string
    country: string
    assetImagePath: string | null
  },
  useDealWideImageCount = true,
): DealAssetRow {
  const name = detail.propertyName?.trim() || "—"
  const address =
    [detail.city, detail.country].filter((x) => x?.trim()).join(", ") || "—"
  const imageCount =
    useDealWideImageCount && detail.assetImagePath?.trim()
      ? String(detail.assetImagePath)
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean).length
      : 0
  return {
    id: primaryDealAssetRowId(detail.id),
    name,
    address,
    assetType: "—",
    imageCount,
    archived: false,
  }
}

function legacyDealAssetRowToPersisted(row: DealAssetRow): DealAssetPersisted {
  const attrRows = createDefaultAssetAttributeRows()
  const at = attrRows.find((r) => r.id === "attr-asset-type")
  if (at && row.assetType && row.assetType !== "—") at.value = row.assetType
  return {
    id: row.id,
    row: { ...row, archived: Boolean(row.archived) },
    draft: {
      ...emptyAssetStepDraft(),
      propertyName: row.name,
    },
    attrRows,
  }
}

/** Writes `archived` for a row into storage keyed by `dealId`. */
export function persistDealAssetRowArchiveState(
  dealId: string,
  row: DealAssetRow,
): void {
  const map = readDealAssetsFullMap(dealId)
  const existing = map[row.id]
  if (existing) {
    map[row.id] = {
      ...existing,
      row: { ...existing.row, archived: Boolean(row.archived) },
    }
  } else {
    map[row.id] = legacyDealAssetRowToPersisted(row)
  }
  writeDealAssetsFullMap(dealId, map)
}

/** Migrates legacy pending JSON into the full map, then returns table rows. */
export function consumeLegacyPendingAsset(dealId: string): void {
  const key = dealAssetPendingStorageKey(dealId)
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(key) ?? localStorage.getItem(key)
  } catch {
    return
  }
  if (!raw) return
  try {
    try {
      sessionStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && "row" in parsed && "draft" in parsed) {
      upsertDealAssetPersisted(dealId, parsed as DealAssetPersisted)
      return
    }
    if (parsed && typeof parsed === "object" && "id" in parsed && "name" in parsed) {
      upsertDealAssetPersisted(
        dealId,
        legacyDealAssetRowToPersisted(parsed as DealAssetRow),
      )
    }
  } catch {
    /* ignore */
  }
}

function countDistinctPreviewUrls(urls: string[] | undefined): number {
  if (!urls?.length) return 0
  const seen = new Set<string>()
  for (const raw of urls) {
    if (typeof raw !== "string" || !raw.trim()) continue
    const k = normalizeDealGallerySrc(raw).trim().toLowerCase()
    if (k) seen.add(k)
  }
  return seen.size
}

function reconcileAssetRowImageCount(
  row: DealAssetRow,
  persisted: DealAssetPersisted | undefined,
  detail: { id: string; assetImagePath: string | null },
  /** When false, do not use deal-wide `assetImagePath` length for the primary row (multi-asset deals). */
  useDealWideApiCountForPrimary: boolean,
): DealAssetRow {
  const fromPreviews = countDistinctPreviewUrls(persisted?.imagePreviewDataUrls)
  const isPrimary = row.id === primaryDealAssetRowId(detail.id)
  /** Once this asset was saved via Add/Edit asset, `imagePreviewDataUrls` is authoritative — do not re-inflate from API paths the user removed (server list is append-only). */
  const hasExplicitSavedImageList =
    persisted != null && Array.isArray(persisted.imagePreviewDataUrls)
  const fromApiSegments =
    isPrimary &&
    useDealWideApiCountForPrimary &&
    !hasExplicitSavedImageList &&
    detail.assetImagePath?.trim()
      ? String(detail.assetImagePath)
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean).length
      : 0
  const merged = Math.max(row.imageCount ?? 0, fromPreviews, fromApiSegments)
  if (merged === row.imageCount) return row
  return { ...row, imageCount: merged }
}

export function computeDealAssetRowsFromClientStorage(detail: {
  id: string
  propertyName: string
  city: string
  country: string
  assetImagePath: string | null
}): DealAssetRow[] {
  consumeLegacyPendingAsset(detail.id)
  const primaryId = primaryDealAssetRowId(detail.id)
  const map = readDealAssetsFullMap(detail.id)
  /** `assetImagePath` on the deal is one shared list for every asset’s uploads. */
  const dealWidePathsCountAsPrimaryOnly = !Object.keys(map).some(
    (id) => id !== primaryId,
  )
  const primaryPersisted = map[primaryId]
  const primaryRow = reconcileAssetRowImageCount(
    primaryPersisted?.row ??
      buildPrimaryDealAssetRowFromDetail(detail, dealWidePathsCountAsPrimaryOnly),
    primaryPersisted,
    detail,
    dealWidePathsCountAsPrimaryOnly,
  )
  const extraRows = Object.keys(map)
    .filter((k) => k !== primaryId)
    .sort()
    .map((k) =>
      reconcileAssetRowImageCount(map[k]!.row, map[k], detail, false),
    )
  return [primaryRow, ...extraRows]
}

export function formatAddressFromAssetDraft(d: AssetStepDraft): string {
  const street = [d.streetAddress1, d.streetAddress2]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ")
  const stateLine =
    d.country === "US" ? getUsStateDisplayName(d.state) : d.state.trim()
  const locality = [d.city, stateLine, d.zipCode]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ")
  const c = COUNTRY_OPTIONS.find((o) => o.value === d.country)
  const country = c?.label ?? d.country.trim()
  const parts = [street, locality, country].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}

/** Row in the Assets offering-details table */
export interface DealAssetRow {
  id: string
  name: string
  address: string
  assetType: string
  imageCount: number
  archived?: boolean
  /** Label / display value pairs from “Additional information” (for View) */
  additionalInfo?: { label: string; value: string }[]
}

export type AssetAttributeKind =
  | "asset_type_search"
  | "text"
  | "number_units"
  | "money"
  | "date_na"
  | "year_na"

export interface AssetAttributeRow {
  id: string
  label: string
  kind: AssetAttributeKind
  value: string
  /** Right dropdown for number_of_units-style fields */
  unitSuffix?: string
  /** Date / year fields: value hidden when true */
  na?: boolean
  /** Preset row: label is fixed */
  preset?: boolean
}

/** Datalist options for Asset type (Additional Information on Add asset) */
export const ASSET_TYPE_SUGGESTIONS = [
  "Angel investment",
  "ATM",
  "Build to rent",
  "Car wash",
  "Crypto",
  "Flex",
  "Franchise",
  "Ground up development",
  "Healthcare",
  "Hedge fund",
  "Hospitality",
  "Industrial",
  "Land",
  "Logistics",
  "Mixed use",
  "Mobile home park",
  "Multifamily",
  "Office",
  "Oil and gas",
  "Private credit",
  "Private equity",
  "Retail",
  "Research and development",
  "RV park",
  "Self-storage",
  "Senior living",
  "Single family",
  "Start-up",
  "Stocks",
  "Student housing",
  "Trucking",
  "Vacation rental",
  "Other",
] as const

/** Right-hand dropdown for “Number of units” (Additional Information on Add asset) */
export const NUMBER_UNIT_SUFFIXES = [
  "Square feet",
  "Units",
  "Rooms",
  "Beds",
  "Parking spaces",
  "Pads",
  "Acres",
  "Wells",
  "Properties",
  "Contracts",
  "Lots",
] as const

export function createDefaultAssetAttributeRows(): AssetAttributeRow[] {
  return [
    {
      id: "attr-asset-type",
      label: "Asset type",
      kind: "asset_type_search",
      value: "",
      preset: true,
    },
    {
      id: "attr-property-class",
      label: "Property class",
      kind: "text",
      value: "",
      preset: true,
    },
    {
      id: "attr-num-units",
      label: "Number of units",
      kind: "number_units",
      value: "",
      unitSuffix: "Units",
      preset: true,
    },
    {
      id: "attr-nav",
      label: "Net asset value",
      kind: "money",
      value: "",
      preset: true,
    },
    {
      id: "attr-acq-price",
      label: "Acquisition price",
      kind: "money",
      value: "",
      preset: true,
    },
    {
      id: "attr-acq-date",
      label: "Acquisition date",
      kind: "date_na",
      value: "",
      na: false,
      preset: true,
    },
    {
      id: "attr-exit-price",
      label: "Exit price",
      kind: "money",
      value: "",
      preset: true,
    },
    {
      id: "attr-exit-date",
      label: "Exit date",
      kind: "date_na",
      value: "",
      na: false,
      preset: true,
    },
    {
      id: "attr-year-built",
      label: "Year built",
      kind: "year_na",
      value: "",
      na: false,
      preset: true,
    },
    {
      id: "attr-year-reno",
      label: "Year renovated",
      kind: "year_na",
      value: "",
      na: false,
      preset: true,
    },
  ]
}

export function normalizeAssetAttributeMoneyRows(
  rows: AssetAttributeRow[],
): AssetAttributeRow[] {
  return rows.map((r) =>
    r.kind === "money" && r.value.trim()
      ? { ...r, value: moneyAmountOnBlurTwoDecimals(r.value) }
      : r,
  )
}

export function formatAttributeValue(r: AssetAttributeRow): string {
  if (r.na) return "N/A"
  const v = r.value.trim()
  if (!v) return ""
  if (r.kind === "money") {
    const formatted = blurFormatMoneyInputTwoDecimals(v)
    return formatted || v
  }
  if (r.kind === "number_units" && r.unitSuffix) return `${v} ${r.unitSuffix}`
  return v
}

/** Ordered list for asset View modal; skips empty values (LPs hide empty). */
export function serializeAdditionalInfo(rows: AssetAttributeRow[]): {
  label: string
  value: string
}[] {
  return rows
    .filter((r) => r.id !== "attr-asset-type")
    .map((r) => ({
      label: r.label.trim() || "Attribute",
      value: formatAttributeValue(r),
    }))
    .filter((x) => x.value !== "")
}

export function assetTypeFromAttributes(rows: AssetAttributeRow[]): string {
  const row = rows.find((r) => r.id === "attr-asset-type")
  const t = row?.value?.trim()
  return t || "—"
}
