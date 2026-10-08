import type { LucideIcon } from "lucide-react"
import { useId } from "react"
import "@/common/components/tool-style-card/tool-style-card.css"
import { Sparkline, sparklineFromSeed } from "./Sparkline"

export type MetricTone = "blue" | "green" | "amber" | "violet" | "slate" | "rose"

/** Sparkline accent only — card chrome matches dashboard `ToolStyleCard` metric variant */
const TONE_SPARK_COLORS: Record<MetricTone, string> = {
  blue: "#d4af37",
  green: "#d4af37",
  amber: "#d4af37",
  violet: "#d4af37",
  slate: "#d4af37",
  rose: "#d4af37",
}

type MetricKpiCardProps = {
  label: string
  value: string
  icon: LucideIcon
  tone?: MetricTone
  footer?: string
  subfooter?: string
  loading?: boolean
  sparkSeed?: number
}

export function MetricKpiCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  footer,
  subfooter,
  loading = false,
  sparkSeed = 1,
}: MetricKpiCardProps) {
  const gradientId = useId()
  const sparkColor = TONE_SPARK_COLORS[tone]
  const points = sparklineFromSeed(sparkSeed)

  return (
    <article
      className={`tool_style_card tool_style_card--metric portal_metric_kpi_card pm_kpi_card${
        loading ? " tool_style_card--loading" : ""
      }`}
      aria-busy={loading}
    >
      <div className="tool_style_card_metric_header">
        <span className="tool_style_card_label_inline">{label}</span>
        <div className="tool_style_card_icon_box" aria-hidden>
          <Icon className="tool_style_card_icon" size={22} strokeWidth={1.75} />
        </div>
      </div>
      {loading ? (
        <div
          className="tool_style_card_value_loading tool_style_card_value_loading--metric"
          role="status"
          aria-label="Loading"
        >
          <span className="tool_style_card_value_skeleton" aria-hidden />
        </div>
      ) : (
        <p className="tool_style_card_value_lead pm_kpi_value">{value}</p>
      )}

      <div className="pm_kpi_spark_row" aria-hidden={loading}>
        {!loading ? (
          <Sparkline
            points={points}
            color={sparkColor}
            width={140}
            height={40}
            gradientId={gradientId}
          />
        ) : null}
      </div>

      {(footer || subfooter) && !loading ? (
        <div className="pm_kpi_footer">
          {footer ? <span className="pm_kpi_footer_main">{footer}</span> : null}
          {subfooter ? (
            <span className="pm_kpi_footer_sub">{subfooter}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
