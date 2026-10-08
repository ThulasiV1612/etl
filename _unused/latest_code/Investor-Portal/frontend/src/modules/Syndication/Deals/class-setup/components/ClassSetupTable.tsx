import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Copy, Trash2 } from "lucide-react"
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import { FloatingTableHScroll } from "../../../../../common/components/data-table/FloatingTableHScroll"
import { attachHorizontalScrollBehavior } from "../../../../../common/utils/horizontalScrollRegion"
import type { ClassSetupClass, ClassSetupType } from "../types/class-setup.types"
import { CLASS_TYPE_META } from "../types/class-setup.types"
import {
  blurFormatMoneyInput,
  formatCurrencyTableDisplay,
  formatCurrencyUsdTypeInput,
} from "../../utils/offeringMoneyFormat"
import { formatPct } from "../utils/classSetupTotals"

const TYPE_ORDER: ClassSetupType[] = [
  "lp",
  "gp",
  "preferred_equity",
  "mezzanine",
]

const TYPE_DESC: Record<ClassSetupType, string> = {
  lp: "Equity · preferred return · upside",
  gp: "Sponsor equity · promote",
  preferred_equity: "Fixed return · no ownership",
  mezzanine: "Debt-like interest",
}

interface ClassSetupTableProps {
  classes: ClassSetupClass[]
  ownershipTotal: number
  totalFunded: number
  focusClassKey?: string | null
  promoteShares: Record<string, string[]>
  promoteStageLabels: string[]
  canSaveSection: (sectionType: ClassSetupType) => boolean
  isSectionDirty: (sectionType: ClassSetupType) => boolean
  savingSection: ClassSetupType | null
  onSaveSection: (sectionType: ClassSetupType) => void
  onGotoPromote: () => void
  onPromoteShareChange: (
    classKey: string,
    stage: number,
    value: string,
  ) => void
  onChange: (clientKey: string, next: ClassSetupClass) => void
  onAdd: (classType: ClassSetupType) => void
  onDuplicate: (classItem: ClassSetupClass) => void
  onDelete: (classItem: ClassSetupClass) => void
}

