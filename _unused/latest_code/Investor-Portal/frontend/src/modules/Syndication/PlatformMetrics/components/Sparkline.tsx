type SparklineProps = {
  points: number[]
  color?: string
  className?: string
  height?: number
  width?: number
  gradientId?: string
}

/** Mini trend line for KPI cards (normalized 0–1 values). */
export function Sparkline({
  points,
  color = "#3b82f6",
  className = "",
  height = 36,
  width = 120,
  gradientId = "pm_spark_fill",
}: SparklineProps) {
  if (points.length < 2) return null

  const padX = 2
  const padY = 4
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * innerW
    const y = padY + (1 - p) * innerH
    return `${x},${y}`
  })

  const polyline = coords.join(" ")
  const area = `${padX},${height - padY} ${polyline} ${width - padX},${height - padY}`

  return (
    <svg
      className={`pm_sparkline ${className}`.trim()}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Deterministic decorative trend from a numeric seed (no time-series API yet). */
export function sparklineFromSeed(seed: number, count = 14): number[] {
  const pts: number[] = []
  let v = 0.35 + (seed % 47) / 120
  for (let i = 0; i < count; i++) {
    v += Math.sin(seed * 0.31 + i * 0.85) * 0.09
    v = Math.max(0.12, Math.min(0.88, v))
    pts.push(v)
  }
  return pts
}
