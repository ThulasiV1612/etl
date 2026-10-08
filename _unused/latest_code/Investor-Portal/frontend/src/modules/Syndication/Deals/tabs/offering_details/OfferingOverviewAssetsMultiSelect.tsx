import { Search, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import type { DealAssetRow } from "../../types/deal-asset.types"

export type OfferingOverviewAssetsMultiSelectProps = {
  /** Stable id prefix for inputs (e.g. deal id). */
  controlId: string
  assetRows: DealAssetRow[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
}

export function OfferingOverviewAssetsMultiSelect({
  controlId,
  assetRows,
  selectedIds,
  onSelectedIdsChange,
}: OfferingOverviewAssetsMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assetRows.filter((r) => {
      if (!q) return true
      const blob = `${r.name} ${r.address} ${r.assetType}`.toLowerCase()
      return blob.includes(q)
    })
  }, [assetRows, search])

  const selectedRows = useMemo(
    () =>
      selectedIds
        .map((sid) => assetRows.find((r) => r.id === sid))
        .filter((r): r is DealAssetRow => r != null),
    [selectedIds, assetRows],
  )

  useEffect(() => {
    setHighlightedIndex((i) => {
      const max = Math.max(0, filteredOptions.length - 1)
      if (filteredOptions.length === 0) return 0
      return Math.min(i, max)
    })
  }, [filteredOptions.length, search, open])

  useEffect(() => {
    if (!open) return
    function onPtr(e: PointerEvent) {
      const el = rootRef.current
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPtr, true)
    return () => document.removeEventListener("pointerdown", onPtr, true)
  }, [open])

  const toggleId = useCallback(
    (assetId: string) => {
      const next = new Set(selectedIds)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      onSelectedIdsChange([...next])
    },
    [selectedIds, onSelectedIdsChange],
  )

  const removeChip = useCallback(
    (assetId: string) => {
      onSelectedIdsChange(selectedIds.filter((x) => x !== assetId))
    },
    [selectedIds, onSelectedIdsChange],
  )

  const clearAll = useCallback(() => {
    onSelectedIdsChange([])
    setSearch("")
    inputRef.current?.focus()
  }, [onSelectedIdsChange])

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setOpen(true)
        setHighlightedIndex((i) =>
          filteredOptions.length === 0
            ? 0
            : Math.min(i + 1, filteredOptions.length - 1),
        )
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setOpen(true)
        setHighlightedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        const row = filteredOptions[highlightedIndex]
        if (row) toggleId(row.id)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
      }
    },
    [filteredOptions, highlightedIndex, toggleId],
  )

  const inputId = `${controlId}-assets-ms-input`

  return (
    <div
      ref={rootRef}
      className="deal_ov_assets_ms"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <div
        className={`deal_ov_assets_ms_field${open ? " deal_ov_assets_ms_field_open" : ""}`}
      >
        <div className="deal_ov_assets_ms_field_inner">
          {selectedRows.map((r) => {
            const label = r.name.trim() || "—"
            return (
              <span key={r.id} className="deal_ov_assets_ms_chip">
                <span className="deal_ov_assets_ms_chip_label">{label}</span>
                <button
                  type="button"
                  className="deal_ov_assets_ms_chip_remove"
                  aria-label={`Remove ${label}`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    removeChip(r.id)
                  }}
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                </button>
              </span>
            )
          })}
          <div className="deal_ov_assets_ms_input_wrap">
            <Search
              size={17}
              strokeWidth={2}
              className="deal_ov_assets_ms_search_icon"
              aria-hidden
            />
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              className="deal_ov_assets_ms_input"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              placeholder={
                assetRows.length === 0
                  ? "No assets"
                  : "Search or select assets…"
              }
              disabled={assetRows.length === 0}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onInputKeyDown}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="deal_ov_assets_ms_clear"
            aria-label="Clear all selected assets"
            disabled={selectedIds.length === 0 && !search.trim()}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={clearAll}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {open && assetRows.length > 0 ? (
        <div
          id={listboxId}
          className="deal_ov_assets_ms_dropdown"
          role="listbox"
          aria-label="Assets"
          aria-multiselectable="true"
        >
          {filteredOptions.length === 0 ? (
            <p className="deal_ov_assets_ms_empty">No matching assets.</p>
          ) : (
            filteredOptions.map((r, i) => {
              const isSelected = selectedSet.has(r.id)
              const isHi = i === highlightedIndex
              const label = r.name.trim() || "—"
              const rowId = `${controlId}-asset-opt-${r.id}`
              return (
                <label
                  key={r.id}
                  htmlFor={rowId}
                  className={`deal_ov_assets_ms_row${isHi ? " deal_ov_assets_ms_row_highlight" : ""}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(ev) => ev.preventDefault()}
                >
                  <input
                    id={rowId}
                    type="checkbox"
                    className="deal_ov_assets_ms_checkbox"
                    checked={isSelected}
                    onChange={() => toggleId(r.id)}
                    tabIndex={-1}
                  />
                  <span className="deal_ov_assets_ms_row_text">
                    <span className="deal_ov_assets_ms_row_main">{label}</span>
                    {r.address?.trim() ? (
                      <span className="deal_ov_assets_ms_row_sub">
                        {r.address.trim()}
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
