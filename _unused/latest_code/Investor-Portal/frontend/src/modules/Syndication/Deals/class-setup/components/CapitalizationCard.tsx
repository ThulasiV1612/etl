import {
  blurFormatMoneyInput,
  formatCurrencyUsdTypeInput,
} from "../../utils/offeringMoneyFormat"
import type { ClassSetupTotals } from "../utils/classSetupTotals"
import { formatMoney, formatPct } from "../utils/classSetupTotals"

interface CapitalizationCardProps {
  totals: ClassSetupTotals
  targetRaise: string
  onTargetRaiseChange: (value: string) => void
}

/** Compact KPI strip — Target raise is editable; Actually funded is from investments. */
export function CapitalizationCard({
  totals,
  targetRaise,
  onTargetRaiseChange,
}: CapitalizationCardProps) {
  const ownershipOk = Math.abs(totals.equityOwnershipTotal - 100) < 0.05
  const fundingWidth = Math.min(100, Math.max(0, totals.fundingPct))

  return (
    <section className="cs_metrics" aria-label="Capitalization">
      <div className="cs_metric">
        <span className="cs_metric_label">Target raise</span>
        <input
          className="cs_metric_input"
          type="text"
          inputMode="decimal"
          placeholder="$0"
          value={targetRaise}
          onChange={(e) =>
            onTargetRaiseChange(formatCurrencyUsdTypeInput(e.target.value))
          }
          onBlur={(e) =>
            onTargetRaiseChange(blurFormatMoneyInput(e.target.value))
          }
          aria-label="Target raise"
        />
      </div>
      <div className="cs_metric">
        <span className="cs_metric_label">Actually funded</span>
        <span
          className="cs_metric_value"
          title="Sum of fund-approved investments across classes"
        >
          {formatMoney(totals.actuallyFunded)}
        </span>
        <div className="cs_metric_bar" aria-hidden>
          <i style={{ width: `${fundingWidth}%` }} />
        </div>
        <span className="cs_metric_hint">
          {formatPct(totals.fundingPct)} of target · from investments
        </span>
      </div>
      <div className="cs_metric">
        <span className="cs_metric_label">Equity classes</span>
        <span className="cs_metric_value">{totals.equityClassCount}</span>
      </div>
      <div className="cs_metric">
        <span className="cs_metric_label">Fixed-return classes</span>
        <span className="cs_metric_value">{totals.fixedReturnClassCount}</span>
      </div>
      <div className="cs_metric">
        <span className="cs_metric_label">Equity ownership</span>
        <span
          className={`cs_metric_value${ownershipOk ? " is-ok" : " is-bad"}`}
        >
          {formatPct(totals.equityOwnershipTotal)}
        </span>
        <span className="cs_metric_hint">LP + GP must total 100%</span>
      </div>
    </section>
  )
}
