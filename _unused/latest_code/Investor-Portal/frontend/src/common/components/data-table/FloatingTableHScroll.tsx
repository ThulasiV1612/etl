import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import "./data-table.css"

interface FloatingTableHScrollProps {
  scrollerRef: RefObject<HTMLElement | null>
  /** Re-measure when table contents change (row count, page, columns). */
  syncKey?: string
  active?: boolean
  ariaLabel?: string
}

interface StickyBarMetrics {
  left: number
  top: number
  width: number
  overlay: boolean
}

interface ScrollMetrics {
  left: number
  max: number
  view: number
  content: number
}

const BAR_HEIGHT_PX = 28
const THUMB_MIN_PX = 48

function scrollPortRect(scroller: HTMLElement): DOMRect {
  const port = scroller.closest(
    ".um_modal, .deals_add_inv_modal_panel, .app_main_content",
  )
  if (port instanceof HTMLElement) return port.getBoundingClientRect()
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

function readScrollMetrics(scroller: HTMLElement): ScrollMetrics {
  const view = scroller.clientWidth
  const content = scroller.scrollWidth
  const max = Math.max(0, content - view)
  return {
    left: scroller.scrollLeft,
    max,
    view,
    content,
  }
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function syncScrollerFade(scroller: HTMLElement, left: boolean, right: boolean) {
  scroller.classList.toggle("data_table_hscroll_scroller--fade-left", left)
  scroller.classList.toggle("data_table_hscroll_scroller--fade-right", right)
  scroller.classList.toggle("deal_docs_ui_table_scroll--fade-left", left)
  scroller.classList.toggle("deal_docs_ui_table_scroll--fade-right", right)
}

export function FloatingTableHScroll({
  scrollerRef,
  syncKey = "",
  active = true,
  ariaLabel = "Columns",
}: FloatingTableHScrollProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startLeft: number
    max: number
    trackWidth: number
    thumbWidth: number
  } | null>(null)
  const [sticky, setSticky] = useState<StickyBarMetrics | null>(null)
  const [overflowX, setOverflowX] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    left: 0,
    max: 0,
    view: 0,
    content: 0,
  })

  const syncScrollState = useCallback((scroller: HTMLElement) => {
    const next = readScrollMetrics(scroller)
    const hasOverflow = next.max > 2
    const left = hasOverflow && next.left > 2
    const right = hasOverflow && next.left < next.max - 2
    setOverflowX(hasOverflow)
    setCanScrollLeft(left)
    setCanScrollRight(right)
    setMetrics(next)
    syncScrollerFade(scroller, left, right)
  }, [])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    function hideSticky() {
      setSticky((prev) => (prev == null ? prev : null))
    }

    function updateSticky() {
      const node = scrollerRef.current
      if (!node) return
      if (!active) {
        setOverflowX(false)
        setCanScrollLeft(false)
        setCanScrollRight(false)
        syncScrollerFade(node, false, false)
        hideSticky()
        return
      }
      syncScrollState(node)
      const hasOverflowX = node.scrollWidth - node.clientWidth > 2
      const rect = node.getBoundingClientRect()
      const port = scrollPortRect(node)
      const visible =
        rect.bottom > port.top + 8 && rect.top < port.bottom - 8
      if (!hasOverflowX || !visible) {
        hideSticky()
        return
      }
      const left = Math.max(rect.left, port.left)
      const width = Math.min(rect.right, port.right) - left
      if (width < 96) {
        hideSticky()
        return
      }
      const tableBottomInView = rect.bottom <= port.bottom + 1
      const fitsBelowTable =
        tableBottomInView && rect.bottom + BAR_HEIGHT_PX <= port.bottom + 1
      const overlay = !fitsBelowTable
      const top = fitsBelowTable
        ? rect.bottom
        : Math.min(rect.bottom, port.bottom) - BAR_HEIGHT_PX
      const next: StickyBarMetrics = {
        left,
        top,
        width,
        overlay,
      }
      setSticky((prev) => {
        if (
          prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.overlay === next.overlay
        )
          return prev
        return next
      })
    }

    function onScrollerScroll() {
      const node = scrollerRef.current
      if (!node) return
      syncScrollState(node)
    }

    updateSticky()
    const port = scroller.closest(
      ".um_modal, .deals_add_inv_modal_panel, .app_main_content",
    )
    port?.addEventListener("scroll", updateSticky, { passive: true })
    window.addEventListener("resize", updateSticky)
    scroller.addEventListener("scroll", onScrollerScroll, { passive: true })
    const resizeObserver = new ResizeObserver(updateSticky)
    resizeObserver.observe(scroller)
    if (scroller.firstElementChild)
      resizeObserver.observe(scroller.firstElementChild)

    return () => {
      port?.removeEventListener("scroll", updateSticky)
      window.removeEventListener("resize", updateSticky)
      scroller.removeEventListener("scroll", onScrollerScroll)
      resizeObserver.disconnect()
      syncScrollerFade(scroller, false, false)
    }
  }, [active, scrollerRef, syncScrollState, syncKey])

  function scrollByDir(dir: -1 | 1) {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollBy({
      left: dir * Math.max(240, scroller.clientWidth * 0.7),
      behavior: "smooth",
    })
  }

  const thumbRatio =
    metrics.content > 0 ? Math.min(1, metrics.view / metrics.content) : 1
  const thumbPct = Math.max(12, thumbRatio * 100)
  const travelPct = Math.max(0, 100 - thumbPct)
  const thumbLeftPct =
    metrics.max > 0 ? (metrics.left / metrics.max) * travelPct : 0

  function scrollToTrackRatio(ratio: number) {
    const scroller = scrollerRef.current
    if (!scroller || metrics.max <= 0) return
    scroller.scrollLeft = Math.min(metrics.max, Math.max(0, ratio * metrics.max))
  }

  function pointerToScroll(clientX: number) {
    const track = trackRef.current
    const scroller = scrollerRef.current
    if (!track || !scroller || metrics.max <= 0) return
    const rect = track.getBoundingClientRect()
    const trackWidth = rect.width
    if (trackWidth <= 0) return
    const thumbWidth = Math.max(THUMB_MIN_PX, (thumbPct / 100) * trackWidth)
    const x = clientX - rect.left
    const travel = Math.max(1, trackWidth - thumbWidth)
    const center = x - thumbWidth / 2
    scrollToTrackRatio(center / travel)
  }

  function onTrackPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const target = e.target
    if (target instanceof Element && target.closest(".data_table_hscroll_thumb"))
      return
    e.preventDefault()
    pointerToScroll(e.clientX)
  }

  function onThumbPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const track = trackRef.current
    const scroller = scrollerRef.current
    if (!track || !scroller || metrics.max <= 0) return
    const rect = track.getBoundingClientRect()
    const trackWidth = rect.width
    const thumbWidth = Math.max(THUMB_MIN_PX, (thumbPct / 100) * trackWidth)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startLeft: scroller.scrollLeft,
      max: metrics.max,
      trackWidth,
      thumbWidth,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onThumbPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    const scroller = scrollerRef.current
    if (!drag || drag.pointerId !== e.pointerId || !scroller) return
    const travel = Math.max(1, drag.trackWidth - drag.thumbWidth)
    const dx = e.clientX - drag.startX
    const next = drag.startLeft + (dx / travel) * drag.max
    scroller.scrollLeft = Math.min(drag.max, Math.max(0, next))
  }

  function onThumbPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {overflowX ? (
        <div className="data_table_hscroll_spacer" aria-hidden />
      ) : null}
      {sticky && typeof document !== "undefined"
        ? createPortal(
            <div
              className={classNames(
                "data_table_hscroll_sticky",
                sticky.overlay && "data_table_hscroll_sticky--overlay",
              )}
              style={{
                left: sticky.left,
                top: sticky.top,
                width: sticky.width,
              }}
              role="group"
              aria-label={ariaLabel}
            >
              <button
                type="button"
                className="data_table_hscroll_btn"
                aria-label="Scroll left"
                disabled={!canScrollLeft}
                onClick={() => scrollByDir(-1)}
              >
                <ChevronLeft size={16} strokeWidth={2.25} aria-hidden />
              </button>
              <div
                ref={trackRef}
                className="data_table_hscroll_track"
                role="scrollbar"
                aria-label="Horizontal scroll"
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.round(metrics.max)}
                aria-valuenow={Math.round(metrics.left)}
                onPointerDown={onTrackPointerDown}
              >
                <button
                  type="button"
                  className="data_table_hscroll_thumb"
                  aria-label="Drag to scroll"
                  style={{
                    width: `${thumbPct}%`,
                    left: `${thumbLeftPct}%`,
                  }}
                  onPointerDown={onThumbPointerDown}
                  onPointerMove={onThumbPointerMove}
                  onPointerUp={onThumbPointerUp}
                  onPointerCancel={onThumbPointerUp}
                />
              </div>
              <button
                type="button"
                className="data_table_hscroll_btn"
                aria-label="Scroll right"
                disabled={!canScrollRight}
                onClick={() => scrollByDir(1)}
              >
                <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
