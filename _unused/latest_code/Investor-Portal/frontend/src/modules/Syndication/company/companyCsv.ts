import { formatDateDdMmmYyyy } from "../../../common/utils/formatDateDisplay"

export type CompanyExportRow = {
  id: string
  name: string
  status?: string
  createdAt?: string
  updatedAt?: string
  userCount?: number
  dealCount?: number
  contactCount?: number
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function companyStatusLabel(row: CompanyExportRow): string {
  const raw = String(row.status ?? "active").trim().toLowerCase();
  if (raw === "active") return "Active";
  if (raw === "inactive" || raw === "suspended") {
    return "Inactive";
  }
  const label = raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return label || "—";
}

export function buildCompaniesCsv(rows: CompanyExportRow[]): string {
  const headers = [
    "Company ID",
    "Company",
    "Deals",
    "Members",
    "No. of contacts",
    "Status",
    "Created",
    "Last updated",
  ];
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    const created = row.createdAt ? formatDateDdMmmYyyy(row.createdAt) : "—";
    const updated = row.updatedAt ? formatDateDdMmmYyyy(row.updatedAt) : "—";
    lines.push(
      [
        row.id,
        row.name,
        String(row.dealCount ?? 0),
        String(row.userCount ?? 0),
        String(row.contactCount ?? 0),
        companyStatusLabel(row),
        created === "—" ? "" : created,
        updated === "—" ? "" : updated,
      ]
        .map((c) => escapeCsvCell(c))
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCompaniesCsv(content: string, filename: string): void {
  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportAuditLinesForCompanies(rows: CompanyExportRow[]): string[] {
  return rows.map((r) => r.name?.trim() || "—");
}
