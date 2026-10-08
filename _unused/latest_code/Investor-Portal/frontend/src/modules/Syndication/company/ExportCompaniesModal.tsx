import { Download, Search, X } from "lucide-react"
import { ExportModalFooter } from "../../../common/components/modal/ExportModalFooter"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "../../../common/components/Toast"
import "../Deals/components/export-deals-modal.css"
import {
  buildCompaniesCsv,
  downloadCompaniesCsv,
  exportAuditLinesForCompanies,
  type CompanyExportRow,
} from "./companyCsv"
import { notifyCompaniesExportAudit } from "./companiesExportNotifyApi"
import { buildTableExportFilename } from "../../../common/utils/tableExportFilename"

interface ExportCompaniesModalProps {
  open: boolean
  onClose: () => void
  companies: CompanyExportRow[]
  /** Matches Customers page Active / Archived tab (copy and filename). */
  listKind?: "active" | "archived"
}

export function ExportCompaniesModal({
  open,
  onClose,
  companies,
  listKind = "active",
}: ExportCompaniesModalProps) {
  const [modalQuery, setModalQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setModalQuery("")
    setSelectedIds(new Set(companies.map((r) => r.id)))
  }, [open, listKind, companies])

  const visibleCompanies = useMemo(() => {
    const q = modalQuery.trim().toLowerCase()
    let list = [...companies]
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.name,
          r.id,
          String(r.dealCount ?? ""),
          String(r.userCount ?? ""),
          String(r.contactCount ?? ""),
          String(r.status ?? ""),
        ]
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
    }
    list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [companies, modalQuery])

  const visibleIds = useMemo(
    () => visibleCompanies.map((r) => r.id),
    [visibleCompanies],
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
    const chosen = companies.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    const csv = buildCompaniesCsv(chosen)
    const filename = buildTableExportFilename({
      tableSlug: listKind === "archived" ? "companies-archived" : "companies",
      includeDateStamp: true,
    })
    downloadCompaniesCsv(csv, filename)
    void notifyCompaniesExportAudit({
      rowCount: chosen.length,
      exportedCompanyLines: exportAuditLinesForCompanies(chosen),
    })
    toast.success("Companies exported", `Saved as ${filename}`)
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
        aria-labelledby="companies-export-modal-title"
      >
        <header className="deals_export_modal_head">
          <h2
            id="companies-export-modal-title"
            className="deals_export_modal_title"
          >
            {listKind === "archived"
              ? "Export archived companies"
              : "Export companies"}
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
            ? "Search and select archived companies, then export to Excel (CSV format)."
            : "Search and select companies, then export to Excel (CSV format)."}
        </p>

        <div className="deals_export_modal_search">
          <input
            type="search"
            className="deals_export_modal_search_input"
            placeholder="Search companies…"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            aria-label="Search companies in export list"
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
            aria-label={`Select all ${visibleCompanies.length} compan${visibleCompanies.length === 1 ? "y" : "ies"} shown`}
          />
          <span>
            Select all
            {visibleCompanies.length !== companies.length ? (
              <span className="deals_export_modal_select_all_meta">
                {" "}
                ({visibleCompanies.length} shown)
              </span>
            ) : null}
          </span>
        </label>

        <ul
          className="deals_export_modal_list"
          aria-label="Companies to export"
        >
          {visibleCompanies.length === 0 ? (
            <li className="deals_export_modal_empty">
              No companies match your search.
            </li>
          ) : (
            visibleCompanies.map((row) => (
              <li key={row.id} className="deals_export_modal_row">
                <label className="deals_export_modal_row_label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleId(row.id)}
                    aria-label={`Select ${row.name}`}
                  />
                  <span className="deals_export_modal_row_name">{row.name}</span>
                  <span className="deals_export_modal_row_meta">
                    {String(row.userCount ?? 0)} members ·{" "}
                    {String(row.dealCount ?? 0)} deals ·{" "}
                    {String(row.contactCount ?? 0)} contacts
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
