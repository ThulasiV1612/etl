import { Download, Search, X } from "lucide-react"
import { ExportModalFooter } from "../../../../common/components/modal/ExportModalFooter"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "@/common/components/Toast"
import { buildTableExportFilename, downloadTableExportCsv } from "@/common/utils/tableExportFilename"
import { dealStageLabel } from "@/modules/Syndication/dealsDashboardUtils"
import type { InvestmentListRow } from "./investments.types"
import { formatAmountNumberExport } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import "@/modules/Syndication/Deals/components/export-deals-modal.css"

function buildInvestmentsExportCsv(rows: InvestmentListRow[]): string {
  const headers = [
    "Deal name",
    "Sponsor",
    "Deal stage",
    "Your role",
    "Deal type",
    "SEC type",
    "Property name",
    "Owning entity",
    "Start date",
    "Close date",
    "Invested as",
    "Investment",
    "Distributed amount",
    "Current valuation",
    "Action required",
  ]
  const esc = (v: string) => {
    const s = String(v ?? "").replace(/"/g, '""')
    return `"${s}"`
  }
  const lines = [headers.join(",")]
  for (const r of rows) {
    lines.push(
      [
        esc(r.investmentName),
        esc(r.dealSponsorName ?? ""),
        esc(dealStageLabel(r.status)),
        esc(r.viewerRolesLabel ?? ""),
        esc(r.dealType ?? ""),
        esc(r.secType ?? ""),
        esc(r.propertyName ?? ""),
        esc(r.owningEntityName ?? ""),
        esc(r.startDateDisplay ?? ""),
        esc(r.dealCloseDate),
        esc(r.investmentProfile),
        esc(formatAmountNumberExport(r.investedAmount)),
        esc(formatAmountNumberExport(r.distributedAmount)),
        esc(r.currentValuation),
        esc(r.actionRequired),
      ].join(","),
    )
  }
  return lines.join("\n")
}

interface ExportInvestmentsModalProps {
  open: boolean
  onClose: () => void
  investments: InvestmentListRow[]
}

export function ExportInvestmentsModal({
  open,
  onClose,
  investments,
}: ExportInvestmentsModalProps) {
  const [modalQuery, setModalQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setModalQuery("")
    setSelectedIds(new Set(investments.map((r) => r.id)))
  }, [open, investments])

  const visibleRows = useMemo(() => {
    const q = modalQuery.trim().toLowerCase()
    let list = [...investments]
    if (q)
      list = list.filter(
        (r) =>
          (r.investmentName ?? "").toLowerCase().includes(q) ||
          (r.offeringName ?? "").toLowerCase().includes(q),
      )
    list.sort((a, b) =>
      (a.investmentName ?? "").localeCompare(b.investmentName ?? ""),
    )
    return list
  }, [investments, modalQuery])

  const visibleIds = useMemo(
    () => visibleRows.map((r) => r.id),
    [visibleRows],
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
      if (allVisibleSelected) for (const id of visibleIds) next.delete(id)
      else for (const id of visibleIds) next.add(id)
      return next
    })
  }, [allVisibleSelected, visibleIds])

  function handleExportAll() {
    if (investments.length === 0) return
    const csv = buildInvestmentsExportCsv(investments)
    const filename = buildTableExportFilename({
      tableSlug: "investments",
      includeDateStamp: true,
    })
    downloadTableExportCsv(csv, filename)
    toast.success("Investments exported", `Saved as ${filename}`)
    onClose()
  }

  function handleExportSelected() {
    const chosen = investments.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    const csv = buildInvestmentsExportCsv(chosen)
    const filename = buildTableExportFilename({
      tableSlug: "investments",
      includeDateStamp: true,
    })
    downloadTableExportCsv(csv, filename)
    toast.success("Investments exported", `Saved as ${filename}`)
    onClose()
  }

  if (!open) return null

  return (
    <div className="deals_export_modal_overlay" role="presentation">
      <div
        ref={panelRef}
        className="deals_export_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="investments-export-modal-title"
      >
        <header className="deals_export_modal_head">
          <h2
            id="investments-export-modal-title"
            className="deals_export_modal_title"
          >
            Export investments
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
          Use <strong>Export all</strong> to download every row in this list, or search
          and select specific rows, then use <strong>Export selected</strong> (CSV).
        </p>

        <div className="deals_export_modal_search">
          <input
            type="search"
            className="deals_export_modal_search_input"
            placeholder="Search investments…"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            aria-label="Search investments in export list"
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
            aria-label={`Select all ${visibleRows.length} investment${visibleRows.length === 1 ? "" : "s"} shown`}
          />
          <span>
            Select all
            {visibleRows.length !== investments.length ? (
              <span className="deals_export_modal_select_all_meta">
                {" "}
                ({visibleRows.length} shown)
              </span>
            ) : null}
          </span>
        </label>

        <ul className="deals_export_modal_list" aria-label="Investments to export">
          {visibleRows.length === 0 ? (
            <li className="deals_export_modal_empty">
              No investments match your search.
            </li>
          ) : (
            visibleRows.map((row) => (
              <li key={row.id} className="deals_export_modal_row">
                <label className="deals_export_modal_row_label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleId(row.id)}
                    aria-label={`Select ${row.investmentName}`}
                  />
                  <span className="deals_export_modal_row_name">
                    {row.investmentName || "—"}
                  </span>
                  <span className="deals_export_modal_row_meta">
                    {row.offeringName || "—"}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>

        <ExportModalFooter onClose={onClose}>
          <button
            type="button"
            className="um_btn_secondary"
            onClick={handleExportSelected}
            disabled={selectedIds.size === 0}
          >
            Export selected
          </button>
          <button
            type="button"
            className="um_btn_primary"
            onClick={handleExportAll}
            disabled={investments.length === 0}
          >
            <Download size={16} strokeWidth={2} aria-hidden />
            Export all
          </button>
        </ExportModalFooter>
      </div>
    </div>
  )
}
