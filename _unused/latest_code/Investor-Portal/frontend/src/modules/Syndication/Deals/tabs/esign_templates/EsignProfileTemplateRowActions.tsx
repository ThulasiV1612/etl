import {
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  Type,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import "../../../usermanagement/user_management.css"
import "../deal_members/components/deal-member-row-actions.css"

export type EsignProfileTemplateRowActionsProps = {
  templateLabel: string
  disabled?: boolean
  viewDisabled?: boolean
  viewLabel?: string
  canView?: boolean
  canManage?: boolean
  canEditInDropbox?: boolean
  editLabel?: string
  editTitle?: string
  canRename?: boolean
  showDropboxNotConfigured?: boolean
  onView?: () => void | Promise<void>
  onEditTemplate?: () => void
  onRenameTemplate?: () => void
  onRemove?: () => void
}

/** Kebab (⋯) for eSign profile template rows: View, Configure/Edit, Rename, Delete. */
export function EsignProfileTemplateRowActions({
  templateLabel,
  disabled = false,
  viewDisabled = false,
  viewLabel = "View",
  canView = false,
  canManage = false,
  canEditInDropbox = false,
  editLabel = "Edit",
  editTitle,
  canRename = false,
  showDropboxNotConfigured = false,
  onView,
  onEditTemplate,
  onRenameTemplate,
  onRemove,
}: EsignProfileTemplateRowActionsProps) {
  const name = (templateLabel?.trim() || "Template").replace(/"/g, "”")
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const close = useCallback(() => setOpen(false), [])

  const run = useCallback(
    (fn: (() => void) | undefined) => {
      if (!fn || disabled) return
      close()
      fn()
    },
    [close, disabled],
  )

  const runView = useCallback(() => {
    if (!onView || disabled || viewDisabled) return
    close()
    void onView()
  }, [close, disabled, onView, viewDisabled])

  useLayoutEffect(() => {
    if (!open) return

    function syncPosition() {
      const trigger = wrapRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const r = trigger.getBoundingClientRect()
      const mw = menu.offsetWidth || 200
      const mh = menu.offsetHeight || 200
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

  const hasMenuItems =
    canView ||
    (canManage &&
      (canEditInDropbox || canRename || showDropboxNotConfigured || onRemove))

  if (!hasMenuItems) {
    return <span className="deal_esign_doc_muted">—</span>
  }

  return (
    <div
      className="um_kebab_root deal_esign_profiles_kebab"
      ref={wrapRef}
      role="group"
      aria-label={`Actions for ${name}`}
    >
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title="Actions"
        aria-label={`Actions for ${name}`}
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          setOpen((v) => !v)
        }}
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
              {canView ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    disabled={disabled || viewDisabled}
                    onClick={runView}
                  >
                    <Eye
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    {viewLabel}
                  </button>
                </li>
              ) : null}
              {canManage && canEditInDropbox ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    disabled={disabled}
                    title={editTitle}
                    onClick={() => run(onEditTemplate)}
                  >
                    <Pencil
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    {editLabel}
                  </button>
                </li>
              ) : null}
              {canManage && canRename ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    disabled={disabled}
                    title="Change the display name for this template"
                    onClick={() => run(onRenameTemplate)}
                  >
                    <Type
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Rename
                  </button>
                </li>
              ) : null}
              {canManage && showDropboxNotConfigured ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem um_kebab_menuitem_disabled"
                    role="menuitem"
                    disabled
                    title="Configure Dropbox Sign in backend .env"
                  >
                    <Pencil
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Configure
                  </button>
                </li>
              ) : null}
              {canManage && onRemove ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem deals_kebab_menuitem_danger"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => run(onRemove)}
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
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
