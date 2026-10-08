import {
  assetImagePathToUrl,
  assetImagePathsToUrls,
  getUploadsPublicOrigin,
  normalizeDealGallerySrc,
} from "../../../../common/utils/apiBaseUrl"
import {
  cloudinaryDeliveryUrlDedupeKey,
  isCloudinaryDeliveryUrl,
  resolveCloudinaryImageSrc,
} from "../../../../common/utils/cloudinaryImage"
import type { DealDetailApi } from "../api/dealsApi"
import {
  computeDealAssetRowsFromClientStorage,
  readDealAssetsFullMap,
} from "../types/deal-asset.types"

/**
 * Asset map keys whose `imagePreviewDataUrls` may appear in the offering gallery.
 * Uses non-archived rows from client storage. When `offeringOverviewAssetIds`
 * matches those row ids, only those assets contribute (deselected extras drop out).
 * When ids are missing or none match (e.g. API vs client id mismatch), all
 * non-archived rows are allowed so previews and uploads keep working.
 * When there are no non-archived rows, returns an empty set — callers treat an
 * empty set as “no allow-list” and include all map entries so previews still load.
 */
/** True once any asset entry was saved with an `imagePreviewDataUrls` array (even `[]`). */
function mapHasExplicitImagePreviewLists(dealId: string): boolean {
  try {
    for (const e of Object.values(readDealAssetsFullMap(dealId))) {
      if (Array.isArray(e.imagePreviewDataUrls)) return true
    }
  } catch {
    return false
  }
  return false
}

function persistedAssetIdsForLocalGalleryPreviews(
  detail: DealDetailApi,
): Set<string> {
  const rows = computeDealAssetRowsFromClientStorage(detail).filter(
    (r) => !r.archived,
  )
  if (rows.length === 0) return new Set()

  const picked = detail.offeringOverviewAssetIds?.filter(Boolean) ?? []
  if (picked.length === 0) {
    return new Set(rows.map((r) => r.id))
  }

  const pickSet = new Set(picked)
  const matched = rows.filter((r) => pickSet.has(r.id)).map((r) => r.id)
  if (matched.length > 0) {
    return new Set(matched)
  }
  return new Set(rows.map((r) => r.id))
}

/**
 * Canonical key for `/uploads/...` gallery sources so API paths and the same
 * URLs repeated in local asset previews dedupe (encoding / origin differences).
 */
function canonicalGalleryUploadKey(raw: string): string | null {
  let s = normalizeDealGallerySrc(raw).trim()
  if (!s) return null
  if (s.startsWith("data:")) return s

  const cloudKey = cloudinaryDeliveryUrlDedupeKey(s)
  if (cloudKey) return `cloudinary:${cloudKey}`

  if (/^uploads\//i.test(s) && !s.startsWith("/")) {
    s = `/${s.replace(/^\/+/, "")}`
  }

  let pathname = ""
  let search = ""
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s)
      if (u.protocol !== "http:" && u.protocol !== "https:") return null
      pathname = u.pathname
      search = u.search
    } else if (s.startsWith("/")) {
      const u = new URL(s, "http://placeholder.local")
      pathname = u.pathname
      search = u.search
    } else {
      return null
    }
  } catch {
    return null
  }

  const lower = pathname.toLowerCase()
  const uploadsIdx = lower.indexOf("/uploads/")
  if (uploadsIdx < 0) return null
  let tail = pathname.slice(uploadsIdx + "/uploads/".length).replace(/\/+$/, "")
  try {
    tail = decodeURIComponent(tail)
  } catch {
    /* keep raw tail */
  }
  tail = tail.replace(/\/+/g, "/")
  return `/uploads/${tail}${search}`
}

/**
 * True when two gallery `src` values point at the same asset (strict match, or
 * same pathname/search across origins e.g. localhost vs 127.0.0.1, or absolute vs `/uploads/...`).
 */
