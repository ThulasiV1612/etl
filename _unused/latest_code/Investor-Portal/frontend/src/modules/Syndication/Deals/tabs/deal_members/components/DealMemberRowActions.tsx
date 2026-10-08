import {
  Banknote,
  Eye,
  FileSignature,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
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
import type { DealInvestorRow } from "../../../types/deal-investors.types"
import {
  investorEsignIsFullyCompletedForRow,
  investorEsignWasSent,
} from "../../../utils/investorEsignStatus"
import "../../../../usermanagement/user_management.css"
import "./deal-member-row-actions.css"

export interface DealMemberRowActionsProps {
  row: DealInvestorRow
  /** Open read-only details (parent may refetch roster first). */
  onView?: (row: DealInvestorRow) => void | Promise<void>
  onEdit: (row: DealInvestorRow) => void
  onCopyLink: (row: DealInvestorRow) => void
  /** Investors tab only: send eSign packet to this row’s email. */
  onSendEsign?: (row: DealInvestorRow) => void | Promise<void>
  /** When true, Send E-sign is shown but not clickable (e.g. no templates uploaded yet). */
  sendEsignDisabled?: boolean
  sendEsignDisabledTitle?: string
  onSendInvite: (row: DealInvestorRow) => void
  /** Return a promise so the confirm dialog can show a loading state until the API finishes. */
  onDelete: (row: DealInvestorRow) => void | Promise<void>
  /** If true (default), opens the portal confirm dialog before calling `onDelete`. */
  confirmBeforeDelete?: boolean
  /** Session draft row: first menu item is "Continue editing" (opens add-member flow). */
  draftRow?: boolean
  /** When true, the mail action label becomes “Re-send invitation mail”. */
  invitationMailSent?: boolean
  /** True while this row’s invitation email request is in flight. */
  invitationMailSending?: boolean
  /**
   * When false, “Copy offering link” is disabled (e.g. visibility is not “Only visible with link”).
   */
  offeringLinkAvailable?: boolean
  /** Deal lifecycle blocks offering preview link copy (e.g. Draft or Liquidated). */
  offeringLinkBlockedBecauseDraft?: boolean
  /** Investors tab: advance investment to “funding instructions sent” (optional). */
  onApproveFund?: (row: DealInvestorRow) => void | Promise<void>
  /** When true, “Approve fund” is disabled (e.g. LP-only roster row or busy). */
  approveFundDisabled?: boolean
  /** Optional tooltip when Approve fund is disabled. */
  approveFundDisabledTitle?: string
}

export function DealMemberRowActions({
  row,
  onView,
  onEdit,
  onCopyLink,
  onSendEsign,
  sendEsignDisabled = false,
  sendEsignDisabledTitle,
  onSendInvite,
  onDelete,
  confirmBeforeDelete = true,
  draftRow = false,
  invitationMailSent = false,
  invitationMailSending = false,
  offeringLinkAvailable = false,
  offeringLinkBlockedBecauseDraft = false,
  onApproveFund,
  approveFundDisabled = false,
  approveFundDisabledTitle,
}: DealMemberRowActionsProps) {
  const esignWasSent = investorEsignWasSent(row)
  const esignCompleted = investorEsignIsFullyCompletedForRow(row)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const deleteTitleId = useId()

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const memberLabel = row.displayName?.trim() || "member"

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
      if (e.key === "Escape" && !deleteBusy) {
        setDeleteConfirmOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deleteConfirmOpen, deleteBusy])

  async function runDelete() {
    if (confirmBeforeDelete) {
      setDeleteConfirmOpen(true)
      closeMenu()
      return
    }
    setDeleteBusy(true)
    try {
      await Promise.resolve(onDelete(row))
    } finally {
      setDeleteBusy(false)
    }
    closeMenu()
  }

  async function confirmDelete() {
    setDeleteBusy(true)
    try {
      await Promise.resolve(onDelete(row))
    } finally {
      setDeleteBusy(false)
      setDeleteConfirmOpen(false)
    }
  }

  function runMenuAction(fn: () => void) {
    fn()
    closeMenu()
  }

  async function runView() {
    if (!onView) return
    closeMenu()
    await Promise.resolve(onView(row))
  }

  const deleteModal =
    deleteConfirmOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_member_delete_overlay"
            role="presentation"
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
                  Remove member from deal?
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
                  Remove &quot;{memberLabel}&quot; from this deal? This cannot be
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
                      <Loader2
                        size={16}
                        strokeWidth={2}
                        className="deals_deal_view_spinner"
                        aria-hidden
                      />
                      Removing…
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      Remove member
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
      className="deal_member_row_actions"
      role="group"
      aria-label={`Actions for ${memberLabel}`}
    >
      {deleteModal}
      <div className="um_kebab_root" ref={wrapRef}>
        <button
          type="button"
          className="um_kebab_trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Actions"
          aria-label={`Actions for ${memberLabel}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
        </button>
        {menuOpen && typeof document !== "undefined"
          ? createPortal(
              <ul
                ref={menuRef}
                className="deal_member_row_actions_menu um_kebab_menu um_kebab_menu--portal"
                role="menu"
              >
                {onApproveFund ? (
                  <li role="none">
                    <button
                      type="button"
                      className={`um_kebab_menuitem${
                        draftRow || approveFundDisabled
                          ? " um_kebab_menuitem_disabled"
                          : ""
                      }`}
                      role="menuitem"
                      disabled={draftRow || approveFundDisabled}
                      title={approveFundDisabledTitle}
                      onClick={() => {
                        if (draftRow || approveFundDisabled) return
                        runMenuAction(() => void onApproveFund(row))
                      }}
                    >
                      <Banknote
                        className="um_kebab_menuitem_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                      Approve fund
                    </button>
                  </li>
                ) : null}
                {onView ? (
                  <li role="none">
                    <button
                      type="button"
                      className="um_kebab_menuitem"
                      role="menuitem"
                      onClick={() => void runView()}
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
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={() => runMenuAction(() => onEdit(row))}
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
                    className={`um_kebab_menuitem${
                      draftRow || !offeringLinkAvailable
                        ? " um_kebab_menuitem_disabled"
                        : ""
                    }`}
                    role="menuitem"
                    disabled={draftRow || !offeringLinkAvailable}
                    title={
                      offeringLinkBlockedBecauseDraft
                        ? "Change the deal stage before copying an offering preview link."
                        : !offeringLinkAvailable
                          ? 'Set visibility to “Only visible with link” in Offering Details to enable this link.'
                          : undefined
                    }
                    onClick={() => {
                      if (draftRow || !offeringLinkAvailable) return
                      runMenuAction(() => onCopyLink(row))
                    }}
                  >
                    <Link2
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Copy offering link
                  </button>
                </li>
                {onSendEsign && !esignCompleted ? (
                  <li role="none">
                    <button
                      type="button"
                      className={`um_kebab_menuitem${
                        draftRow || sendEsignDisabled
                          ? " um_kebab_menuitem_disabled"
                          : ""
                      }`}
                      role="menuitem"
                      disabled={draftRow || sendEsignDisabled}
                      title={
                        draftRow
                          ? "Available after the investor is saved"
                          : sendEsignDisabled
                            ? sendEsignDisabledTitle
                            : esignWasSent
                              ? "Re-send eSign documents to this investor"
                              : "Send eSign documents to this investor"
                      }
                      onClick={() => {
                        if (draftRow || sendEsignDisabled) return
                        runMenuAction(() => void onSendEsign(row))
                      }}
                    >
                      <FileSignature
                        className="um_kebab_menuitem_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                      {esignWasSent ? "Re-send E-sign" : "Send E-sign"}
                    </button>
                  </li>
                ) : null}
                <li role="none">
                  <button
                    type="button"
                    className={`um_kebab_menuitem${
                      draftRow || invitationMailSending
                        ? " um_kebab_menuitem_disabled"
                        : ""
                    }`}
                    role="menuitem"
                    disabled={draftRow || invitationMailSending}
                    title={
                      draftRow
                        ? "Available after the member is saved"
                        : invitationMailSending
                          ? "Sending invitation email"
                        : invitationMailSent
                          ? "Send another invitation email"
                          : undefined
                    }
                    onClick={() => {
                      if (draftRow || invitationMailSending) return
                      runMenuAction(() => onSendInvite(row))
                    }}
                  >
                    {invitationMailSending ? (
                      <Loader2
                        className="um_kebab_menuitem_icon deal_inv_mail_status_spin"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : draftRow || !invitationMailSent ? (
                      <Mail
                        className="um_kebab_menuitem_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : (
                      <Send
                        className="um_kebab_menuitem_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                    {draftRow
                      ? "Send invitation email"
                      : invitationMailSending
                        ? "Sending…"
                      : invitationMailSent
                        ? "Re-send invitation email"
                        : "Send invitation email"}
                  </button>
                </li>
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
              </ul>,
              document.body,
            )
          : null}
      </div>
    </div>
  )
}