export function ClassSetupTable({
  classes,
  ownershipTotal,
  totalFunded,
  focusClassKey = null,
  promoteShares,
  promoteStageLabels,
  canSaveSection,
  isSectionDirty,
  savingSection,
  onSaveSection,
  onGotoPromote,
  onPromoteShareChange,
  onChange,
  onAdd,
  onDuplicate,
  onDelete,
}: ClassSetupTableProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    if (!focusClassKey) return
    const row = document.querySelector(
      `[data-cs-row="${CSS.escape(focusClassKey)}"]`,
    ) as HTMLElement | null
    if (!row) return
    row.scrollIntoView({ behavior: "smooth", block: "center" })
    row.classList.add("is-focused")
    const t = window.setTimeout(() => row.classList.remove("is-focused"), 2400)
    return () => window.clearTimeout(t)
  }, [focusClassKey, classes.length])

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(max > 2 && el.scrollLeft < max - 2)
    // Keep section headers (name + arrows + Add) sized to the visible port while columns scroll.
    el.style.setProperty("--cs-scroll-port-width", `${el.clientWidth}px`)
  }, [])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return

    // Capture a non-null HTMLElement for nested listeners (TS narrows don't
    // always stick inside nested function declarations).
    const scroller: HTMLDivElement = root

    updateScrollState()
    const onScroll = () => updateScrollState()
    scroller.addEventListener("scroll", onScroll, { passive: true })

    const ro = new ResizeObserver(() => updateScrollState())
    ro.observe(scroller)
    const table = scroller.querySelector("table")
    if (table) ro.observe(table)

    /** Shift / trackpad X / drag → columns. Do not steal vertical page scroll. */
    const detachScroll = attachHorizontalScrollBehavior(scroller, {
      hoverVerticalToHorizontal: false,
      edgeScroll: false,
    })

    window.addEventListener("resize", updateScrollState)

    return () => {
      scroller.removeEventListener("scroll", onScroll)
      detachScroll()
      window.removeEventListener("resize", updateScrollState)
      ro.disconnect()
    }
  }, [updateScrollState, classes.length, promoteStageLabels.length])

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({
      left: dir * Math.max(280, el.clientWidth * 0.55),
      behavior: "smooth",
    })
    window.setTimeout(updateScrollState, 320)
  }

  function patchByKey(key: string, partial: Partial<ClassSetupClass>) {
    const current = classes.find((c) => (c.id || c.clientKey) === key)
    if (!current) return
    onChange(key, { ...current, ...partial })
  }

  const ownershipOk = Math.abs(ownershipTotal - 100) < 0.05

  return (
    <section className="cs_table_panel" aria-label="Investor classes">
      <div className="cs_table_toolbar">
        <div>
          <h2 className="cs_table_title">Capital stack</h2>
          <p className="cs_table_subtitle">
            Edit cells inline. Add a class from each section header.
          </p>
        </div>
      </div>

      <div
        className={`cs_table_scroll data_table_scroll_region--floating-hscroll${canScrollLeft ? " has-left" : ""}${canScrollRight ? " has-right" : ""}`}
        ref={scrollerRef}
      >
        <table className="cs_classes_table">
          <thead>
            <tr>
              <th scope="col" className="cs_col_sticky cs_col_group">
                Group
              </th>
              <th scope="col" className="cs_col_sticky cs_col_class">
                Class
              </th>
              <th scope="col" className="r" title="LP + GP must total 100%">
                Equity %
              </th>
              <th
                scope="col"
                className="r"
                title="Sum of funded investments for this class (fund-approved or funds received)"
              >
                Funded
              </th>
              <th scope="col" className="r">
                Min invest
              </th>
              <th scope="col">Pref / rate</th>
              <th scope="col">Terms</th>
              <th
                scope="col"
                title="Split share by stage — set in the promote schedule below"
              >
                Promote splits
              </th>
              <th scope="col" className="cs_col_actions">
                <span className="cs_sr_only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map((type) => {
              const meta = CLASS_TYPE_META[type]
              const members = classes.filter((c) => c.classType === type)
              return (
                <TypeSection
                  key={type}
                  type={type}
                  meta={meta}
                  members={members}
                  focusClassKey={focusClassKey}
                  promoteShares={promoteShares}
                  promoteStageLabels={promoteStageLabels}
                  canScrollLeft={canScrollLeft}
                  canScrollRight={canScrollRight}
                  canSave={canSaveSection(type)}
                  isDirty={isSectionDirty(type)}
                  saving={savingSection === type}
                  onScrollByDir={scrollByDir}
                  onSave={() => onSaveSection(type)}
                  onGotoPromote={onGotoPromote}
                  onPromoteShareChange={onPromoteShareChange}
                  onAdd={() => onAdd(type)}
                  onPatch={patchByKey}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              )
            })}
          </tbody>
          <tfoot>
            <tr className="cs_totals">
              <td className="cs_col_sticky cs_totals_sticky_label" colSpan={2}>
                Totals
              </td>
              <td
                className={`r num${ownershipOk ? " is-ok" : " is-bad"}`}
              >
                {formatPct(ownershipTotal)}
              </td>
              <td className="r money">
                ${Math.round(totalFunded).toLocaleString("en-US")}
              </td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>
      <FloatingTableHScroll
        scrollerRef={scrollerRef}
        active={classes.length > 0}
        ariaLabel="Class setup columns"
      />
    </section>
  )
}

