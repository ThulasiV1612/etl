import { Info } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import "./form-tooltip.css"

export type FormTooltipPanelAlign = "center" | "start" | "end"

export interface FormTooltipProps {
  content: ReactNode
  /** Shown in aria-label on the trigger */
  label: string
  placement?: "top" | "bottom"
  className?: string
  /**
   * Horizontal alignment of the panel relative to the trigger.
   * Use `start` for left-column headers (avoids clipping off the left edge),
   * `end` for right-aligned headers.
   */
  panelAlign?: FormTooltipPanelAlign
  /**
   * `icon` — default (i) button. `inline` — hover/focus the given `children` (same panel styling as icon mode).
   */
  triggerMode?: "icon" | "inline"
  /** Required when `triggerMode` is `inline`: visible label/cell text that opens the tooltip. */
  children?: ReactNode
  /**
   * When false, the panel opens only from clicking the trigger (not from hovering).
   * Use for table header info icons where hover feels redundant next to click.
   */
  openOnHover?: boolean
  /**
   * When false, the trigger is a `<span role="button">` instead of `<button>`.
   * Use inside another `<button>` (e.g. sortable DataTable headers) — nested buttons are invalid HTML.
   */
  nativeButtonTrigger?: boolean
}

const LEAVE_MS = 180
const VIEWPORT_PAD = 12
const GAP = 10
/** Above stacked UI (dropdown panels ~13000, deal preview ~12100) */
const TOOLTIP_Z = 14000

function computeFixedPosition(args: {
  triggerRect: DOMRect
  placement: "top" | "bottom"
  panelAlign: FormTooltipPanelAlign
  panelWidth: number
  panelHeight: number
}): { top: number; left: number; maxHeight: number } {
  const { triggerRect, placement, panelAlign, panelWidth, panelHeight } = args
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxW = Math.min(32 * 16, vw - VIEWPORT_PAD * 2)
  const w = Math.min(Math.max(panelWidth, 1), maxW)
  const maxHeight = Math.max(48, vh - VIEWPORT_PAD * 2)
  const h = Math.min(Math.max(panelHeight, 1), maxHeight)

  let left = triggerRect.left
  if (panelAlign === "center")
    left = triggerRect.left + triggerRect.width / 2 - w / 2
  else if (panelAlign === "end") left = triggerRect.right - w
  else left = triggerRect.left

  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - VIEWPORT_PAD - w))

  const spaceBelow = vh - triggerRect.bottom - GAP - VIEWPORT_PAD
  const spaceAbove = triggerRect.top - GAP - VIEWPORT_PAD
  const preferBottom =
    placement === "bottom"
      ? spaceBelow >= Math.min(h, 72) || spaceBelow >= spaceAbove
      : spaceAbove < Math.min(h, 72) && spaceBelow > spaceAbove

  let top: number
  if (preferBottom) top = triggerRect.bottom + GAP
  else top = triggerRect.top - GAP - h

  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - VIEWPORT_PAD - h))

  return { top, left, maxHeight }
}

export function MandatoryFieldMark() {
  return (
    <span className="form_mandatory_star" aria-hidden="true">
      *
    </span>
  )
}

