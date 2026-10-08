import { ChevronDown } from "lucide-react"

type DistributionNameClassMenuProps = {
  name: string
  expanded: boolean
  onToggle: () => void
  /** Noun in the accessible label, e.g. "classes" or "investors". */
  revealLabel?: string
}

/**
 * Distribution name + chevron, matching Offering Details → Classes accordion.
 */
export function DistributionNameClassMenu({
  name,
  expanded,
  onToggle,
  revealLabel = "classes",
}: DistributionNameClassMenuProps) {
  const label = name.trim() || "Distribution"
  return (
    <button
      type="button"
      className="deal_dist_name_toggle"
      aria-expanded={expanded}
      aria-label={
        expanded
          ? `Hide ${revealLabel} for ${label}`
          : `Show ${revealLabel} for ${label}`
      }
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <span className="deal_dist_name_toggle_label">{label}</span>
      <ChevronDown
        size={18}
        strokeWidth={2}
        aria-hidden
        className={`deal_dist_name_chevron${expanded ? " is-open" : ""}`}
      />
    </button>
  )
}
