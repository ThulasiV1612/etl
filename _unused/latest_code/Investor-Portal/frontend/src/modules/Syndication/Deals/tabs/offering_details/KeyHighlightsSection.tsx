import { GripVertical, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "../../../../../common/components/Toast"
import {
  fetchDealInvestorClasses,
  patchDealKeyHighlights,
  type DealDetailApi,
} from "../../api/dealsApi"
import {
  firstCreatedInvestorClassName,
  OFFERING_KEY_HIGHLIGHT_PRESET_METRICS,
} from "../../dealOfferingPreviewShared"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"

interface KeyMetricRow {
  id: string
  metric: string
  newClass: string
  isPreset?: boolean
}

function initialRows(): KeyMetricRow[] {
  return OFFERING_KEY_HIGHLIGHT_PRESET_METRICS.map((metric, i) => ({
    id: `preset-${i}`,
    metric,
    newClass: "",
    isPreset: true,
  }))
}

function cloneRows(rows: KeyMetricRow[]): KeyMetricRow[] {
  return rows.map((r) => ({ ...r }))
}

function rowsFromStoredJson(stored: string | null | undefined): KeyMetricRow[] {
  const t = stored?.trim()
  if (!t) return initialRows()
  try {
    const parsed = JSON.parse(t) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return initialRows()
    const out: KeyMetricRow[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const o = item as Record<string, unknown>
      const id = typeof o.id === "string" ? o.id : ""
      if (!id) continue
      out.push({
        id,
        metric: typeof o.metric === "string" ? o.metric : "",
        newClass: typeof o.newClass === "string" ? o.newClass : "",
        isPreset: o.isPreset === true,
      })
    }
    if (out.length === 0) return initialRows()
    return out
  } catch {
    return initialRows()
  }
}

function serializeRows(rows: KeyMetricRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      metric: r.metric,
      newClass: r.newClass,
      isPreset: Boolean(r.isPreset),
    })),
  )
}

type KeyHighlightsSectionProps = {
  dealId: string
  initialStoredJson?: string | null
  onSaved?: (deal: DealDetailApi) => void
}

function rowsEqual(a: KeyMetricRow[], b: KeyMetricRow[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      !x ||
      !y ||
      x.id !== y.id ||
      x.metric !== y.metric ||
      x.newClass !== y.newClass ||
      Boolean(x.isPreset) !== Boolean(y.isPreset)
    ) {
      return false
    }
  }
  return true
}

