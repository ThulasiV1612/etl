import { Archive, Activity, type LucideIcon } from "lucide-react"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import "./active-archived-tabs.css"

export type ActiveArchivedTab = "active" | "archived"

interface ActiveArchivedTabsProps {
  value: ActiveArchivedTab
  onChange: (tab: ActiveArchivedTab) => void
  activeCount: number
  archivedCount: number
  idPrefix: string
  ariaLabel: string
  activeIcon?: LucideIcon
  activePanelId?: string
  archivedPanelId?: string
  className?: string
}

export function ActiveArchivedTabs({
  value,
  onChange,
  activeCount,
  archivedCount,
  idPrefix,
  ariaLabel,
  activeIcon: ActiveIcon = Activity,
  activePanelId,
  archivedPanelId,
  className = "",
}: ActiveArchivedTabsProps) {
  const rootClass = [
    "um_members_tabs_outer",
    "deals_tabs_outer",
    "um_segmented_tabs_outer",
    "active_archived_tabs_outer",
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
            id={`${idPrefix}-active`}
            role="tab"
            aria-selected={value === "active"}
            aria-controls={activePanelId}
            aria-label={`Active, ${activeCount}`}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              value === "active" ? " um_members_tab_active" : ""
            }`}
            onClick={() => onChange("active")}
          >
            <ActiveIcon
              className="deals_tabs_icon um_segmented_tab_icon"
              size={16}
              strokeWidth={2}
              aria-hidden
            />
            <span className="deals_tabs_label um_segmented_tab_label">Active</span>
            <span className="deals_tabs_count" aria-hidden>
              ({activeCount})
            </span>
          </button>
          <button
            type="button"
            id={`${idPrefix}-archived`}
            role="tab"
            aria-selected={value === "archived"}
            aria-controls={archivedPanelId}
            aria-label={`Archived, ${archivedCount}`}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              value === "archived" ? " um_members_tab_active" : ""
            }`}
            onClick={() => onChange("archived")}
          >
            <Archive
              className="deals_tabs_icon um_segmented_tab_icon"
              size={16}
              strokeWidth={2}
              aria-hidden
            />
            <span className="deals_tabs_label um_segmented_tab_label">Archived</span>
            <span className="deals_tabs_count" aria-hidden>
              ({archivedCount})
            </span>
          </button>
        </div>
      </TabsScrollStrip>
    </div>
  )
}
