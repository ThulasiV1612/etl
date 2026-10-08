/** Investor entity / profile options (Add Investment + investor rows). */
export const INVESTOR_PROFILE_SELECT_OPTIONS = [
  { value: "", label: "Select" },
  { value: "individual", label: "Individual" },
  {
    value: "custodian_ira_401k",
    label: "Custodian IRA or custodian based 401(k)",
  },
  { value: "joint_tenancy", label: "Joint tenancy" },
  {
    value: "llc_corp_trust_etc",
    label:
      "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
  },
] as const


/** Stored on `deal_investment.investor_role` for LP-only Investors tab + add flow. */
export const LP_INVESTOR_ROLE_VALUE = "lp_investors"

export const LP_INVESTORS_ROLE_LABEL = "LP Investor"

/** Deal Members inner roster: Deal Members vs General Partners. */
export type DealRosterKind = "deal_members" | "general_partners"

/** Add/edit modal entry: Investors tab vs Deal Members vs General Partners. */
export type DealInvestmentModalEntry =
  | "member"
  | "investor"
  | "general_partner"

export const DEAL_MEMBER_ROLE_VALUE = "Deal Member"
export const DEAL_MEMBER_ROLE_LABEL = "General Partner"

export const GENERAL_PARTNER_ROLE_VALUE = "General Partner"
export const GENERAL_PARTNER_ROLE_LABEL = "Team Member"

/** Roles shown on the Deal Members subtab (not LP investors, not general partners). */
export const DEAL_MEMBERS_TAB_ROLE_VALUES = new Set([
  "Lead Sponsor",
  "admin sponsor",
  "Co-sponsor",
  DEAL_MEMBER_ROLE_VALUE,
])

/** Roles shown on the General Partners subtab. */
export const GENERAL_PARTNERS_TAB_ROLE_VALUES = new Set([
  GENERAL_PARTNER_ROLE_VALUE,
])

/** Stored `investor_role` for the single Lead Sponsor slot per deal (dropdown `value`). */
export const LEAD_SPONSOR_ROLE_VALUE = "Lead Sponsor"

/** Must match backend / `DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER` in deals API. */
export const DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER =
  "__portal_investment_autosave__"

export const INVESTOR_ROLE_SELECT_OPTIONS = [
  { value: "", label: "Select" },
  // { value: LP_INVESTOR_ROLE_VALUE, label: LP_INVESTORS_ROLE_LABEL },
  {
    value: LEAD_SPONSOR_ROLE_VALUE,
    label: "Lead Sponsor",
  },
  { value: "admin sponsor", label: "Admin sponsor" },
  {
    value: "Co-sponsor",
    label: "Co-sponsor",
  },
  {
    value: DEAL_MEMBER_ROLE_VALUE,
    label: DEAL_MEMBER_ROLE_LABEL,
  },
  {
    value: GENERAL_PARTNER_ROLE_VALUE,
    label: GENERAL_PARTNER_ROLE_LABEL,
  },

  // { value: "LP Investors", label: "LP Investors" },
  // { value: "CPA/Accountant", label: "CPA/Accountant" },
  // {
  //   value: "Attroney",
  //   label:
  //     "Attroney",
  // },
  // {
  //   value: "Fund Admin",
  //   label:
  //     "Fund Admin",
  // },
  // {
  //   value: "Registered investment advisor",
  //   label:
  //     "Registered investment advisor",
  // },
]
export function investorProfileLabel(value: string): string {
  if (!value?.trim()) return "—"
  const row = INVESTOR_PROFILE_SELECT_OPTIONS.find((o) => o.value === value)
  return row?.label ?? value
}

/**
 * Profile column: Investing → Profiles `profile_name` only (not profile type).
 */
export function dealInvestorProfileDisplayName(row: {
  userInvestorProfileName?: string | null
}): string {
  const named = String(row.userInvestorProfileName ?? "").trim()
  return named || "—"
}

/** Resolve profile select `value` from a display label (e.g. when API only sent `entitySubtitle`). */
export function investorProfileIdFromLabel(label: string): string {
  if (!label?.trim()) return ""
  const row = INVESTOR_PROFILE_SELECT_OPTIONS.find((o) => o.label === label)
  return row?.value ?? ""
}

/** Display label for table / optimistic row; passthrough if not a known option value. */
export function investorRoleLabel(value: string): string {
  const t = String(value ?? "").trim()
  if (!t) return "—"
  const lower = t.toLowerCase()
  /** Portal role stored on legacy rows — never show as a deal role label. */
  if (lower === "deal_participant" || lower === "deal participant") return "—"
  if (
    lower === LP_INVESTOR_ROLE_VALUE ||
    lower === "lp_investor" ||
    lower === "lp investors" ||
    lower === "lp investor"
  ) {
    return LP_INVESTORS_ROLE_LABEL
  }
  const row = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.value === t)
  if (row) return row.label
  return t
}

/** Map API / row text back to select `value` for edit prefill. */
export function investorRoleSelectValueFromStored(stored: string | undefined): string {
  const t = String(stored ?? "").trim()
  if (!t || t === "—") return ""
  const lower = t.toLowerCase()
  if (lower === LP_INVESTOR_ROLE_VALUE || lower === "lp investors")
    return LP_INVESTOR_ROLE_VALUE
  const byVal = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.value === t)
  if (byVal) return byVal.value
  const byLabel = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.label === t)
  if (byLabel) return byLabel.value
  return ""
}

