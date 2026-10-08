import { Award, ClipboardList, Handshake, Shield, UserCircle, Users } from "lucide-react"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  investorRoleLabel,
  LP_INVESTORS_ROLE_LABEL,
  LP_INVESTOR_ROLE_VALUE,
} from "../../constants/investor-profile"

function pickIconForRoleLabel(label: string) {
  const raw = label.trim().toLowerCase()
  if (
    raw === LP_INVESTOR_ROLE_VALUE ||
    raw === "lp investors" ||
    raw === "lp investor" ||
    raw === LP_INVESTORS_ROLE_LABEL.toLowerCase()
  )
    return Users
  if (raw === "lead sponsor") return Award
  if (raw === "admin sponsor") return ClipboardList
  if (raw === "co-sponsor") return UserCircle
  if (raw === "team member" || raw === "team members") return Handshake
  if (
    raw === "general partner" ||
    raw === "general partners" ||
    raw === "deal member"
  )
    return Shield
  return Shield
}

function dedupeDisplayLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of labels) {
    const label = investorRoleLabel(raw)
    if (!label || label === "—") continue
    const k = label.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(label)
  }
  return out
}

/**
 * Deal roster / LP role(s) for Deal Members and Investors tables.
 * Prefer `memberRoleLabels` when the API sends multiple distinct roles; otherwise uses `investorRole`.
 */
export function DealInvestorRoleBadge({
  investorRole,
  memberRoleLabels,
}: {
  investorRole?: string
  memberRoleLabels?: string[]
}) {
  const fromArray =
    memberRoleLabels?.length &&
    dedupeDisplayLabels(memberRoleLabels)
  const labels =
    fromArray && fromArray.length > 0
      ? fromArray
      : dedupeDisplayLabels([String(investorRole ?? "")])

  if (labels.length === 0) {
    return <span className="um_status_muted">—</span>
  }

  if (labels.length === 1) {
    const label = labels[0]!
    const Icon = pickIconForRoleLabel(label)

    return (
      <span className="um_role_badge deal_inv_role_badge">
        <Icon
          className="um_role_badge_icon"
          size={16}
          strokeWidth={2}
          aria-hidden
        />
        <span className="um_role_badge_label">{label}</span>
      </span>
    )
  }

  return (
    <div className="deal_inv_roles_stack" role="list" aria-label="Roles">
      {labels.map((label) => {
        const Icon = pickIconForRoleLabel(label)
        return (
          <span
            key={label}
            className="um_role_badge deal_inv_role_badge deal_inv_role_badge_compact"
            role="listitem"
          >
            <Icon
              className="um_role_badge_icon"
              size={14}
              strokeWidth={2}
              aria-hidden
            />
            <span className="um_role_badge_label">{label}</span>
          </span>
        )
      })}
    </div>
  )
}

/** Convenience for table cells that have a full {@link DealInvestorRow}. */
export function DealInvestorRoleCell({ row }: { row: DealInvestorRow }) {
  return (
    <DealInvestorRoleBadge
      investorRole={row.investorRole}
      memberRoleLabels={row.memberRoleLabels}
    />
  )
}
