import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import {
  DropdownSelect,
  type DropdownSelectOption,
} from "../../../../../common/components/dropdown-select"
import { useHorizontalScrollRegion } from "../../../../../common/hooks/useHorizontalScrollRegion"
import { FloatingTableHScroll } from "../../../../../common/components/data-table/FloatingTableHScroll"
import {
  blurFormatMoneyInput,
  formatCurrencyUsdTypeInput,
} from "../../utils/offeringMoneyFormat"
import type {
  DistributionPaymentRow,
  DistributionSetupClass,
  DistributionSetupPromote,
  DistributionWfKind,
  DistributionWfSource,
} from "../types/distribution-setup.types"
import { CLASS_TYPE_TONE, KIND_META } from "../types/distribution-setup.types"
import {
  // calcFormulaNote, // re-enable with formula preview below
  // equityParticipants, // re-enable with Residual splits section
  // formatPct,
  // hurdleLabel,
  // shareAt,
  stageCount,
} from "../utils/distributionSim"

const KIND_OPTIONS: DropdownSelectOption[] = (
  Object.keys(KIND_META) as DistributionWfKind[]
).map((k) => ({
  value: k,
  label: KIND_META[k].label,
}))

const AMOUNT_MODE_OPTIONS: DropdownSelectOption[] = [
  { value: "calc", label: "Calculated" },
  { value: "input", label: "Manual input" },
]

interface WaterfallBuilderProps {
  rows: DistributionPaymentRow[]
  classes: DistributionSetupClass[]
  promote: DistributionSetupPromote
  addKind: DistributionWfKind
  activeWf: DistributionWfSource
  onAddKindChange: (kind: DistributionWfKind) => void
  onAddRow: () => void
  onChangeRow: (id: string, next: DistributionPaymentRow) => void
  onMoveRow: (id: string, dir: -1 | 1) => void
  onDeleteRow: (id: string) => void
}

