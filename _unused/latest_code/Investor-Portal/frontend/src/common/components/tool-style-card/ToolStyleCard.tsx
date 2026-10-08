import { type LucideIcon, HelpCircle } from "lucide-react"
import type { ReactNode } from "react"
import "./tool-style-card.css"

interface ToolStyleCardProps {
  icon: LucideIcon
  title: string
  description: ReactNode
  footer?: ReactNode
  hintTitle?: string
  onClick?: () => void
  className?: string
  /** KPI row: label beside icon, large bold value (description), optional footer */
  variant?: "default" | "metric"
  /** Shows a skeleton loader in place of the value while data is loading */
  loading?: boolean
}

function ToolStyleCardValue({
  loading,
  description,
  metric,
}: {
  loading: boolean
  description: ReactNode
  metric: boolean
}) {
  if (loading) {
    return (
      <div
        className={
          metric
            ? "tool_style_card_value_loading tool_style_card_value_loading--metric"
            : "tool_style_card_value_loading"
        }
        role="status"
        aria-label="Loading"
      >
        <span className="tool_style_card_value_skeleton" aria-hidden />
      </div>
    )
  }

  if (metric) {
    return <p className="tool_style_card_value_lead">{description}</p>
  }

  return <p className="tool_style_card_desc">{description}</p>
}

export function ToolStyleCard({
  icon: Icon,
  title,
  description,
  footer,
  hintTitle,
  onClick,
  className = "",
  variant = "default",
  loading = false,
}: ToolStyleCardProps) {
  const rootClass = [
    "tool_style_card",
    variant === "metric" ? "tool_style_card--metric portal_metric_kpi_card" : "",
    loading ? "tool_style_card--loading" : "",
    onClick ? "tool_style_card_clickable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  const hintEl = hintTitle ? (
    <span
      className="tool_style_card_hint"
      title={hintTitle}
      aria-label={hintTitle}
    >
      <HelpCircle size={14} strokeWidth={2} />
    </span>
  ) : null

  const inner =
    variant === "metric" ? (
      <>
        <div className="tool_style_card_metric_header">
          <div className="tool_style_card_label_cluster">
            <span className="tool_style_card_label_inline">{title}</span>
            {hintEl}
          </div>
          <div className="tool_style_card_icon_box" aria-hidden>
            <Icon className="tool_style_card_icon" size={22} strokeWidth={1.75} />
          </div>
        </div>
        <ToolStyleCardValue loading={loading} description={description} metric />
        {footer && !loading ? (
          <div className="tool_style_card_footer">{footer}</div>
        ) : null}
      </>
    ) : (
      <>
        <div className="tool_style_card_icon_box" aria-hidden>
          <Icon className="tool_style_card_icon" size={22} strokeWidth={1.75} />
        </div>
        <div className="tool_style_card_title_row">
          <h3 className="tool_style_card_title">{title}</h3>
          {hintEl}
        </div>
        <ToolStyleCardValue loading={loading} description={description} metric={false} />
        {footer && !loading ? (
          <div className="tool_style_card_footer">{footer}</div>
        ) : null}
      </>
    )

  if (onClick) {
    return (
      <button
        type="button"
        className={rootClass}
        onClick={onClick}
        aria-busy={loading}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={rootClass} aria-busy={loading}>
      {inner}
    </div>
  )
}
