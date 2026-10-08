import { ChevronLeft, ChevronRight, CameraOff } from "lucide-react"
import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { CloudinaryDeliveryImage } from "@/common/components/CloudinaryDeliveryImage"

interface DealCardMediaCarouselProps {
  imageUrls: string[]
  title: string
  onUploadCoverClick?: () => void
  /** When set, clicking the visible image invokes this with the active slide index. */
  onImageClick?: (index: number) => void
}

function stopLinkNavigation(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
}

export function DealCardMediaCarousel({
  imageUrls,
  title,
  onUploadCoverClick,
  onImageClick,
}: DealCardMediaCarouselProps) {
  const [index, setIndex] = useState(0)
  const n = imageUrls.length

  useEffect(() => {
    setIndex(0)
  }, [imageUrls])

  const go = useCallback(
    (dir: -1 | 1) => {
      if (n <= 1) return
      setIndex((i) => (i + dir + n) % n)
    },
    [n],
  )

  if (n === 0) {
    return (
      <div className="deal_card_media deal_card_media--hero">
        <div className="deal_card_media_placeholder">
          <CameraOff size={40} strokeWidth={1.25} aria-hidden />
          {onUploadCoverClick ? (
            <button
              type="button"
              className="deal_card_upload_btn"
              onClick={(e) => {
                stopLinkNavigation(e)
                onUploadCoverClick()
              }}
            >
              Upload photo
            </button>
          ) : (
            <span className="deal_card_upload_muted">Upload photo</span>
          )}
        </div>
      </div>
    )
  }

  const current = imageUrls[index] ?? ""
  const imageAlt = title.trim()
    ? `Property image for ${title}`
    : "Property image"

  const imageNode = (
    <CloudinaryDeliveryImage
      src={current}
      alt={imageAlt}
      className="deal_card_cover"
      loading={index === 0 ? "eager" : "lazy"}
      fetchPriority={index === 0 ? "high" : "auto"}
      decoding="async"
    />
  )

  return (
    <div className="deal_card_media deal_card_media--hero deal_card_media_carousel">
      {onImageClick ? (
        <button
          type="button"
          className="deal_card_carousel_image_btn"
          onClick={() => onImageClick(index)}
          aria-haspopup="dialog"
          aria-label={`Open image ${index + 1} of ${n} in gallery viewer`}
        >
          {imageNode}
        </button>
      ) : (
        imageNode
      )}
      {n > 1 ? (
        <>
          <button
            type="button"
            className="deal_card_carousel_btn deal_card_carousel_btn_prev"
            onClick={(e) => {
              stopLinkNavigation(e)
              go(-1)
            }}
            aria-label="Previous image"
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="deal_card_carousel_btn deal_card_carousel_btn_next"
            onClick={(e) => {
              stopLinkNavigation(e)
              go(1)
            }}
            aria-label="Next image"
          >
            <ChevronRight size={18} strokeWidth={2} aria-hidden />
          </button>
          <div
            className="deal_card_carousel_dots"
            role="tablist"
            aria-label="Property images"
          >
            {imageUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={
                  i === index
                    ? "deal_card_carousel_dot deal_card_carousel_dot_active"
                    : "deal_card_carousel_dot"
                }
                onClick={(e) => {
                  stopLinkNavigation(e)
                  setIndex(i)
                }}
                aria-label={`Image ${i + 1} of ${n}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
