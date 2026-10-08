import {
  Archive,
  ArchiveRestore,
  Download,
  Eye,
  Landmark,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ConfirmDeleteModal } from "@/common/components/ConfirmDeleteModal"
import { toast } from "@/common/components/Toast"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/tabs/deal_members/components/deal-member-row-actions.css"

type RowEntityKind = "profile" | "beneficiary" | "address"

function labels(kind: RowEntityKind) {
  const noun =
    kind === "profile" ? "profile" : kind === "beneficiary" ? "beneficiary" : "address"
  return {
    viewTitle: `View ${noun}` as const,
    editTitle: `Edit ${noun}` as const,
    archiveTitle: `Archive ${noun}` as const,
    deleteTitle: `Delete ${noun}` as const,
    exportTitle: `Export ${noun}` as const,
  }
}

/**
 * Kebab (⋯) for Investing profiles tables: View, Edit, Archive, Delete, Export.
 * Pass `onView` / `onEdit` / `onExport` / `onDelete` to run real actions; archive uses `onSetArchived`.
 */
export function InvestingProfilesRowActions({
  displayName,
  kind,
  archived: archivedProp = false,
  incompleteDraft = false,
  onSetArchived,
  onView,
  onEdit,
  onExport,
  onDelete,
  onSetupPayouts,
  bankSetupLabel = "Add bank account",
  onUseExistingBank,
  useExistingBankLabel = "Use existing bank",
  onAddDifferentBank,
}: {
  displayName: string
  kind: RowEntityKind
  archived?: boolean
  /** Incomplete add-profile or session draft — show Resume instead of Edit. */
  incompleteDraft?: boolean
  onSetArchived?: (archived: boolean) => void | Promise<void>
  onView?: () => void
  onEdit?: () => void
  onExport?: () => void
  /** Hard-delete after confirmation. Shown when provided. */
  onDelete?: () => void | Promise<void>
  /** Opens hosted bank setup so this profile can receive ACH distributions. */
  onSetupPayouts?: () => void
  /** Menu label for bank setup (Add vs Update). */
  bankSetupLabel?: string
  /** Reuse a bank already linked on another profile. */
  onUseExistingBank?: () => void
  useExistingBankLabel?: string
  /** Start a new Stripe bank for this profile (different from shared ones). */
  onAddDifferentBank?: () => void
}) {
  const { viewTitle, editTitle, archiveTitle, deleteTitle, exportTitle } = labels(kind)
  const resumeLabel = incompleteDraft ? "Resume" : editTitle
  const archived = Boolean(archivedProp)
  const canToggleArchive = Boolean(onSetArchived)
  const canDelete = Boolean(onDelete)
  const nameFallback =
    kind === "profile" ? "Profile" : kind === "beneficiary" ? "Beneficiary" : "Address"
  const nameForMsg = (displayName?.trim() || nameFallback).replace(/"/g, "”")
  const a11yLabel = nameForMsg
  const [open, setOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const close = useCallback(() => setOpen(false), [])

  const apiHint = (action: string) =>
    `“${nameForMsg}” — connect API to ${action}.`

  const run = useCallback(
    (fn: () => void) => {
      close()
      fn()
    },
    [close],
  )

  const confirmDelete = useCallback(async () => {
    if (!onDelete) return
    setDeleteBusy(true)
    try {
      await Promise.resolve(onDelete())
      toast.success(deleteTitle, `“${nameForMsg}” was deleted.`)
      setDeleteConfirmOpen(false)
    } catch {
      /* parent shows the error toast */
    } finally {
      setDeleteBusy(false)
    }
  }, [onDelete, deleteTitle, nameForMsg])

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

  return (
    <>
    <div
      className="um_kebab_root"
      ref={wrapRef}
      role="group"
      aria-label={`Actions for ${a11yLabel}`}
    >
      <button
        type="button"
        className="um_kebab_trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
        aria-label={`Actions for ${a11yLabel}`}
        onClick={(e) => {
          e.stopPropagation()
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
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() =>
                    run(() => {
                      if (onView) onView()
                      else toast.success(viewTitle, apiHint("open details"))
                    })
                  }
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
              {kind === "profile" && onUseExistingBank ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={() => run(onUseExistingBank)}
                  >
                    <Landmark
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    {useExistingBankLabel}
                  </button>
                </li>
              ) : null}
              {kind === "profile" && onSetupPayouts ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={() => run(onSetupPayouts)}
                  >
                    <Landmark
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    {bankSetupLabel}
                  </button>
                </li>
              ) : null}
              {kind === "profile" && onAddDifferentBank ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem"
                    role="menuitem"
                    onClick={() => run(onAddDifferentBank)}
                  >
                    <Landmark
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Add different bank
                  </button>
                </li>
              ) : null}
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() =>
                    run(() => {
                      if (onEdit) onEdit()
                      else toast.success(resumeLabel, apiHint("edit"))
                    })
                  }
                >
                  {incompleteDraft ? (
                    <Play
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <Pencil
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  {resumeLabel}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() =>
                    run(() => {
                      if (!canToggleArchive || !onSetArchived) {
                        toast.success(archiveTitle, apiHint("archive"))
                        return
                      }
                      const next = !archived
                      void (async () => {
                        try {
                          await Promise.resolve(onSetArchived(next))
                          if (next) {
                            toast.success(
                              archiveTitle,
                              `“${nameForMsg}” is archived.`,
                            )
                          } else {
                            toast.success(
                              "Restored",
                              `“${nameForMsg}” is back in the active list.`,
                            )
                          }
                        } catch {
                          /* parent shows the error toast */
                        }
                      })()
                    })
                  }
                >
                  {archived && canToggleArchive ? (
                    <ArchiveRestore
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <Archive
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  {archived && canToggleArchive ? "Restore" : "Archive"}
                </button>
              </li>
              {canDelete ? (
                <li role="none">
                  <button
                    type="button"
                    className="um_kebab_menuitem deals_kebab_menuitem_danger"
                    role="menuitem"
                    onClick={() => {
                      close()
                      setDeleteConfirmOpen(true)
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
              ) : null}
              <li role="none">
                <button
                  type="button"
                  className="um_kebab_menuitem"
                  role="menuitem"
                  onClick={() =>
                    run(() => {
                      if (onExport) onExport()
                      else toast.success(exportTitle, apiHint("export"))
                    })
                  }
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
            </ul>,
            document.body,
          )
        : null}
    </div>
    <ConfirmDeleteModal
      open={deleteConfirmOpen}
      title={deleteTitle}
      message={`Are you sure you want to delete this ${kind}? This cannot be undone.`}
      itemLabel={nameForMsg}
      busy={deleteBusy}
      onCancel={() => {
        if (deleteBusy) return
        setDeleteConfirmOpen(false)
      }}
      onConfirm={() => void confirmDelete()}
    />
    </>
  )
}