export function WaterfallBuilder({
  rows,
  classes,
  promote,
  addKind,
  activeWf,
  onAddKindChange,
  onAddRow,
  onChangeRow,
  onMoveRow,
  onDeleteRow,
}: WaterfallBuilderProps) {
  const stages = stageCount(promote)
  // const parts = equityParticipants(classes) // used by Residual splits section
  const hasContent = rows.length > 0 || stages > 0
  const subtitle =
    activeWf === "operating"
      ? "Cash pays each row in order until funded or cash runs out. Unpaid balances accrue."
      : "Sale and refinance proceeds follow this order."
  const prevRowCountRef = useRef(rows.length)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  useHorizontalScrollRegion(tableScrollRef, [rows.length], {
    hoverVerticalToHorizontal: false,
    edgeScroll: false,
  })

  function scrollFlowRowIntoView(rowId: string) {
    const el = document.getElementById(`ds-flow-row-${rowId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  useEffect(() => {
    if (rows.length <= prevRowCountRef.current) {
      prevRowCountRef.current = rows.length
      return
    }
    prevRowCountRef.current = rows.length
    const last = rows[rows.length - 1]
    if (!last) return
    requestAnimationFrame(() => {
      document
        .getElementById(`ds-wf-row-${last.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
      scrollFlowRowIntoView(last.id)
    })
  }, [rows])

  return (
    <section className="ds_table_panel" aria-label="Payment waterfall">
      <div className="ds_table_toolbar">
        <div>
          <h2 className="ds_table_title">Payment waterfall</h2>
          <p className="ds_table_subtitle">{subtitle}</p>
        </div>
        <div className="ds_table_toolbar_actions">
          <DropdownSelect
            className="ds_dropdown ds_dropdown_kind"
            value={addKind}
            options={KIND_OPTIONS}
            onChange={(v) => onAddKindChange(v as DistributionWfKind)}
            ariaLabel="Payment row type to add"
            useFixedPanel
            placeholder="Payment type"
          />
          <button type="button" className="ds_add_btn" onClick={onAddRow}>
            <Plus size={15} strokeWidth={2.25} aria-hidden />
            Add payment row
          </button>
        </div>
      </div>

      <div className="ds_table_scroll data_table_scroll_region--floating-hscroll" ref={tableScrollRef}>
        <table className="ds_wf_table">
          <thead>
            <tr>
              <th scope="col" className="ds_col_order">
                <span className="ds_sr_only">Order</span>
              </th>
              <th scope="col">Cash goes to</th>
              <th scope="col">What is paid</th>
              <th scope="col" className="ds_col_actions">
                <span className="ds_sr_only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!hasContent ? (
              <tr className="ds_wf_empty_row">
                <td colSpan={4}>
                  <p className="ds_empty_msg">
                    No payment rows yet. Use{" "}
                    <strong>Add payment row</strong>, or define LP/GP classes
                    and hurdles in Class Setup for residual splits.
                  </p>
                </td>
              </tr>
            ) : null}

            {rows.map((row, i) => (
              <PaymentRowView
                key={row.id}
                row={row}
                index={i}
                total={rows.length}
                classes={classes}
                onChange={(next) => onChangeRow(row.id, next)}
                onMove={(dir) => onMoveRow(row.id, dir)}
                onDelete={() => onDeleteRow(row.id)}
                onHover={() => scrollFlowRowIntoView(row.id)}
              />
            ))}

            {/* Residual splits — re-enable when needed
            {stages > 0 ? (
              <tr className="ds_wf_section_row">
                <td colSpan={4}>
                  <div className="ds_section_inner">
                    <strong>Residual splits</strong>
                    <span className="ds_section_desc">
                      From Class Setup promote schedule
                    </span>
                  </div>
                </td>
              </tr>
            ) : null}

            {Array.from({ length: stages }, (_, s) => {
              const chips = parts.map((c) => (
                <span
                  key={c.id}
                  className={`ds_chip tone-${CLASS_TYPE_TONE[c.classType] || "lp"}`}
                >
                  {c.name}{" "}
                  <span className="ds_chip_pct">
                    {formatPct(shareAt(promote, c.id, s))}
                  </span>
                </span>
              ))
              const until =
                s < stages - 1
                  ? `Until Hurdle ${s + 1} is met (${
                      promote.hurdles[s]
                        ? hurdleLabel(promote.hurdles[s]!)
                        : `Hurdle ${s + 1}`
                    }) — then stage ${s + 2}.`
                  : "Final residual — splits remaining cash."
              return (
                <tr key={`stage_${s}`} className="ds_wf_row ds_stage_row">
                  <td>
                    <span className="ds_then">
                      <span className="ds_then_label">
                        {rows.length + s === 0 ? "First" : "Then"}
                      </span>
                      <span className="ds_step_num">{rows.length + s + 1}</span>
                    </span>
                  </td>
                  <td>
                    <div className="ds_chips">
                      {chips.length > 0 ? (
                        chips
                      ) : (
                        <span className="ds_muted">
                          No LP/GP classes defined
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="ds_row_title">
                      Split remaining cash — stage {s + 1}{" "}
                      {s === 0 ? "(base shares)" : `(after Hurdle ${s})`}
                    </div>
                    <div className="ds_calc_note">{until}</div>
                  </td>
                  <td className="r">
                    <span
                      className="ds_auto_badge"
                      title="Generated from promote schedule"
                    >
                      auto
                    </span>
                  </td>
                </tr>
              )
            })}
            */}
          </tbody>
        </table>
      </div>
      <FloatingTableHScroll
        scrollerRef={tableScrollRef}
        syncKey={String(rows.length)}
        ariaLabel="Waterfall columns"
      />
    </section>
  )
}

