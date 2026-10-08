import {
  ChevronLeft,
  ChevronRight,
  Eye,
  ImagePlus,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { createPortal } from "react-dom"
import { CloudinaryDeliveryImage } from "@/common/components/CloudinaryDeliveryImage"
import {
  isLikelyImageFile,
  materializeImageFileForUpload,
  MAX_DEAL_IMAGE_FILE_BYTES,
} from "@/common/utils/materializeImageFileForUpload"
import { toast } from "../../../../common/components/Toast"
import { ASSET_MAX_IMAGE_COUNT } from "../types/deal-asset.types"
import "../tabs/deal_members/add-investment/add_deal_modal.css"

type AssetImageUploadSectionProps = {
  imageFiles: File[]
  onImageFilesChange: Dispatch<SetStateAction<File[]>>
  existingImageUrls?: string[]
  onRemoveExistingImage?: (index: number) => void
  maxCount?: number
}

type GalleryTile =
  | { kind: "existing"; src: string; index: number }
  | { kind: "pending"; src: string; index: number; fileName: string }

function tileLabel(tile: GalleryTile): string {
  return tile.kind === "pending"
    ? tile.fileName
    : `Saved image ${tile.index + 1}`
}

export function AssetImageUploadSection({
  imageFiles,
  onImageFilesChange,
  existingImageUrls = [],
  onRemoveExistingImage,
  maxCount = ASSET_MAX_IMAGE_COUNT,
}: AssetImageUploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lightboxTitleId = useId()
  const [imageLimitMessage, setImageLimitMessage] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])

  const existingCount = existingImageUrls.length
  const pendingCount = imageFiles.length
  const totalCount = existingCount + pendingCount
  const remainingSlots = Math.max(0, maxCount - totalCount)
  const atLimit = totalCount >= maxCount

  useEffect(() => {
    const urls = imageFiles.map((file) => URL.createObjectURL(file))
    setPendingPreviews(urls)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [imageFiles])

  const tiles = useMemo<GalleryTile[]>(() => {
    const existing: GalleryTile[] = existingImageUrls.map((src, index) => ({
      kind: "existing",
      src,
      index,
    }))
    const pending: GalleryTile[] = pendingPreviews.map((src, index) => ({
      kind: "pending",
      src,
      index,
      fileName: imageFiles[index]?.name ?? `Image ${index + 1}`,
    }))
    return [...existing, ...pending]
  }, [existingImageUrls, pendingPreviews, imageFiles])

  const canRemoveTile = useCallback(
    (tile: GalleryTile) =>
      tile.kind === "pending" || Boolean(onRemoveExistingImage),
    [onRemoveExistingImage],
  )

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i != null && i > 0 ? i - 1 : i))
  }, [])

  const goNext = useCallback(() => {
    setLightboxIndex((i) =>
      i != null && i < tiles.length - 1 ? i + 1 : i,
    )
  }, [tiles.length])

  useEffect(() => {
    if (lightboxIndex == null) return
    if (tiles.length === 0) {
      setLightboxIndex(null)
      return
    }
    if (lightboxIndex >= tiles.length) {
      setLightboxIndex(tiles.length - 1)
    }
  }, [lightboxIndex, tiles.length])

  useEffect(() => {
    if (lightboxIndex == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox()
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxIndex, closeLightbox, goPrev, goNext])

  useEffect(() => {
    if (!atLimit) setImageLimitMessage(null)
  }, [atLimit])

  function mergeFiles(incoming: FileList | File[]) {
    let skipped = 0
    let rejected = 0
    void (async () => {
      const accepted: File[] = []
      for (const f of Array.from(incoming)) {
        if (!isLikelyImageFile(f)) {
          rejected += 1
          continue
        }
        if (typeof f.size === "number" && f.size <= 0) {
          rejected += 1
          continue
        }
        if (typeof f.size === "number" && f.size > MAX_DEAL_IMAGE_FILE_BYTES) {
          toast.error("File too large", "Maximum file size is 20 MB per image.")
          rejected += 1
          continue
        }
        try {
          accepted.push(
            await materializeImageFileForUpload(f, {
              fallbackBasename: "property-image",
              maxBytes: MAX_DEAL_IMAGE_FILE_BYTES,
            }),
          )
        } catch {
          rejected += 1
        }
      }
      if (accepted.length === 0) {
        if (rejected > 0) {
          toast.error(
            "Invalid image",
            "Could not read the selected file. Use PNG, JPEG, WebP, or GIF.",
          )
        }
        return
      }
      onImageFilesChange((prev) => {
        const key = (f: File) => `${f.name}\0${f.size}\0${f.lastModified}`
        const seen = new Set(prev.map(key))
        const list = [...prev]
        const room = Math.max(0, maxCount - existingCount - prev.length)
        for (const f of accepted) {
          const k = key(f)
          if (seen.has(k)) continue
          if (list.length - prev.length >= room) {
            skipped += 1
            continue
          }
          seen.add(k)
          list.push(f)
        }
        return list
      })
      if (skipped > 0) {
        setImageLimitMessage(
          `Each asset can have up to ${maxCount} images. Remove one or more to add more.`,
        )
        return
      }
      setImageLimitMessage(null)
    })()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (atLimit || !e.dataTransfer.files.length) return
    mergeFiles(Array.from(e.dataTransfer.files))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const snapshot = e.target.files?.length
      ? Array.from(e.target.files)
      : []
    e.target.value = ""
    if (!snapshot.length) return
    mergeFiles(snapshot)
  }

  function removeTile(tile: GalleryTile) {
    if (tile.kind === "existing") {
      onRemoveExistingImage?.(tile.index)
      return
    }
    onImageFilesChange((prev) => prev.filter((_, j) => j !== tile.index))
  }

  function removeAtLightboxIndex() {
    if (lightboxIndex == null) return
    const tile = tiles[lightboxIndex]
    if (!tile || !canRemoveTile(tile)) return

    const isOnlyImage = tiles.length === 1
    const isLastIndex = lightboxIndex === tiles.length - 1

    removeTile(tile)

    if (isOnlyImage) {
      closeLightbox()
    } else if (isLastIndex) {
      setLightboxIndex(lightboxIndex - 1)
    }
  }

  const activeTile =
    lightboxIndex != null ? (tiles[lightboxIndex] ?? null) : null
  const showCarouselNav = tiles.length > 1
  const canRemoveActive = activeTile ? canRemoveTile(activeTile) : false

  return (
    <div
      className="asset_image_upload"
      onDrop={atLimit ? undefined : handleDrop}
      onDragOver={atLimit ? undefined : handleDragOver}
    >
      <div className="asset_image_upload_head">
        <div className="asset_image_upload_titles">
          <span className="deals_create_label_text">Property images</span>
          <p className="asset_image_upload_hint">
            Upload photos for this asset. Click to preview; use the carousel to
            browse multiple images.
          </p>
        </div>
      </div>

      {tiles.length > 0 ? (
        <div
          className="asset_image_grid"
          role="list"
          aria-label="Property images"
        >
          {tiles.map((tile, i) => {
            const label = tileLabel(tile)
            return (
              <div
                key={`${tile.kind}-${tile.index}-${tile.src.slice(0, 24)}`}
                className="asset_image_tile"
                role="listitem"
              >
                {tile.kind === "pending" ? (
                  <span className="asset_image_tile_badge">New</span>
                ) : null}
                {canRemoveTile(tile) ? (
                  <button
                    type="button"
                    className="asset_image_tile_close"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTile(tile)
                    }}
                    aria-label={`Remove ${label}`}
                  >
                    <X size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="asset_image_tile_view_btn"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`View ${label}`}
                >
                  {tile.kind === "existing" ? (
                    <CloudinaryDeliveryImage
                      src={tile.src}
                      alt=""
                      className="asset_image_tile_img"
                      loading={i < 4 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  ) : (
                    <img
                      src={tile.src}
                      alt=""
                      className="asset_image_tile_img"
                      loading={i < 4 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  )}
                  <span className="asset_image_tile_view_overlay">
                    <Eye size={18} strokeWidth={2} aria-hidden />
                  </span>
                </button>
              </div>
            )
          })}

          {!atLimit ? (
            <button
              type="button"
              className="asset_image_add_tile"
              onClick={() => fileInputRef.current?.click()}
              aria-label={`Add property image, ${remainingSlots} remaining`}
            >
              <ImagePlus
                size={28}
                strokeWidth={1.5}
                className="asset_image_add_tile_icon"
                aria-hidden
              />
              <span className="asset_image_add_tile_label">Add photo</span>
              <span className="asset_image_add_tile_meta">
                {remainingSlots} left
              </span>
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={[
            "asset_image_empty_dropzone",
            atLimit ? "asset_image_empty_dropzone_disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => !atLimit && fileInputRef.current?.click()}
          disabled={atLimit}
          aria-label="Upload property images"
        >
          <Upload
            size={32}
            strokeWidth={1.25}
            className="asset_image_empty_dropzone_icon"
            aria-hidden
          />
          <span className="asset_image_empty_dropzone_title">
            Drag and drop photos here
          </span>
          <span className="asset_image_empty_dropzone_sub">
            or click to browse from your device
          </span>
          <span className="asset_image_empty_dropzone_meta">
            Up to {maxCount} images · JPG, PNG, WebP
          </span>
        </button>
      )}

      {tiles.length > 0 && !atLimit ? (
        <p className="asset_image_drop_hint" role="status">
          Drag and drop more photos anywhere in this section, or use{" "}
          <strong>Add photo</strong>.
        </p>
      ) : null}

      {atLimit ? (
        <p className="asset_image_limit_notice" role="status">
          Image limit reached. Remove an image to upload another.
        </p>
      ) : null}

      {imageLimitMessage ? (
        <p className="deals_create_field_error asset_image_limit_error" role="alert">
          {imageLimitMessage}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        className="asset_step_file_input"
        accept="image/jpeg,image/png,image/webp,image/gif,image/*"
        multiple
        disabled={atLimit}
        onChange={handleFileInput}
        tabIndex={-1}
        aria-hidden
      />

      {activeTile && lightboxIndex != null
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
              role="presentation"
              onClick={closeLightbox}
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel asset_image_lightbox_panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={lightboxTitleId}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <div className="asset_image_lightbox_head_text">
                    <h3
                      id={lightboxTitleId}
                      className="um_modal_title add_contact_modal_title"
                    >
                      Property images
                    </h3>
                    {showCarouselNav ? (
                      <p className="asset_image_lightbox_counter">
                        {lightboxIndex + 1} of {tiles.length}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="um_modal_close"
                    onClick={closeLightbox}
                    aria-label="Close"
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>

                <div className="asset_image_carousel_stage">
                  {showCarouselNav ? (
                    <button
                      type="button"
                      className="asset_image_carousel_nav asset_image_carousel_nav_prev"
                      onClick={goPrev}
                      disabled={lightboxIndex <= 0}
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={22} strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}

                  <div className="asset_image_lightbox_scroll">
                    {activeTile.kind === "pending" ? (
                      <span className="asset_image_lightbox_new_badge">New</span>
                    ) : null}
                    {activeTile.kind === "existing" ? (
                      <CloudinaryDeliveryImage
                        key={activeTile.src}
                        src={activeTile.src}
                        alt=""
                        className="asset_image_lightbox_img"
                        loading="eager"
                        fetchPriority="high"
                      />
                    ) : (
                      <img
                        key={activeTile.src}
                        src={activeTile.src}
                        alt=""
                        className="asset_image_lightbox_img"
                      />
                    )}
                    <p className="asset_image_lightbox_caption">
                      {tileLabel(activeTile)}
                    </p>
                  </div>

                  {showCarouselNav ? (
                    <button
                      type="button"
                      className="asset_image_carousel_nav asset_image_carousel_nav_next"
                      onClick={goNext}
                      disabled={lightboxIndex >= tiles.length - 1}
                      aria-label="Next image"
                    >
                      <ChevronRight size={22} strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}
                </div>

                {showCarouselNav ? (
                  <div
                    className="asset_image_carousel_thumbs"
                    role="tablist"
                    aria-label="Image thumbnails"
                  >
                    {tiles.map((tile, i) => (
                      <button
                        key={`thumb-${tile.kind}-${tile.index}-${tile.src.slice(0, 16)}`}
                        type="button"
                        role="tab"
                        className={[
                          "asset_image_carousel_thumb",
                          i === lightboxIndex
                            ? "asset_image_carousel_thumb_active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-selected={i === lightboxIndex}
                        aria-label={`View image ${i + 1} of ${tiles.length}`}
                        onClick={() => setLightboxIndex(i)}
                      >
                        {tile.kind === "existing" ? (
                          <CloudinaryDeliveryImage src={tile.src} alt="" loading="eager" />
                        ) : (
                          <img src={tile.src} alt="" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="um_modal_actions asset_image_lightbox_actions">
                  {canRemoveActive ? (
                    <button
                      type="button"
                      className="um_btn_secondary asset_image_lightbox_btn asset_image_lightbox_remove_btn"
                      onClick={removeAtLightboxIndex}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      Remove image
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="um_btn_primary asset_image_lightbox_btn"
                    onClick={closeLightbox}
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
    </div>
  )
}
