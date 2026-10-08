export type DonutSegment = {
  id: string
  label: string
  value: number
  color: string
}

type DonutChartProps = {
  segments: DonutSegment[]
  size?: number
  strokeWidth?: number
  centerLabel?: string
  centerSub?: string
}

export function DonutChart({
  segments,
  size = 168,
  strokeWidth = 22,
  centerLabel,
  centerSub,
}: DonutChartProps) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0
    const dash = pct * circumference
    const gap = circumference - dash
    const rot = (offset / circumference) * 360 - 90
    offset += dash
    return { ...seg, dash, gap, rot, pct }
  })

  return (
    <div className="pm_donut_chart" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {arcs.map((a) =>
          a.value > 0 ? (
            <circle
              key={a.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={0}
              transform={`rotate(${a.rot} ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          ) : null,
        )}
      </svg>
      {(centerLabel || centerSub) && (
        <div className="pm_donut_center">
          {centerLabel ? <span className="pm_donut_center_val">{centerLabel}</span> : null}
          {centerSub ? <span className="pm_donut_center_sub">{centerSub}</span> : null}
        </div>
      )}
    </div>
  )
}
