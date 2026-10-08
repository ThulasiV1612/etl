import { Download, Search, X } from "lucide-react"
import { ExportModalFooter } from "../../../../common/components/modal/ExportModalFooter"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "@/common/components/Toast"
import { buildTableExportFilename } from "@/common/utils/tableExportFilename"
import type { BeneficiaryDraft } from "./AddBeneficiaryModal"
import {
  buildBeneficiariesExportCsv,
  downloadExportCsv,
} from "./investingProfileBookExport"
import "@/modules/Syndication/Deals/components/export-deals-modal.css"

type BeneficiaryListRow = BeneficiaryDraft & { id: string; archived?: boolean }

interface ExportBeneficiariesModalProps {
  open: boolean
  onClose: () => void
  beneficiaries: BeneficiaryListRow[]
}

export function ExportBeneficiariesModal({
  open,
  onClose,
  beneficiaries,
}: ExportBeneficiariesModalProps) {
  const [modalQuery, setModalQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setModalQuery("")
    setSelectedIds(new Set(beneficiaries.map((r) => r.id)))
  }, [open, beneficiaries])

  const visibleRows = useMemo(() => {
    const q = modalQuery.trim().toLowerCase()
    let list = [...beneficiaries]
    if (q) {
      list = list.filter(
        (r) =>
          (r.fullName ?? "").toLowerCase().includes(q) ||
          (r.relationship ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q) ||
          (r.addressQuery ?? "").toLowerCase().includes(q) ||
          (r.taxId ?? "").toLowerCase().includes(q),
      )
    }
    list.sort((a, b) =>
      (a.fullName ?? "").localeCompare(b.fullName ?? "", undefined, {
        sensitivity: "base",
      }),
    )
    return list
  }, [beneficiaries, modalQuery])

  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])

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
    if (beneficiaries.length === 0) return
    const csv = buildBeneficiariesExportCsv(beneficiaries)
    const filename = buildTableExportFilename({
      tableSlug: "beneficiaries",
      includeDateStamp: true,
    })
    downloadExportCsv(csv, filename, true)
    toast.success("Beneficiaries exported", `Saved as ${filename}`)
    onClose()
  }

  function handleExportSelected() {
    const chosen = beneficiaries.filter((r) => selectedIds.has(r.id))
    if (chosen.length === 0) return
    const csv = buildBeneficiariesExportCsv(chosen)
    const filename = buildTableExportFilename({
      tableSlug: "beneficiaries",
      includeDateStamp: true,
    })
    downloadExportCsv(csv, filename, true)
    toast.success("Beneficiaries exported", `Saved as ${filename}`)
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
        aria-labelledby="beneficiaries-export-modal-title"
      >
        <header className="deals_export_modal_head">
          <h2
            id="beneficiaries-export-modal-title"
            className="deals_export_modal_title"
          >
            Export beneficiaries
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
          Use <strong>Export all</strong> to download every beneficiary in this list, or
          search and select rows, then <strong>Export selected</strong> (CSV).
        </p>

        <div className="deals_export_modal_search">
          <input
            type="search"
            className="deals_export_modal_search_input"
            placeholder="Search beneficiaries…"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            aria-label="Search beneficiaries in export list"
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
            aria-label={`Select all ${visibleRows.length} ${
              visibleRows.length === 1 ? "beneficiary" : "beneficiaries"
            } shown`}
          />
          <span>
            Select all
            {visibleRows.length !== beneficiaries.length ? (
              <span className="deals_export_modal_select_all_meta">
                {" "}
                ({visibleRows.length} shown)
              </span>
            ) : null}
          </span>
        </label>

        <ul
          className="deals_export_modal_list"
          aria-label="Beneficiaries to export"
        >
          {visibleRows.length === 0 ? (
            <li className="deals_export_modal_empty">
              No beneficiaries match your search.
            </li>
          ) : (
            visibleRows.map((row) => (
              <li key={row.id} className="deals_export_modal_row">
                <label className="deals_export_modal_row_label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleId(row.id)}
                    aria-label={`Select ${row.fullName || "beneficiary"}`}
                  />
                  <span className="deals_export_modal_row_name">
                    {row.fullName || "—"}
                  </span>
                  <span className="deals_export_modal_row_meta">
                    {row.relationship || "—"} · {row.email || "—"}
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
            disabled={beneficiaries.length === 0}
          >
            <Download size={16} strokeWidth={2} aria-hidden />
            Export all
          </button>
        </ExportModalFooter>
      </div>
    </div>
  )
}
