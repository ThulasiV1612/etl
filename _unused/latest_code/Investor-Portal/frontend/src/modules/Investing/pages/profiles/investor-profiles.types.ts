/** Distribution / bank details stored on `user_investor_profiles` (also in `profileWizardState`). */
export type InvestorProfileDistributionBank = {
  distributionMethod: string
  achRoutingNumber: string
  achAccountNumber: string
  achBankAddress: string
  achBankName: string
  achBankAccountType: string
  bankAccountQuery: string
  checkPayeeName: string
  checkMailingAddressId: string
}

/**
 * Row for Investing → Profiles "My profiles"; persisted per user in `user_investor_profiles`.
 */
export type InvestorProfileListRow = {
  id: string
  profileName: string
  profileType: string
  addedBy: string
  /** Count of linked investments; UI may also derive from merged investments list. */
  investmentsCount: number
  dateCreated: string
  /** When true, show under Archived; omitted/false = Active. */
  archived?: boolean
  /** True while add-profile wizard autosave is in progress. */
  isDraft?: boolean
  /** Note from the last time this profile was edited (audit). */
  lastEditReason?: string | null
  /**
   * Add-profile wizard (multi-step form). API field name; DB column is `form_snapshot` (jsonb).
   * Null for legacy rows or before first full save.
   */
  profileWizardState?: unknown | null
  /** Dedicated DB columns for distribution / ACH bank (synced on save). */
  distributionBank?: InvestorProfileDistributionBank
}

export type NewInvestorProfilePayload = {
  profileName: string
  profileType: string
  /** Serializable `FormState` from the add profile wizard. */
  profileWizardState: Record<string, unknown>
  /** Debounced wizard autosave — creates an `isDraft` row. */
  autosave?: boolean
}

/** PUT update — reason required for edits to completed profiles; optional when completing a draft. */
export type UpdateInvestorProfilePayload = NewInvestorProfilePayload & {
  lastEditReason?: string
  /** Explicit `false` clears draft on final Save from the add wizard. */
  isDraft?: boolean
}
