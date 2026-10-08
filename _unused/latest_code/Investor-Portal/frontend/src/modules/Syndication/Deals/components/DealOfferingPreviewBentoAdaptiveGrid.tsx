import { Children, type ReactNode } from "react"

export interface DealOfferingPreviewBentoAdaptiveGridProps {
  children: ReactNode
  /** Extra class, e.g. `deal_offer_pf_bento_asset_grid` for asset-specific bento rules. */
  className?: string
  ariaLabel?: string
}

function isRenderableChild(c: ReactNode): boolean {
  if (c === null || c === undefined) return false
  if (typeof c === "boolean") return false
  return true
}

/** Bento grid that lays out 1–3 (or 4+) tiles with count-specific columns. */
export function DealOfferingPreviewBentoAdaptiveGrid({
  children,
  className = "",
  ariaLabel,
}: DealOfferingPreviewBentoAdaptiveGridProps) {
  const items = Children.toArray(children).filter(isRenderableChild)
  if (items.length === 0) return null

  const countKey = items.length >= 4 ? 4 : items.length

  return (
    <div
      className={`deal_offer_pf_bento_adaptive_grid deal_offer_pf_bento_adaptive_grid--count-${countKey}${className ? ` ${className}` : ""}`}
      role={ariaLabel ? "list" : undefined}
      aria-label={ariaLabel}
    >
      {items.map((child, index) => (
        <div
          key={index}
          className="deal_offer_pf_bento_adaptive_grid_cell"
          role={ariaLabel ? "listitem" : undefined}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

