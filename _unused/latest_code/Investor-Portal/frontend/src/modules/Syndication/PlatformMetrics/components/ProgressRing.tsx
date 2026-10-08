type ProgressRingProps = {
  percent: number
  label: string
  sublabel?: string
  color?: string
  size?: number
}

export function ProgressRing({
  percent,
  label,
  sublabel,
  color = "#3b82f6",
  size = 200,
}: ProgressRingProps) {
  const stroke = 14
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const dash = (clamped / 100) * circumference

  return (
    <div className="pm_progress_ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="pm_progress_ring_center">
        <span className="pm_progress_ring_val">{label}</span>
        {sublabel ? (
          <span className="pm_progress_ring_sub">{sublabel}</span>
        ) : null}
      </div>
    </div>
  )
}
