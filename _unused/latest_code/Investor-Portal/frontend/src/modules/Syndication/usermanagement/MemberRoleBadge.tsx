import { LayoutGrid, ShieldCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { primaryRoleLabelFromRow } from "./memberAdminShared"

function pickIconForMemberRole(
  row: Record<string, unknown>,
  label: string,
): LucideIcon | null {
  const raw = String(row.role ?? "").trim().toLowerCase()
  const normalizedLabel = label.trim().toLowerCase()

  if (raw === "company_admin" || normalizedLabel === "company admin") {
    return ShieldCheck
  }
  if (raw === "company_user" || normalizedLabel === "company member") {
    return LayoutGrid
  }
  return null
}

/** Role pill for Org Members / company Members tables (Company Admin, Company Member icons). */
export function MemberRoleBadge({ row }: { row: Record<string, unknown> }) {
  const label = primaryRoleLabelFromRow(row)

  if (!label || label === "—") {
    return <span className="um_status_muted">—</span>
  }

  const Icon = pickIconForMemberRole(row, label)

  return (
    <span className="um_role_badge um_member_role_badge">
      {Icon ? (
        <Icon
          className="um_role_badge_icon"
          size={16}
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
      <span className="um_role_badge_label">{label}</span>
    </span>
  )
}
