import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import "./tabs-scroll-strip.css"

interface TabsScrollStripProps {
  children: ReactNode
  /** Classes for the scrolling element (e.g. `deals_tabs_scroll`) */
  scrollClassName?: string
  className?: string
}

/**
 * Horizontal tab row with edge arrows when content overflows (scroll stays usable; scrollbar hidden via CSS).
 */
export function TabsScrollStrip({
  children,
  scrollClassName = "",
  className = "",
}: TabsScrollStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [showNav, setShowNav] = useState(false)

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const overflow = scrollWidth > clientWidth + 2
    setShowNav(overflow)
    if (!overflow) {
      setCanLeft(false)
      setCanRight(false)
      return
    }
    setCanLeft(scrollLeft > 4)
    setCanRight(scrollLeft + clientWidth < scrollWidth - 4)
  }, [])

  useLayoutEffect(() => {
    update()
  }, [update])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [update])

  function scrollTabs(dir: "left" | "right") {
    const el = scrollRef.current
    if (!el) return
    const w = el.clientWidth
    el.scrollBy({
      left: dir === "left" ? -w * 0.88 : w * 0.88,
      behavior: "smooth",
    })
  }

  const rootClass = `tabs_scroll_strip${className ? ` ${className}` : ""}`.trim()
  const scrollClass = `tabs_scroll_strip_scroll ${scrollClassName}`.trim()

  return (
    <div className={rootClass}>
      {showNav ? (
        <div className="tabs_scroll_strip_edge tabs_scroll_strip_edge_start">
          <button
            type="button"
            className="tabs_scroll_strip_btn"
            aria-label="Scroll tabs backward"
            disabled={!canLeft}
            onClick={() => scrollTabs("left")}
          >
            <ChevronLeft size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}
      <div ref={scrollRef} className={scrollClass}>
        {children}
      </div>
      {showNav ? (
        <div className="tabs_scroll_strip_edge tabs_scroll_strip_edge_end">
          <button
            type="button"
            className="tabs_scroll_strip_btn"
            aria-label="Scroll tabs forward"
            disabled={!canRight}
            onClick={() => scrollTabs("right")}
          >
            <ChevronRight size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}
