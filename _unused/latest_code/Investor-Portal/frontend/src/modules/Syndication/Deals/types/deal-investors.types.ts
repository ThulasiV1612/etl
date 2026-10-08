/** KPI strip on deal detail → Investors tab (populated state) */
export interface DealInvestorsKpis {
  offeringSize: string
  committed: string
  remaining: string
  totalApproved: string
  totalPending: string
  totalFunded: string
  approvedCount: string
  pendingCount: string
  waitlistCount: string
  averageApproved: string
  nonAccreditedCount: string
}

/** Single row in the Investors table */
export interface DealInvestorRow {
  id: string
  /** Member / contact name — first line in identity cell */
  displayName: string
  /** Investor profile label (e.g. Individual, LLC) — tooltip fallback when email missing */
  entitySubtitle: string
  /** Portal user login / display name for this member */
  userDisplayName: string
  /** Portal user email — second line in identity cell */
  userEmail: string
  /** Portal / contact first name — shown under email in Investor column */
  firstName?: string
  /** Portal / contact last name — shown under email in Investor column */
  lastName?: string
  investorClass: string
  /** Percent of class (ownership), e.g. `25.00%`. Optional. */
  percentOfClassOwnership?: string
  /** Percent of class (distributions), e.g. `25.00%`. Optional. */
  percentOfClassDistributions?: string
  /** Entity Ownership % — separate from percent of class. Optional. */
  entityOwnershipPercent?: string
  /** Distribution Allocation % — separate from percent of class. Optional. */
  distributionAllocationPercent?: string
  /** Investor role label from investment row; empty → show "—" in UI */
  investorRole?: string
  /**
   * Optional: multiple deal-level roles for this contact (e.g. roster + LP). When present,
   * the Role column renders these instead of `investorRole` alone.
   */
  memberRoleLabels?: string[]
  status: string
  /**
   * Stored `deal_investment.fund_approved` when API sends it; otherwise infer from
   * workflow status for older payloads.
   */
  fundApproved?: boolean
  /**
   * Stored approved commitment total when sponsor last approved fund (numeric string).
   * With further LP commits before re-approval, UI shows snapshot + new amount.
   */
  fundApprovedCommitmentSnapshot?: string
  /** Timestamp when sponsor approved funding for this row. */
  fundApprovedAtIso?: string
  /** `users.id` / contact id of the sponsor who approved funding. */
  fundApprovedByUserId?: string
  /** Display name resolved for `fundApprovedByUserId`. */
  fundApprovedByDisplayName?: string
  committed: string
  signedDate: string
  /**
   * eSign workflow timestamps after Send E-sign (sent → viewed → signed → completed).
   * When present, the Signed column is clickable to open the status popup.
   */
  esignStatus?: DealInvestorEsignStatus
  /** Raw `esign_status_json` from DB when API sends it (fallback parse if `esignStatus` is null). */
  esignStatusBundleJson?: string | null
  fundedDate: string
  selfAccredited: string
  verifiedAccLabel: string
  /** Editable row fields (from API) — used when opening Edit investment */
  contactId?: string
  profileId?: string
  /** Investing → Profiles saved row id, when set on the deal investment. */
  userInvestorProfileId?: string
  /**
   * My Profiles **display name** denormalized on the deal investment when the commitment
   * is saved (so the client need not map id → name). When absent, fall back to the book.
   */
  userInvestorProfileName?: string
  offeringId?: string
  commitmentAmountRaw?: string
  extraContributionAmounts?: string[]
  docSignedDateIso?: string
  /** Timestamp when this investment row was first created (invested). */
  investedAtIso?: string
  /** Portal user who added this investor (`deal_lp_investor` / `deal_member.added_by`). */
  /** Sponsor / Co-sponsor display name for this investor on the deal (Sponsor name column). */
  addedByDisplayName?: string
  /** Email for the Sponsor/Co-sponsor associated with this investor. */
  addedByEmail?: string
  /** Portal `users.id` of the Sponsor/Co-sponsor associated with this investor. */
  addedByUserId?: string
  /** True when that sponsor user is a Lead / Admin / Co-sponsor on this deal’s roster. */
  addedByIsSponsorOnDeal?: boolean
  /** True when that sponsor user is a Co-sponsor on this deal (lead/admin email redaction). */
  addedByIsCoSponsorOnDeal?: boolean
  /**
   * Co-sponsor’s deal-scoped intercept preference (`yes` / `no`).
   * `yes` (default): lead-sponsor mail goes to this co-sponsor and their LPs.
   * `no`: those emails go to the co-sponsor only; they can later send the same template.
   */
  addedByCoSponsorEmailIntercept?: "yes" | "no"
  /**
   * Deal Members “Investors added”: sum of Investors-tab Committed amounts for
   * investors whose Sponsor name is this member on this deal (excludes own).
   * From API `addedInvestorsCommitted`.
   */
  addedInvestorsCommitted?: string
  /**
   * `send_invitation_mail` on `deal_member` or `deal_lp_investor` (yes = Mail Sent, no = Not sent).
   * When true, the kebab action is “Re-send invitation mail”.
   */
  invitationMailSent?: boolean
  /** `lp_roster` = row from `deal_lp_investor` only (no `deal_investment`). */
  investorKind?: "investment" | "lp_roster"
}

export interface DealInvestorEsignDocumentRef {
  fileId: string
  name: string
  /** eSign template profile (individual, llc, …). */
  categoryId?: string
  /** Merged investor PDF (questionnaire + W-9) for View while pending. */
  templateRelativePath?: string
  /** Set on all sent docs when signing is complete (combined signed PDF). */
  signedRelativePath?: string
}

export interface DealInvestorEsignStatus {
  sentAt: string | null
  viewedAt: string | null
  signedAt: string | null
  completedAt: string | null
  documents: DealInvestorEsignDocumentRef[]
}

/** One profile-type template send with stage timestamps. */
export interface DealInvestorEsignSendStatus {
  categoryId: string
  sentAt: string
  viewedAt: string | null
  signedAt: string | null
  completedAt: string | null
  signatureRequestId?: string | null
  documents: DealInvestorEsignDocumentRef[]
}

export interface DealInvestorsPayload {
  kpis: DealInvestorsKpis
  investors: DealInvestorRow[]
}

/** GET `/deals/:dealId/members` — roster rows plus optional viewer role hint. */
export interface DealMembersPayload {
  members: DealInvestorRow[]
  /** API `viewerDealMemberRole` / `viewer_deal_member_role` for the signed-in user. */
  viewerDealMemberRole?: unknown
  /** Lead sponsor person name for investor-facing surfaces (Invest Now). */
  leadSponsorDisplayName?: string
  /** When `referring_sponsor_ref` is sent on GET members, the linked sponsor name. */
  referringSponsorDisplayName?: string
  referringSponsorRef?: string
}

export function emptyDealMembersPayload(): DealMembersPayload {
  return { members: [] }
}
