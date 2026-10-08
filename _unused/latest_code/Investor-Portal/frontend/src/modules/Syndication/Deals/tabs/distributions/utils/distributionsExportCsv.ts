import {
  buildTableExportFilename,
  downloadTableExportCsv,
} from "../../../../../../common/utils/tableExportFilename"
import { formatDateDdMmmYyyy } from "../../../../../../common/utils/formatDateDisplay"
import { escapeCsvCell } from "../../../utils/dealInvestorExportCsv"
import type { PriorDistributionRecord } from "../../../distribution-setup/types/distribution-setup.types"
import { parseMoneyDigits, formatAmountNumberExport } from "../../../utils/offeringMoneyFormat"

function formatDistributionDate(iso: string): string {
  const formatted = formatDateDdMmmYyyy(iso)
  return formatted === "—" ? iso : formatted
}

function sourceLabel(source: string | undefined): string {
  const s = (source ?? "").trim().toLowerCase()
  if (s === "capital" || s === "capital_event") return "Capital event"
  if (s === "operating") return "Operating"
  if (s === "fee" || s === "distribution_fee") return "GP Payment"
  return "—"
}

export function buildDistributionsExportCsv(
  rows: PriorDistributionRecord[],
): string {
  const headers = [
    "Name",
    "Date",
    "Amount",
    "Waterfall",
    "Period",
    "Status",
    "Investor payment lines",
    "Notes",
  ]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    const amount = parseMoneyDigits(row.amount)
    const line = [
      row.name?.trim() || "—",
      formatDistributionDate(row.date),
      Number.isFinite(amount) ? formatAmountNumberExport(amount) : "",
      sourceLabel(row.source),
      row.period ?? "—",
      "Completed",
      String(row.investorPayments?.length ?? 0),
      row.notes?.trim() || "",
    ]
    lines.push(line.map((c) => escapeCsvCell(String(c ?? ""))).join(","))
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function downloadDistributionsExportCsv(params: {
  rows: PriorDistributionRecord[]
  dealName?: string | null
}): void {
  const csv = buildDistributionsExportCsv(params.rows)
  const filename = buildTableExportFilename({
    dealName: params.dealName,
    tableSlug: "distribution",
  })
  downloadTableExportCsv(csv, filename)
}
