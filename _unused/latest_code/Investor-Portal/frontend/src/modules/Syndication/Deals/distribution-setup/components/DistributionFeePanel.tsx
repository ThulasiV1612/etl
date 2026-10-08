import { useMemo } from "react"
import { TableHScrollShell } from "../../../../../common/components/data-table/TableHScrollShell"
import {
  DropdownSelect,
  type DropdownSelectOption,
} from "../../../../../common/components/dropdown-select"
import {
  blurFormatMoneyInput,
  formatCurrencyUsdTypeInput,
  parseMoneyDigits,
} from "../../utils/offeringMoneyFormat"
import type {
  DistributionFeeConfig,
  DistributionSetupClass,
} from "../types/distribution-setup.types"
import { CLASS_TYPE_TONE } from "../types/distribution-setup.types"
import { CreatableDropdownField } from "./CreatableDropdownField"
import {
  allocateFeeCashByClass,
  feeClassSplitTotal,
  feeWindowForPeriodFactor,
  listFeeClassSplitStatuses,
  mergeFeeTypeOptions,
  parseFeePercent,
  validateDistributionFee,
} from "../utils/distributionFee"

const PERIOD_OPTIONS: DropdownSelectOption[] = [
  { value: "0.083333", label: "Monthly" },
  { value: "0.25", label: "Quarterly" },
  { value: "1", label: "Annual" },
]

type DistributionFeePanelProps = {
  fee: DistributionFeeConfig
  classes: DistributionSetupClass[]
  investors?: Array<{ investorClass?: string | null }>
  onChange: (next: DistributionFeeConfig) => void
  completing?: boolean
  onComplete?: () => void
}

