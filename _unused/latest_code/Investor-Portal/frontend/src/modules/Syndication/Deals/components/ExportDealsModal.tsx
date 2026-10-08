import { Download, Search, X } from "lucide-react"
import { ExportModalFooter } from "../../../../common/components/modal/ExportModalFooter"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { dealStageLabel } from "../../dealsDashboardUtils"
import { toast } from "../../../../common/components/Toast"
import { buildTableExportFilename } from "../../../../common/utils/tableExportFilename"
import { notifyDealsExportAudit } from "../api/dealsExportNotifyApi"
import type { DealListRow } from "../types/deals.types"
import {
  buildDealsListExportCsv,
  downloadDealsListExportCsv,
  exportAuditLinesForDealListRows,
} from "../utils/dealsListExportCsv"
import "./export-deals-modal.css"

interface ExportDealsModalProps {
  open: boolean
  onClose: () => void
  deals: DealListRow[]
}

export function ExportDealsModal({
  open,
  onClose,
  deals,
}: ExportDealsModalProps) {
  const [modalQuery, setModalQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setModalQuery("")
    setSelectedIds(new Set(deals.map((r) => r.id)))
  }, [open, deals])

  const visibleDeals = useMemo(() => {
    const q = modalQuery.trim().toLowerCase()
    let list = [...deals]
    if (q)
      list = list.filter((r) => r.dealName.toLowerCase().includes(q))
    list.sort((a, b) => a.dealName.localeCompare(b.dealName))
    return list
  }, [deals, modalQuery])

  const visibleIds = useMemo(
    () => visibleDeals.map((r) => r.id),
    [visibleDeals],
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
      panelRef.current?.querySelector<HTMLInputElement>("input[type='search']")?.focus()
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
    const chosen = deals.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    const csv = buildDealsListExportCsv(chosen)
    const filename =
      chosen.length === 1
        ? buildTableExportFilename({ dealName: chosen[0]!.dealName })
        : buildTableExportFilename({ tableSlug: "deals", includeDateStamp: true })
    downloadDealsListExportCsv(csv, filename)
    void notifyDealsExportAudit({
      rowCount: chosen.length,
      exportedDealLines: exportAuditLinesForDealListRows(chosen),
    })
    toast.success("Deals exported", `Saved as ${filename}`)
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
        aria-labelledby="deals-export-modal-title"
      >
        <header className="deals_export_modal_head">
          <h2 id="deals-export-modal-title" className="deals_export_modal_title">
            Export deals
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
          Search and select deals, then export to Excel (CSV format).
        </p>

        <div className="deals_export_modal_search">
          <input
            type="search"
            className="deals_export_modal_search_input"
            placeholder="Search deals…"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            aria-label="Search deals in export list"
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
            aria-label={`Select all ${visibleDeals.length} deal${visibleDeals.length === 1 ? "" : "s"} shown`}
          />
          <span>
            Select all
            {visibleDeals.length !== deals.length ? (
              <span className="deals_export_modal_select_all_meta">
                {" "}
                ({visibleDeals.length} shown)
              </span>
            ) : null}
          </span>
        </label>

        <ul
          className="deals_export_modal_list"
          aria-label="Deals to export"
        >
          {visibleDeals.length === 0 ? (
            <li className="deals_export_modal_empty">No deals match your search.</li>
          ) : (
            visibleDeals.map((row) => (
              <li key={row.id} className="deals_export_modal_row">
                <label className="deals_export_modal_row_label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleId(row.id)}
                    aria-label={`Select ${row.dealName}`}
                  />
                  <span className="deals_export_modal_row_name">{row.dealName}</span>
                  <span className="deals_export_modal_row_meta">
                    {dealStageLabel(row.dealStage)}
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
