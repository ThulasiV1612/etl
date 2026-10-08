import { Download, Search, X } from "lucide-react"
import { ExportModalFooter } from "../../../../common/components/modal/ExportModalFooter"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "../../Deals/components/export-deals-modal.css"
import { notifyContactsExportAudit } from "../api/contactsApi"
import type { ContactRow } from "../types/contact.types"
import {
  buildContactsCsv,
  downloadContactsCsv,
  exportAuditLinesForContacts,
  formatContactSinceLabel,
} from "../utils/contactCsv"
import { buildTableExportFilename } from "../../../../common/utils/tableExportFilename"
import { displayEmail } from "../../../../common/utils/displayEmail"

interface ExportContactsModalProps {
  open: boolean
  onClose: () => void
  contacts: ContactRow[]
  /** Which list is being exported (affects title and download filename). */
  listKind?: "active" | "archived"
}

function contactDisplayName(c: ContactRow): string {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
  return n || c.email || "—"
}

export function ExportContactsModal({
  open,
  onClose,
  contacts,
  listKind = "active",
}: ExportContactsModalProps) {
  const [modalQuery, setModalQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setModalQuery("")
    setSelectedIds(new Set(contacts.map((r) => r.id)))
  }, [open, listKind, contacts])

  const visibleContacts = useMemo(() => {
    const q = modalQuery.trim().toLowerCase()
    let list = [...contacts]
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.firstName,
          r.lastName,
          r.email,
          r.phone,
          r.note,
          ...r.tags,
          ...r.lists,
          ...r.owners,
          r.createdByDisplayName ?? "",
          r.createdAt ?? "",
          formatContactSinceLabel(r.createdAt),
        ]
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
    }
    list.sort((a, b) =>
      contactDisplayName(a).localeCompare(contactDisplayName(b)),
    )
    return list
  }, [contacts, modalQuery])

  const visibleIds = useMemo(
    () => visibleContacts.map((r) => r.id),
    [visibleContacts],
  )

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = someVisibleSelected && !allVisibleSelected
  }, [someVisibleSelected, allVisibleSelected])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLInputElement>("input[type='search']")
        ?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected)
        for (const id of visibleIds) next.delete(id)
      else for (const id of visibleIds) next.add(id)
      return next
    })
  }, [allVisibleSelected, visibleIds])

  function handleExportExcel() {
    const chosen = contacts.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    const csv = buildContactsCsv(chosen)
    const filename = buildTableExportFilename({
      tableSlug: listKind === "archived" ? "contacts-archived" : "contacts",
      includeDateStamp: true,
    })
    downloadContactsCsv(csv, filename)
    void notifyContactsExportAudit({
      rowCount: chosen.length,
      exportedContactLines: exportAuditLinesForContacts(chosen),
    })
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="deals_export_modal_overlay"
      role="presentation"
    >
      <div
        ref={panelRef}
        className="deals_export_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contacts-export-modal-title"
      >
        <header className="deals_export_modal_head">
          <h2 id="contacts-export-modal-title" className="deals_export_modal_title">
            {listKind === "archived"
              ? "Export archived contacts"
              : "Export contacts"}
          </h2>
          <button
            type="button"
            className="deals_export_modal_close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <p className="deals_export_modal_hint">
          {listKind === "archived"
            ? "Search and select archived contacts, then export to Excel (CSV format)."
            : "Search and select active contacts, then export to Excel (CSV format)."}
        </p>

        <div className="deals_export_modal_search">
          <input
            type="search"
            className="deals_export_modal_search_input"
            placeholder="Search contacts…"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            aria-label="Search contacts in export list"
          />
          <Search
            className="deals_export_modal_search_icon"
            size={18}
            strokeWidth={2}
            aria-hidden
          />
        </div>

        <label className="deals_export_modal_select_all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            aria-label={`Select all ${visibleContacts.length} contact${visibleContacts.length === 1 ? "" : "s"} shown`}
          />
          <span>
            Select all
            {visibleContacts.length !== contacts.length ? (
              <span className="deals_export_modal_select_all_meta">
                {" "}
                ({visibleContacts.length} shown)
              </span>
            ) : null}
          </span>
        </label>

        <ul
          className="deals_export_modal_list"
          aria-label="Contacts to export"
        >
          {visibleContacts.length === 0 ? (
            <li className="deals_export_modal_empty">
              No contacts match your search.
            </li>
          ) : (
            visibleContacts.map((row) => (
              <li key={row.id} className="deals_export_modal_row">
                <label className="deals_export_modal_row_label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleId(row.id)}
                    aria-label={`Select ${contactDisplayName(row)}`}
                  />
                  <span className="deals_export_modal_row_name">
                    {contactDisplayName(row)}
                  </span>
                  <span className="deals_export_modal_row_meta">
                    {displayEmail(row.email)}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>

        <ExportModalFooter onClose={onClose}>
          <button
            type="button"
            className="um_btn_primary"
            onClick={handleExportExcel}
            disabled={selectedIds.size === 0}
          >
            <Download size={16} strokeWidth={2} aria-hidden />
            Export to Excel
          </button>
        </ExportModalFooter>
      </div>
    </div>
  )
}
