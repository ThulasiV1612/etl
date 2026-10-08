import { Loader2, RotateCcw, Star, X } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  patchDealGalleryCover,
  patchDealOfferingGallery,
  type DealDetailApi,
} from "../../api/dealsApi"
import {
  collectDealGalleryUrls,
  galleryUrlsReferToSameAsset,
  mergePathSegmentsForOfferingGalleryPersist,
} from "../../utils/offeringGalleryUrls"
import { DealOfferingGalleryImage } from "../../components/DealOfferingGalleryImage"
import { toast } from "../../../../../common/components/Toast"
import "../deal_members/add-investment/add_deal_modal.css"

type OfferingGallerySectionProps = {
  detail: DealDetailApi
  onDealUpdated?: (deal: DealDetailApi) => void
  /** Cover image changes — parent may scroll back to this accordion section. */
  onUserSaved?: (deal: DealDetailApi) => void
}

export function OfferingGallerySection({
  detail,
  onDealUpdated,
  onUserSaved,
}: OfferingGallerySectionProps) {
  const viewModalTitleId = useId()
  const saveLockRef = useRef(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [savingUrl, setSavingUrl] = useState<string | null>(null)
  const urls = collectDealGalleryUrls(detail)
  const coverUrl = detail.galleryCoverImageUrl?.trim() ?? ""
  const urlsKey = urls.join("\u0001")

  useEffect(() => {
    const nextUrls = collectDealGalleryUrls(detail)
    const derived = mergePathSegmentsForOfferingGalleryPersist(detail, nextUrls)
    const stored = detail.offeringGalleryPaths ?? []
    if (
      derived.length === stored.length &&
      derived.every((p, i) => p === stored[i])
    )
      return
    let cancelled = false
    void patchDealOfferingGallery(detail.id, derived).then((res) => {
      if (cancelled || !res.ok) return
      onDealUpdated?.(res.deal)
    })
    return () => {
      cancelled = true
    }
  }, [
    detail.id,
    detail.assetImagePath,
    detail.galleryCoverImageUrl,
    JSON.stringify(detail.offeringGalleryPaths ?? []),
    urlsKey,
    onDealUpdated,
  ])

  useEffect(() => {
    if (!lightboxSrc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxSrc(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxSrc])

  const setCover = useCallback(
    async (src: string): Promise<boolean> => {
      if (saveLockRef.current) return false
      saveLockRef.current = true
      setSavingUrl(src)
      try {
        const result = await patchDealGalleryCover(detail.id, src)
        if (!result.ok) {
          toast.error(result.message)
          return false
        }
        onUserSaved?.(result.deal) ?? onDealUpdated?.(result.deal)
        toast.success("Cover image updated.")
        return true
      } finally {
        saveLockRef.current = false
        setSavingUrl(null)
      }
    },
    [detail.id, onDealUpdated, onUserSaved],
  )

  const clearCover = useCallback(async () => {
    if (saveLockRef.current) return
    saveLockRef.current = true
    setSavingUrl("__clear__")
    try {
      const result = await patchDealGalleryCover(detail.id, null)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onUserSaved?.(result.deal) ?? onDealUpdated?.(result.deal)
      toast.success("Cover image cleared.")
    } finally {
      saveLockRef.current = false
      setSavingUrl(null)
    }
  }, [detail.id, onDealUpdated, onUserSaved])

  if (urls.length === 0)
    return (
      <p className="deal_offering_muted">
        No gallery images uploaded for this offering yet.
      </p>
    )

  return (
    <>
      <p className="deal_offering_gallery_cover_hint">
        Choose a <strong>cover image</strong> for the deal card on the
        dashboard and the hero on the offering preview. Click a photo to view
        it larger.
      </p>
      {coverUrl ? (
        <div className="deal_offering_gallery_cover_actions">
          <button
            type="button"
            className="deal_offering_gallery_clear_cover"
            disabled={Boolean(savingUrl)}
            onClick={() => void clearCover()}
          >
            {savingUrl === "__clear__" ? (
              <Loader2
                size={15}
                strokeWidth={2}
                className="deal_offering_gallery_clear_cover_spin"
                aria-hidden
              />
            ) : (
              <RotateCcw size={15} strokeWidth={2} aria-hidden />
            )}
            Reset to default order
          </button>
        </div>
      ) : null}
      <div
        className="deal_offering_gallery deal_offering_gallery_grid"
        role="list"
        aria-label="Offering gallery images"
      >
        {urls.map((src, i) => {
          const isCover = Boolean(
            coverUrl && galleryUrlsReferToSameAsset(src, coverUrl),
          )
          const busy = savingUrl === src || savingUrl === "__clear__"
          return (
            <div
              key={`gallery-${i}-${src.slice(0, 48)}`}
              className={`deal_offering_gallery_cell${isCover ? " deal_offering_gallery_cell_cover" : ""}`}
              role="listitem"
            >
              {isCover ? (
                <span className="deal_offering_gallery_cover_badge">
                  <Star size={12} strokeWidth={2.5} aria-hidden />
                  Cover
                </span>
              ) : null}
              <button
                type="button"
                className="deal_offering_gallery_thumb_btn"
                onClick={() => setLightboxSrc(src)}
                aria-label={`View gallery image ${i + 1} of ${urls.length} at full size`}
              >
                <DealOfferingGalleryImage
                  src={src}
                  alt=""
                  className="deal_offering_gallery_img"
                  loading={isCover ? "eager" : "lazy"}
                  decoding="async"
                />
              </button>
              <div className="deal_offering_gallery_cell_footer">
                <button
                  type="button"
                  className="deal_offering_gallery_set_cover_btn"
                  disabled={Boolean(savingUrl) || isCover}
                  onClick={(e) => {
                    e.stopPropagation()
                    void setCover(src)
                  }}
                >
                  {busy && savingUrl === src ? (
                    <Loader2
                      size={14}
                      strokeWidth={2}
                      className="deal_offering_gallery_set_cover_spin"
                      aria-hidden
                    />
                  ) : (
                    <Star size={14} strokeWidth={2} aria-hidden />
                  )}
                  {isCover ? "Current cover" : "Set as cover"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {lightboxSrc
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
              role="presentation"
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_offering_gallery_lightbox_panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={viewModalTitleId}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <h3
                    id={viewModalTitleId}
                    className="um_modal_title add_contact_modal_title"
                  >
                    Gallery image
                  </h3>
                  <button
                    type="button"
                    className="um_modal_close"
                    onClick={() => setLightboxSrc(null)}
                    aria-label="Close"
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="deals_add_inv_modal_scroll deal_offering_gallery_lightbox_scroll">
                  <DealOfferingGalleryImage
                    src={lightboxSrc}
                    alt=""
                    className="deal_offering_gallery_lightbox_img"
                    loading="eager"
                    fetchPriority="high"
                  />
                </div>
                <div className="um_modal_actions deal_offering_gallery_lightbox_actions">
                  <button
                    type="button"
                    className="um_btn_secondary deal_offering_gallery_lightbox_btn"
                    disabled={Boolean(savingUrl)}
                    onClick={() => {
                      void (async () => {
                        const ok = await setCover(lightboxSrc)
                        if (ok) setLightboxSrc(null)
                      })()
                    }}
                  >
                    {savingUrl === lightboxSrc ? (
                      <Loader2
                        size={16}
                        strokeWidth={2}
                        className="deal_offering_gallery_set_cover_spin"
                        aria-hidden
                      />
                    ) : (
                      <Star size={16} strokeWidth={2} aria-hidden />
                    )}
                    Set as cover
                  </button>
                  <button
                    type="button"
                    className="um_btn_primary deal_offering_gallery_lightbox_btn"
                    onClick={() => setLightboxSrc(null)}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
