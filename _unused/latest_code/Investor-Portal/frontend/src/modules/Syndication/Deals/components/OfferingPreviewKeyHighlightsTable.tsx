import type { KeyHighlightPreviewRow } from "../dealOfferingPreviewShared"

export interface OfferingPreviewKeyHighlightsTableProps {
  rows: KeyHighlightPreviewRow[]
  /** Second column header: name of the first investor class created for the deal. */
  classColumnHeader: string
}

/**
 * Read-only Key Highlights — neat two-column table for offering portfolio preview.
 */
export function OfferingPreviewKeyHighlightsTable({
  rows,
  classColumnHeader,
}: OfferingPreviewKeyHighlightsTableProps) {
  if (rows.length === 0) return null

  return (
    <div className="deal_offer_pf_kh_table_wrap">
      <table className="deal_offer_pf_kh_table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">{classColumnHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isEmpty = row.newClass === "—" || !row.newClass.trim()
            return (
              <tr key={`${row.metric}-${row.newClass}-${i}`}>
                <th scope="row">{row.metric}</th>
                <td>
                  <span
                    className={
                      isEmpty
                        ? "deal_offer_pf_kh_value deal_offer_pf_kh_value--empty"
                        : "deal_offer_pf_kh_value"
                    }
                  >
                    {isEmpty ? "—" : row.newClass}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
