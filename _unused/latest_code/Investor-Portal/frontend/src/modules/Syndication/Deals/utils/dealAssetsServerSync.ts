/**
 * Sync Offering Assets between API (`deal_asset`) and browser localStorage cache.
 */

import {
  fetchDealAssets,
  putDealAsset,
  replaceDealAssets,
} from "../api/dealAssetsApi"
import {
  getDealAssetPersisted,
  readDealAssetsFullMap,
  upsertDealAssetPersisted,
  writeDealAssetsFullMap,
  type DealAssetPersisted,
  type DealAssetRow,
} from "../types/deal-asset.types"

function mapFromList(assets: DealAssetPersisted[]): Record<string, DealAssetPersisted> {
  const map: Record<string, DealAssetPersisted> = {}
  for (const a of assets) map[a.id] = a
  return map
}

/** Load assets from DB into localStorage (migrates local → DB when DB is empty). */
export async function syncDealAssetsFromServer(dealId: string): Promise<{
  ok: boolean
  assets: DealAssetPersisted[]
  message?: string
}> {
  const id = dealId.trim()
  if (!id) return { ok: false, assets: [], message: "Missing deal id" }

  const remote = await fetchDealAssets(id)
  if (!remote.ok) {
    const local = Object.values(readDealAssetsFullMap(id))
    return { ok: false, assets: local, message: remote.message }
  }

  if (remote.assets.length > 0) {
    writeDealAssetsFullMap(id, mapFromList(remote.assets))
    return { ok: true, assets: remote.assets }
  }

  const localList = Object.values(readDealAssetsFullMap(id))
  if (localList.length === 0) return { ok: true, assets: [] }

  const migrated = await replaceDealAssets(id, localList)
  if (!migrated.ok) {
    return { ok: false, assets: localList, message: migrated.message }
  }
  writeDealAssetsFullMap(id, mapFromList(migrated.assets))
  return { ok: true, assets: migrated.assets }
}

/** Persist one asset to DB and keep localStorage in sync. */
export async function saveDealAssetToServer(
  dealId: string,
  entry: DealAssetPersisted,
): Promise<{ ok: true } | { ok: false; message: string }> {
  upsertDealAssetPersisted(dealId, entry)
  const result = await putDealAsset(dealId, entry.id, entry)
  if (!result.ok) return { ok: false, message: result.message }
  upsertDealAssetPersisted(dealId, result.asset)
  return { ok: true }
}

/** Archive / activate — updates localStorage and DB. */
export async function persistDealAssetArchiveToServer(params: {
  dealId: string
  row: DealAssetRow
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { dealId, row } = params
  const existing = getDealAssetPersisted(dealId, row.id)
  const entry: DealAssetPersisted = existing
    ? {
        ...existing,
        row: { ...existing.row, archived: Boolean(row.archived) },
      }
    : {
        id: row.id,
        row: { ...row, archived: Boolean(row.archived) },
        draft: {
          propertyName: row.name,
          country: "US",
          streetAddress1: "",
          streetAddress2: "",
          city: "",
          state: "",
          zipCode: "",
        },
        attrRows: [],
      }
  return saveDealAssetToServer(dealId, entry)
}
