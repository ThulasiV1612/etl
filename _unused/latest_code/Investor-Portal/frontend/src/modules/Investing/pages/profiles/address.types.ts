/** Saved address row for investing profiles; persisted per user in `user_saved_addresses`. */
export type SavedAddress = {
  id: string
  fullNameOrCompany: string
  country: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  /** Printed on the check, when applicable. */
  checkMemo: string
  /** Notes for the sponsor. */
  distributionNote: string
  /** When true, list row appears under Archived. */
  archived?: boolean
}

/** One-line label for saved-address dropdowns. */
export function formatSavedAddressLabel(a: SavedAddress): string {
  const who = a.fullNameOrCompany.trim() || "Saved address"
  const street = [a.street1, a.street2].filter(Boolean).join(", ")
  const loc = [a.city, a.state, a.zip].filter(Boolean).join(", ")
  const parts = [who, street, loc, a.country].filter(Boolean)
  return parts.join(" · ")
}

export type AddressFormDraft = Omit<SavedAddress, "id">