function TypeSection({
  type,
  meta,
  members,
  focusClassKey,
  promoteShares,
  promoteStageLabels,
  canScrollLeft,
  canScrollRight,
  canSave,
  isDirty,
  saving,
  onScrollByDir,
  onSave,
  onGotoPromote,
  onPromoteShareChange,
  onAdd,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  type: ClassSetupType
  meta: (typeof CLASS_TYPE_META)[ClassSetupType]
  members: ClassSetupClass[]
  focusClassKey: string | null
  promoteShares: Record<string, string[]>
  promoteStageLabels: string[]
  canScrollLeft: boolean
  canScrollRight: boolean
  canSave: boolean
  isDirty: boolean
  saving: boolean
  onScrollByDir: (dir: -1 | 1) => void
  onSave: () => void
  onGotoPromote: () => void
  onPromoteShareChange: (
    classKey: string,
    stage: number,
    value: string,
  ) => void
  onAdd: () => void
  onPatch: (key: string, partial: Partial<ClassSetupClass>) => void
  onDuplicate: (classItem: ClassSetupClass) => void
  onDelete: (classItem: ClassSetupClass) => void
}) {
  return (
    <>
      <tr className={`cs_section_row${isDirty ? " is-dirty" : ""}`}>
        <td colSpan={9}>
          <div className="cs_section_inner">
            <span className={`cs_swatch ${meta.tone}`} />
            <strong>{meta.label}</strong>
            <span className="cs_section_desc">{TYPE_DESC[type]}</span>
            {members.length > 0 ? (
              <span className="cs_section_count">
                {members.length}{" "}
                {members.length === 1 ? "class" : "classes"}
              </span>
            ) : null}
            <div className="cs_section_actions">
              <div
                className="cs_table_scroll_btns"
                role="group"
                aria-label={`Scroll ${meta.label} columns`}
              >
                <button
                  type="button"
                  className="cs_table_scroll_btn"
                  aria-label="Previous columns"
                  disabled={!canScrollLeft}
                  onClick={() => onScrollByDir(-1)}
                >
                  <ChevronLeft size={16} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  className="cs_table_scroll_btn"
                  aria-label="Next columns"
                  disabled={!canScrollRight}
                  onClick={() => onScrollByDir(1)}
                >
                  <ChevronRight size={16} strokeWidth={2.25} />
                </button>
              </div>
              <button type="button" className="cs_add_btn" onClick={onAdd}>
                + Add {type === "lp" || type === "gp" ? "sub-class" : "class"}
              </button>
              <button
                type="button"
                className={`cs_primary_btn cs_section_save_btn${
                  isDirty ? " is-dirty" : ""
                }`}
                disabled={!canSave || saving}
                onClick={onSave}
                title={
                  isDirty
                    ? "Unsaved changes — click Save to keep them"
                    : canSave
                      ? `Save only the ${meta.label} section`
                      : "Add an LP class and fill class names in this section before saving"
                }
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
          {isDirty ? (
            <p className="cs_section_unsaved_msg" role="status">
              Changes in this section are not saved. Click{" "}
              <strong>Save</strong> to keep them.
            </p>
          ) : null}
        </td>
      </tr>
      {members.length === 0 ? (
        <tr className="cs_empty_row">
          <td colSpan={9}>
            No {meta.label.toLowerCase()} classes yet. Use{" "}
            <strong>
              + Add {type === "lp" || type === "gp" ? "sub-class" : "class"}
            </strong>{" "}
            to create one — key terms (equity, rates, funded) will show under
            the class name.
          </td>
        </tr>
      ) : (
        members.map((c) => {
          const key = c.id || c.clientKey
          return (
            <tr
              key={key}
              data-cs-row={key}
              className={`cs_class_row tone-${meta.tone}${
                focusClassKey === key ? " is-focused" : ""
              }`}
            >
              <td className="cs_col_sticky cs_col_group">
                <input
                  className="cs_text_in"
                  value={c.classGroup}
                  onChange={(e) => onPatch(key, { classGroup: e.target.value })}
                  aria-label={`${c.name} group`}
                />
              </td>
              <td className="cs_col_sticky cs_col_class">
                <div className="cs_class_identity">
                  <input
                    className="cs_name_in"
                    value={c.name}
                    onChange={(e) => onPatch(key, { name: e.target.value })}
                    aria-label={`${c.name} class name`}
                  />
                </div>
              </td>
              <td className="r">
                {c.classType === "preferred_equity" ||
                c.classType === "mezzanine" ? (
                  <span className="cs_unit">—</span>
                ) : (
                  <input
                    className="cs_pct_in"
                    type="number"
                    step={0.1}
                    min={0}
                    max={100}
                    value={c.equityPct}
                    onChange={(e) =>
                      onPatch(key, { equityPct: e.target.value })
                    }
                    aria-label={`${c.name} equity %`}
                  />
                )}
              </td>
              <td className="r">
                <span
                  className="cs_num_ro"
                  title="From funded investments for this class (fund-approved or funds received)"
                >
                  {formatCurrencyTableDisplay(c.actuallyFunded)}
                </span>
              </td>
              <td className="r">
                {c.classType === "gp" ? (
                  <span className="cs_unit">—</span>
                ) : (
                  <input
                    className="cs_num_in"
                    type="text"
                    inputMode="decimal"
                    placeholder="$0"
                    value={c.minimumInvestment}
                    onChange={(e) =>
                      onPatch(key, {
                        minimumInvestment: formatCurrencyUsdTypeInput(
                          e.target.value,
                        ),
                      })
                    }
                    onBlur={(e) =>
                      onPatch(key, {
                        minimumInvestment: blurFormatMoneyInput(e.target.value),
                      })
                    }
                    aria-label={`${c.name} minimum investment`}
                  />
                )}
              </td>
              <td>
                <PrefRateCell
                  classItem={c}
                  onPatch={(partial) => onPatch(key, partial)}
                />
              </td>
              <td>
                <TermsCell
                  classItem={c}
                  onPatch={(partial) => onPatch(key, partial)}
                />
              </td>
              <td>
                {c.classType === "lp" || c.classType === "gp" ? (
                  <PromoteSplitsCell
                    classLabel={c.name}
                    shares={promoteShares[key] ?? ["0"]}
                    stageLabels={promoteStageLabels}
                    onChange={(stage, value) =>
                      onPromoteShareChange(key, stage, value)
                    }
                    onGotoPromote={onGotoPromote}
                  />
                ) : (
                  <span className="cs_unit">—</span>
                )}
              </td>
              <td className="cs_col_actions">
                <div className="cs_row_actions">
                  <button
                    type="button"
                    className="cs_icon_btn"
                    title="Duplicate"
                    aria-label={`Duplicate ${c.name}`}
                    onClick={() => onDuplicate(c)}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="cs_icon_btn danger"
                    title="Delete"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => onDelete(c)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          )
        })
      )}
    </>
  )
}