export function galleryUrlsReferToSameAsset(a: string, b: string): boolean {
  const x = a.trim()
  const y = b.trim()
  if (x === y) return true
  if (!x || !y) return false

  const fromAbsolute = (s: string): string | null => {
    try {
      const u = new URL(s)
      if (u.protocol !== "http:" && u.protocol !== "https:") return null
      const p = decodeURIComponent(u.pathname.replace(/\/$/, ""))
      return p + u.search
    } catch {
      return null
    }
  }

  const fromRootRelative = (s: string): string | null => {
    const t = s.trim()
    if (!t.startsWith("/")) return null
    try {
      const u = new URL(t, "http://placeholder.local")
      const p = decodeURIComponent(u.pathname.replace(/\/$/, ""))
      return p + u.search
    } catch {
      return null
    }
  }

  const key = (s: string) => {
    const cloud = cloudinaryDeliveryUrlDedupeKey(s)
    if (cloud) return `cloudinary:${cloud}`
    return /^https?:\/\//i.test(s) ? fromAbsolute(s) : fromRootRelative(s)
  }

  const kx = key(x)
  const ky = key(y)
  if (kx != null && ky != null && kx === ky) return true

  const cx = canonicalGalleryUploadKey(x)
  const cy = canonicalGalleryUploadKey(y)
  return cx != null && cy != null && cx === cy
}

function pushUniqueGalleryUrl(out: string[], raw: string): void {
  const s = resolveCloudinaryImageSrc(raw, normalizeDealGallerySrc).trim()
  if (!s) return
  if (out.some((e) => galleryUrlsReferToSameAsset(e, s))) return
  out.push(s)
}

/** Ordered unique stored path segments (Cloudinary URL or upload-relative path). */
export function dedupeStoredImagePathSegments(
  paths: readonly string[],
): string[] {
  const out: string[] = []
  for (const raw of paths) {
    const t = raw.trim()
    if (!t) continue
    const url = assetImagePathsToUrls(t)[0] ?? t
    if (
      out.some((p) =>
        galleryUrlsReferToSameAsset(assetImagePathsToUrls(p)[0] ?? p, url),
      )
    ) {
      continue
    }
    out.push(t)
  }
  return out
}

/** Stable-order unique URLs (API + local lists often repeat the same upload). */
export function dedupeGalleryUrlsPreserveOrder(urls: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of urls) {
    const u = resolveCloudinaryImageSrc(
      typeof raw === "string" ? raw : String(raw ?? ""),
      normalizeDealGallerySrc,
    ).trim()
    if (!u) continue
    if (!out.some((e) => galleryUrlsReferToSameAsset(e, u))) out.push(u)
  }
  return out
}

/** One persisted gallery path segment → browser-ready `src`. */
function galleryPathSegmentToUrl(seg: string): string {
  const t = seg.trim()
  if (!t) return ""
  if (
    t.startsWith("data:image/") ||
    isCloudinaryDeliveryUrl(t) ||
    /^https?:\/\//i.test(t) ||
    t.startsWith("/uploads/")
  ) {
    return resolveCloudinaryImageSrc(t, normalizeDealGallerySrc)
  }
  return assetImagePathToUrl(t)
}

/** Ordered unique URLs from persisted gallery path segments. */
function galleryPathSegmentsToUrls(segments: readonly string[]): string[] {
  return dedupeGalleryUrlsPreserveOrder(
    segments.map(galleryPathSegmentToUrl).filter(Boolean),
  )
}

/** Ordered unique upload-relative segments: persisted gallery first, then `assetImagePath`. */
function mergeOfferingGalleryPathSegments(
  persisted: string[] | undefined,
  assetImagePath: string | null | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const t = raw.trim().replace(/^\/+/, "")
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  for (const p of persisted ?? []) add(p)
  if (assetImagePath) {
    for (const s of String(assetImagePath).split(";")) add(s)
  }
  return out
}

/**
 * From displayed gallery URLs, extract values to persist on the API:
 * upload-relative paths for `/uploads/...`, or full Cloudinary delivery URLs.
 * Skips `data:` URLs and other non-persistable absolute links.
 */
