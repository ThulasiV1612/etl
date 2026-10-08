import { useCallback, useEffect, useMemo, useState } from "react"
import { normalizeDealGallerySrc } from "@/common/utils/apiBaseUrl"
import {
  cloudinaryImgReferrerPolicy,
  resolveCloudinaryImageSrc,
} from "@/common/utils/cloudinaryImage"

function fallbackDeliverySrc(src: string, attempt: number): string {
  const normalized = resolveCloudinaryImageSrc(src, normalizeDealGallerySrc).trim()
  if (!normalized) return ""
  if (attempt === 0) return normalized
  try {
    if (/^https?:\/\//i.test(normalized)) {
      const u = new URL(normalized)
      const lower = u.pathname.toLowerCase()
      const idx = lower.indexOf("/uploads/")
      if (idx >= 0) {
        const pathOnly = `${u.pathname.slice(idx)}${u.search || ""}`
        if (pathOnly !== normalized && pathOnly.startsWith("/uploads/")) {
          if (typeof window !== "undefined") {
            return `${window.location.origin.replace(/\/$/, "")}${pathOnly}`
          }
          return pathOnly
        }
      }
    }
  } catch {
    /* ignore */
  }
  return ""
}

export type CloudinaryDeliveryImageProps = {
  src: string
  alt?: string
  className?: string
  /**
   * Org branding uses eager + high priority so Chrome does not defer in-viewport images.
   * Gallery tiles may pass `lazy` for below-the-fold rows.
   */
  loading?: "eager" | "lazy"
  fetchPriority?: "high" | "low" | "auto"
  decoding?: "async" | "sync" | "auto"
  onError?: () => void
}

/**
 * Plain `<img>` for Cloudinary delivery URLs, public ids, or `/uploads/...` paths —
 * same delivery pattern as Settings → org branding assets (no `@cloudinary/react`).
 */
export function CloudinaryDeliveryImage({
  src,
  alt = "",
  className,
  loading = "eager",
  fetchPriority,
  decoding = "async",
  onError,
}: CloudinaryDeliveryImageProps) {
  const [attempt, setAttempt] = useState(0)
  const normalizedSrc = useMemo(
    () => resolveCloudinaryImageSrc(src, normalizeDealGallerySrc),
    [src],
  )
  const resolved =
    fallbackDeliverySrc(normalizedSrc, attempt) || normalizedSrc

  useEffect(() => {
    setAttempt(0)
  }, [src])

  const handleError = useCallback(() => {
    setAttempt((n) => (n < 1 ? n + 1 : n))
    onError?.()
  }, [onError])

  if (!resolved) return null

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding={decoding}
      referrerPolicy={cloudinaryImgReferrerPolicy(resolved)}
      onError={handleError}
    />
  )
}
