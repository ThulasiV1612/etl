import { Activity, CircleOff, LayoutGrid } from "lucide-react"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import "../active-archived-tabs/active-archived-tabs.css"

export type UsageFilterTab = "all" | "in_use" | "unused"

interface UsageFilterTabsProps {
  value: UsageFilterTab
  onChange: (tab: UsageFilterTab) => void
  allCount: number
  inUseCount: number
  unusedCount: number
  idPrefix: string
  ariaLabel: string
  className?: string
}

export function UsageFilterTabs({
  value,
  onChange,
  allCount,
  inUseCount,
  unusedCount,
  idPrefix,
  ariaLabel,
  className = "",
}: UsageFilterTabsProps) {
  const rootClass = [
    "um_members_tabs_outer",
    "deals_tabs_outer",
    "um_segmented_tabs_outer",
    "usage_filter_tabs_outer",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={rootClass}>
      <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
        <div
          className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
          role="tablist"
          aria-label={ariaLabel}
        >
          <button
            type="button"
            id={`${idPrefix}-all`}
            role="tab"
            aria-selected={value === "all"}
            aria-label={`All, ${allCount}`}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              value === "all" ? " um_members_tab_active" : ""
            }`}
            onClick={() => onChange("all")}
          >
            <LayoutGrid
              className="deals_tabs_icon um_segmented_tab_icon"
              size={16}
              strokeWidth={2}
              aria-hidden
            />
            <span className="deals_tabs_label um_segmented_tab_label">All</span>
            <span className="deals_tabs_count" aria-hidden>
              ({allCount})
            </span>
          </button>
          <button
            type="button"
            id={`${idPrefix}-in-use`}
            role="tab"
            aria-selected={value === "in_use"}
            aria-label={`In use, ${inUseCount}`}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              value === "in_use" ? " um_members_tab_active" : ""
            }`}
            onClick={() => onChange("in_use")}
          >
            <Activity
              className="deals_tabs_icon um_segmented_tab_icon"
              size={16}
              strokeWidth={2}
              aria-hidden
            />
            <span className="deals_tabs_label um_segmented_tab_label">
              In use
            </span>
            <span className="deals_tabs_count" aria-hidden>
              ({inUseCount})
            </span>
          </button>
          <button
            type="button"
            id={`${idPrefix}-unused`}
            role="tab"
            aria-selected={value === "unused"}
            aria-label={`Unused, ${unusedCount}`}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              value === "unused" ? " um_members_tab_active" : ""
            }`}
            onClick={() => onChange("unused")}
          >
            <CircleOff
              className="deals_tabs_icon um_segmented_tab_icon"
              size={16}
              strokeWidth={2}
              aria-hidden
            />
            <span className="deals_tabs_label um_segmented_tab_label">
              Unused
            </span>
            <span className="deals_tabs_count" aria-hidden>
              ({unusedCount})
            </span>
          </button>
        </div>
      </TabsScrollStrip>
    </div>
  )
}
