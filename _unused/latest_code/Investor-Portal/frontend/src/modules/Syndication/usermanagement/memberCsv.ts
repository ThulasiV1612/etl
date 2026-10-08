import { formatDateDdMmmYyyy } from "../../../common/utils/formatDateDisplay"
import { formatUsPhoneStoredForUi } from "../../../common/phone/usPhoneNumber"
import {
  accountStatusForUi,
  assignedDealCountFromRow,
  formatMemberUsername,
  formatMembershipsCsvCell,
  formatOrganizationsCsvCell,
  formatRoleCsvCell,
  formatValue,
  rowDisplayName,
  userStatusForUi,
  type OrganizationDisplayScope,
} from "./memberAdminShared"

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function csvPlain(value: string): string {
  const s = value.trim()
  return s === "—" ? "" : s
}

function memberField(row: Record<string, unknown>, camel: string, snake: string): string {
  return csvPlain(formatValue(row[camel] ?? row[snake]))
}

function memberId(row: Record<string, unknown>): string {
  const id = row.id ?? row.userId ?? row.user_id
  return id != null ? String(id).trim() : ""
}

function memberDateForCsv(
  row: Record<string, unknown>,
  camel: string,
  snake: string,
): string {
  const raw = row[camel] ?? row[snake]
  return csvPlain(formatDateDdMmmYyyy(raw as string | Date | null | undefined))
}

export function getMemberCsvHeaders(
  organizationScope?: OrganizationDisplayScope | null,
): string[] {
  const orgHeader = organizationScope?.companyId ? "Organization" : "Organizations"
  return [
    "Member ID",
    "First name",
    "Last name",
    "Display name",
    "Username",
    "Email",
    "Phone",
    "Roles",
    "Memberships",
    orgHeader,
    "User Status",
    "Account status",
    "Assigned deals",
    "Created",
    "Last updated",
    "Invite expires",
  ]
}

export function memberCsvValuesForRow(
  row: Record<string, unknown>,
  organizationScope?: OrganizationDisplayScope | null,
): string[] {
  return [
    memberId(row),
    memberField(row, "firstName", "first_name"),
    memberField(row, "lastName", "last_name"),
    csvPlain(rowDisplayName(row)),
    csvPlain(formatMemberUsername(row)),
    memberField(row, "email", "email"),
    csvPlain(formatUsPhoneStoredForUi(row.phone)),
    csvPlain(formatRoleCsvCell(row)),
    csvPlain(formatMembershipsCsvCell(row)),
    csvPlain(formatOrganizationsCsvCell(row, organizationScope)),
    userStatusForUi(row).label,
    accountStatusForUi(row).label,
    String(assignedDealCountFromRow(row)),
    memberDateForCsv(row, "createdAt", "created_at"),
    memberDateForCsv(row, "updatedAt", "updated_at"),
    memberDateForCsv(row, "inviteExpiresAt", "invite_expires_at"),
  ]
}

export function buildMembersCsv(
  rows: Record<string, unknown>[],
  organizationScope?: OrganizationDisplayScope | null,
): string {
  const headers = getMemberCsvHeaders(organizationScope)
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(
      memberCsvValuesForRow(row, organizationScope)
        .map((c) => escapeCsvCell(c))
        .join(","),
    )
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function downloadMembersCsv(content: string, filename: string): void {
  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;",
  })
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

export function exportAuditLinesForMembers(
  rows: Record<string, unknown>[],
): string[] {
  return rows.map((row) => {
    const label = rowDisplayName(row)
    const em = formatValue(row.email).trim()
    const base = label && label !== "—" ? label : em || "—"
    if (em && em !== "—" && base !== em) return `${base} (${em})`
    if (em && em !== "—") return em
    return String(base)
  })
}

export function memberRowKey(row: Record<string, unknown>): string {
  const id = row.id
  if (typeof id === "string" && id.trim()) return id.trim()
  if (typeof id === "number" && Number.isFinite(id)) return String(id)
  const u = formatMemberUsername(row.username)
  const e = formatValue(row.email)
  return `k:${u}|${e}`
}
