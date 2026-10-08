import { AlertTriangle, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  DropdownSelect,
} from "../../../../../common/components/dropdown-select"
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import { useHorizontalScrollRegion } from "../../../../../common/hooks/useHorizontalScrollRegion"
import { FloatingTableHScroll } from "../../../../../common/components/data-table/FloatingTableHScroll"
import {
  blurFormatMoneyInput,
  formatCurrencyTableDisplay,
  formatCurrencyUsdTypeInput,
  parseMoneyDigits,
} from "../../utils/offeringMoneyFormat"
import type {
  DistributionSetupClass,
  PriorDistributionRecord,
} from "../types/distribution-setup.types"
import { CLASS_TYPE_TONE } from "../types/distribution-setup.types"
import type { SimResult, PreferredDayCountMode } from "../utils/distributionSim"
import { formatMoneyCents } from "../utils/distributionSim"
import type { HurdleEvaluation } from "../utils/hurdleCalculations"

const CASH_PRESETS = ["15000", "25000", "50000"] as const

const ACTUAL_365_INFO =
  "Uses actual calendar days elapsed, divided by 365. Preferred / CoC accrues as capital × rate × days ÷ 365 with no compounding."

function PreferredDayCountLabel() {
  return (
    <span className="ds_field_label_with_tip">
      <span>Preferred day count</span>
      <FormTooltip
        label="About Actual/365"
        content={<p>{ACTUAL_365_INFO}</p>}
        placement="top"
        panelAlign="end"
        openOnHover
        nativeButtonTrigger={false}
      />
    </span>
  )
}

interface DistributionSimPanelProps {
  cash: string
  periodFactor: string
  onCashChange: (v: string) => void
  onPeriodChange: (v: string) => void
  sim: SimResult
  classes: DistributionSetupClass[]
  stageMet: Record<number, boolean>
  onToggleStageMet: (stage: number, met: boolean) => void
  onDueOverride: (rowId: string, value: string) => void
  rowIds: string[]
  investmentDate: string
  onInvestmentDateChange: (v: string) => void
  /** Where the current investment date was loaded from (for UI hint). */
  investmentDateSource?: "close" | "funded" | "none"
  /** Distribution / payment as-of date — drives period window (actual/365). */
  distributionDate: string
  onDistributionDateChange: (v: string) => void
  periodStart: string
  periodEnd: string
  onPeriodStartChange: (v: string) => void
  onPeriodEndChange: (v: string) => void
  priorDistributions: PriorDistributionRecord[]
  investedCapital: number
  setupName: string
  onSetupNameChange: (v: string) => void
  distributionRunName: string
  onDistributionRunNameChange: (v: string) => void
  dayCountMode: PreferredDayCountMode
  onDayCountModeChange: (v: PreferredDayCountMode) => void
  /** Other (manual) adjustments after waterfall — Woodland ± class Other. */
  otherAdjustment: string
  onOtherAdjustmentChange: (v: string) => void
  /**
   * Final class totals for "Who receives what".
   * Prefer SUM(investor payments) + Other from the allocation engine.
   * Falls back to sim.perClass when omitted.
   */
  classDisplayTotals?: Record<string, number>
  completing?: boolean
  onComplete?: () => void
  /** Button label when recording / updating a run. */
  completeLabel?: string
  /**
   * `test` — full-width inputs (name, cash, period, complete).
   * `results` — Who receives what + How the cash flows (beside waterfall).
   * Omit / `all` — legacy single-column panel (both).
   */
  section?: "test" | "results" | "all"
}

function formatMetricPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${(n * 100).toFixed(1)}%`
}

export function DistributionSimPanel({
  cash,
  periodFactor,
  onCashChange,
  onPeriodChange,
  sim,
  classes,
  stageMet,
  onToggleStageMet,
  onDueOverride,
  rowIds,
  investmentDate,
  onInvestmentDateChange,
  investmentDateSource = "none",
  distributionDate,
  onDistributionDateChange,
  periodStart,
  periodEnd,
  onPeriodStartChange,
  onPeriodEndChange,
  priorDistributions,
  investedCapital,
  setupName,
  onSetupNameChange,
  distributionRunName,
  onDistributionRunNameChange,
  dayCountMode: _dayCountMode,
  onDayCountModeChange: _onDayCountModeChange,
  otherAdjustment,
  onOtherAdjustmentChange,
  classDisplayTotals,
  completing = false,
  onComplete,
  completeLabel,
  section = "all",
}: DistributionSimPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const displayTotals = classDisplayTotals ?? sim.perClass
  const recipients = classes.filter((c) => {
    const fromInvestors = displayTotals[c.id]
    const fromWaterfall = sim.perClass[c.id]
    const amount =
      fromInvestors != null && fromInvestors > 0.004
        ? fromInvestors
        : (fromWaterfall ?? 0)
    return amount > 0.5
  })
  function classTotal(classId: string): number {
    const fromInvestors = displayTotals[classId]
    if (fromInvestors != null && fromInvestors > 0.004) return fromInvestors
    return sim.perClass[classId] ?? 0
  }
  const evaluations = sim.hurdleEvaluations ?? []
  const cashAmount = (() => {
    const n = parseMoneyDigits(cash)
    return Number.isFinite(n) ? n : 0
  })()
  const canComplete = Boolean(onComplete) && cashAmount > 0 && !completing

  /* Period / day-count hint copy — re-enable with the hint block below when needed:
  const periodHint =
    periodFactor === "1"
      ? "Annual window ending on the distribution date"
      : periodFactor === "0.083333"
        ? "Monthly window containing the distribution date"
        : "Quarterly window containing the distribution date"

  const dayCountHint =
    dayCountMode === "from_accrual_start"
      ? "Days count from accrual / investment date through period end (e.g. Wildflower)."
      : "Days count only inside the period window (e.g. Woodland quarterly)."
  */

  const showTest = section === "test" || section === "all"
  const showResults = section === "results" || section === "all"
  const prevFlowPaymentCountRef = useRef(0)
  const flowScrollRef = useRef<HTMLDivElement>(null)

  useHorizontalScrollRegion(
    flowScrollRef,
    [showResults, sim.flowRows.length],
    {
      hoverVerticalToHorizontal: false,
      edgeScroll: false,
    },
  )

  useEffect(() => {
    if (!showResults) return
    const paymentCount = sim.flowRows.filter((r) => r.kind === "payment").length
    if (paymentCount <= prevFlowPaymentCountRef.current) {
      prevFlowPaymentCountRef.current = paymentCount
      return
    }
    prevFlowPaymentCountRef.current = paymentCount
    const lastPaymentId = rowIds[rowIds.length - 1]
    if (!lastPaymentId) return
    requestAnimationFrame(() => {
      document
        .getElementById(`ds-flow-row-${lastPaymentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [showResults, sim.flowRows, rowIds])

  const testBlock = showTest ? (
    <>
      <div className="ds_sim_head">
        <h2>Test a distribution</h2>
      </div>

      <div className="ds_sim_inputs ds_sim_inputs_test">
        <div className="ds_sim_row ds_sim_row_primary">
          <label className="ds_field">
            <span>Distribution name</span>
            <input
              type="text"
              placeholder="e.g. Q2 2026 Distribution"
              value={distributionRunName}
              onChange={(e) => onDistributionRunNameChange(e.target.value)}
              aria-label="Distribution name"
            />
          </label>
          <label className="ds_field">
            <span>Cash available</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="$0.00"
              value={cash}
              onChange={(e) =>
                onCashChange(formatCurrencyUsdTypeInput(e.target.value))
              }
              onBlur={(e) =>
                onCashChange(blurFormatMoneyInput(e.target.value))
              }
            />
          </label>
          <label className="ds_field">
            <span>Period</span>
            <DropdownSelect
              className="ds_dropdown"
              value={periodFactor}
              options={[
                { value: "0.083333", label: "Monthly" },
                { value: "0.25", label: "Quarterly" },
                { value: "1", label: "Annual" },
              ]}
              onChange={onPeriodChange}
              ariaLabel="Period"
              useFixedPanel
            />
          </label>
        </div>
        <div className="ds_sim_row ds_sim_row_dates">
          <label className="ds_field">
            <span>Distribution date</span>
            <input
              type="date"
              value={distributionDate}
              onChange={(e) => onDistributionDateChange(e.target.value)}
              aria-label="Distribution date"
            />
          </label>
          <label className="ds_field">
            <span>Start date</span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => onPeriodStartChange(e.target.value)}
              aria-label="Period start date"
            />
          </label>
          <label className="ds_field">
            <span>End date</span>
            <input
              type="date"
              value={periodEnd}
              min={periodStart || undefined}
              onChange={(e) => onPeriodEndChange(e.target.value)}
              aria-label="Period end date"
            />
          </label>
          <label className="ds_field">
            <PreferredDayCountLabel />
            <input
              type="text"
              readOnly
              tabIndex={-1}
              value="Actual/365"
              aria-label="Preferred day count"
              className="ds_day_count_readonly"
            />
          </label>
        </div>
        {/* Period / day-count hint — re-enable when needed:
        <p className="ds_muted ds_sim_hint ds_period_hint ds_field_span">
          {periodHint}. {dayCountHint}
          {sim.priorCashInPeriod > 0
            ? ` · ${formatMoneyCents(sim.priorCashInPeriod)} already distributed in this window`
            : ""}
          {sim.preferredHurdleUnpaid
            ? " · preferred/CoC unpaid — later promote blocked"
            : ""}
        </p>
        */}
        <div className="ds_presets_row">
          <div className="ds_presets">
            <span>Try:</span>
            {CASH_PRESETS.map((v) => {
              const formatted = blurFormatMoneyInput(v)
              return (
                <button
                  key={v}
                  type="button"
                  className="ds_preset_btn"
                  onClick={() => onCashChange(formatted)}
                >
                  {formatted}
                </button>
              )
            })}
          </div>
          {onComplete ? (
            <button
              type="button"
              className="ds_primary_btn ds_complete_btn"
              disabled={!canComplete}
              onClick={onComplete}
              title={
                cashAmount > 0
                  ? completeLabel?.toLowerCase().includes("update")
                    ? "Update this distribution with the current details"
                    : "Record this cash as a completed distribution"
                  : "Enter cash available greater than $0 to complete"
              }
            >
              {completing
                ? completeLabel?.toLowerCase().includes("update")
                  ? "Updating…"
                  : "Completing…"
                : completeLabel || "Complete distribution"}
            </button>
          ) : null}
        </div>
      </div>

      <details
        className="ds_advanced"
        open={advancedOpen}
        onToggle={(e) =>
          setAdvancedOpen((e.target as HTMLDetailsElement).open)
        }
      >
        <summary className="ds_advanced_summary">
          <ChevronDown size={16} strokeWidth={2} aria-hidden />
          Advanced settings
        </summary>
        <div className="ds_advanced_body">
          <div className="ds_sim_inputs ds_sim_inputs_advanced">
            <label className="ds_field ds_field_name">
              <span>Distribution setup name</span>
              <input
                type="text"
                placeholder="Internal setup label"
                value={setupName}
                onChange={(e) => onSetupNameChange(e.target.value)}
                aria-label="Distribution setup name"
              />
            </label>
            <label className="ds_field">
              <span>Other (manual)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="$0.00"
                value={otherAdjustment}
                onChange={(e) =>
                  onOtherAdjustmentChange(
                    formatCurrencyUsdTypeInput(e.target.value),
                  )
                }
                onBlur={(e) =>
                  onOtherAdjustmentChange(
                    blurFormatMoneyInput(e.target.value),
                  )
                }
                aria-label="Other manual adjustments"
                title="Manual adjustments applied after the waterfall"
              />
            </label>
            <label className="ds_field">
              <span>Investment / accrual date</span>
              <input
                type="date"
                value={investmentDate}
                onChange={(e) => onInvestmentDateChange(e.target.value)}
              />
            </label>
          </div>
          <p className="ds_muted ds_sim_hint">
            Invested capital {formatMoneyCents(investedCapital)}.
            {investmentDateSource === "close"
              ? " Date defaults to deal close."
              : investmentDateSource === "funded"
                ? " Date defaults to earliest funded / setup accrual start."
                : investmentDate
                  ? ""
                  : " Set close date on Offering Overview if this is empty."}
          </p>
          <div className="ds_field">
            <span>Prior distributions</span>
            {priorDistributions.length === 0 ? (
              <p className="ds_prior_empty">
                No prior distributions recorded yet.
              </p>
            ) : (
              <ul className="ds_prior_list" aria-label="Prior distributions">
                {priorDistributions.map((p) => (
                  <li key={p.id || `${p.date}_${p.amount}`}>
                    <span>{formatCurrencyTableDisplay(p.amount)}</span>
                    <span className="ds_muted">{p.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {evaluations.length > 0 ? (
            <ul className="ds_hurdle_metrics">
              {evaluations.map((ev: HurdleEvaluation, i) => (
                <li key={`hurdle_ev_${i}`}>
                  <span className="ds_hurdle_metrics_label">
                    Hurdle {i + 1} · {ev.type}
                  </span>
                  <span
                    className={
                      ev.hurdleMet
                        ? "ds_hurdle_metrics_ok"
                        : "ds_hurdle_metrics_miss"
                    }
                  >
                    {ev.canEvaluate
                      ? `${formatMetricPct(ev.metric)} ${ev.hurdleMet ? "≥" : "<"} ${formatMetricPct(ev.hurdleRate)}`
                      : "needs cash flows"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </>
  ) : null

  const resultsBlock = showResults ? (
    <>
      {section === "results" ? (
        <div className="ds_sim_head">
          <h2>Preview results</h2>
        </div>
      ) : null}

      <div
        className={
          section === "all"
            ? "ds_sim_section"
            : "ds_sim_section ds_sim_section_first"
        }
      >
        <p className="ds_eyebrow">Who receives what</p>
        {recipients.length === 0 ? (
          <p className="ds_muted">
            No allocations yet — enter cash and confirm the period window
            above.
          </p>
        ) : (
          <ul className="ds_alloc_list">
            {recipients.map((c) => (
              <li key={c.id}>
                <span
                  className={`ds_swatch ${CLASS_TYPE_TONE[c.classType] || "lp"}`}
                />
                <span className="ds_alloc_name">{c.name}</span>
                <span className="ds_alloc_amt">
                  {formatMoneyCents(classTotal(c.id))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="ds_sim_note">
          Class totals include cents. Investor payments appear on the
          Distributions tab after you complete a run.
        </p>
      </div>

      <div className="ds_sim_section">
        <p className="ds_eyebrow">How the cash flows</p>
        <div className="ds_flow_wrap data_table_scroll_region--floating-hscroll" ref={flowScrollRef}>
          <table className="ds_flow_table">
            <thead>
              <tr>
                <th>Tier</th>
                <th className="r">Due</th>
                <th className="r">Paid</th>
              </tr>
            </thead>
            <tbody>
              {sim.flowRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <span className="ds_muted">
                      Add payment rows to preview flow.
                    </span>
                  </td>
                </tr>
              ) : (
                sim.flowRows.map((r) => {
                  const isStage = r.kind === "stage"
                  const paymentId =
                    !isStage && rowIds[r.index] ? rowIds[r.index]! : null
                  const ev =
                    isStage && r.stage != null && r.stage > 0
                      ? evaluations[r.stage - 1]
                      : undefined
                  return (
                    <tr
                      key={`${r.kind}_${r.index}`}
                      id={
                        paymentId
                          ? `ds-flow-row-${paymentId}`
                          : `ds-flow-${r.kind}-${r.index}`
                      }
                      className={
                        paymentId ? "ds_flow_row ds_flow_row_payment" : "ds_flow_row"
                      }
                    >
                      <td>
                        <div className="ds_tier_label">
                          <span className="n">{r.index + 1}</span>
                          <span>{r.label}</span>
                        </div>
                        {r.shortfall != null && r.shortfall > 0.5 ? (
                          <div className="ds_flow_warn">
                            short {formatMoneyCents(r.shortfall)} → accrues
                          </div>
                        ) : null}
                        {r.skipped ? (
                          <div className="ds_flow_skip">not reached</div>
                        ) : null}
                        {isStage && r.stage != null && r.stage > 0 ? (
                          <label className="ds_stage_toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(stageMet[r.stage])}
                              onChange={(e) =>
                                onToggleStageMet(
                                  r.stage!,
                                  e.target.checked,
                                )
                              }
                            />
                            Hurdle {r.stage} met?
                            {ev?.canEvaluate ? (
                              <span className="ds_stage_auto">
                                {" "}
                                (auto)
                              </span>
                            ) : null}
                          </label>
                        ) : null}
                      </td>
                      <td className="r">
                        {r.due == null ? (
                          "—"
                        ) : paymentId ? (
                          <input
                            className="ds_due_in"
                            type="text"
                            inputMode="decimal"
                            placeholder="$0"
                            value={blurFormatMoneyInput(
                              String(Math.round(r.due * 100) / 100),
                            )}
                            onChange={(e) =>
                              onDueOverride(
                                paymentId,
                                formatCurrencyUsdTypeInput(e.target.value),
                              )
                            }
                            onBlur={(e) =>
                              onDueOverride(
                                paymentId,
                                blurFormatMoneyInput(e.target.value),
                              )
                            }
                            aria-label="Due override"
                          />
                        ) : (
                          <input
                            className="ds_due_in"
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={blurFormatMoneyInput(
                              String(Math.round(r.due * 100) / 100),
                            )}
                            aria-label="Due"
                          />
                        )}
                      </td>
                      <td className="r">
                        {r.paid == null ? (
                          "—"
                        ) : (
                          <input
                            className="ds_due_in"
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={blurFormatMoneyInput(
                              String(Math.round(r.paid * 100) / 100),
                            )}
                            aria-label="Paid"
                          />
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <FloatingTableHScroll
          scrollerRef={flowScrollRef}
          ariaLabel="Cash flow columns"
        />
        {sim.leftover > 0.5 ? (
          <p className="ds_leftover">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span>
              {formatMoneyCents(sim.leftover)} undistributed — no LP/GP
              classes with split schedules to absorb the residual.
            </span>
          </p>
        ) : null}
      </div>
    </>
  ) : null

  const panelClass = [
    "ds_sim_panel",
    section === "test" ? "ds_sim_panel_test" : "",
    section === "results" ? "ds_sim_panel_results" : "",
  ]
    .filter(Boolean)
    .join(" ")

  const ariaLabel =
    section === "test"
      ? "Test a distribution"
      : section === "results"
        ? "Distribution preview results"
        : "Test a distribution"

  return (
    <aside className={panelClass} aria-label={ariaLabel}>
      <div className="ds_card ds_sim_card">
        <div className="ds_card_pad">
          {testBlock}
          {resultsBlock}
        </div>
      </div>
    </aside>
  )
}
