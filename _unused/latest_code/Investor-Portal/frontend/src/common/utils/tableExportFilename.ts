/** Excel opens UTF-8 CSV reliably when saved with this MIME type. */
export const TABLE_EXPORT_CSV_MIME = "application/vnd.ms-excel;charset=utf-8;"

const MAX_PART_LEN = 80

/** Safe filename segment (ASCII letters, digits, hyphen, underscore, dot). */
export function sanitizeExportFilenamePart(
  value: string | null | undefined,
  fallback: string,
): string {
  const t = String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, MAX_PART_LEN)
  return t || fallback
}

export type TableExportFilenameOptions = {
  /** Deal display name when the export is scoped to one deal. */
  dealName?: string | null
  /**
   * Table identifier for the file name, e.g. `investor`, `deal-member`, `assets`.
   * When omitted with a deal name, the file is `{dealName}.csv`.
   */
  tableSlug?: string | null
  /** File extension without dot (default `csv`). */
  extension?: string
  /** Use a date stamp when there is no deal name (e.g. multi-deal export). */
  includeDateStamp?: boolean
}

/**
 * Build a download file name from deal + table context.
 * Examples: `Sunset-Apts-investor.csv`, `Sunset-Apts-deal-member.csv`, `My-Deal.csv`
 */
export function buildTableExportFilename(
  opts: TableExportFilenameOptions,
): string {
  const ext = (opts.extension ?? "csv").replace(/^\./, "")
  const table = opts.tableSlug
    ? sanitizeExportFilenamePart(opts.tableSlug, "export")
    : ""
  const deal = sanitizeExportFilenamePart(opts.dealName, "")

  if (deal && table) return `${deal}-${table}.${ext}`
  if (deal) return `${deal}.${ext}`

  const stamp =
    opts.includeDateStamp !== false
      ? new Date().toISOString().slice(0, 10)
      : ""
  const base = table || "export"
  return stamp ? `${base}-${stamp}.${ext}` : `${base}.${ext}`
}

export function downloadTableExportCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: TABLE_EXPORT_CSV_MIME })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
