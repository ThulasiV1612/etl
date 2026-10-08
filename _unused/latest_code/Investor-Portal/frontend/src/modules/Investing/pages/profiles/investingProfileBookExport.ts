import type { BeneficiaryDraft } from "./AddBeneficiaryModal"
import type { SavedAddress } from "./address.types"
import type { InvestorProfileListRow } from "./investor-profiles.types"
import { bookProfileTypeDisplayLabel } from "@/modules/Syndication/Deals/utils/resolveInvestNowDealContext"
import { buildTableExportFilename, downloadTableExportCsv } from "@/common/utils/tableExportFilename"

function esc(v: string): string {
  const s = String(v ?? "").replace(/"/g, '""')
  return `"${s}"`
}

function formatDateForExport(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ""
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const BOM = "\ufeff"

export function exportInvestorProfileRow(row: InvestorProfileListRow): void {
  const headers = [
    "Profile name",
    "Profile type",
    "Added by",
    "Investments",
    "Date created",
    "Archived",
  ]
  const lines = [
    headers.join(","),
    [
      esc(row.profileName),
      esc(bookProfileTypeDisplayLabel(row)),
      esc(row.addedBy),
      esc(String(row.investmentsCount ?? 0)),
      esc(formatDateForExport(row.dateCreated)),
      esc(row.archived ? "Yes" : "No"),
    ].join(","),
  ]
  const filename = buildTableExportFilename({
    dealName: row.profileName,
    tableSlug: "investor-profile",
  })
  downloadTableExportCsv(BOM + lines.join("\n"), filename)
}

export function exportBeneficiaryRow(
  row: BeneficiaryDraft & { id: string; archived?: boolean },
): void {
  const headers = [
    "Name",
    "Relationship",
    "Email",
    "Phone",
    "Address",
    "Tax ID",
    "Archived",
  ]
  const lines = [
    headers.join(","),
    [
      esc(row.fullName),
      esc(row.relationship),
      esc(row.email),
      esc(row.phone),
      esc(row.addressQuery),
      esc(row.taxId),
      esc(row.archived ? "Yes" : "No"),
    ].join(","),
  ]
  const filename = buildTableExportFilename({
    dealName: row.fullName,
    tableSlug: "beneficiary",
  })
  downloadTableExportCsv(BOM + lines.join("\n"), filename)
}

/** Multi-row CSV for export modal (same columns as `exportBeneficiaryRow`). */
export function buildBeneficiariesExportCsv(
  rows: (BeneficiaryDraft & { id: string; archived?: boolean })[],
): string {
  const headers = [
    "Name",
    "Relationship",
    "Email",
    "Phone",
    "Address",
    "Tax ID",
    "Archived",
  ]
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(
      [
        esc(row.fullName),
        esc(row.relationship),
        esc(row.email),
        esc(row.phone),
        esc(row.addressQuery),
        esc(row.taxId),
        esc(row.archived ? "Yes" : "No"),
      ].join(","),
    )
  }
  return lines.join("\n")
}

/** Multi-row CSV for export modal (same columns as `exportSavedAddressRow`). */
export function buildAddressesExportCsv(rows: SavedAddress[]): string {
  const headers = [
    "Name / company",
    "Country",
    "Street 1",
    "Street 2",
    "City",
    "State",
    "Zip",
    "Check memo",
    "Distribution note",
    "Archived",
  ]
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(
      [
        esc(row.fullNameOrCompany),
        esc(row.country),
        esc(row.street1),
        esc(row.street2),
        esc(row.city),
        esc(row.state),
        esc(row.zip),
        esc(row.checkMemo),
        esc(row.distributionNote),
        esc(row.archived ? "Yes" : "No"),
      ].join(","),
    )
  }
  return lines.join("\n")
}

export function downloadExportCsv(
  content: string,
  filename: string,
  withBom = true,
): void {
  downloadTableExportCsv(withBom ? `${BOM}${content}` : content, filename)
}

export function exportSavedAddressRow(row: SavedAddress): void {
  const headers = [
    "Name / company",
    "Country",
    "Street 1",
    "Street 2",
    "City",
    "State",
    "Zip",
    "Check memo",
    "Distribution note",
    "Archived",
  ]
  const lines = [
    headers.join(","),
    [
      esc(row.fullNameOrCompany),
      esc(row.country),
      esc(row.street1),
      esc(row.street2),
      esc(row.city),
      esc(row.state),
      esc(row.zip),
      esc(row.checkMemo),
      esc(row.distributionNote),
      esc(row.archived ? "Yes" : "No"),
    ].join(","),
  ]
  const filename = buildTableExportFilename({
    dealName: row.fullNameOrCompany,
    tableSlug: "saved-address",
  })
  downloadTableExportCsv(BOM + lines.join("\n"), filename)
}