function PaymentRowView({
  row,
  index,
  total,
  classes,
  onChange,
  onMove,
  onDelete,
  onHover,
}: {
  row: DistributionPaymentRow
  index: number
  total: number
  classes: DistributionSetupClass[]
  onChange: (next: DistributionPaymentRow) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onHover?: () => void
}) {
  const selected = new Set(row.payTo)
  const available = classes.filter((c) => !selected.has(c.id))
  const classOptions = useMemo((): DropdownSelectOption[] => {
    const selectedIds = new Set(row.payTo)
    return classes
      .filter((c) => !selectedIds.has(c.id))
      .map((c) => ({ value: c.id, label: c.name }))
  }, [classes, row.payTo])

  return (
    <tr
      className="ds_wf_row"
      id={`ds-wf-row-${row.id}`}
      onMouseEnter={onHover}
    >
      <td>
        <span className="ds_then">
          <span className="ds_then_label">{index === 0 ? "First" : "Then"}</span>
          <span className="ds_step_num">{index + 1}</span>
        </span>
      </td>
      <td>
        <div className="ds_chips">
          {row.payTo.length === 0 ? (
            <span className="ds_muted">No classes selected</span>
          ) : (
            row.payTo.map((id) => {
              const c = classes.find((x) => x.id === id)
              if (!c) return null
              return (
                <span
                  key={id}
                  className={`ds_chip tone-${CLASS_TYPE_TONE[c.classType] || "lp"}`}
                >
                  {c.name}
                  <button
                    type="button"
                    className="ds_chip_x"
                    aria-label={`Remove ${c.name}`}
                    onClick={() =>
                      onChange({
                        ...row,
                        payTo: row.payTo.filter((x) => x !== id),
                      })
                    }
                  >
                    <X size={12} strokeWidth={2.5} aria-hidden />
                  </button>
                </span>
              )
            })
          )}
          {available.length > 0 ? (
            <DropdownSelect
              className="ds_dropdown ds_dropdown_add_class"
              value=""
              options={classOptions}
              onChange={(v) => {
                if (!v) return
                onChange({ ...row, payTo: [...row.payTo, v] })
              }}
              ariaLabel="Add class"
              placeholder="+ class…"
              useFixedPanel
            />
          ) : null}
        </div>
      </td>
      <td>
        <input
          className="ds_tname_in"
          value={row.name}
          onChange={(e) => onChange({ ...row, name: e.target.value })}
          aria-label="Row name"
        />
        <div className="ds_calc_note">{KIND_META[row.kind].label}</div>
        {row.kind === "CATCHUP" ? (
          <div className="ds_cellflex ds_cellflex_spaced">
            catch up to
            <input
              className="ds_pct_in"
              type="number"
              step={0.5}
              min={0}
              max={99}
              value={row.catchupPct}
              onChange={(e) =>
                onChange({ ...row, catchupPct: e.target.value })
              }
              aria-label="Catch-up target"
            />
            <span className="ds_muted">% of profits to date</span>
          </div>
        ) : null}
        <div className="ds_cellflex ds_cellflex_spaced">
          <DropdownSelect
            className="ds_dropdown ds_dropdown_amount_mode"
            value={row.amountMode}
            options={AMOUNT_MODE_OPTIONS}
            onChange={(v) =>
              onChange({
                ...row,
                amountMode: v === "input" ? "input" : "calc",
              })
            }
            ariaLabel="Amount mode"
            useFixedPanel
          />
          {row.amountMode === "input" ? (
            <>
              <input
                className="ds_num_in"
                type="text"
                inputMode="decimal"
                placeholder="$0"
                value={row.inputAmount}
                onChange={(e) =>
                  onChange({
                    ...row,
                    inputAmount: formatCurrencyUsdTypeInput(e.target.value),
                  })
                }
                onBlur={(e) =>
                  onChange({
                    ...row,
                    inputAmount: blurFormatMoneyInput(e.target.value),
                  })
                }
                aria-label="Manual amount"
              />
              <span className="ds_muted">due</span>
            </>
          ) : null}
          {/* Formula preview — re-enable when needed:
          {row.amountMode !== "input" ? (
            <span className="ds_calc_note">
              = {calcFormulaNote(row, classes)}
            </span>
          ) : null}
          */}
        </div>
      </td>
      <td className="r">
        <span className="ds_row_actions">
          <button
            type="button"
            className="ds_icon_btn"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            title="Move up"
            aria-label="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="ds_icon_btn"
            disabled={index >= total - 1}
            onClick={() => onMove(1)}
            title="Move down"
            aria-label="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="ds_icon_btn danger"
            onClick={onDelete}
            title="Delete row"
            aria-label="Delete row"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </td>
    </tr>
  )
}
