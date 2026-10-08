import { createElement, type ReactNode } from "react"

export type RosterRowForDuplicateCheck = {
  id: string
  contactId?: string
  userEmail?: string
}

export const INVESTOR_ALREADY_ON_DEAL_MESSAGE =
  "This person is already on the Investors list for this deal."

/** Match by roster `contactId` or email (same rules as Deal Members add modal). */
export function isContactAlreadyOnDealRoster(
  rows: readonly RosterRowForDuplicateCheck[],
  contactOrUserId: string,
  email: string,
  excludeRowId: string | null | undefined,
): boolean {
  const cid = contactOrUserId.trim()
  const em = email.trim().toLowerCase()
  if (!cid && !em) return false
  const exclude = excludeRowId?.trim()
  for (const r of rows) {
    if (exclude && r.id === exclude) continue
    const rowCid = String(r.contactId ?? "").trim()
    if (cid && rowCid && rowCid === cid) return true
    const rowEm = String(r.userEmail ?? "").trim().toLowerCase()
    if (em && rowEm && rowEm === em) return true
  }
  return false
}

export function rosterDropdownOptionSuffixLabel(
  baseLabel: string,
  suffix: string,
): ReactNode {
  return createElement(
    "span",
    { className: "portal_dropdown_select_option_label_row" },
    createElement(
      "span",
      { className: "portal_dropdown_select_option_label_text" },
      baseLabel,
    ),
    createElement(
      "span",
      { className: "portal_dropdown_select_option_suffix" },
      suffix,
    ),
  )
}

export function alreadyAddedOptionLabel(baseLabel: string): ReactNode {
  return rosterDropdownOptionSuffixLabel(baseLabel, "Already added")
}

export function contactIsArchived(contact: { status?: string }): boolean {
  const s = String(contact.status ?? "").trim().toLowerCase()
  return s === "suspended" || s === "archived"
}

export function directoryMemberIsInactive(row: Record<string, unknown>): boolean {
  const s = String(row.userStatus ?? row.user_status ?? "")
    .trim()
    .toLowerCase()
  return s === "inactive" || s === "suspended"
}

export type RosterDropdownOptionMeta = {
  disabled: boolean
  labelContent: ReactNode
}

export function buildContactRosterDropdownOption(
  baseLabel: string,
  contact: { status?: string },
  onDeal: boolean,
  extraDisabled = false,
): RosterDropdownOptionMeta {
  if (onDeal) {
    return {
      disabled: true,
      labelContent: alreadyAddedOptionLabel(baseLabel),
    }
  }
  if (contactIsArchived(contact)) {
    return {
      disabled: false,
      labelContent: rosterDropdownOptionSuffixLabel(baseLabel, "Archived"),
    }
  }
  return {
    disabled: extraDisabled,
    labelContent: rosterDropdownOptionSuffixLabel(baseLabel, "Active"),
  }
}

export function buildDirectoryMemberRosterDropdownOption(
  baseLabel: string,
  userRow: Record<string, unknown>,
  onDeal: boolean,
  extraDisabled = false,
): RosterDropdownOptionMeta {
  if (onDeal) {
    return {
      disabled: true,
      labelContent: alreadyAddedOptionLabel(baseLabel),
    }
  }
  if (directoryMemberIsInactive(userRow)) {
    return {
      disabled: false,
      labelContent: rosterDropdownOptionSuffixLabel(baseLabel, "Inactive"),
    }
  }
  return {
    disabled: extraDisabled,
    labelContent: rosterDropdownOptionSuffixLabel(baseLabel, "Active"),
  }
}
