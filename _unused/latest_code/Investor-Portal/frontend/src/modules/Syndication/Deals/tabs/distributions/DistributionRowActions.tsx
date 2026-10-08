import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import "../../../usermanagement/user_management.css"

type DistributionRowActionsProps = {
  rowLabel: string
  onEdit: () => void
  onExport: () => void
  onDelete: () => void
}

/**
 * Distributions list kebab: Edit → Distribution Setup, Export, Delete.
 */
export function DistributionRowActions({
  rowLabel,
  onEdit,
  onExport,
  onDelete,
}: DistributionRowActionsProps) {
  const label = rowLabel.trim() || "distribution"
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
      const mw = menu.offsetWidth || 180
      const mh = menu.offsetHeight || 140
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

  return (
    <div
      className="um_kebab_root"
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
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
                    onEdit()
                  }}
                >
                  <Pencil
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Edit
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() => {
                    close()
                    onExport()
                  }}
                >
                  <Download
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Export
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() => {
                    close()
                    onDelete()
                  }}
                >
                  <Trash2
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Delete
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
