import {
  Archive,
  ArchiveRestore,
  Eye,
  MoreHorizontal,
  Pencil,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import "../../usermanagement/user_management.css"

interface AssetRowActionsProps {
  rowName: string
  archived?: boolean
  onView: () => void
  onEdit?: () => void
  onArchive: () => void
  onActivate: () => void
}

export function AssetRowActions({
  rowName,
  archived = false,
  onView,
  onEdit,
  onArchive,
  onActivate,
}: AssetRowActionsProps) {
  const confirmTitleId = useId()
  const [open, setOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<
    null | "archive" | "activate"
  >(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const close = useCallback(() => setOpen(false), [])

  const closeConfirm = useCallback(() => setConfirmKind(null), [])

  useEffect(() => {
    if (!confirmKind) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeConfirm()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmKind, closeConfirm])

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

  function handleView() {
    close()
    onView()
  }

  function handleEdit() {
    close()
    onEdit?.()
  }

  function handleArchive() {
    close()
    setConfirmKind("archive")
  }

  function handleActivate() {
    close()
    setConfirmKind("activate")
  }

  function confirmArchiveAction() {
    closeConfirm()
    onArchive()
  }

  function confirmActivateAction() {
    closeConfirm()
    onActivate()
  }

  const label = rowName.trim() || "this asset"

  return (
    <div className="um_kebab_root" ref={wrapRef}>
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${rowName.trim() || "asset"}`}
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
                  onClick={handleView}
                >
                  <Eye
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  View
                </button>
              </li>
              {archived ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={handleActivate}
                  >
                    <ArchiveRestore
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Activate
                  </button>
                </li>
              ) : (
                <>
                  {onEdit ? (
                    <li role="none">
                      <button
                        type="button"
                        className="um_kebab_menuitem"
                        role="menuitem"
                        onClick={handleEdit}
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
                  ) : null}
                  <li role="none">
                    <button
                      type="button"
                      className="um_kebab_menuitem"
                      role="menuitem"
                      onClick={handleArchive}
                    >
                      <Archive
                        className="um_kebab_menuitem_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                      Archive
                    </button>
                  </li>
                </>
              )}
            </ul>,
            document.body,
          )
        : null}
      {confirmKind && typeof document !== "undefined"
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
              role="presentation"
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={confirmTitleId}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <h3
                    id={confirmTitleId}
                    className="um_modal_title add_contact_modal_title"
                  >
                    {confirmKind === "archive"
                      ? "Archive this asset?"
                      : "Activate this asset?"}
                  </h3>
                  <button
                    type="button"
                    className="um_modal_close"
                    onClick={closeConfirm}
                    aria-label="Close"
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="deals_add_inv_modal_scroll">
                  <p className="deals_suspend_all_modal_message">
                    {confirmKind === "archive"
                      ? `Archive “${label}”? It will remain in this list as archived (gray). You can activate it again anytime.`
                      : `Activate “${label}” and return it to active assets?`}
                  </p>
                </div>
                <div className="um_modal_actions add_contact_modal_actions">
                  <button
                    type="button"
                    className="um_btn_secondary"
                    onClick={closeConfirm}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    Close
                  </button>
                  <button
                    type="button"
                    className="um_btn_primary"
                    onClick={
                      confirmKind === "archive"
                        ? confirmArchiveAction
                        : confirmActivateAction
                    }
                  >
                    {confirmKind === "archive" ? (
                      <>
                        <Archive size={16} strokeWidth={2} aria-hidden />
                        Archive
                      </>
                    ) : (
                      <>
                        <ArchiveRestore size={16} strokeWidth={2} aria-hidden />
                        Activate
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
