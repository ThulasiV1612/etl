import { LineChart, TrendingUp } from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import {
  fetchPlatformFunding,
  formatPlatformUsd,
  type FundingPeriod,
  type PlatformFundingSeries,
} from "../platformMetricsApi"

const PERIOD_OPTIONS: { value: FundingPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
]

function formatAxisUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

type FundPerformanceChartProps = {
  defaultPeriod?: FundingPeriod
}

export function FundPerformanceChart({
  defaultPeriod = "30d",
}: FundPerformanceChartProps) {
  const gradientId = useId().replace(/:/g, "")
  const [period, setPeriod] = useState<FundingPeriod>(defaultPeriod)
  const [series, setSeries] = useState<PlatformFundingSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: FundingPeriod) => {
    setLoading(true)
    setError(null)
    const result = await fetchPlatformFunding(p)
    if (result.ok) {
      setSeries(result.funding)
    } else {
      setSeries(null)
      setError(result.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(period)
  }, [period, load])

  const chart = useMemo(() => {
    const points = series?.points ?? []
    if (points.length === 0) return null

    const width = 720
    const height = 260
    const padL = 56
    const padR = 16
    const padT = 16
    const padB = 44
    const innerW = width - padL - padR
    const innerH = height - padT - padB

    const maxY = Math.max(
      ...points.map((p) => p.amountUsd),
      1,
    )
    const yTicks = 4
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
      (maxY * (yTicks - i)) / yTicks,
    )

    const coords = points.map((p, i) => {
      const x =
        padL +
        (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
      const y = padT + (1 - p.amountUsd / maxY) * innerH
      return { x, y, ...p }
    })

    const line = coords.map((c) => `${c.x},${c.y}`).join(" ")
    const area = `${coords[0]?.x ?? padL},${padT + innerH} ${line} ${
      coords[coords.length - 1]?.x ?? padL + innerW
    },${padT + innerH}`

    const labelStep =
      points.length > 14
        ? Math.ceil(points.length / 7)
        : points.length > 8
          ? 2
          : 1

    return {
      width,
      height,
      padL,
      padT,
      innerH,
      maxY,
      yTickValues,
      coords,
      line,
      area,
      labelStep,
    }
  }, [series])

  return (
    <article className="pm_panel pm_fund_panel" aria-label="Fund performance">
      <div className="pm_panel_head pm_fund_panel_head">
        <div className="pm_panel_title_row">
          <span className="pm_panel_icon pm_panel_icon_info" aria-hidden>
            <LineChart size={18} />
          </span>
          <div>
            <h3 className="pm_panel_title">Fund performance</h3>
            <p className="pm_fund_subtitle">
              Platform funding by period (approved and pending commitments)
            </p>
          </div>
        </div>
        {!loading && series ? (
          <span className="pm_panel_badge">
            In period:{" "}
            <strong>{formatPlatformUsd(series.totalInPeriodUsd)}</strong>
          </span>
        ) : null}
      </div>

      <div className="pm_period_tabs" role="tablist" aria-label="Time period">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={period === opt.value}
            className={`pm_period_tab${period === opt.value ? " pm_period_tab_active" : ""}`}
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="pm_fund_error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="pm_fund_chart_wrap" aria-busy={loading}>
        {loading ? (
          <p className="pm_fund_chart_state">Loading funding data…</p>
        ) : chart && chart.coords.length > 0 ? (
          <svg
            className="pm_fund_chart_svg"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Funding over time chart"
          >
            <defs>
              <linearGradient
                id={gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {chart.yTickValues.map((v, i) => {
              const y = chart.padT + (i / chart.yTickValues.length) * chart.innerH
              return (
                <g key={v}>
                  <line
                    x1={chart.padL}
                    y1={y}
                    x2={chart.width - 16}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                  <text
                    x={chart.padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="pm_fund_axis_label"
                  >
                    {formatAxisUsd(v)}
                  </text>
                </g>
              )
            })}
            <polygon points={chart.area} fill={`url(#${gradientId})`} />
            <polyline
              points={chart.line}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.coords.map((c) => (
              <circle
                key={c.bucket}
                cx={c.x}
                cy={c.y}
                r={4}
                fill="#fff"
                stroke="#3b82f6"
                strokeWidth={2}
              >
                <title>
                  {`${c.label}: ${formatPlatformUsd(c.amountUsd)} (${c.investmentCount} investments)`}
                </title>
              </circle>
            ))}
            {chart.coords.map((c, i) =>
              i % chart.labelStep === 0 || i === chart.coords.length - 1 ? (
                <text
                  key={`${c.bucket}-lbl`}
                  x={c.x}
                  y={chart.height - 12}
                  textAnchor="middle"
                  className="pm_fund_axis_label"
                >
                  {c.label}
                </text>
              ) : null,
            )}
          </svg>
        ) : (
          <p className="pm_fund_chart_state">
            <TrendingUp size={20} aria-hidden />
            No funding recorded for this period.
          </p>
        )}
      </div>

      {!loading && series ? (
        <div className="pm_fund_footer_stats">
          <span>
            Total funded (approved):{" "}
            <strong>{formatPlatformUsd(series.totalFundedAllTimeUsd)}</strong>
          </span>
          <span>
            Range: {series.from} – {series.to}
          </span>
        </div>
      ) : null}
    </article>
  )
}
