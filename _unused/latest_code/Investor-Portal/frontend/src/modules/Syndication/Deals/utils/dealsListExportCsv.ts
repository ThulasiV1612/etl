import { downloadTableExportCsv } from "../../../../common/utils/tableExportFilename"
import { dealStageLabel } from "../../dealsDashboardUtils"
import {
  DEAL_FORM_TYPE_OPTIONS,
  DEAL_TYPE_LABELS,
  type DealListRow,
  type DealTypeOption,
} from "../types/deals.types"
import { formatAmountNumberExport, parseMoneyDigits } from "./offeringMoneyFormat"
import { formatDealListDateDisplay } from "../dealsListDisplay"

function dealTypeLabel(code: string): string {
  if (code === "—" || !code) return "—"
  const fromForm = DEAL_FORM_TYPE_OPTIONS.find((o) => o.value === code)
  if (fromForm) return fromForm.label
  const k = code as DealTypeOption
  return DEAL_TYPE_LABELS[k] ?? code
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value))
    return `"${value.replace(/"/g, '""')}"`
  return value
}

function dealCsvCell(value: string | number | boolean | undefined | null): string {
  if (value == null) return ""
  const s = String(value).trim()
  return s === "—" ? "" : s
}

/** Money-ish deal list fields → plain number for Excel. */
function dealMoneyCsvCell(value: string | number | undefined | null): string {
  if (value == null) return ""
  const s = String(value).trim()
  if (!s || s === "—") return ""
  const n = typeof value === "number" ? value : parseMoneyDigits(s)
  if (!Number.isFinite(n)) return dealCsvCell(s)
  return formatAmountNumberExport(n)
}

export function buildDealsListExportCsv(rows: DealListRow[]): string {
  const headers = [
    "Deal ID",
    "Deal name",
    "Deal type",
    "Deal stage",
    "Start date",
    "Close date",
    "Created date",
    "Location",
    "City",
    "Property name",
    "Owning entity",
    "SEC type",
    "Investment type",
    "Property type",
    "Offering status",
    "Total in progress",
    "Total accepted",
    "Raise target",
    "Next billing",
    "Distributions",
    "Investors",
    "Investor class",
    "Investments",
    "Review rating",
    "Review count",
    "Archived",
  ]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.dealName,
        dealTypeLabel(row.dealType),
        dealStageLabel(row.dealStage),
        row.startDateDisplay ?? row.createdDateDisplay,
        row.closeDateDisplay,
        row.createdDateDisplay,
        row.locationDisplay,
        row.city,
        row.propertyName,
        row.owningEntityName,
        row.secType,
        row.investmentType,
        row.propertyType,
        row.offeringStatus,
        dealMoneyCsvCell(row.totalInProgress),
        dealMoneyCsvCell(row.totalAccepted),
        dealMoneyCsvCell(row.raiseTarget),
        row.nextBillingDate
          ? formatDealListDateDisplay(row.nextBillingDate)
          : row.archived
            ? "Not billed"
            : "",
        row.distributions,
        row.investors,
        row.investorClass,
        row.investmentsDisplay,
        row.reviewRating != null ? String(row.reviewRating) : "",
        row.reviewCount != null ? String(row.reviewCount) : "",
        row.archived ? "Yes" : "No",
      ]
        .map((c) => escapeCsvCell(dealCsvCell(c)))
        .join(","),
    )
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function downloadDealsListExportCsv(
  content: string,
  filename: string,
): void {
  downloadTableExportCsv(content, filename)
}

export function exportAuditLinesForDealListRows(rows: DealListRow[]): string[] {
  return rows.map((r) => r.dealName?.trim() || "—")
}
