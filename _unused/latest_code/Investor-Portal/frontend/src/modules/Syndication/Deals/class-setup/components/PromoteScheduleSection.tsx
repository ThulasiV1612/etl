import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import { TableHScrollShell } from "../../../../../common/components/data-table/TableHScrollShell"
import type {
  ClassSetupClass,
  ClassSetupPromoteSchedule,
} from "../types/class-setup.types"
import {
  PROMOTE_HURDLE_BASES,
  PROMOTE_MEASURED_ON,
} from "../types/class-setup.types"
import { formatPct } from "../utils/classSetupTotals"
import {
  addPromoteHurdle,
  classShareKey,
  hurdleLabel,
  isEquityParticipant,
  normalizePromoteShares,
  removePromoteHurdle,
  stageCount,
  stageShareSum,
  updatePromoteShare,
} from "../utils/promoteSchedule"

interface PromoteScheduleSectionProps {
  promote: ClassSetupPromoteSchedule
  classes: ClassSetupClass[]
  onChange: (next: ClassSetupPromoteSchedule) => void
  canSave?: boolean
  isDirty?: boolean
  saving?: boolean
  onSave?: () => void
}

export function PromoteScheduleSection({
  promote,
  classes,
  onChange,
  canSave = true,
  isDirty = false,
  saving = false,
  onSave,
}: PromoteScheduleSectionProps) {
  const normalized = normalizePromoteShares(promote, classes)
  const participants = classes.filter(isEquityParticipant)
  const stages = stageCount(normalized)

  function patchHurdle(
    index: number,
    partial: Partial<(typeof normalized.hurdles)[number]>,
  ) {
    const hurdles = normalized.hurdles.map((h, i) =>
      i === index ? { ...h, ...partial } : h,
    )
    onChange({ ...normalized, hurdles })
  }

  return (
    <section
      id="promote-section"
      className={`cs_promote_card${isDirty ? " is-dirty" : ""}`}
      aria-label="Hurdles and promote schedule"
    >
      <div className="cs_promote_pad">
        <div className="cs_promote_head">
          <div>
            <p className="cs_eyebrow">Hurdles &amp; promote schedule</p>
            <p className="cs_promote_sub">
              Define each hurdle once, then set every class&apos;s share per stage
              in the matrix — <strong>each column must total 100%</strong>. These
              stages drive the split cascade for distributions later.
            </p>
            {isDirty ? (
              <p className="cs_section_unsaved_msg" role="status">
                Changes in this section are not saved. Click{" "}
                <strong>Save promote</strong> to keep them.
              </p>
            ) : null}
          </div>
          {onSave ? (
            <button
              type="button"
              className={`cs_section_save_btn${isDirty ? " is-dirty" : ""}`}
              disabled={!canSave || saving}
              onClick={onSave}
              title={
                isDirty
                  ? "Unsaved changes — click Save promote to keep them"
                  : canSave
                    ? "Save hurdles and promote shares only"
                    : "Add an LP class and fill class names before saving"
              }
            >
              {saving ? "Saving…" : "Save promote"}
            </button>
          ) : null}
        </div>

        <div className="cs_hurdle_editor">
          {normalized.hurdles.length === 0 ? (
            <div className="cs_unit">
              No hurdles — the base split applies to all residual cash.
            </div>
          ) : (
            normalized.hurdles.map((h, i) => (
              <div key={h.id} className="cs_hurdle_line">
                <span className="cs_unit">Hurdle {i + 1}:</span>
                <input
                  type="number"
                  step={0.25}
                  min={0}
                  value={h.rate}
                  onChange={(e) => patchHurdle(i, { rate: e.target.value })}
                  aria-label={`Hurdle ${i + 1} rate`}
                />
                <span className="cs_unit">%</span>
                <select
                  value={h.basis}
                  onChange={(e) =>
                    patchHurdle(i, {
                      basis: e.target.value as (typeof PROMOTE_HURDLE_BASES)[number],
                    })
                  }
                  aria-label={`Hurdle ${i + 1} basis`}
                >
                  {PROMOTE_HURDLE_BASES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <span className="cs_unit">measured on</span>
                <select
                  value={h.measuredOn}
                  onChange={(e) =>
                    patchHurdle(i, {
                      measuredOn: e.target
                        .value as (typeof PROMOTE_MEASURED_ON)[number],
                    })
                  }
                  aria-label={`Hurdle ${i + 1} measured on`}
                >
                  {PROMOTE_MEASURED_ON.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="cs_icon_btn danger"
                  title={`Remove hurdle ${i + 1}`}
                  aria-label={`Remove hurdle ${i + 1}`}
                  onClick={() =>
                    onChange(removePromoteHurdle(normalized, classes, i))
                  }
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div className="cs_hurdle_line">
            <button
              type="button"
              className="cs_add_btn"
              onClick={() => onChange(addPromoteHurdle(normalized, classes))}
            >
              ＋ Add hurdle
            </button>
            <span className="cs_unit">
              a new stage starts as a copy of the previous one, so its column
              stays at 100%
            </span>
          </div>
        </div>

        {participants.length === 0 ? (
          <p className="cs_unit" style={{ marginTop: 8 }}>
            Add LP or GP classes above to edit promote shares.
          </p>
        ) : (
          <div className="cs_matrix_wrap">
            <TableHScrollShell ariaLabel="Promote schedule columns">
            <table className="cs_matrix_table">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col" className="r cs_matrix_stage_th">
                    <span className="cs_matrix_th_label">
                      Base
                      <FormTooltip
                        label="About Base split"
                        placement="top"
                        panelAlign="end"
                        content={
                          <p className="cs_promote_stage_tip">
                            Base split — each class’s share of residual cash
                            before Hurdle 1 is met.
                          </p>
                        }
                      />
                    </span>
                  </th>
                  {normalized.hurdles.map((h, i) => (
                    <th
                      key={h.id}
                      scope="col"
                      className="r cs_matrix_hurdle_th cs_matrix_stage_th"
                    >
                      <span className="cs_matrix_th_label">
                        <span className="cs_matrix_hurdle_title">
                          After Hurdle {i + 1}
                        </span>
                        <FormTooltip
                          label={`About After Hurdle ${i + 1}`}
                          placement="top"
                          panelAlign="end"
                          content={
                            <p className="cs_promote_stage_tip">
                              After Hurdle {i + 1} ({hurdleLabel(h)}) — each
                              class’s share of residual cash once this hurdle is
                              met.
                            </p>
                          }
                        />
                      </span>
                      <span className="cs_matrix_hurdle_rate">
                        {`${h.rate || 0}%`}
                      </span>
                      <span className="cs_unit">{h.basis}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((c) => {
                  const key = classShareKey(c)
                  const tone =
                    c.classType === "lp"
                      ? "lp"
                      : c.classType === "gp"
                        ? "gp"
                        : "pref"
                  return (
                    <tr key={key}>
                      <td>
                        <span className="cs_cellflex">
                          <span className={`cs_swatch ${tone}`} />
                          <span className="cs_matrix_class_name" title={c.name}>
                            {c.name}
                          </span>
                          <span className="cs_unit">
                            {c.classType === "lp" ? "LP" : "GP"}
                          </span>
                        </span>
                      </td>
                      {Array.from({ length: stages }, (_, s) => (
                        <td key={s} className="r">
                          <input
                            className="cs_pct_in"
                            type="number"
                            step={0.1}
                            min={0}
                            max={100}
                            value={normalized.shares[key]?.[s] ?? "0"}
                            onChange={(e) =>
                              onChange(
                                updatePromoteShare(
                                  normalized,
                                  key,
                                  s,
                                  e.target.value,
                                ),
                              )
                            }
                            aria-label={`${c.name} stage ${s + 1} share`}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="cs_totals">
                  <td>Σ each stage</td>
                  {Array.from({ length: stages }, (_, s) => {
                    const sum = stageShareSum(normalized, classes, s)
                    const ok = Math.abs(sum - 100) < 0.5
                    return (
                      <td
                        key={s}
                        className={`r num${ok ? " is-ok" : " is-bad"}`}
                      >
                        {formatPct(sum)} {ok ? "✓" : "✗"}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
            </TableHScrollShell>
          </div>
        )}
      </div>
    </section>
  )
}
