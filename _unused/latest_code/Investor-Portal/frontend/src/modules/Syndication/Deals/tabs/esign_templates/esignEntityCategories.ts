export type EsignEntityCategory = {
  id: string
  label: string
}

/** eSign template profile types (one template per category on the Profiles tab). */
export const ESIGN_ENTITY_CATEGORIES: EsignEntityCategory[] = [
  { id: "individual", label: "Individual" },
  {
    id: "custodian_ira_401k",
    label: "Custodian IRA or custodian based 401(k)",
  },
  { id: "joint_tenancy", label: "Joint tenancy" },
  {
    id: "llc",
    label: "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
  },
]

/** Compact column titles for the Manage Questionnaire matrix. */
export const ESIGN_ENTITY_CATEGORY_COLUMN_LABELS: Record<string, string> = {
  individual: "Individual",
  custodian_ira_401k: "IRA",
  joint_tenancy: "Joint tenancy",
  llc: "LLC / Entity",
}

export const ESIGN_ENTITY_PROFILE_IDS = ESIGN_ENTITY_CATEGORIES.map((c) => c.id)
