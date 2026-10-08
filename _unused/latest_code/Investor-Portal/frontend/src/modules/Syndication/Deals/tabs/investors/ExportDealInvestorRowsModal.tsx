import { Download, Search, X } from "lucide-react"
import { ExportModalFooter } from "../../../../../common/components/modal/ExportModalFooter"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "../../components/export-deals-modal.css"
import { formatMemberUsername } from "../../../usermanagement/memberAdminShared"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import { dealInvestorRowExportKey } from "../../utils/dealInvestorExportCsv"

export interface ExportDealInvestorRowsModalProps {
  open: boolean
  onClose: () => void
  /** Modal title (e.g. Export deal investors) */
  title: string
  /** Short hint under the title */
  hint: string
  searchPlaceholder: string
  searchAriaLabel: string
  listAriaLabel: string
  rows: DealInvestorRow[]
  /** Called with selected rows after user confirms export */
  onExportExcel: (selected: DealInvestorRow[]) => void
}

function rowDisplayLabel(row: DealInvestorRow): string {
  const n = String(row.displayName ?? "").trim()
  if (n && n !== "—") return n
  const e = String(row.userEmail ?? "").trim()
  if (e && e !== "—") return e
  const u = formatMemberUsername(row.userDisplayName)
  return u && u !== "—" ? u : "—"
}

function rowMetaLine(row: DealInvestorRow): string {
  const e = String(row.userEmail ?? "").trim()
  if (e && e !== "—") return e
  return formatMemberUsername(row.userDisplayName)
}

function searchHaystack(row: DealInvestorRow): string {
  return [
    row.displayName,
    row.entitySubtitle,
    row.userDisplayName,
    row.userEmail,
    row.investorRole,
    row.investorClass,
    row.status,
    row.addedByDisplayName,
    row.committed,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function ExportDealInvestorRowsModal({
  open,
  onClose,
  title,
  hint,
  searchPlaceholder,
  searchAriaLabel,
  listAriaLabel,
  rows,
  onExportExcel,
}: ExportDealInvestorRowsModalProps) {
  const [modalQuery, setModalQuery] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setModalQuery("")
    setSelectedKeys(new Set(rows.map((r) => dealInvestorRowExportKey(r))))
  }, [open, rows])

  const visibleRows = useMemo(() => {
    const q = modalQuery.trim().toLowerCase()
    let list = [...rows]
    if (q) {
      list = list.filter((r) => searchHaystack(r).includes(q))
    }
    list.sort((a, b) =>
      rowDisplayLabel(a).localeCompare(rowDisplayLabel(b)),
    )
    return list
  }, [rows, modalQuery])

  const keyForRow = useCallback(
    (row: DealInvestorRow) => dealInvestorRowExportKey(row),
    [],
  )

  const visibleKeys = useMemo(
    () => visibleRows.map((r) => keyForRow(r)),
    [visibleRows, keyForRow],
  )

  const allVisibleSelected =
    visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k))
  const someVisibleSelected = visibleKeys.some((k) => selectedKeys.has(k))

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

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) for (const k of visibleKeys) next.delete(k)
      else for (const k of visibleKeys) next.add(k)
      return next
    })
  }, [allVisibleSelected, visibleKeys])

  function handleExportExcel() {
    const keySet = selectedKeys
    const chosen = rows.filter((r) => keySet.has(keyForRow(r)))
    if (chosen.length === 0) return
    onExportExcel(chosen)
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
        aria-labelledby="deal-export-modal-title"
      >
        <header className="deals_export_modal_head">
          <h2 id="deal-export-modal-title" className="deals_export_modal_title">
            {title}
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

        <p className="deals_export_modal_hint">{hint}</p>

        <div className="deals_export_modal_search">
          <input
            type="search"
            className="deals_export_modal_search_input"
            placeholder={searchPlaceholder}
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            aria-label={searchAriaLabel}
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
            aria-label={`Select all ${visibleRows.length} row${visibleRows.length === 1 ? "" : "s"} shown`}
          />
          <span>
            Select all
            {visibleRows.length !== rows.length ? (
              <span className="deals_export_modal_select_all_meta">
                {" "}
                ({visibleRows.length} shown)
              </span>
            ) : null}
          </span>
        </label>

        <ul className="deals_export_modal_list" aria-label={listAriaLabel}>
          {visibleRows.length === 0 ? (
            <li className="deals_export_modal_empty">
              No rows match your search.
            </li>
          ) : (
            visibleRows.map((row) => {
              const k = keyForRow(row)
              return (
                <li key={k} className="deals_export_modal_row">
                  <label className="deals_export_modal_row_label">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(k)}
                      onChange={() => toggleKey(k)}
                      aria-label={`Select ${rowDisplayLabel(row)}`}
                    />
                    <span className="deals_export_modal_row_name">
                      {rowDisplayLabel(row)}
                    </span>
                    <span className="deals_export_modal_row_meta">
                      {rowMetaLine(row)}
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>

        <ExportModalFooter onClose={onClose}>
          <button
            type="button"
            className="um_btn_primary"
            onClick={handleExportExcel}
            disabled={selectedKeys.size === 0}
          >
            <Download size={16} strokeWidth={2} aria-hidden />
            Export to Excel
          </button>
        </ExportModalFooter>
      </div>
    </div>
  )
}
