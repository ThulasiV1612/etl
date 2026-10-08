import {
  Archive,
  ArchiveRestore,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  TrendingUp,
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
import { useNavigate } from "react-router-dom"
import "../tabs/deal_members/components/deal-member-row-actions.css"

interface DealRowActionsProps {
  dealId: string
  dealName: string
  archived?: boolean
  /**
   * Investing-mode list: only view deal (no preview modal, edit, archive, or delete).
   */
  readOnlyActions?: boolean
  /**
   * Session create-deal draft row: “Edit Deal” becomes “Continue editing”
   * (`/deals/create?resume=1`). Archive is disabled; Delete discards the session draft
   * after confirmation with a required reason.
   */
  draftRow?: boolean
  /** Deal lifecycle stage (e.g. `draft`) — used for delete confirmation copy. */
  dealStage?: string
  /** Opens read-only deal preview (e.g. modal). */
  onPreviewDeal?: () => void
  /** Investing list: open LP invest-now wizard (`/deals/:id/invest`). */
  onInvestNow?: () => void
  /** Pending list: resume saved Invest Now progress for a draft profile. */
  onResumeInvesting?: () => void
  onArchived?: () => void
  onRestored?: () => void
  /** Called after the user confirms with a non-empty reason (delete flow). */
  onDeleted?: (reason: string) => void
  /** When true, kebab stays visible but cannot open (no actions for this row). */
  actionsDisabled?: boolean
  /** Unpaid / expired SaaS — view, preview, and edit open the paywall instead. */
  saasAccessLocked?: boolean
  onSaasLocked?: () => void
  /** When false, hide Edit Deal (co-sponsor / LP on this deal). Default true. */
  canEditDeal?: boolean
}

export function DealRowActions({
  dealId,
  dealName,
  archived = false,
  readOnlyActions = false,
  draftRow = false,
  dealStage = "",
  onPreviewDeal,
  onInvestNow,
  onResumeInvesting,
  onArchived,
  onRestored,
  onDeleted,
  actionsDisabled = false,
  saasAccessLocked = false,
  onSaasLocked,
  canEditDeal = true,
}: DealRowActionsProps) {
  const navigate = useNavigate()
  const confirmTitleId = useId()
  const [open, setOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<
    null | "archive" | "delete" | "restore"
  >(null)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const closeConfirm = useCallback(() => {
    setConfirmKind(null)
    setReason("")
    setReasonError(null)
  }, [])

  useEffect(() => {
    if (!confirmKind) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeConfirm()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmKind, closeConfirm])

  useLayoutEffect(() => {
    if (!open || actionsDisabled) return

    function syncPosition() {
      const trigger = wrapRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const r = trigger.getBoundingClientRect()
      const mw = menu.offsetWidth || 180
      const mh = menu.offsetHeight || 120
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
  }, [open, actionsDisabled])

  useEffect(() => {
    if (!open || actionsDisabled) return
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

  function goContinueCreateDraft() {
    close()
    navigate("/deals/create?resume=1")
  }

  function handlePreviewDeal() {
    close()
    if (draftRow) {
      goContinueCreateDraft()
      return
    }
    if (saasAccessLocked) {
      onSaasLocked?.()
      return
    }
    onPreviewDeal?.()
  }

  function handleViewDeal() {
    close()
    if (draftRow) {
      goContinueCreateDraft()
      return
    }
    if (saasAccessLocked) {
      onSaasLocked?.()
      return
    }
    if (readOnlyActions && onPreviewDeal) {
      onPreviewDeal()
      return
    }
    navigate(`/deals/${encodeURIComponent(dealId)}`)
  }

  function handleInvestNow() {
    close()
    onInvestNow?.()
  }

  function handleResumeInvesting() {
    close()
    onResumeInvesting?.()
  }

  function handleEditDeal() {
    close()
    if (draftRow) {
      goContinueCreateDraft()
      return
    }
    if (saasAccessLocked) {
      onSaasLocked?.()
      return
    }
    navigate(`/deals/create?edit=${encodeURIComponent(dealId)}`)
  }

  function handleArchiveDeal() {
    close()
    if (draftRow) return
    setConfirmKind("archive")
  }

  function handleRestoreDeal() {
    close()
    if (draftRow) return
    setConfirmKind("restore")
  }

  function handleDeleteDeal() {
    close()
    setConfirmKind("delete")
  }

  function handleConfirmDangerAction() {
    if (confirmKind === "restore") {
      closeConfirm()
      onRestored?.()
      return
    }
    if (!reason.trim()) {
      setReasonError("Reason is required.")
      return
    }
    const kind = confirmKind
    const trimmedReason = reason.trim()
    closeConfirm()
    if (kind === "archive") {
      onArchived?.()
      return
    }
    onDeleted?.(trimmedReason)
  }

  const isLifecycleDraftDeal =
    !draftRow && String(dealStage ?? "").trim().toLowerCase() === "draft"

  const triggerTitle = actionsDisabled
    ? "No in-progress Invest Now draft for this investment"
    : undefined

  return (
    <div className="um_kebab_root" ref={wrapRef}>
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup={actionsDisabled ? undefined : "menu"}
        aria-expanded={actionsDisabled ? undefined : open}
        aria-disabled={actionsDisabled || undefined}
        disabled={actionsDisabled}
        title={triggerTitle}
        aria-label={`Actions for ${dealName.trim() || "deal"}${draftRow ? " (draft)" : ""}`}
        onClick={() => {
          if (actionsDisabled) return
          setOpen((v) => !v)
        }}
      >
        <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
      </button>
      {open && !actionsDisabled && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              className="um_kebab_menu um_kebab_menu--portal"
              role="menu"
            >
              {onPreviewDeal || draftRow ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={handlePreviewDeal}
                  >
                    <Eye className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                    Preview deal
                  </button>
                </li>
              ) : null}
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={handleViewDeal}
                >
                  <Eye className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  View deal
                </button>
              </li>
              {readOnlyActions && onResumeInvesting ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={handleResumeInvesting}
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
              ) : null}
              {readOnlyActions && onInvestNow ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={handleInvestNow}
                  >
                    <TrendingUp
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Invest now
                  </button>
                </li>
              ) : null}
              {!readOnlyActions ? (
                <>
                  {canEditDeal || draftRow ? (
                  <li role="none">
                    <button
                      type="button"
                      className="um_kebab_menuitem"
                      role="menuitem"
                      onClick={handleEditDeal}
                    >
                      <Pencil className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                      {draftRow ? "Continue editing" : "Edit Deal"}
                    </button>
                  </li>
                  ) : null}
                  <li role="none">
                    {archived ? (
                      <button
                        type="button"
                        className={`um_kebab_menuitem${draftRow ? " um_kebab_menuitem_disabled" : ""}`}
                        role="menuitem"
                        disabled={draftRow}
                        title={
                          draftRow
                            ? "Not available until the deal is saved"
                            : undefined
                        }
                        onClick={handleRestoreDeal}
                      >
                        <ArchiveRestore className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                        Restore deal
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`um_kebab_menuitem${draftRow ? " um_kebab_menuitem_disabled" : ""}`}
                        role="menuitem"
                        disabled={draftRow}
                        title={
                          draftRow
                            ? "Not available until the deal is saved"
                            : undefined
                        }
                        onClick={handleArchiveDeal}
                      >
                        <Archive className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                        Archive deal
                      </button>
                    )}
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      className="um_kebab_menuitem deals_kebab_menuitem_danger"
                      role="menuitem"
                      onClick={handleDeleteDeal}
                    >
                      <Trash2 className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                      Delete
                    </button>
                  </li>
                </>
              ) : null}
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
                      ? "Archive this deal?"
                      : confirmKind === "restore"
                        ? "Restore this deal?"
                        : draftRow
                          ? "Discard unsaved draft?"
                          : isLifecycleDraftDeal
                            ? "Delete this draft deal?"
                            : "Delete this deal?"}
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
                      ? `Archive “${dealName.trim() || "this deal"}”? It will move to Archives and can be restored later.`
                      : confirmKind === "restore"
                        ? `Restore “${dealName.trim() || "this deal"}” to active deals?`
                        : draftRow
                          ? `Discard the in-progress “${dealName.trim() || "Untitled deal"}” wizard? Unsaved work on this device will be cleared. This cannot be undone.`
                          : `Delete “${dealName.trim() || "this deal"}”? This action cannot be undone.`}
                  </p>
                  {confirmKind !== "restore" ? (
                    <>
                      <label className="deals_create_label" style={{ marginTop: "0.8em" }}>
                        <span className="form_label_inline_row">
                          Reason <span className="deal_inv_required">*</span>
                        </span>
                        <textarea
                          className="deals_create_input"
                          rows={3}
                          value={reason}
                          onChange={(e) => {
                            setReason(e.target.value)
                            if (reasonError) setReasonError(null)
                          }}
                          placeholder={
                            confirmKind === "archive"
                              ? "Why are you archiving this deal?"
                              : draftRow
                                ? "Why are you discarding this draft?"
                                : "Why are you deleting this deal?"
                          }
                        />
                      </label>
                      {reasonError ? (
                        <p className="deals_create_field_error" role="alert">
                          {reasonError}
                        </p>
                      ) : null}
                    </>
                  ) : null}
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
                    onClick={handleConfirmDangerAction}
                  >
                    {confirmKind === "archive" ? (
                      <>
                        <Archive size={16} strokeWidth={2} aria-hidden />
                        Archive
                      </>
                    ) : confirmKind === "restore" ? (
                      <>
                        <ArchiveRestore size={16} strokeWidth={2} aria-hidden />
                        Restore
                      </>
                    ) : draftRow ? (
                      <>
                        <Trash2 size={16} strokeWidth={2} aria-hidden />
                        Discard draft
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
        : null}
    </div>
  )
}