export function KeyHighlightsSection({
  dealId,
  initialStoredJson,
  onSaved,
}: KeyHighlightsSectionProps) {
  const [rows, setRows] = useState<KeyMetricRow[]>(() =>
    rowsFromStoredJson(initialStoredJson),
  )
  const [savedSnapshot, setSavedSnapshot] = useState<KeyMetricRow[]>(() =>
    cloneRows(rowsFromStoredJson(initialStoredJson)),
  )
  const [saving, setSaving] = useState(false)
  const [investorClasses, setInvestorClasses] = useState<DealInvestorClass[]>([])
  const dragFromRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await fetchDealInvestorClasses(dealId)
      if (!cancelled) setInvestorClasses(list)
    })()
    return () => {
      cancelled = true
    }
  }, [dealId])

  const classColumnLabel = useMemo(
    () => firstCreatedInvestorClassName(investorClasses),
    [investorClasses],
  )

  useEffect(() => {
    const next = rowsFromStoredJson(initialStoredJson)
    setRows(next)
    setSavedSnapshot(cloneRows(next))
  }, [dealId, initialStoredJson])

  const isDirty = useMemo(
    () => !rowsEqual(rows, savedSnapshot),
    [rows, savedSnapshot],
  )

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await patchDealKeyHighlights(
        dealId,
        serializeRows(rows),
      )
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onSaved?.(result.deal)
      const fromApi = result.deal.keyHighlightsJson?.trim() ?? ""
      const rawForRows =
        fromApi !== "" ? fromApi : serializeRows(rows)
      const next = rowsFromStoredJson(rawForRows)
      setRows(next)
      setSavedSnapshot(cloneRows(next))
      toast.success("Key highlights saved.")
    } finally {
      setSaving(false)
    }
  }, [dealId, rows, saving, onSaved])

  const handleReset = useCallback(() => {
    setRows(cloneRows(savedSnapshot))
  }, [savedSnapshot])

  const addMetric = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        metric: "",
        newClass: "",
        isPreset: false,
      },
    ])
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const updateRow = useCallback(
    (id: string, patch: Partial<Pick<KeyMetricRow, "metric" | "newClass">>) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      )
    },
    [],
  )

  const onDragStart = useCallback((index: number) => {
    dragFromRef.current = index
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback((toIndex: number) => {
    const from = dragFromRef.current
    dragFromRef.current = null
    if (from === null || from === toIndex) return
    setRows((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const onDragEnd = useCallback(() => {
    dragFromRef.current = null
  }, [])

  return (
    <div className="deal_kh">
      {investorClasses.length === 0 ? (
        <p className="deal_offering_muted deal_kh_class_hint" role="status">
          Add an investor class in Offering information — its name labels the
          values column below.
        </p>
      ) : null}
      <div className="deal_kh_toolbar">
        <button
          type="button"
          className="um_btn_primary"
          onClick={addMetric}
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
          Add key metric
        </button>
      </div>

      <div className="deal_kh_table" role="table" aria-label="Key highlights">
        <div className="deal_kh_thead" role="rowgroup">
          <div className="deal_kh_tr deal_kh_tr_head" role="row">
            <div className="deal_kh_th deal_kh_col_drag" aria-hidden />
            <div className="deal_kh_th" role="columnheader">
              Metric
            </div>
            <div className="deal_kh_th" role="columnheader">
              {classColumnLabel}
            </div>
            <div className="deal_kh_th deal_kh_th_actions" role="columnheader">
              Actions
            </div>
          </div>
        </div>
        <div className="deal_kh_tbody" role="rowgroup">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="deal_kh_tr deal_kh_tr_body"
              role="row"
              onDragOver={onDragOver}
              onDrop={() => onDrop(index)}
            >
              <div
                className="deal_kh_td deal_kh_col_drag deal_kh_col_drag_handle"
                role="cell"
                aria-label="Drag to reorder"
                draggable
                onDragStart={(e) => {
                  e.stopPropagation()
                  onDragStart(index)
                }}
                onDragEnd={onDragEnd}
              >
                <span className="deal_kh_grip" aria-hidden>
                  <GripVertical size={18} strokeWidth={2} />
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                {row.isPreset ? (
                  <span className="deal_kh_metric_label">{row.metric}</span>
                ) : (
                  <input
                    type="text"
                    className="deal_kh_input deal_kh_input_metric"
                    placeholder="Metric name"
                    value={row.metric}
                    onChange={(e) =>
                      updateRow(row.id, { metric: e.target.value })
                    }
                    aria-label="Metric name"
                  />
                )}
              </div>
              <div className="deal_kh_td" role="cell">
                <input
                  type="text"
                  className="deal_kh_input"
                  placeholder=""
                  value={row.newClass}
                  onChange={(e) =>
                    updateRow(row.id, { newClass: e.target.value })
                  }
                  aria-label={`${classColumnLabel} value for ${row.metric || "metric"}`}
                />
              </div>
              <div
                className="deal_kh_td deal_kh_td_actions"
                role="cell"
              >
                <button
                  type="button"
                  className="deal_kh_row_delete"
                  onClick={() => removeRow(row.id)}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={
                    row.isPreset
                      ? `Remove ${row.metric}`
                      : "Remove metric"
                  }
                >
                  <Trash2 size={18} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="deal_kh_footer um_modal_actions add_contact_modal_actions">
        <button
          type="button"
          className="um_btn_secondary"
          disabled={!isDirty || saving}
          onClick={handleReset}
        >
          <RotateCcw size={17} strokeWidth={2} aria-hidden />
          Reset
        </button>
        <div className="add_contact_modal_actions_trailing">
          <button
            type="button"
            className="um_btn_primary"
            disabled={!isDirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2
                  size={18}
                  strokeWidth={2}
                  className="deal_offering_btn_spin"
                  aria-hidden
                />
                Saving…
              </>
            ) : (
              <>
                <Save size={18} strokeWidth={2} aria-hidden />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
