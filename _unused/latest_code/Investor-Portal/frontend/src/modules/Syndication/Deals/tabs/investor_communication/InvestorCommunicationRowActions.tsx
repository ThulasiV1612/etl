import {
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  Send,
  Trash2,
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
import type { InvestorCommunicationMailRow } from "./investor-communication.types"
import "../../../usermanagement/user_management.css"
import "../../deals-list.css"
import "../deal_members/components/deal-member-row-actions.css"

export interface InvestorCommunicationRowActionsProps {
  row: InvestorCommunicationMailRow
  viewerIsCosponsor?: boolean
  onView?: (row: InvestorCommunicationMailRow) => void
  onResend?: (row: InvestorCommunicationMailRow) => void
  onSendToInvestors?: (row: InvestorCommunicationMailRow) => void
  onDelete?: (row: InvestorCommunicationMailRow) => void | Promise<void>
}

export function InvestorCommunicationRowActions({
  row,
  viewerIsCosponsor = false,
  onView,
  onResend,
  onSendToInvestors,
  onDelete,
}: InvestorCommunicationRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const deleteTitleId = useId()

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const label = row.subject?.trim() || "mail"
  const hasRecipients = row.recipientUsers.length > 0
  const heldForCosponsor = row.heldForCosponsorRelease === true
  const canSendToInvestors =
    viewerIsCosponsor &&
    Boolean(onSendToInvestors) &&
    (heldForCosponsor || row.status === "not_sent")
  const canResend =
    Boolean(onResend) &&
    !canSendToInvestors &&
    row.status !== "not_sent" &&
    hasRecipients

  useLayoutEffect(() => {
    if (!menuOpen) return

    function syncPosition() {
      const trigger = wrapRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const r = trigger.getBoundingClientRect()
      const mw = menu.offsetWidth || 200
      const mh = menu.offsetHeight || 120
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
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      closeMenu()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen, closeMenu])

  useEffect(() => {
    if (!deleteConfirmOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleteBusy) setDeleteConfirmOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deleteConfirmOpen, deleteBusy])

  function runMenuAction(fn: () => void) {
    fn()
    closeMenu()
  }

  async function confirmDelete() {
    if (!onDelete) return
    setDeleteBusy(true)
    try {
      await Promise.resolve(onDelete(row))
    } finally {
      setDeleteBusy(false)
      setDeleteConfirmOpen(false)
    }
  }

  function runDelete() {
    if (!onDelete) return
    setDeleteConfirmOpen(true)
    closeMenu()
  }

  const deleteModal =
    deleteConfirmOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_member_delete_overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !deleteBusy) {
                setDeleteConfirmOpen(false)
              }
            }}
          >
            <div
              className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_member_delete_modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={deleteTitleId}
            >
              <div className="um_modal_head add_contact_modal_head">
                <h3
                  id={deleteTitleId}
                  className="um_modal_title add_contact_modal_title"
                >
                  Delete email log entry?
                </h3>
                <button
                  type="button"
                  className="um_modal_close"
                  onClick={() => !deleteBusy && setDeleteConfirmOpen(false)}
                  disabled={deleteBusy}
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2} aria-hidden />
                </button>
              </div>
              <div className="deals_add_inv_modal_scroll">
                <p className="deals_suspend_all_modal_message">
                  Remove this email log for &quot;{label}&quot;? This cannot be
                  undone.
                </p>
              </div>
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleteBusy}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="button"
                  className="um_btn_primary deal_member_delete_confirm_btn"
                  onClick={() => void confirmDelete()}
                  disabled={deleteBusy}
                >
                  {deleteBusy ? (
                    <>
                      <Loader2 size={16} strokeWidth={2} aria-hidden />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      className="deal_inv_comm_row_actions"
      role="group"
      aria-label={`Actions for ${label}`}
    >
      {deleteModal}
      <div className="um_kebab_root" ref={wrapRef}>
        <button
          type="button"
          className="um_kebab_trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Actions"
          aria-label={`Actions for ${label}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
        </button>
        {menuOpen && typeof document !== "undefined"
          ? createPortal(
              <ul
                ref={menuRef}
                className="um_kebab_menu um_kebab_menu--portal"
                role="menu"
              >
                {onView ? (
                  <li role="none">
                    <button
                      type="button"
                      className={`um_kebab_menuitem${
                        hasRecipients ? "" : " um_kebab_menuitem_disabled"
                      }`}
                      role="menuitem"
                      disabled={!hasRecipients}
                      title={
                        hasRecipients
                          ? "View recipient list"
                          : "No recipients on this entry"
                      }
                      onClick={() => {
                        if (!hasRecipients) return
                        runMenuAction(() => onView(row))
                      }}
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
                ) : null}
                {canSendToInvestors ? (
                  <li role="none">
                    <button
                      type="button"
                      className="um_kebab_menuitem"
                      role="menuitem"
                      title="Send this email to your investors"
                      onClick={() => {
                        runMenuAction(() => onSendToInvestors?.(row))
                      }}
                    >
                      <Send
                        className="um_kebab_menuitem_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                      Send to my investors
                    </button>
                  </li>
                ) : null}
                {onResend && !canSendToInvestors ? (
                  <li role="none">
                    <button
                      type="button"
                      className={`um_kebab_menuitem${
                        canResend ? "" : " um_kebab_menuitem_disabled"
                      }`}
                      role="menuitem"
                      disabled={!canResend}
                      title={
                        canResend
                          ? "Compose and send again"
                          : "Not available for this entry"
                      }
                      onClick={() => {
                        if (!canResend) return
                        runMenuAction(() => onResend(row))
                      }}
                    >
                      {row.status === "sent" ? (
                        <Send
                          className="um_kebab_menuitem_icon"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                      ) : (
                        <Mail
                          className="um_kebab_menuitem_icon"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                      )}
                      Resend email
                    </button>
                  </li>
                ) : null}
                {onDelete ? (
                  <li role="none">
                    <button
                      type="button"
                      className="um_kebab_menuitem deals_kebab_menuitem_danger"
                      role="menuitem"
                      onClick={() => void runDelete()}
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
    </div>
  )
}
