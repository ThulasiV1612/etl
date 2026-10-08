import { dealDisplayFieldText, type DealDetailApi } from "../api/dealsApi"
import {
  assetTypeFromAttributes,
  computeDealAssetRowsFromClientStorage,
  formatAddressFromAssetDraft,
  getDealAssetPersisted,
  primaryDealAssetRowId,
  serializeAdditionalInfo,
  type DealAssetRow,
} from "../types/deal-asset.types"

export type OfferingPreviewAssetBlock = {
  id: string
  name: string
  address: string
  assetType: string
  additionalInfo: { label: string; value: string }[]
}

/** True when a preview asset metric should render (not blank / em dash). */
export function isFilledPreviewAssetValue(value: string | undefined): boolean {
  const t = String(value ?? "").trim()
  return Boolean(t) && t !== "—"
}

function filledPreviewText(raw: string | undefined): string {
  const t = dealDisplayFieldText(raw)
  if (!t || t === "—") return ""
  return t
}

/** Full deal address for offering preview “Location” section. */
export function formatOfferingPreviewDealAddress(detail: DealDetailApi): string {
  const street = [detail.addressLine1, detail.addressLine2]
    .map((x) => dealDisplayFieldText(x))
    .filter(Boolean)
    .join(", ")
  const locality = [detail.city, detail.state, detail.zipCode]
    .map((x) => dealDisplayFieldText(x))
    .filter(Boolean)
    .join(", ")
  const country = dealDisplayFieldText(detail.country)
  const parts = [street, locality, country].filter(Boolean)
  if (parts.length) return parts.join(", ")
  const cityCountry = [dealDisplayFieldText(detail.city), country]
    .filter(Boolean)
    .join(", ")
  return cityCountry || "—"
}

function orderedPreviewAssetRows(detail: DealDetailApi): DealAssetRow[] {
  const rows = computeDealAssetRowsFromClientStorage(detail).filter(
    (r) => !r.archived,
  )
  const ids = detail.offeringOverviewAssetIds?.filter(Boolean) ?? []
  const ordered: DealAssetRow[] = []
  if (ids.length > 0) {
    for (const id of ids) {
      const row = rows.find((r) => r.id === id)
      if (row) ordered.push(row)
    }
  }
  if (ordered.length === 0 && rows.length > 0) ordered.push(rows[0]!)
  return ordered
}

function buildPreviewAssetBlock(
  detail: DealDetailApi,
  row: DealAssetRow,
): OfferingPreviewAssetBlock {
  const persisted = getDealAssetPersisted(detail.id, row.id)
  const attrs = persisted?.attrRows
  const address =
    persisted?.draft != null
      ? formatAddressFromAssetDraft(persisted.draft).trim() ||
        row.address?.trim() ||
        formatOfferingPreviewDealAddress(detail)
      : row.address?.trim() || formatOfferingPreviewDealAddress(detail)

  const assetTypeRaw =
    row.assetType && row.assetType !== "—"
      ? row.assetType.trim()
      : attrs
        ? assetTypeFromAttributes(attrs)
        : ""
  const assetType = filledPreviewText(assetTypeRaw)

  return {
    id: row.id,
    name:
      filledPreviewText(row.name) ||
      filledPreviewText(detail.propertyName) ||
      "Offering asset",
    address: filledPreviewText(address),
    assetType,
    additionalInfo: attrs?.length ? serializeAdditionalInfo(attrs) : [],
  }
}

/**
 * Data for the offering preview “Assets” block (browser localStorage + deal fields).
 * LPs on a shared link only see persisted offering gallery + deal fields unless they
 * have the same origin storage as the sponsor.
 */
export function buildOfferingPreviewAssetBlocks(
  detail: DealDetailApi,
): OfferingPreviewAssetBlock[] {
  const ordered = orderedPreviewAssetRows(detail)
  if (ordered.length === 0) {
    const primaryPersisted = getDealAssetPersisted(
      detail.id,
      primaryDealAssetRowId(detail.id),
    )
    const attrs = primaryPersisted?.attrRows
    const assetType = attrs?.length
      ? filledPreviewText(assetTypeFromAttributes(attrs))
      : ""
    return [
      {
        id: `fallback-${detail.id}`,
        name: filledPreviewText(detail.propertyName) || "Offering asset",
        address: filledPreviewText(formatOfferingPreviewDealAddress(detail)),
        assetType,
        additionalInfo: attrs?.length ? serializeAdditionalInfo(attrs) : [],
      },
    ]
  }

  return ordered.map((row) => buildPreviewAssetBlock(detail, row))
}