export function FormTooltip({
  content,
  label,
  placement = "top",
  className = "",
  panelAlign = "center",
  triggerMode = "icon",
  children,
  openOnHover = true,
  nativeButtonTrigger = true,
}: FormTooltipProps) {
  const tooltipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [fixedStyle, setFixedStyle] = useState<CSSProperties>({})

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const show = useCallback(() => {
    clearLeaveTimer()
    setOpen(true)
  }, [clearLeaveTimer])

  const scheduleHide = useCallback(() => {
    clearLeaveTimer()
    leaveTimerRef.current = setTimeout(() => setOpen(false), LEAVE_MS)
  }, [clearLeaveTimer])

  useLayoutEffect(() => {
    if (!open) {
      setFixedStyle({})
      return
    }
    const root = rootRef.current
    const panel = panelRef.current
    if (!root || !panel) return

    function position() {
      const rEl = rootRef.current
      const pEl = panelRef.current
      if (!rEl || !pEl) return
      const triggerRect = rEl.getBoundingClientRect()
      const w = pEl.offsetWidth
      const h = pEl.offsetHeight
      const { top, left, maxHeight } = computeFixedPosition({
        triggerRect,
        placement,
        panelAlign,
        panelWidth: w,
        panelHeight: h,
      })
      setFixedStyle({
        position: "fixed",
        top,
        left,
        zIndex: TOOLTIP_Z,
        maxWidth: `min(32rem, calc(100vw - ${VIEWPORT_PAD * 2}px))`,
        maxHeight,
        overflowY: h > maxHeight ? "auto" : undefined,
      })
    }

    position()
    const ro = new ResizeObserver(() => position())
    ro.observe(panel)
    window.addEventListener("resize", position)
    window.addEventListener("scroll", position, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", position)
      window.removeEventListener("scroll", position, true)
    }
  }, [open, placement, panelAlign, content])

  useEffect(() => {
    return () => clearLeaveTimer()
  }, [clearLeaveTimer])

  useEffect(() => {
    if (!open) return
    function onWindowKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDocMouseDown)
    return () => document.removeEventListener("mousedown", onDocMouseDown)
  }, [open])

  function handleTriggerClick() {
    clearLeaveTimer()
    setOpen((v) => !v)
  }

  function handleTriggerKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleTriggerClick()
    }
  }

  const triggerAria = {
    "aria-label": label,
    "aria-expanded": open,
    "aria-describedby": open ? tooltipId : undefined,
  } as const

  function handleRootMouseLeave(e: React.MouseEvent) {
    const rel = e.relatedTarget as Node | null
    if (rel && panelRef.current?.contains(rel)) return
    scheduleHide()
  }

  function handlePanelMouseLeave(e: React.MouseEvent) {
    const rel = e.relatedTarget as Node | null
    if (rel && rootRef.current?.contains(rel)) return
    scheduleHide()
  }

  const rootClass = `form_tooltip_root${triggerMode === "inline" ? " form_tooltip_root_inline" : ""} ${className}`.trim()

  const panelInner = (
    <div
      ref={panelRef}
      id={tooltipId}
      role="tooltip"
      className="form_tooltip_panel form_tooltip_panel_portaled"
      data-placement={placement}
      data-panel-align={panelAlign}
      data-visible={open}
      style={fixedStyle}
      onMouseEnter={show}
      onMouseLeave={handlePanelMouseLeave}
    >
      <div className="form_tooltip_surface">{content}</div>
      <span className="form_tooltip_arrow form_tooltip_arrow_portaled_hide" aria-hidden />
    </div>
  )

  return (
    <span
      ref={rootRef}
      className={rootClass}
      onMouseEnter={openOnHover ? show : undefined}
      onMouseLeave={handleRootMouseLeave}
    >
      {triggerMode === "inline" ? (
        nativeButtonTrigger ? (
          <button
            type="button"
            className="form_tooltip_trigger_inline"
            {...triggerAria}
            onClick={handleTriggerClick}
          >
            {children}
          </button>
        ) : (
          <span
            role="button"
            tabIndex={0}
            className="form_tooltip_trigger_inline"
            {...triggerAria}
            onClick={handleTriggerClick}
            onKeyDown={handleTriggerKeyDown}
          >
            {children}
          </span>
        )
      ) : nativeButtonTrigger ? (
        <button
          type="button"
          className="form_tooltip_trigger"
          {...triggerAria}
          onClick={handleTriggerClick}
        >
          <Info size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <span
          role="button"
          tabIndex={0}
          className="form_tooltip_trigger"
          {...triggerAria}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
        >
          <Info size={16} strokeWidth={2} aria-hidden />
        </span>
      )}
      {open ? createPortal(panelInner, document.body) : null}
    </span>
  )
}
