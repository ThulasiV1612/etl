import { MoreHorizontal, TrendingUp } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import "@/modules/Syndication/usermanagement/user_management.css"

type InvestmentProfileBreakdownRowActionsProps = {
  profileLabel: string
  /** When false, kebab stays visible but cannot open (profile has no Invest Now draft). */
  disabled?: boolean
  onResumeInvesting?: () => void
}

/**
 * Kebab (⋯) for Profile and investment breakdown rows — Resume investing when in draft.
 */
export function InvestmentProfileBreakdownRowActions({
  profileLabel,
  disabled = false,
  onResumeInvesting,
}: InvestmentProfileBreakdownRowActionsProps) {
  const a11yLabel = (profileLabel?.trim() || "Profile").replace(/"/g, "”")
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    if (!open || disabled || !onResumeInvesting) return

    function syncPosition() {
      const trigger = wrapRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const r = trigger.getBoundingClientRect()
      const mw = menu.offsetWidth || 200
      const mh = menu.offsetHeight || 80
      const gap = 6
      const vh = window.innerHeight
      const vw = window.innerWidth
      let top = r.bottom + gap
      if (top + mh > vh - gap) top = Math.max(gap, r.top - mh - gap)
      let left = r.right - mw
      left = Math.min(Math.max(gap, left), vw - mw - gap)
      menu.style.position = "fixed"
      menu.style.top = `${top}px`
      menu.style.left = `${left}px`
      menu.style.right = "auto"
      menu.style.zIndex = "11000"
    }

    syncPosition()
    const raf = requestAnimationFrame(syncPosition)
    const ro = new ResizeObserver(syncPosition)
    if (menuRef.current) ro.observe(menuRef.current)
    window.addEventListener("scroll", syncPosition, true)
    window.addEventListener("resize", syncPosition)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("scroll", syncPosition, true)
      window.removeEventListener("resize", syncPosition)
    }
  }, [open, disabled, onResumeInvesting])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  const triggerTitle = disabled
    ? "No in-progress Invest Now draft for this profile"
    : "Actions"

  return (
    <div
      className="um_kebab_root"
      ref={wrapRef}
      role="group"
      aria-label={`Actions for ${a11yLabel}`}
    >
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup={disabled ? undefined : "menu"}
        aria-expanded={disabled ? undefined : open}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        title={triggerTitle}
        aria-label={`Actions for ${a11yLabel}`}
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          setOpen((v) => !v)
        }}
      >
        <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
      </button>
      {open && !disabled && onResumeInvesting && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              className="um_kebab_menu um_kebab_menu--portal"
              role="menu"
            >
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() => {
                    close()
                    onResumeInvesting()
                  }}
                >
                  <TrendingUp
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Resume investing
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
