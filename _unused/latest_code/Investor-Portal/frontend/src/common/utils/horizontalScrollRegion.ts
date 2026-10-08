/**
 * Shared horizontal scroll behavior for table regions that show a bottom scrollbar:
 * - Shift + vertical wheel → scroll columns (smoothed)
 * - Trackpad / mouse horizontal gestures → scroll columns (smoothed)
 * - Click-drag pan on non-interactive areas (horizontal only)
 * - Optional edge auto-scroll near left/right edges
 *
 * Vertical page scroll is never intercepted for ordinary vertical wheel moves.
 * Bottom scrollbar drag stays native (no scroll-behavior: smooth on the element).
 */

export interface HorizontalScrollRegionOptions {
  /** Enable auto-scroll when the pointer sits near left/right edges. Default false. */
  edgeScroll?: boolean
  /** Edge zone width in px. Default 28. */
  edgeZonePx?: number
  /** Max edge-scroll speed in px per frame (~60fps). Default 14. */
  edgeSpeedPx?: number
  /**
   * Map vertical wheel to horizontal while hovered when the scroller
   * has no meaningful vertical overflow. Default false (avoids page-scroll shake).
   */
  hoverVerticalToHorizontal?: boolean
}

export function attachHorizontalScrollBehavior(
  scroller: HTMLElement,
  options: HorizontalScrollRegionOptions = {},
): () => void {
  const {
    edgeScroll = false,
    edgeZonePx = 28,
    edgeSpeedPx = 14,
    hoverVerticalToHorizontal = false,
  } = options

  const maxScrollX = () =>
    Math.max(0, scroller.scrollWidth - scroller.clientWidth)

  const maxScrollY = () =>
    Math.max(0, scroller.scrollHeight - scroller.clientHeight)

  /** Soft momentum so wheel / trackpad horizontal pan does not jump. */
  let wheelTarget = scroller.scrollLeft
  let wheelRaf: number | null = null

  function stopWheelSmooth() {
    if (wheelRaf != null) {
      cancelAnimationFrame(wheelRaf)
      wheelRaf = null
    }
  }

  function tickWheelSmooth() {
    wheelRaf = null
    const maxX = maxScrollX()
    const target = Math.max(0, Math.min(maxX, wheelTarget))
    const cur = scroller.scrollLeft
    const delta = target - cur
    if (Math.abs(delta) < 0.4) {
      scroller.scrollLeft = target
      return
    }
    scroller.scrollLeft = cur + delta * 0.28
    wheelRaf = requestAnimationFrame(tickWheelSmooth)
  }

  const applyScrollX = (delta: number, e: WheelEvent) => {
    if (delta === 0) return false
    const maxX = maxScrollX()
    if (maxX <= 2) return false
    if (wheelRaf == null) wheelTarget = scroller.scrollLeft
    wheelTarget = Math.max(0, Math.min(maxX, wheelTarget + delta))
    if (wheelRaf == null) wheelRaf = requestAnimationFrame(tickWheelSmooth)
    e.preventDefault()
    return true
  }

  const onWheel = (e: WheelEvent) => {
    const maxX = maxScrollX()
    if (maxX <= 2) return

    const absX = Math.abs(e.deltaX)
    const absY = Math.abs(e.deltaY)

    // Shift + wheel always means horizontal columns.
    if (e.shiftKey) {
      applyScrollX(absX > 0 ? e.deltaX : e.deltaY, e)
      return
    }

    // Clear horizontal trackpad / mouse wheel gesture only.
    // Require a clear X bias so diagonal trackpad moves don't fight page scroll.
    if (absX > 0 && absX >= absY * 1.25) {
      applyScrollX(e.deltaX, e)
      return
    }

    // Opt-in: vertical wheel → columns when the region itself isn't a vertical scroller.
    if (
      hoverVerticalToHorizontal &&
      maxScrollY() <= 2 &&
      absY > absX + 1
    ) {
      applyScrollX(e.deltaY, e)
    }
  }

  let isDragging = false
  let startX = 0
  let startY = 0
  let startScrollLeft = 0
  let pointerId: number | null = null
  let panAxis: "x" | "y" | null = null
  let panThreshold = 6

  const interactiveSelector =
    "a[href], button, [role='menuitem'], [role='button'], input, select, textarea, label, .cs_toggle"

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest(interactiveSelector)) return
    if (maxScrollX() <= 2) return

    // Do NOT setPointerCapture here — that swallows row clicks (Investor details).
    // Capture only after horizontal pan intent is confirmed in pointermove.
    stopWheelSmooth()
    isDragging = true
    panAxis = null
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startScrollLeft = scroller.scrollLeft
    // Higher threshold on clickable rows so a normal click opens Investor details.
    panThreshold = target.closest("tr.data_table_row_clickable") ? 12 : 6
    stopEdgeScroll()
  }

  const onPointerMove = (e: PointerEvent) => {
    if (isDragging && pointerId === e.pointerId) {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (panAxis == null) {
        if (Math.abs(dx) < panThreshold && Math.abs(dy) < panThreshold) return
        // Prefer vertical: don't steal page / text selection intent.
        panAxis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y"
        if (panAxis === "x") {
          scroller.classList.add("is-panning")
          try {
            scroller.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
        } else {
          // Vertical intent or ambiguous — release so row click / page scroll work.
          isDragging = false
          pointerId = null
          panAxis = null
          return
        }
      }
      if (panAxis !== "x") return
      scroller.scrollLeft = startScrollLeft - dx
      wheelTarget = scroller.scrollLeft
      e.preventDefault()
      return
    }

    if (edgeScroll && !isDragging) updateEdgeScrollFromPointer(e.clientX)
  }

  const endPan = (e: PointerEvent) => {
    if (!isDragging || (pointerId != null && e.pointerId !== pointerId)) return
    const wasHorizontalPan = panAxis === "x"
    isDragging = false
    pointerId = null
    panAxis = null
    scroller.classList.remove("is-panning")
    if (wasHorizontalPan) {
      try {
        scroller.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
  }

  let edgeRaf: number | null = null
  let edgeDir: -1 | 0 | 1 = 0
  let edgeIntensity = 0

  function stopEdgeScroll() {
    edgeDir = 0
    edgeIntensity = 0
    if (edgeRaf != null) {
      cancelAnimationFrame(edgeRaf)
      edgeRaf = null
    }
  }

  function edgeTick() {
    edgeRaf = null
    if (edgeDir === 0 || isDragging) return
    const maxX = maxScrollX()
    if (maxX <= 2) {
      stopEdgeScroll()
      return
    }
    const step = edgeDir * Math.max(2, edgeSpeedPx * edgeIntensity)
    const prev = scroller.scrollLeft
    const next = Math.max(0, Math.min(maxX, prev + step))
    scroller.scrollLeft = next
    wheelTarget = next
    if (next !== 0 && next !== maxX) edgeRaf = requestAnimationFrame(edgeTick)
    else stopEdgeScroll()
  }

  function updateEdgeScrollFromPointer(clientX: number) {
    if (!edgeScroll || isDragging) {
      stopEdgeScroll()
      return
    }
    const maxX = maxScrollX()
    if (maxX <= 2) {
      stopEdgeScroll()
      return
    }

    const rect = scroller.getBoundingClientRect()
    const localX = clientX - rect.left
    let nextDir: -1 | 0 | 1 = 0
    let intensity = 0

    if (localX >= 0 && localX < edgeZonePx) {
      nextDir = -1
      intensity = 1 - localX / edgeZonePx
    } else if (localX > rect.width - edgeZonePx && localX <= rect.width) {
      nextDir = 1
      intensity = 1 - (rect.width - localX) / edgeZonePx
    }

    edgeDir = nextDir
    edgeIntensity = Math.max(0, Math.min(1, intensity))
    if (edgeDir === 0) {
      stopEdgeScroll()
      return
    }
    if (edgeRaf == null) edgeRaf = requestAnimationFrame(edgeTick)
  }

  const onPointerLeave = () => {
    if (!isDragging) stopEdgeScroll()
  }

  scroller.addEventListener("wheel", onWheel, { passive: false })
  scroller.addEventListener("pointerdown", onPointerDown)
  scroller.addEventListener("pointermove", onPointerMove)
  scroller.addEventListener("pointerup", endPan)
  scroller.addEventListener("pointercancel", endPan)
  scroller.addEventListener("pointerleave", onPointerLeave)

  return () => {
    stopWheelSmooth()
    stopEdgeScroll()
    scroller.removeEventListener("wheel", onWheel)
    scroller.removeEventListener("pointerdown", onPointerDown)
    scroller.removeEventListener("pointermove", onPointerMove)
    scroller.removeEventListener("pointerup", endPan)
    scroller.removeEventListener("pointercancel", endPan)
    scroller.removeEventListener("pointerleave", onPointerLeave)
    scroller.classList.remove("is-panning")
  }
}
