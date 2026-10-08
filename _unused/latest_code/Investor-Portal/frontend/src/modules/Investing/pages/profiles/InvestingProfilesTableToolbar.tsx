import { Download, Search } from "lucide-react"

export function InvestingProfilesTableToolbar({
  onExport,
  exportDisabled,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  searchDisabled,
}: {
  onExport?: () => void
  exportDisabled?: boolean
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  searchAriaLabel: string
  searchDisabled?: boolean
}) {
  return (
    <div className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
      {onExport ? (
        <div className="um_toolbar_actions deal_inv_table_toolbar_actions">
          <button
            type="button"
            className="um_toolbar_export_btn"
            onClick={onExport}
            disabled={exportDisabled}
            aria-label="Export All"
          >
            <Download size={18} strokeWidth={2} aria-hidden />
            <span>Export All</span>
          </button>
        </div>
      ) : null}
      <div className="um_search_wrap">
        <Search className="um_search_icon" size={18} aria-hidden />
        <input
          type="search"
          className="um_search_input"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={searchAriaLabel}
          disabled={searchDisabled}
        />
      </div>
    </div>
  )
}
