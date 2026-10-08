import {
  DollarSign,
  Eye,
  FileDown,
  Mail,
  MoreHorizontal,
  Pencil,
} from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface DealInvestorRowActionsProps {
  /** Member / investor display name for accessible labeling */
  investorLabel: string
  /**
   * Add-member session draft row: same kebab; “Edit” → “Continue editing”;
   * Email / Funding / Documents are disabled until the member is saved.
   */
  draftRow?: boolean
  onViewDetails: () => void
  onEdit?: () => void
  /** When `draftRow`, used for View + Continue editing (opens add flow). */
  onContinueDraftEdit?: () => void
}

export function DealInvestorRowActions({
  investorLabel,
  draftRow = false,
  onViewDetails,
  onEdit,
  onContinueDraftEdit,
}: DealInvestorRowActionsProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    if (!open) return

    function syncPosition() {
      const trigger = wrapRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const r = trigger.getBoundingClientRect()
      const mw = menu.offsetWidth || 200
      const mh = menu.offsetHeight || 160
      const gap = 6
      const vh = window.innerHeight
      const vw = window.innerWidth
      let top = r.bottom + gap
      if (top + mh > vh - gap)
        top = Math.max(gap, r.top - mh - gap)
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
    const menuEl = menuRef.current
    if (menuEl) ro.observe(menuEl)
    window.addEventListener("scroll", syncPosition, true)
    window.addEventListener("resize", syncPosition)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("scroll", syncPosition, true)
      window.removeEventListener("resize", syncPosition)
    }
  }, [open])

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

  const label = investorLabel.trim() || "investor"

  function continueDraft() {
    const fn = onContinueDraftEdit ?? onViewDetails
    fn()
  }

  return (
    <div className="um_kebab_root" ref={wrapRef}>
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}${draftRow ? " (draft)" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
      </button>
      {open && typeof document !== "undefined"
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
                    if (draftRow) continueDraft()
                    else onViewDetails()
                  }}
                >
                  <Eye
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  View Investor Details
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className={`um_kebab_menuitem${draftRow ? " um_kebab_menuitem_disabled" : ""}`}
                  role="menuitem"
                  disabled={draftRow}
                  title={
                    draftRow
                      ? "Available after the member is saved"
                      : undefined
                  }
                  onClick={() => {
                    close()
                  }}
                >
                  <Mail
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Email
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() => {
                    close()
                    if (draftRow) continueDraft()
                    else onEdit?.()
                  }}
                >
                  <Pencil
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {draftRow ? "Continue editing" : "Edit"}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className={`um_kebab_menuitem${draftRow ? " um_kebab_menuitem_disabled" : ""}`}
                  role="menuitem"
                  disabled={draftRow}
                  title={
                    draftRow
                      ? "Available after the member is saved"
                      : undefined
                  }
                  onClick={() => {
                    close()
                  }}
                >
                  <DollarSign
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Funding
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className={`um_kebab_menuitem${draftRow ? " um_kebab_menuitem_disabled" : ""}`}
                  role="menuitem"
                  disabled={draftRow}
                  title={
                    draftRow
                      ? "Available after the member is saved"
                      : undefined
                  }
                  onClick={() => {
                    close()
                  }}
                >
                  <FileDown
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Documents
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