/** True when the role is Lead Sponsor (stored value or display label). */
export function isLeadSponsorRole(stored: string | undefined): boolean {
  const t = String(stored ?? "").trim().toLowerCase()
  if (!t) return false
  return t === LEAD_SPONSOR_ROLE_VALUE.toLowerCase()
}

/**
 * A roster row counts toward “this deal already has a Lead Sponsor” only when the role is
 * Lead Sponsor and a real contact is assigned — not autosave placeholder / incomplete rows.
 */
function isCountableLeadSponsorRosterRow(
  r: { investorRole?: string; contactId?: string },
): boolean {
  if (!isLeadSponsorRole(r.investorRole)) return false
  const cid = String(r.contactId ?? "").trim()
  if (!cid) return false
  if (cid === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER) return false
  return true
}

/**
 * True if some member other than `excludeRowId` already has the Lead Sponsor role.
 * Use `excludeRowId` when editing that row so the current Lead Sponsor can keep the role.
 * In add mode, pass the autosaved `deal_investment` id as `excludeRowId` so the in-flight
 * draft row does not count as a second Lead Sponsor.
 */
export function leadSponsorTakenByAnotherMember(
  rows: { id: string; investorRole?: string; contactId?: string }[],
  excludeRowId: string | null | undefined,
): boolean {
  for (const r of rows) {
    if (!isCountableLeadSponsorRosterRow(r)) continue
    if (excludeRowId && r.id === excludeRowId) continue
    return true
  }
  return false
}

/**
 * When adding/editing a member, disable (or reject) assigning Lead Sponsor again
 * only while another Lead Sponsor row still has no investor profile (`profileId`).
 * Once every existing Lead Sponsor has a profile selected, another Lead Sponsor can be added.
 */
export function leadSponsorIncompleteProfileBlocksNewLeadSponsor(
  rows: {
    id: string
    investorRole?: string
    profileId?: string
    contactId?: string
  }[],
  excludeRowId: string | null | undefined,
): boolean {
  for (const r of rows) {
    if (!isCountableLeadSponsorRosterRow(r)) continue
    if (excludeRowId && r.id === excludeRowId) continue
    if (!String(r.profileId ?? "").trim()) return true
  }
  return false
}

/** `contactId` / directory user id for whoever is Lead Sponsor (excluding the row being edited). */
export function leadSponsorContactIdExcludingRow(
  rows: { id: string; investorRole?: string; contactId?: string }[],
  excludeRowId: string | null | undefined,
): string | null {
  for (const r of rows) {
    if (!isCountableLeadSponsorRosterRow(r)) continue
    if (excludeRowId && r.id === excludeRowId) continue
    const cid = String(r.contactId ?? "").trim()
    if (cid) return cid
  }
  return null
}

/** Admin sponsor or Co-sponsor — same deal cannot assign both Lead Sponsor and these roles to one person. */
export function isAdminSponsorOrCoSponsorRole(stored: string | undefined): boolean {
  const t = String(stored ?? "").trim()
  if (!t) return false
  const lower = t.toLowerCase()
  return lower === "admin sponsor" || lower === "co-sponsor"
}

/** True when the stored role is the LP Investors row (canonical or legacy label). */
export function isLpInvestorRole(stored: string | undefined): boolean {
  const t = String(stored ?? "").trim()
  if (!t) return false
  if (t === LP_INVESTOR_ROLE_VALUE) return true
  const lower = t.toLowerCase()
  return (
    lower === "lp investors" ||
    lower === "lp investor" ||
    lower === LP_INVESTOR_ROLE_VALUE ||
    lower === "lp_investor"
  )
}

/** Lead / admin / co-sponsor / deal member — matches select option value or label. */
export function isDealMembersTabRole(stored: string | undefined): boolean {
  const t = String(stored ?? "").trim()
  if (!t || t === "—") return false
  const byVal = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.value === t)
  if (byVal?.value && DEAL_MEMBERS_TAB_ROLE_VALUES.has(byVal.value)) return true
  const byLabel = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.label === t)
  if (byLabel?.value && DEAL_MEMBERS_TAB_ROLE_VALUES.has(byLabel.value))
    return true
  return false
}

/** True when the stored role is General Partner (value or label). */
export function isGeneralPartnerRole(stored: string | undefined): boolean {
  const t = String(stored ?? "").trim()
  if (!t || t === "—") return false
  const lower = t.toLowerCase()
  if (lower === GENERAL_PARTNER_ROLE_VALUE.toLowerCase()) return true
  if (lower === "general partners") return true
  if (lower === "team member" || lower === "team members") return true
  const byVal = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.value === t)
  if (byVal?.value && GENERAL_PARTNERS_TAB_ROLE_VALUES.has(byVal.value))
    return true
  const byLabel = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.label === t)
  if (byLabel?.value && GENERAL_PARTNERS_TAB_ROLE_VALUES.has(byLabel.value))
    return true
  return false
}

export function dealRosterKindFromRole(
  stored: string | undefined,
): DealRosterKind {
  return isGeneralPartnerRole(stored) ? "general_partners" : "deal_members"
}

export function dealInvestmentModalEntryFromRosterKind(
  kind: DealRosterKind,
): DealInvestmentModalEntry {
  return kind === "general_partners" ? "general_partner" : "member"
}
