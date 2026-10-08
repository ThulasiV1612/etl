import { Cloudinary } from "@cloudinary/url-gen"

/** Public cloud name; override with VITE_CLOUDINARY_CLOUD_NAME in your env. */
const DEFAULT_CLOUDINARY_NAME = "dzlkuqizv"

let cldSingleton: Cloudinary | null = null

export function getCloudinaryInstance(): Cloudinary {
  if (!cldSingleton) {
    const cloudName = (
      import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? DEFAULT_CLOUDINARY_NAME
    ).toString()
    cldSingleton = new Cloudinary({
      cloud: { cloudName: cloudName.trim() || DEFAULT_CLOUDINARY_NAME },
    })
  }
  return cldSingleton
}

export function isCloudinaryDeliveryUrl(raw: string | null | undefined): boolean {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim()
  if (!/^https?:\/\//i.test(s)) return false
  try {
    const u = new URL(s)
    return /(^|\.)res\.cloudinary\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

/** Cloudinary delivery URLs should always be loaded over HTTPS (mixed-content safe in Chrome). */
export function normalizeCloudinaryDeliveryUrl(
  raw: string | null | undefined,
): string {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim()
  if (!s || !isCloudinaryDeliveryUrl(s)) return s
  if (s.startsWith("http://")) {
    return `https://${s.slice("http://".length)}`
  }
  return s
}

/** `referrerPolicy="no-referrer"` for third-party delivery hosts (matches org branding assets). */
export function cloudinaryImgReferrerPolicy(
  src: string | null | undefined,
): "no-referrer" | undefined {
  const s = typeof src === "string" ? src.trim() : String(src ?? "").trim()
  if (!s || s.startsWith("blob:") || s.startsWith("data:")) return undefined
  if (typeof window === "undefined") {
    return isCloudinaryDeliveryUrl(s) ? "no-referrer" : undefined
  }
  if (!/^https?:\/\//i.test(s)) return undefined
  try {
    return new URL(s).origin !== window.location.origin ? "no-referrer" : undefined
  } catch {
    return "no-referrer"
  }
}

/** Stable key for deduping Cloudinary delivery URLs (ignores version segment). */
export function cloudinaryDeliveryUrlDedupeKey(
  raw: string | null | undefined,
): string | null {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim()
  if (!isCloudinaryDeliveryUrl(s)) return null
  try {
    const u = new URL(s)
    const parts = u.pathname.split("/").filter(Boolean)
    const uploadIdx = parts.findIndex((p) => p === "upload")
    if (uploadIdx >= 0 && uploadIdx + 1 < parts.length) {
      let i = uploadIdx + 1
      if (/^v\d+$/i.test(parts[i] ?? "")) i += 1
      const tail = parts.slice(i).join("/")
      return `${u.hostname.toLowerCase()}/${tail}${u.search}`
    }
    return `${u.hostname.toLowerCase()}${u.pathname}${u.search}`
  } catch {
    return s.toLowerCase()
  }
}

function looksLikeCloudinaryPublicId(raw: string): boolean {
  const s = raw.trim()
  if (!s || s.includes("://")) return false
  return /^investor_portal\//i.test(s)
}

/**
 * Resolve a stored image reference to a browser-ready `src`:
 * Cloudinary `https` URL, Cloudinary public id via url-gen, or caller-normalized uploads path.
 */
export function resolveCloudinaryImageSrc(
  raw: string | null | undefined,
  normalizeFallback?: (value: string) => string,
): string {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim()
  if (!s) return ""
  if (s.startsWith("data:image/") || s.startsWith("blob:")) return s
  if (isCloudinaryDeliveryUrl(s)) return normalizeCloudinaryDeliveryUrl(s)
  if (looksLikeCloudinaryPublicId(s)) {
    return getCloudinaryInstance().image(s).toURL()
  }
  if (/^https?:\/\//i.test(s)) return normalizeCloudinaryDeliveryUrl(s)
  return normalizeFallback ? normalizeFallback(s) : s
}