function PrefRateCell({
  classItem: c,
  onPatch,
}: {
  classItem: ClassSetupClass
  onPatch: (partial: Partial<ClassSetupClass>) => void
}) {
  if (c.classType === "lp") {
    const p = c.preferredReturn
    return (
      <div className="cs_cellflex">
        <label className="cs_toggle" title="Preferred return">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) =>
              onPatch({
                preferredReturn: { ...p, enabled: e.target.checked },
              })
            }
            aria-label="Preferred return enabled"
          />
          <span className="track" />
        </label>
        {p.enabled ? (
          <>
            <input
              className="cs_pct_in"
              type="number"
              step={0.25}
              min={0}
              value={p.rate}
              onChange={(e) =>
                onPatch({
                  preferredReturn: { ...p, rate: e.target.value },
                })
              }
              aria-label="Preferred rate"
            />
            <span className="cs_unit">%/yr</span>
          </>
        ) : (
          <span className="cs_unit">Off</span>
        )}
      </div>
    )
  }
  if (c.classType === "preferred_equity") {
    const p = c.prefEquity
    return (
      <div className="cs_cellflex">
        <input
          className="cs_pct_in"
          type="number"
          step={0.25}
          min={0}
          value={p.totalRate}
          onChange={(e) => {
            const totalRate = e.target.value
            onPatch({
              prefEquity: {
                ...p,
                totalRate,
                accrualRate: String(
                  Math.max(
                    0,
                    Number(totalRate || 0) - Number(p.currentRate || 0),
                  ),
                ),
              },
            })
          }}
          aria-label="Total preferred rate"
        />
        <span className="cs_unit">%/yr</span>
      </div>
    )
  }
  if (c.classType === "mezzanine") {
    return (
      <div className="cs_cellflex">
        <input
          className="cs_pct_in"
          type="number"
          step={0.25}
          min={0}
          value={c.mezz.rate}
          onChange={(e) =>
            onPatch({ mezz: { ...c.mezz, rate: e.target.value } })
          }
          aria-label="Interest rate"
        />
        <span className="cs_unit">%/yr</span>
      </div>
    )
  }
  return <span className="cs_unit">—</span>
}

