import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

interface LpDealGalleryCarouselProps {
  imageUrls: string[]
  title: string
}

export function LpDealGalleryCarousel({
  imageUrls,
  title,
}: LpDealGalleryCarouselProps) {
  const [index, setIndex] = useState(0)
  const n = imageUrls.length

  useEffect(() => {
    setIndex(0)
  }, [imageUrls])

  const go = useCallback(
    (dir: -1 | 1) => {
      if (n === 0) return
      setIndex((i) => (i + dir + n) % n)
    },
    [n],
  )

  if (n === 0) {
    return (
      <div
        className="lpdd_hero_media lpdd_hero_media_empty"
        role="img"
        aria-label="No property images"
      >
        <ImageIcon size={48} strokeWidth={1.25} aria-hidden />
        <span className="lpdd_hero_media_empty_text">Property imagery coming soon</span>
      </div>
    )
  }

  const current = imageUrls[index] ?? ""

  return (
    <div className="lpdd_hero_carousel">
      <div className="lpdd_hero_carousel_frame">
        <img
          src={current}
          alt={title.trim() ? title : "Property image"}
          className="lpdd_hero_carousel_img"
          loading={index === 0 ? "eager" : "lazy"}
        />
        {n > 1 ? (
          <>
            <button
              type="button"
              className="lpdd_hero_carousel_btn lpdd_hero_carousel_btn_prev"
              onClick={() => go(-1)}
              aria-label="Previous image"
            >
              <ChevronLeft size={22} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="lpdd_hero_carousel_btn lpdd_hero_carousel_btn_next"
              onClick={() => go(1)}
              aria-label="Next image"
            >
              <ChevronRight size={22} strokeWidth={2} />
            </button>
            <div className="lpdd_hero_carousel_dots" role="tablist" aria-label="Gallery">
              {imageUrls.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  className={
                    i === index ? "lpdd_hero_dot lpdd_hero_dot_active" : "lpdd_hero_dot"
                  }
                  onClick={() => setIndex(i)}
                  aria-label={`Image ${i + 1} of ${n}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
      {/* <p className="lpdd_hero_carousel_caption">{title}</p> */}
    </div>
  )
}
