import { getApiV1Base } from "../../../../common/utils/apiBaseUrl"
import { portalAuthHeaders } from "../../../../common/auth/portalAuthHeaders"
import type { DealAssetPersisted } from "../types/deal-asset.types"

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

function toPersisted(raw: unknown): DealAssetPersisted | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" ? o.id.trim() : ""
  if (!id) return null
  const row =
    o.row != null && typeof o.row === "object" && !Array.isArray(o.row)
      ? (o.row as DealAssetPersisted["row"])
      : null
  const draft =
    o.draft != null && typeof o.draft === "object" && !Array.isArray(o.draft)
      ? (o.draft as DealAssetPersisted["draft"])
      : null
  const attrRows = Array.isArray(o.attrRows)
    ? (o.attrRows as DealAssetPersisted["attrRows"])
    : []
  if (!row || !draft) return null
  const imagePreviewDataUrls = Array.isArray(o.imagePreviewDataUrls)
    ? o.imagePreviewDataUrls.filter((u): u is string => typeof u === "string")
    : undefined
  return {
    id,
    row: { ...row, id: row.id || id },
    draft,
    attrRows,
    ...(imagePreviewDataUrls ? { imagePreviewDataUrls } : {}),
  }
}

export async function fetchDealAssets(dealId: string): Promise<
  | { ok: true; assets: DealAssetPersisted[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/assets`,
      {
        headers: { ...authHeaders() },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      assets?: unknown[]
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message: data.message || `Could not load assets (${res.status})`,
      }
    }
    const assets = (Array.isArray(data.assets) ? data.assets : [])
      .map(toPersisted)
      .filter((a): a is DealAssetPersisted => a != null)
    return { ok: true, assets }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Network error while loading assets.",
    }
  }
}

export async function fetchDealAssetById(
  dealId: string,
  assetId: string,
): Promise<
  | { ok: true; asset: DealAssetPersisted }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/assets/${encodeURIComponent(assetId)}`,
      {
        headers: { ...authHeaders() },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      asset?: unknown
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message: data.message || `Could not load asset (${res.status})`,
      }
    }
    const asset = toPersisted(data.asset)
    if (!asset)
      return { ok: false, message: "Invalid asset response" }
    return { ok: true, asset }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Network error while loading asset.",
    }
  }
}

export async function putDealAsset(
  dealId: string,
  assetId: string,
  entry: DealAssetPersisted,
): Promise<
  | { ok: true; asset: DealAssetPersisted }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/assets/${encodeURIComponent(assetId)}`,
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          id: assetId,
          row: entry.row,
          draft: entry.draft,
          attrRows: entry.attrRows,
          imagePreviewDataUrls: entry.imagePreviewDataUrls ?? [],
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      asset?: unknown
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message: data.message || `Could not save asset (${res.status})`,
      }
    }
    const asset = toPersisted(data.asset) ?? { ...entry, id: assetId }
    return { ok: true, asset }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Network error while saving asset.",
    }
  }
}

export async function replaceDealAssets(
  dealId: string,
  assets: DealAssetPersisted[],
): Promise<
  | { ok: true; assets: DealAssetPersisted[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/assets`,
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          assets: assets.map((a) => ({
            id: a.id,
            row: a.row,
            draft: a.draft,
            attrRows: a.attrRows,
            imagePreviewDataUrls: a.imagePreviewDataUrls ?? [],
          })),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      assets?: unknown[]
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message: data.message || `Could not save assets (${res.status})`,
      }
    }
    const parsed = (Array.isArray(data.assets) ? data.assets : [])
      .map(toPersisted)
      .filter((a): a is DealAssetPersisted => a != null)
    return { ok: true, assets: parsed }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Network error while saving assets.",
    }
  }
}
