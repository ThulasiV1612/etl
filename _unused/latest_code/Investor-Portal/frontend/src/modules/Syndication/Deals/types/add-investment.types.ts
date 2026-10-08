/** Values collected from Add Investment modal (saved to investors table row) */
export interface AddInvestmentFormValues {
  offeringId: string
  /** User id from GET /users (or legacy demo slug when API unavailable) */
  contactId: string
  /** Directory user — set when Member is chosen from /users */
  contactDisplayName?: string
  contactEmail?: string
  contactUsername?: string
  profileId: string
  /** Stored `investor_role` on investment (option value from INVESTOR_ROLE_SELECT_OPTIONS) */
  investorRole: string
  status: string
  /** Mirrors DB `fund_approved` on save (Approved vs Not Approved). */
  fundApproved?: boolean
  investorClass: string
  docSignedDate: string
  commitmentAmount: string
  extraContributionAmounts: string[]
  documentFileName: string | null
}