function TermsCell({
  classItem: c,
  onPatch,
}: {
  classItem: ClassSetupClass
  onPatch: (partial: Partial<ClassSetupClass>) => void
}) {
  if (c.classType === "lp") {
    const p = c.preferredReturn
    if (!p.enabled) return <span className="cs_unit">—</span>
    return (
      <div className="cs_cellflex">
        <select
          value={p.compounding}
          onChange={(e) =>
            onPatch({
              preferredReturn: {
                ...p,
                compounding: e.target.value as "simple" | "compound",
              },
            })
          }
          aria-label="Compounding"
        >
          <option value="simple">Simple</option>
          <option value="compound">Compound</option>
        </select>
        {/* Preferred type
        <select
          value={p.preferredType}
          onChange={(e) =>
            onPatch({
              preferredReturn: {
                ...p,
                preferredType: e.target.value as "single" | "split",
              },
            })
          }
          aria-label="Preferred type"
        >
          <option value="single">Single</option>
          <option value="split">Split</option>
        </select>
        */}
      </div>
    )
  }
  if (c.classType === "preferred_equity") {
    const p = c.prefEquity
    return (
      <div className="cs_cellflex">
        <input
          className="cs_pct_in"
          type="number"
          step={0.25}
          min={0}
          value={p.currentRate}
          onChange={(e) => {
            const currentRate = e.target.value
            onPatch({
              prefEquity: {
                ...p,
                currentRate,
                accrualRate: String(
                  Math.max(
                    0,
                    Number(p.totalRate || 0) - Number(currentRate || 0),
                  ),
                ),
              },
            })
          }}
          aria-label="Current pay portion"
        />
        <span className="cs_unit">
          current · {formatPct(Math.max(0, Number(p.accrualRate || 0)))}{" "}
          accrued
        </span>
      </div>
    )
  }
  if (c.classType === "mezzanine") {
    return (
      <select
        value={c.mezz.pay}
        onChange={(e) => onPatch({ mezz: { ...c.mezz, pay: e.target.value } })}
        aria-label="Payment type"
      >
        <option>Current pay</option>
        <option>Partial PIK</option>
        <option>Full PIK</option>
      </select>
    )
  }
  if (c.classType === "gp") {
    return <span className="cs_unit">set in schedule ↓</span>
  }
  return <span className="cs_unit">—</span>
}

function promoteStageTooltip(stageIndex: number, label: string): string {
  if (stageIndex === 0) {
    return "Base split — this class’s share of residual cash before Hurdle 1 is met."
  }
  return `${label} — this class’s share of residual cash after that hurdle is met.`
}

function PromoteSplitsCell({
  classLabel,
  shares,
  stageLabels,
  onChange,
  onGotoPromote,
}: {
  classLabel: string
  shares: string[]
  stageLabels: string[]
  onChange: (stage: number, value: string) => void
  onGotoPromote: () => void
}) {
  const stages = Math.max(shares.length, stageLabels.length, 1)

  return (
    <div className="cs_promote_splits_edit">
      <div className="cs_promote_splits_inputs">
        {Array.from({ length: stages }, (_, s) => {
          const label = stageLabels[s] ?? `Stage ${s + 1}`
          return (
            <span key={s} className="cs_promote_stage_field">
              {s > 0 ? (
                <span className="cs_promote_arrow" aria-hidden>
                  →
                </span>
              ) : null}
              <FormTooltip
                label={`About ${label}`}
                placement="top"
                panelAlign="start"
                content={
                  <p className="cs_promote_stage_tip">
                    {promoteStageTooltip(s, label)}
                  </p>
                }
              />
              <input
                className="cs_pct_in"
                type="number"
                step={0.1}
                min={0}
                max={100}
                value={shares[s] ?? "0"}
                onChange={(e) => onChange(s, e.target.value)}
                aria-label={`${classLabel} ${label} share %`}
              />
              <span className="cs_unit">%</span>
            </span>
          )
        })}
      </div>
      <button
        type="button"
        className="cs_hurdles_btn"
        title="Open full hurdles & promote schedule"
        onClick={onGotoPromote}
      >
        schedule ↓
      </button>
    </div>
  )
}
