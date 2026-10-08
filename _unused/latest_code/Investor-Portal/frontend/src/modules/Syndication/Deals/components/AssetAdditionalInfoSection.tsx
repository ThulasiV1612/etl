import { GripVertical } from "lucide-react"
import { useCallback, useId, useState } from "react"
import {
  ASSET_TYPE_SUGGESTIONS,
  NUMBER_UNIT_SUFFIXES,
  type AssetAttributeRow,
} from "../types/deal-asset.types"
import {
  formatNumberOfUnitsTypingInput,
  moneyAmountOnBlurTwoDecimals,
  moneyAmountOnChange,
  blurFormatNumberOfUnitsInput,
} from "../utils/offeringMoneyFormat"
import "./asset-additional-info.css"

function patchRow(
  rows: AssetAttributeRow[],
  id: string,
  patch: Partial<AssetAttributeRow>,
): AssetAttributeRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

interface AssetAdditionalInfoSectionProps {
  rows: AssetAttributeRow[]
  onChange: (next: AssetAttributeRow[]) => void
}

export function AssetAdditionalInfoSection({
  rows,
  onChange,
}: AssetAdditionalInfoSectionProps) {
  const datalistId = useId()
  const [dragId, setDragId] = useState<string | null>(null)

  const moveRow = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return
      const ix = rows.findIndex((r) => r.id === fromId)
      const iy = rows.findIndex((r) => r.id === toId)
      if (ix < 0 || iy < 0) return
      const next = [...rows]
      const [removed] = next.splice(ix, 1)
      next.splice(iy, 0, removed)
      onChange(next)
    },
    [rows, onChange],
  )

  const renderValueCell = (r: AssetAttributeRow) => {
    switch (r.kind) {
      case "asset_type_search":
        return (
          <>
            <input
              type="text"
              className="deal_asset_attr_input deal_asset_attr_input_search"
              placeholder="Search asset type…"
              value={r.value}
              onChange={(e) =>
                onChange(patchRow(rows, r.id, { value: e.target.value }))
              }
              list={datalistId}
              aria-label={`${r.label} value`}
            />
            <datalist id={datalistId}>
              {ASSET_TYPE_SUGGESTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </>
        )
      case "text":
        return (
          <input
            type="text"
            className="deal_asset_attr_input"
            value={r.value}
            onChange={(e) =>
              onChange(patchRow(rows, r.id, { value: e.target.value }))
            }
            aria-label={`${r.label} value`}
          />
        )
      case "money":
        return (
          <input
            type="text"
            inputMode="decimal"
            className="deal_asset_attr_input"
            value={r.value}
            onChange={(e) =>
              onChange(
                patchRow(rows, r.id, {
                  value: moneyAmountOnChange(e.target.value),
                }),
              )
            }
            onBlur={(e) =>
              onChange(
                patchRow(rows, r.id, {
                  value: moneyAmountOnBlurTwoDecimals(e.target.value),
                }),
              )
            }
            aria-label={`${r.label} value`}
          />
        )
      case "number_units":
        return (
          <div className="deal_asset_attr_num_units_wrap">
            <input
              type="text"
              inputMode="decimal"
              className="deal_asset_attr_input deal_asset_attr_input_num deal_asset_attr_num_units_input"
              value={r.value}
              onChange={(e) =>
                onChange(
                  patchRow(rows, r.id, {
                    value: formatNumberOfUnitsTypingInput(e.target.value),
                  }),
                )
              }
              onBlur={(e) =>
                onChange(
                  patchRow(rows, r.id, {
                    value: blurFormatNumberOfUnitsInput(e.target.value),
                  }),
                )
              }
              aria-label={`${r.label} amount`}
            />
            <select
              className="deal_asset_attr_select deal_asset_attr_num_units_select"
              value={r.unitSuffix ?? "Units"}
              onChange={(e) =>
                onChange(
                  patchRow(rows, r.id, { unitSuffix: e.target.value }),
                )
              }
              aria-label={`${r.label} unit`}
            >
              {NUMBER_UNIT_SUFFIXES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )
      case "date_na":
        return (
          <div className="deal_asset_attr_date_row">
            <input
              type="date"
              className="deal_asset_attr_input deal_asset_attr_input_date"
              disabled={r.na}
              value={r.na ? "" : r.value}
              onChange={(e) =>
                onChange(patchRow(rows, r.id, { value: e.target.value }))
              }
              aria-label={`${r.label}`}
            />
            <label className="deal_asset_attr_na">
              <input
                type="checkbox"
                checked={r.na ?? false}
                onChange={(e) =>
                  onChange(
                    patchRow(rows, r.id, {
                      na: e.target.checked,
                      value: e.target.checked ? "" : r.value,
                    }),
                  )
                }
              />
              <span>N/A</span>
            </label>
          </div>
        )
      case "year_na":
        return (
          <div className="deal_asset_attr_year_na_row">
            <input
              type="number"
              className="deal_asset_attr_input deal_asset_attr_input_year"
              placeholder="YYYY"
              min={1800}
              max={2100}
              disabled={r.na}
              value={r.na ? "" : r.value}
              onChange={(e) =>
                onChange(patchRow(rows, r.id, { value: e.target.value }))
              }
              aria-label={`${r.label}`}
            />
            <label className="deal_asset_attr_na">
              <input
                type="checkbox"
                checked={r.na ?? false}
                onChange={(e) =>
                  onChange(
                    patchRow(rows, r.id, {
                      na: e.target.checked,
                      value: e.target.checked ? "" : r.value,
                    }),
                  )
                }
              />
              <span>N/A</span>
            </label>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="deal_asset_attr_table_wrap">
      <div className="deal_asset_attr_table" role="table" aria-label="Additional attributes">
        <div className="deal_asset_attr_thead" role="rowgroup">
          <div className="deal_asset_attr_tr deal_asset_attr_tr_head" role="row">
            <div className="deal_asset_attr_th deal_asset_attr_th_handle" role="columnheader" aria-hidden />
            <div className="deal_asset_attr_th" role="columnheader">
              Label
            </div>
            <div className="deal_asset_attr_th" role="columnheader">
              Value
            </div>
          </div>
        </div>
        <div className="deal_asset_attr_tbody" role="rowgroup">
          {rows.map((r) => (
            <div
              key={r.id}
              className={[
                "deal_asset_attr_tr",
                "deal_asset_attr_tr_body",
                r.kind === "number_units"
                  ? "deal_asset_attr_tr_num_units"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="row"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = e.dataTransfer.getData("text/plain") || dragId
                if (from) moveRow(from, r.id)
                setDragId(null)
              }}
            >
              <div className="deal_asset_attr_td deal_asset_attr_td_handle" role="cell">
                <div
                  className="deal_asset_attr_drag"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", r.id)
                    e.dataTransfer.effectAllowed = "move"
                    setDragId(r.id)
                  }}
                  onDragEnd={() => setDragId(null)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Drag to reorder ${r.label}`}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return
                    e.preventDefault()
                  }}
                >
                  <GripVertical size={18} strokeWidth={2} aria-hidden />
                </div>
              </div>
              <div className="deal_asset_attr_td" role="cell">
                {r.preset ? (
                  <span className="deal_asset_attr_label_text">{r.label}</span>
                ) : (
                  <input
                    type="text"
                    className="deal_asset_attr_input deal_asset_attr_input_label"
                    placeholder="Label"
                    value={r.label}
                    onChange={(e) =>
                      onChange(patchRow(rows, r.id, { label: e.target.value }))
                    }
                    aria-label="Attribute label"
                  />
                )}
              </div>
              <div
                className={[
                  "deal_asset_attr_td",
                  "deal_asset_attr_td_value",
                  r.kind === "number_units"
                    ? "deal_asset_attr_td_num_units"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="cell"
              >
                {renderValueCell(r)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