export function uploadRelativePathsFromGalleryUrls(urls: string[]): string[] {
  const origin = getUploadsPublicOrigin().replace(/\/$/, "")
  const uploadPrefix = "/uploads/"
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    const s = raw.trim()
    if (!s || s.startsWith("data:")) continue
    if (isCloudinaryDeliveryUrl(s)) {
      const dedupeKey = cloudinaryDeliveryUrlDedupeKey(s) ?? s
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      out.push(s)
      continue
    }
    let rel: string | null = null
    if (s.startsWith(uploadPrefix)) {
      rel = s.slice(uploadPrefix.length).replace(/^\/+/, "")
    } else if (origin) {
      const prefix = `${origin}${uploadPrefix}`
      if (s.startsWith(prefix)) {
        try {
          rel = decodeURIComponent(s.slice(prefix.length).replace(/^\/+/, ""))
        } catch {
          rel = s.slice(prefix.length).replace(/^\/+/, "")
        }
      }
    }
    if (!rel) {
      try {
        const u = new URL(s)
        const idx = u.pathname.indexOf("/uploads/")
        if (idx >= 0) {
          const slice = u.pathname
            .slice(idx + uploadPrefix.length)
            .replace(/^\/+/, "")
          try {
            rel = decodeURIComponent(slice)
          } catch {
            rel = slice
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!rel || rel.includes("..")) continue
    if (!/^[\w./-]+$/.test(rel)) continue
    if (seen.has(rel)) continue
    seen.add(rel)
    out.push(rel)
  }
  return out
}

/** Upload-relative paths for all non-archived assets in local storage (authoritative image lists). */
export function collectGalleryPathsFromDealAssetsMap(dealId: string): string[] {
  const urls: string[] = []
  try {
    for (const entry of Object.values(readDealAssetsFullMap(dealId))) {
      if (entry.row.archived) continue
      if (!Array.isArray(entry.imagePreviewDataUrls)) continue
      for (const u of entry.imagePreviewDataUrls) {
        if (typeof u === "string" && u.trim()) urls.push(u)
      }
    }
  } catch {
    /* ignore */
  }
  return dedupeStoredImagePathSegments(uploadRelativePathsFromGalleryUrls(urls))
}

/** Upload-relative paths referenced anywhere in persisted deal asset maps (localStorage). */
export function collectUploadRelativePathsFromDealAssetsMap(
  detail: DealDetailApi,
): string[] {
  const urls: string[] = []
  try {
    const map = readDealAssetsFullMap(detail.id)
    const allowedIds = persistedAssetIdsForLocalGalleryPreviews(detail)
    const useAllowList = allowedIds.size > 0
    for (const [assetId, e] of Object.entries(map)) {
      if (
        useAllowList &&
        !allowedIds.has(assetId) &&
        !allowedIds.has(e.id)
      ) {
        continue
      }
      for (const u of e.imagePreviewDataUrls ?? []) {
        if (typeof u === "string" && u.trim()) urls.push(u)
      }
    }
  } catch {
    /* ignore */
  }
  return uploadRelativePathsFromGalleryUrls(urls)
}

/**
 * Ordered unique path segments to persist from the **current** gallery view (`urlsFromCollect`)
 * plus upload paths referenced in the local asset map.
 *
 * We intentionally do **not** merge every segment from `detail.assetImagePath` here: that list
 * is append-only on the server and would re-insert images the user removed from assets, so the
 * PATCH could never shrink `offering_gallery_paths`.
 */
export function mergePathSegmentsForOfferingGalleryPersist(
  detail: DealDetailApi,
  urlsFromCollect: string[],
): string[] {
  const fromUrls = uploadRelativePathsFromGalleryUrls(urlsFromCollect)
  const fromMap = collectUploadRelativePathsFromDealAssetsMap(detail)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of [...fromUrls, ...fromMap]) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

/** Options for {@link collectDealGalleryUrls}. */
export type CollectDealGalleryUrlsOptions = {
  /**
   * When true, only use server-persisted paths (`offeringGalleryPaths`, `assetImagePath`)
   * and cover URL — no browser `localStorage` asset maps. Matches anonymous
   * `/public/offering-preview` / shared link consumers.
   */
  persistedOnly?: boolean
  /** Public offering preview `?preview=` token for protected `/uploads/` access. */
  previewToken?: string | null
}

/**
 * URLs for offering gallery / preview: persisted `offeringGalleryPaths`, API `assetImagePath`,
 * saved `galleryCoverImageUrl` (https, data URL, or `/uploads/...`),
 * plus any `imagePreviewDataUrls` persisted in local asset maps for this deal (unless `persistedOnly`).
 */
export function collectDealGalleryUrls(
  detail: DealDetailApi,
  options?: CollectDealGalleryUrlsOptions,
): string[] {
  const persistedOnly = Boolean(options?.persistedOnly)
  const merged = mergeOfferingGalleryPathSegments(
    detail.offeringGalleryPaths,
    detail.assetImagePath,
  )
  let fromApi = galleryPathSegmentsToUrls(merged)
  if (!persistedOnly) {
    /** Sponsor browser: once assets store image lists, uploads in the gallery must match them. */
    let hasLocalAssetMap = false
    try {
      hasLocalAssetMap =
        Object.keys(readDealAssetsFullMap(detail.id)).length > 0
    } catch {
      hasLocalAssetMap = false
    }
    if (hasLocalAssetMap) {
      const allowedRels = collectUploadRelativePathsFromDealAssetsMap(detail)
      const allowed = new Set(allowedRels)
      const explicitLists = mapHasExplicitImagePreviewLists(detail.id)
      if (allowed.size > 0) {
        const filtered = fromApi.filter((url) => {
          const rels = uploadRelativePathsFromGalleryUrls([url])
          return rels.some((p) => allowed.has(p))
        })
        /** Stale local asset ids must not hide server-persisted gallery paths. */
        if (filtered.length > 0 || fromApi.length === 0) {
          fromApi = filtered
        }
      } else if (explicitLists) {
        /** All upload refs removed from assets; do not keep orphan server paths. */
        fromApi = []
      }
    }
  }
  const fromAssets: string[] = []
  if (!persistedOnly) {
    try {
      const map = readDealAssetsFullMap(detail.id)
      const allowedIds = persistedAssetIdsForLocalGalleryPreviews(detail)
      const useAllowList = allowedIds.size > 0
      for (const [assetId, entry] of Object.entries(map)) {
        if (
          useAllowList &&
          !allowedIds.has(assetId) &&
          !allowedIds.has(entry.id)
        ) {
          continue
        }
        const previews = entry.imagePreviewDataUrls
        if (previews?.length) fromAssets.push(...previews)
      }
    } catch {
      /* ignore */
    }
  }
  const out: string[] = []
  for (const u of fromApi) pushUniqueGalleryUrl(out, u)
  for (const u of fromAssets) pushUniqueGalleryUrl(out, u)
  const cover = detail.galleryCoverImageUrl?.trim() ?? ""
  if (cover) pushUniqueGalleryUrl(out, cover)
  return out
}

/** Puts the saved cover URL first so the offering hero matches the dashboard card. */
export function orderedGalleryUrlsForOffering(
  detail: DealDetailApi,
  options?: CollectDealGalleryUrlsOptions,
): string[] {
  const all = collectDealGalleryUrls(detail, options)
  const uploadAccess = options?.previewToken
    ? { previewToken: options.previewToken }
    : undefined
  const withAccess = (urls: string[]) =>
    uploadAccess ? urls.map((u) => normalizeDealGallerySrc(u, uploadAccess)) : urls
  const pickRaw = detail.galleryCoverImageUrl?.trim()
  const pick = pickRaw
    ? resolveCloudinaryImageSrc(pickRaw, (raw) =>
        normalizeDealGallerySrc(raw, uploadAccess),
      ).trim()
    : ""
  if (!pick) return withAccess(all)
  if (all.length === 0) return [pick]
  const idx = all.findIndex((u) => galleryUrlsReferToSameAsset(u, pick))
  if (idx < 0) {
    const rest = all.filter((u) => !galleryUrlsReferToSameAsset(u, pick))
    return withAccess([pick, ...rest])
  }
  if (idx === 0) return withAccess(all)
  const next = [...all]
  const [c] = next.splice(idx, 1)
  return withAccess([c, ...next])
}