function formatMoneyPlain(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function classTypeLabel(classType: string): string {
  if (classType === "lp") return "Limited Partners"
  if (classType === "gp") return "General Partners"
  if (classType === "preferred_equity") return "Preferred Equity"
  if (classType === "mezzanine") return "Mezzanine"
  return classType.replace(/_/g, " ")
}

/**
 * Distribution Setup → Acquisition Fee tab.
 * Fee name + cash window + user-defined class split (must total 100%).
 */
export function DistributionFeePanel({
  fee,
  classes,
  investors = [],
  onChange,
  completing = false,
  onComplete,
}: DistributionFeePanelProps) {
  const validation = useMemo(
    () =>
      validateDistributionFee({
        fee,
        requireComplete: true,
        classes,
        investors,
      }),
    [fee, classes, investors],
  )

  const totalPct = useMemo(
    () => feeClassSplitTotal(fee.classSplits),
    [fee.classSplits],
  )

  const splitStatuses = useMemo(
    () =>
      listFeeClassSplitStatuses({
        classes,
        splits: fee.classSplits,
        investors,
      }),
    [classes, fee.classSplits, investors],
  )

  const allocations = useMemo(
    () =>
      allocateFeeCashByClass({
        cashAvailable: fee.cashAvailable,
        splits: fee.classSplits,
      }),
    [fee.cashAvailable, fee.classSplits],
  )

  const typeOptions = useMemo(
    () =>
      mergeFeeTypeOptions({
        options: fee.typeOptions,
        extra: fee.type ? [fee.type] : [],
      }),
    [fee.typeOptions, fee.type],
  )

  const cashNum = Math.max(0, parseMoneyDigits(fee.cashAvailable))
  const totalOk = Math.abs(totalPct - 100) <= 0.005
  const canComplete =
    Boolean(onComplete) &&
    validation.ok &&
    cashNum > 0 &&
    totalOk &&
    !completing

  function patch(partial: Partial<DistributionFeeConfig>) {
    onChange({ ...fee, ...partial })
  }

  function commitType(nextType: string) {
    const type = nextType.trim()
    patch({
      type,
      typeOptions: mergeFeeTypeOptions({
        options: fee.typeOptions,
        extra: type ? [type] : [],
      }),
    })
  }

  function setClassPercent(classId: string, percent: string) {
    patch({
      classSplits: fee.classSplits.map((s) =>
        s.classId === classId ? { ...s, percent } : s,
      ),
    })
  }

  return (
    <div className="ds_fee_panel" role="region" aria-label="Acquisition fee">
      <div className="ds_sim_head">
        <h2>Acquisition Fee</h2>
        <p className="ds_table_subtitle">
          Name the fee and allocate available cash across investor classes. The
          split is yours to set — the system does not assume a GP-only fee.
        </p>
      </div>

      <div className="ds_sim_inputs ds_sim_inputs_test ds_fee_inputs">
        <div className="ds_sim_row ds_sim_row_primary">
          <label className="ds_field ds_field_name">
            <span>
              Acquisition Fee Name <span className="ds_req" aria-hidden>*</span>
            </span>
            <input
              type="text"
              placeholder="e.g. Q1 Acquisition Fee"
              value={fee.name}
              onChange={(e) => patch({ name: e.target.value })}
              aria-required
              aria-invalid={fee.name.trim() ? undefined : true}
              aria-label="Acquisition fee name"
            />
          </label>
          <label className="ds_field ds_field_type">
            <span>
              Type <span className="ds_req" aria-hidden>*</span>
            </span>
            <CreatableDropdownField
              className="ds_dropdown ds_creatable_type"
              value={fee.type}
              options={typeOptions}
              onChange={commitType}
              placeholder="Type or select a fee type"
              ariaLabel="Acquisition fee type"
              invalid={!fee.type.trim()}
            />
          </label>
          <label className="ds_field">
            <span>Cash Available</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="$0.00"
              value={fee.cashAvailable}
              onChange={(e) =>
                patch({
                  cashAvailable: formatCurrencyUsdTypeInput(e.target.value),
                })
              }
              onBlur={(e) =>
                patch({
                  cashAvailable: blurFormatMoneyInput(e.target.value),
                })
              }
              aria-label="Cash available"
            />
          </label>
          <label className="ds_field">
            <span>Period</span>
            <DropdownSelect
              className="ds_dropdown"
              value={fee.periodFactor}
              options={PERIOD_OPTIONS}
              onChange={(v) => {
                const window = feeWindowForPeriodFactor({
                  periodFactor: v,
                  asOfIso: fee.periodEnd || fee.periodStart,
                })
                patch({
                  periodFactor: v,
                  periodStart: window.periodStart,
                  periodEnd: window.periodEnd,
                })
              }}
              ariaLabel="Period"
              useFixedPanel
            />
          </label>
        </div>
        <div className="ds_sim_row ds_sim_row_dates">
          <label className="ds_field">
            <span>Period start date</span>
            <input
              type="date"
              value={fee.periodStart}
              onChange={(e) => patch({ periodStart: e.target.value })}
              aria-label="Period start date"
            />
          </label>
          <label className="ds_field">
            <span>Period end date</span>
            <input
              type="date"
              value={fee.periodEnd}
              min={fee.periodStart || undefined}
              onChange={(e) => patch({ periodEnd: e.target.value })}
              aria-label="Period end date"
            />
          </label>
        </div>
      </div>

      <section className="ds_table_panel ds_fee_split_panel" aria-label="Class split">
        <div className="ds_table_toolbar">
          <div>
            <h2 className="ds_table_title">Class Split</h2>
            <p className="ds_table_subtitle">
              Enter a percentage for each investor class. Combined allocation
              must equal 100%. A class is paid only when it has a percentage
              and investors. If a class has a percentage but no investors, that
              class is not paid and this distribution is not paid to other
              classes either.
            </p>
          </div>
          <p
            className={`ds_fee_split_total${totalOk ? " is-ok" : " is-bad"}`}
            role="status"
            aria-live="polite"
          >
            Total {totalPct.toFixed(2)}%
            {!totalOk
              ? " · Must equal 100%"
              : validation.ok
                ? " · Ready"
                : ""}
          </p>
        </div>

        {classes.length === 0 ? (
          <p className="ds_muted ds_fee_empty">
            No investor classes yet. Finish Class Setup, then return here to
            allocate the fee.
          </p>
        ) : (
          <div className="ds_table_scroll">
            <TableHScrollShell ariaLabel="Fee split columns">
            <table className="ds_wf_table ds_fee_split_table">
              <thead>
                <tr>
                  <th scope="col">Investor Class</th>
                  <th scope="col" className="ds_fee_col_pct">
                    Percentage
                  </th>
                  <th scope="col" className="ds_fee_col_amt">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => {
                  const split = fee.classSplits.find((s) => s.classId === cls.id)
                  const pctRaw = split?.percent ?? "0"
                  const pctN = parseFeePercent(pctRaw)
                  const pctInvalid =
                    !Number.isFinite(pctN) || pctN < 0 || pctN > 100
                  const status = splitStatuses.find((s) => s.classId === cls.id)
                  const blocked =
                    status?.mentioned === true &&
                    (status?.investorCount ?? 0) === 0
                  const payable = status?.payable === true
                  const amount = allocations[cls.id] ?? 0
                  return (
                    <tr
                      key={cls.id}
                      className={blocked ? "is-blocked" : undefined}
                    >
                      <td>
                        <div className="ds_fee_class_cell">
                          <span
                            className={`ds_chip tone-${CLASS_TYPE_TONE[cls.classType] || "lp"}`}
                          >
                            {cls.name || "Class"}
                          </span>
                          <span className="ds_fee_class_role">
                            {classTypeLabel(cls.classType)}
                          </span>
                          {blocked ? (
                            <span className="ds_fee_class_note">
                              No investors — this class will not be paid
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="ds_fee_col_pct">
                        <label className="ds_fee_pct_field">
                          <span className="ds_sr_only">
                            Percentage for {cls.name}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            className={
                              pctInvalid || blocked ? "is-invalid" : undefined
                            }
                            value={pctRaw}
                            onChange={(e) =>
                              setClassPercent(cls.id, e.target.value)
                            }
                            aria-invalid={
                              pctInvalid || blocked ? true : undefined
                            }
                          />
                          <span className="ds_fee_pct_suffix" aria-hidden>
                            %
                          </span>
                        </label>
                      </td>
                      <td className="ds_fee_col_amt">
                        <span className="ds_fee_amount">
                          {cashNum > 0 && totalOk && payable
                            ? formatMoneyPlain(amount)
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </TableHScrollShell>
          </div>
        )}

        {!validation.ok ? (
          <p className="ds_fee_validation" role="alert">
            {validation.message}
          </p>
        ) : fee.name.trim() ? (
          <p className="ds_fee_validation is-ok" role="status">
            Class allocation is valid
            {cashNum > 0
              ? ` · ${formatMoneyPlain(cashNum)} will be split across classes that have both a percentage and investors.`
              : "."}
          </p>
        ) : null}
      </section>

      {onComplete ? (
        <div className="ds_complete_row ds_fee_complete_row">
          <button
            type="button"
            className="ds_primary_btn ds_complete_btn"
            disabled={!canComplete}
            onClick={onComplete}
            title={
              canComplete
                ? "Record this fee distribution — Source: GP Payment, Type: selected type"
                : "Enter fee name, type, cash > $0, and a class-scoped split totaling 100% (each allocated class must have investors)"
            }
          >
            {completing ? "Completing…" : "Complete acquisition fee"}
          </button>
        </div>
      ) : null}
    </div>
  )
}
