import { useMemo, useRef } from "react"
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import "./investor-class-pills.css"

export function parseInvestorClassTokens(raw: string): string[] {
  const s = raw.trim()
  if (!s || s === "—") return []
  return s
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

const MAX_VISIBLE_CLASS_PILLS = 2

export function InvestorClassPillsDisplay({
  pillSource,
  titleForTooltip,
  disableHoverTooltip = false,
}: {
  pillSource: string
  titleForTooltip: string
  /** When true, render pills only (no hover tooltip). */
  disableHoverTooltip?: boolean
}) {
  const tokens = useMemo(
    () => parseInvestorClassTokens(pillSource),
    [pillSource],
  )
  const rowRef = useRef<HTMLDivElement>(null)

  const overTwo = tokens.length > MAX_VISIBLE_CLASS_PILLS
  const visibleTokens = overTwo
    ? tokens.slice(0, MAX_VISIBLE_CLASS_PILLS)
    : tokens
  const hiddenTokens = overTwo
    ? tokens.slice(MAX_VISIBLE_CLASS_PILLS)
    : []
  const extraCount = hiddenTokens.length

  if (tokens.length === 0)
    return <span className="deal_inv_class_pill_muted">—</span>

  const row = (
    <div ref={rowRef} className="deal_inv_class_pills_row">
      {visibleTokens.map((t, i) => (
        <span key={`${i}-${t}`} className="deal_inv_class_pill">
          {t}
        </span>
      ))}
      {extraCount > 0 ? (
        <span
          className="deal_inv_class_pill deal_inv_class_pill_more"
          aria-hidden
        >
          +{extraCount}
        </span>
      ) : null}
    </div>
  )

  if (disableHoverTooltip) return row

  const tooltipPanel =
    overTwo && hiddenTokens.length > 0 ? (
      <ul className="deal_inv_class_tooltip_list">
        {hiddenTokens.map((t, i) => (
          <li key={`${i}-${t}`}>{t}</li>
        ))}
      </ul>
    ) : (
      <p className="deal_inv_class_tooltip_p">{titleForTooltip}</p>
    )

  return (
    <FormTooltip
      className="deal_inv_class_pills_tooltip_root deal_inv_class_pills_tooltip_always"
      label={titleForTooltip}
      content={tooltipPanel}
      placement="top"
      panelAlign="center"
      triggerMode="inline"
    >
      {row}
    </FormTooltip>
  )
}
