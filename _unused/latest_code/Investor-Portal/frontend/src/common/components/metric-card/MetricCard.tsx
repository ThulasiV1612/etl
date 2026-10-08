import type { LucideIcon } from "lucide-react"
import { HelpCircle } from "lucide-react"
import type { ReactNode } from "react"
import "./metric-card.css"

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string
  footer?: ReactNode
  hintTitle?: string
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  footer,
  hintTitle,
}: MetricCardProps) {
  return (
    <article className="metric_card">
      <div className="metric_card_head">
        <span className="metric_card_icon_wrap" aria-hidden>
          <Icon className="metric_card_icon" size={22} strokeWidth={2} />
        </span>
        <div className="metric_card_label_row">
          <span className="metric_card_label">{label}</span>
          {hintTitle ? (
            <span
              className="metric_card_hint"
              title={hintTitle}
              aria-label={hintTitle}
            >
              <HelpCircle size={14} strokeWidth={2} />
            </span>
          ) : null}
        </div>
      </div>
      <p className="metric_card_value">{value}</p>
      {footer ? <div className="metric_card_footer">{footer}</div> : null}
    </article>
  )
}
