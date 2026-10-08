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
import "../../deal-offering-details.css"

export const INVESTOR_CLASS_ASSET_TAG_ALL = "All"

export type InvestorClassAssetsMultiSelectProps = {
  controlId: string
  assetRows: DealAssetRow[]
  selectedTags: string[]
  disabled?: boolean
  onSelectedTagsChange: (tags: string[]) => void
}

type AssetListRow = DealAssetRow & { isAllOption?: boolean }

function allDealAssetIds(assetRows: readonly DealAssetRow[]): string[] {
  return assetRows.map((r) => r.id)
}

function isAllAssetsSelected(
  current: readonly string[],
  assetRows: readonly DealAssetRow[],
): boolean {
  if (current.includes(INVESTOR_CLASS_ASSET_TAG_ALL)) return true
  const ids = allDealAssetIds(assetRows)
  if (ids.length === 0) return false
  return ids.every((id) => current.includes(id))
}

function isInvestorClassAssetTagSelected(
  tagId: string,
  current: readonly string[],
  assetRows: readonly DealAssetRow[],
): boolean {
  if (tagId === INVESTOR_CLASS_ASSET_TAG_ALL) {
    return isAllAssetsSelected(current, assetRows)
  }
  return isAllAssetsSelected(current, assetRows) || current.includes(tagId)
}

function toggleInvestorClassAssetTag(
  current: readonly string[],
  tagId: string,
  assetRows: readonly DealAssetRow[],
): string[] {
  const assetIds = allDealAssetIds(assetRows)
  const allOn = isAllAssetsSelected(current, assetRows)

  if (tagId === INVESTOR_CLASS_ASSET_TAG_ALL) {
    return allOn ? [] : [INVESTOR_CLASS_ASSET_TAG_ALL]
  }

  if (allOn) {
    return assetIds.filter((id) => id !== tagId)
  }

  let next = current.filter((t) => t !== INVESTOR_CLASS_ASSET_TAG_ALL)
  if (next.includes(tagId)) next = next.filter((t) => t !== tagId)
  else next = [...next, tagId]

  if (assetIds.length > 0 && assetIds.every((id) => next.includes(id))) {
    return [INVESTOR_CLASS_ASSET_TAG_ALL]
  }
  return next
}

function chipLabelForTag(
  tag: string,
  assetRows: readonly DealAssetRow[],
): string {
  if (tag === INVESTOR_CLASS_ASSET_TAG_ALL) return "All"
  const row = assetRows.find((r) => r.id === tag)
  return row?.name.trim() || tag
}

export function InvestorClassAssetsMultiSelect({
  controlId,
  assetRows,
  selectedTags,
  disabled = false,
  onSelectedTagsChange,
}: InvestorClassAssetsMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const listRows: AssetListRow[] = useMemo(
    () => [
      {
        id: INVESTOR_CLASS_ASSET_TAG_ALL,
        name: "All",
        address: "Every asset in this deal",
        assetType: "",
        imageCount: 0,
        isAllOption: true,
      },
      ...assetRows,
    ],
    [assetRows],
  )

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return listRows.filter((r) => {
      if (!q) return true
      const blob = `${r.name} ${r.address} ${r.assetType}`.toLowerCase()
      return blob.includes(q)
    })
  }, [listRows, search])

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

  const toggleTag = useCallback(
    (tagId: string) => {
      if (disabled) return
      onSelectedTagsChange(
        toggleInvestorClassAssetTag(selectedTags, tagId, assetRows),
      )
    },
    [assetRows, disabled, onSelectedTagsChange, selectedTags],
  )

  const removeChip = useCallback(
    (tagId: string) => {
      if (disabled) return
      if (tagId === INVESTOR_CLASS_ASSET_TAG_ALL) {
        onSelectedTagsChange([])
        return
      }
      onSelectedTagsChange(
        toggleInvestorClassAssetTag(selectedTags, tagId, assetRows),
      )
    },
    [assetRows, disabled, onSelectedTagsChange, selectedTags],
  )

  const chipTags = useMemo(() => {
    if (isAllAssetsSelected(selectedTags, assetRows)) {
      return [INVESTOR_CLASS_ASSET_TAG_ALL]
    }
    return selectedTags.filter((t) => t !== INVESTOR_CLASS_ASSET_TAG_ALL)
  }, [assetRows, selectedTags])

  const clearAll = useCallback(() => {
    if (disabled) return
    onSelectedTagsChange([])
    setSearch("")
    inputRef.current?.focus()
  }, [disabled, onSelectedTagsChange])

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return
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
        if (row) toggleTag(row.id)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
      }
    },
    [disabled, filteredOptions, highlightedIndex, toggleTag],
  )

  const inputId = `${controlId}-assets-ms-input`
  const noDealAssets = assetRows.length === 0

  return (
    <div
      ref={rootRef}
      className="deal_ov_assets_ms deal_inv_ic_assets_ms"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <div
        className={`deal_ov_assets_ms_field${open ? " deal_ov_assets_ms_field_open" : ""}`}
      >
        <div className="deal_ov_assets_ms_field_inner">
          {chipTags.map((tag) => {
            const label = chipLabelForTag(tag, assetRows)
            return (
              <span key={tag} className="deal_ov_assets_ms_chip">
                <span className="deal_ov_assets_ms_chip_label">{label}</span>
                <button
                  type="button"
                  className="deal_ov_assets_ms_chip_remove"
                  disabled={disabled}
                  aria-label={`Remove ${label}`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    removeChip(tag)
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
                noDealAssets
                  ? "Add assets in the Assets section first"
                  : "Search or select assets…"
              }
              disabled={disabled}
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
            disabled={disabled || (chipTags.length === 0 && !search.trim())}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={(ev) => {
              ev.stopPropagation()
              clearAll()
            }}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {open && !disabled ? (
        <div
          id={listboxId}
          className="deal_ov_assets_ms_dropdown"
          role="listbox"
          aria-label="Assets for this class"
          aria-multiselectable="true"
        >
          {filteredOptions.length === 0 ? (
            <p className="deal_ov_assets_ms_empty">No matching assets.</p>
          ) : (
            filteredOptions.map((r, i) => {
              const isSelected = isInvestorClassAssetTagSelected(
                r.id,
                selectedTags,
                assetRows,
              )
              const isHi = i === highlightedIndex
              const label = r.name.trim() || "—"
              const rowId = `${controlId}-asset-opt-${r.id}`
              const sub =
                r.isAllOption
                  ? "Applies to every asset on this deal"
                  : r.address?.trim() || ""
              return (
                <div
                  key={r.id}
                  id={rowId}
                  className={`deal_ov_assets_ms_row${isHi ? " deal_ov_assets_ms_row_highlight" : ""}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => toggleTag(r.id)}
                >
                  <input
                    type="checkbox"
                    className="deal_ov_assets_ms_checkbox"
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden
                  />
                  <span className="deal_ov_assets_ms_row_text">
                    <span className="deal_ov_assets_ms_row_main">{label}</span>
                    {sub ? (
                      <span className="deal_ov_assets_ms_row_sub">{sub}</span>
                    ) : null}
                  </span>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
