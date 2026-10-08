import {
  formatPeriodDateDdMmm,
  formatPeriodDateDdMmmYyyy,
} from "./utils/distributionListDisplay"

export interface DistributionPeriodCellProps {
  startIso: string
  endIso: string
  /** Calendar label above the range (e.g. "August 2026"). */
  periodName?: string | null
}

/**
 * Dense table Period cell: optional name + start → end with muted arrow.
 */
export function DistributionPeriodCell({
  startIso,
  endIso,
  periodName,
}: DistributionPeriodCellProps) {
  const name = String(periodName ?? "").trim()
  const startFull = formatPeriodDateDdMmmYyyy(startIso)
  const endFull = formatPeriodDateDdMmmYyyy(endIso)
  if (startFull === "—" && endFull === "—")
    return <span className="deal_dist_period_cell">—</span>

  const startShort = formatPeriodDateDdMmm(startIso)
  const endShort = formatPeriodDateDdMmm(endIso)
  const showName = Boolean(name)
  const startText = showName ? startShort : startFull
  const endText = showName ? endShort : endFull

  return (
    <span className="deal_dist_period_cell">
      {showName ? (
        <span className="deal_dist_period_name">{name}</span>
      ) : null}
      <span
        className="deal_dist_period_range"
        title={`${startFull} → ${endFull}`}
      >
        <span className="deal_dist_period_date">{startText}</span>
        <span className="deal_dist_period_arrow" aria-hidden>
          →
        </span>
        <span className="deal_dist_period_date">{endText}</span>
      </span>
    </span>
  )
}
