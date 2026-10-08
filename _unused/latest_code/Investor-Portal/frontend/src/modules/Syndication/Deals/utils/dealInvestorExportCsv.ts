import { formatMemberUsername } from "../../usermanagement/memberAdminShared"
import {
  dealInvestorProfileDisplayName,
  investorRoleLabel,
} from "../constants/investor-profile"
import type { DealInvestorRow } from "../types/deal-investors.types"
import {
  displayAddedInvestorsCommittedAmountExport,
  displayInvestorCommittedAmountExport,
} from "../utils/offeringMoneyFormat"
import {
  dealInvestorStatusForTable,
  investorFundedColumnLabel,
} from "./dealInvestorTableDisplay"

import { downloadTableExportCsv } from "../../../../common/utils/tableExportFilename"

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function dealInvestorRowExportKey(row: DealInvestorRow): string {
  const id = row.id?.trim()
  if (id) return id
  const e = String(row.userEmail ?? "").trim()
  const n = String(row.displayName ?? "").trim()
  return `k:${n}|${e}`
}

export function exportAuditLinesForDealInvestorRows(
  rows: DealInvestorRow[],
): string[] {
  return rows.map((row) => {
    const name = String(row.displayName ?? "").trim()
    const em = String(row.userEmail ?? "").trim()
    if (name && name !== "—" && em && em !== "—") return `${name} (${em})`
    if (em && em !== "—") return em
    return name && name !== "—" ? name : "—"
  })
}

export function buildDealInvestorsExportCsv(
  rows: DealInvestorRow[],
  dealAllClassNamesLine: string,
): string {
  const headers = [
    "Member name",
    "Profile",
    "Role",
    "Investor class",
    "Status",
    "Sponsor name",
    "Committed",
    "Signed",
    "Funded",
    "Self accredited",
    "Verified accreditation",
    "Username",
    "Email",
  ]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    const invClass =
      (row.investorClass ?? "").trim() ||
      dealAllClassNamesLine.trim() ||
      "—"
    const roleForCsv = investorRoleLabel(row.investorRole ?? "")
    const line = [
      row.displayName,
      dealInvestorProfileDisplayName(row),
      roleForCsv,
      invClass,
      dealInvestorStatusForTable(row),
      String(row.addedByDisplayName ?? "").trim() || "—",
      displayInvestorCommittedAmountExport(row),
      row.signedDate,
      investorFundedColumnLabel(row),
      row.selfAccredited,
      row.verifiedAccLabel,
      row.userDisplayName,
      row.userEmail,
    ]
    lines.push(line.map((c) => escapeCsvCell(String(c ?? ""))).join(","))
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function buildDealMembersTableExportCsv(rows: DealInvestorRow[]): string {
  const headers = [
    "User",
    "Role",
    "Class",
    "Commitment",
    "Investors added",
    "Status",
    "Added by",
    "Username",
    "Email",
  ]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    const line = [
      row.displayName,
      investorRoleLabel(row.investorRole ?? ""),
      row.investorClass,
      displayInvestorCommittedAmountExport(row),
      displayAddedInvestorsCommittedAmountExport(row),
      dealInvestorStatusForTable(row),
      row.addedByDisplayName,
      formatMemberUsername(row.userDisplayName),
      row.userEmail,
    ]
    lines.push(line.map((c) => escapeCsvCell(String(c ?? ""))).join(","))
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function downloadDealExportCsv(content: string, filename: string): void {
  downloadTableExportCsv(content, filename)
}
