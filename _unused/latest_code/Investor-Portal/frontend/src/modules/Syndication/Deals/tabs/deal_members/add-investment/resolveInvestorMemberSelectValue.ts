import type { DropdownSelectSection } from "../../../../../../common/components/dropdown-select"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../../../../common/utils/displayEmail"

/**
 * Map a saved investor `contactId` (+ optional email) to the Investors /
 * Members dropdown value (`contact:` / `user:` prefixes).
 * Matches by id first, then by email, so edit mode still selects the person
 * when roster ids differ between contact vs portal user.
 */
export function resolveInvestorMemberSelectValue(params: {
  contactId: string
  contactEmail?: string
  contactRows: Array<{ id: string; email?: string | null }>
  memberRows: Array<Record<string, unknown>>
  prefixContact: string
  prefixUser: string
}): string {
  const id = String(params.contactId ?? "").trim()
  if (!id) return ""
  const idLow = id.toLowerCase()
  const emailNorm = String(params.contactEmail ?? "")
    .trim()
    .toLowerCase()

  const contactById = params.contactRows.find(
    (c) => String(c.id ?? "").trim().toLowerCase() === idLow,
  )
  if (contactById) return `${params.prefixContact}${contactById.id}`

  const memberById = params.memberRows.find(
    (u) => String(u.id ?? "").trim().toLowerCase() === idLow,
  )
  if (memberById)
    return `${params.prefixUser}${String(memberById.id).trim()}`

  if (emailNorm && isDisplayableEmail(emailNorm)) {
    const contactByEmail = params.contactRows.find(
      (c) =>
        String(c.email ?? "")
          .trim()
          .toLowerCase() === emailNorm,
    )
    if (contactByEmail) return `${params.prefixContact}${contactByEmail.id}`

    const memberByEmail = params.memberRows.find(
      (u) =>
        String(u.email ?? "")
          .trim()
          .toLowerCase() === emailNorm,
    )
    if (memberByEmail)
      return `${params.prefixUser}${String(memberByEmail.id).trim()}`
  }

  // Keep a stable prefixed value so we can inject a Selected option.
  return `${params.prefixContact}${id}`
}

/** Trigger / option label: `Name — email` when both exist. */
export function selectedInvestorDropdownLabel(params: {
  displayName?: string | null
  email?: string | null
}): string {
  const name = String(params.displayName ?? "").trim()
  const emailRaw = String(params.email ?? "").trim()
  const email = isDisplayableEmail(emailRaw) ? displayEmail(emailRaw) : ""
  if (name && name !== "—" && email) return `${name} — ${email}`
  if (email) return email
  if (name && name !== "—") return name
  return "Selected investor"
}

/** Ensure the current value exists in sections so the trigger shows the label. */
export function ensureSelectedMemberDropdownOption(params: {
  sections: DropdownSelectSection[]
  value: string
  fallbackLabel: string
}): DropdownSelectSection[] {
  const value = String(params.value ?? "").trim()
  if (!value) return params.sections
  const flat = params.sections.flatMap((s) => s.options)
  if (flat.some((o) => o.value === value)) return params.sections
  return [
    {
      heading: "Selected",
      options: [{ value, label: params.fallbackLabel }],
    },
    ...params.sections,
  ]
}
