import type { InvestNowDraftProgress } from "@/modules/Investing/pages/invest/investNowDraftProgress"

/** Investments list tab: active commitment vs invited but not onboarded. */
export type InvestmentOnboardingBucket = "in_progress" | "pending"

export type InvestmentListRow = {
  id: string
  /** Underlying deal id (same as `id` for API rows; set for localStorage rows). */
  dealId?: string
  investmentName: string
  /** Deal / offering title (not investor class, e.g. “Class A”). */
  offeringName: string
  /**
   * Shown in list/export as "Invested as" — `My profile` name + type when a book profile is
   * linked, otherwise the commitment type (e.g. Individual) from the deal row.
   */
  investmentProfile: string
  /** `profileId` on the deal commitment (investor type enum). */
  commitmentProfileId?: string
  /** `user_investor_profiles.id` when this commitment is tied to a saved book profile. */
  userInvestorProfileId?: string
  /**
   * Name stored on the deal investment when the API provides it; preferred over
   * resolving the id via My Profiles in `enrichInvestmentListRow`.
   */
  userInvestorProfileName?: string
  investedAmount: number
  distributedAmount: number
  currentValuation: string
  dealCloseDate: string
  /** Deal lifecycle stage (same as former Deals list `dealStage`). */
  status: string
  /** Offering workflow status (`offering_status`) — drives Invest now eligibility. */
  offeringStatus?: string
  actionRequired: string
  /**
   * Drives Active vs Pending tabs on the investments page.
   * `pending` = invited or draft, and no profile has fully completed e-sign yet.
   * `in_progress` = at least one profile fully completed e-sign (Active only).
   */
  onboardingBucket?: InvestmentOnboardingBucket
  /** Tab membership; a deal is on Active OR Pending, not both. */
  onboardingBuckets?: InvestmentOnboardingBucket[]
  /** True when the viewer has a per-profile Invest Now draft on this deal. */
  hasInvestNowDraft?: boolean
  /** Scope for Resume investing from the list (first draft profile). */
  investNowResumeScope?: {
    investmentId?: string
    userInvestorProfileId?: string
    profileId?: string
  }
  /** Estimated Invest Now wizard completion for draft deals. */
  investNowDraftProgress?: InvestNowDraftProgress
  /** When true, row appears under Archives tab (same pattern as deals list). */
  archived?: boolean
  /** Former Deals tab columns (from `DealListRow`). */
  dealType?: string
  secType?: string
  propertyName?: string
  owningEntityName?: string
  /** Lead sponsor person name for this deal — same as Invest now “Sponsor”. */
  dealSponsorName?: string
  startDateDisplay?: string
  viewerRolesLabel?: string
}

/** One line on the investment detail: a My Profile (or an unbooked commitment), type(s), and amount. */
export type InvestmentBreakdownLine = {
  /** `deal_investment.id` for this commitment line. */
  investmentRowId?: string
  userInvestorProfileId?: string
  commitmentProfileId?: string
  /**
   * Book profile name when available; else a non-duplicate `entitySubtitle` or id hint
   * so the same investor type (e.g. Individual) on multiple rows can still be distinguished.
   */
  profileName: string
  /** Commitment / investor type (e.g. Individual, LLC) from the deal row(s). */
  investorType: string
  /** For this line: this commitment’s `committed` amount in USD in the table. */
  investedAmount: number
  /** When this investment row was created (invested). */
  investedAtIso?: string
  /** Sponsor display name that approved this amount. */
  approvedBy?: string
  /** When this amount was approved by sponsor. */
  approvedAtIso?: string
}

/** Full property / investment / debt snapshot for the investment detail form. */
export type InvestmentDetailRecord = {
  id: string
  list: InvestmentListRow
  propertyName: string
  propertyType: string
  propertyStatus: string
  city: string
  state: string
  numberOfUnits: string
  occupancyPct: string
  ownedSince: string
  yearBuilt: string
  /**
   * How this commitment is held: **My profile** name + commitment type, same as the
   * investments list / “Invested as” column; derived from the deal and profile book, not
   * free-typed.
   */
  investedAs: string
  /** One row per deal commitment: profile name, investor type, and amount. */
  investedAsBreakdown?: InvestmentBreakdownLine[]
  ownershipPct: string
  generalComments: string
  overallAssetValue: string
  netOperatingIncome: string
  outstandingLoans: string
  debtService: string
  loanType: string
  ioOrAmortizing: string
  maturityDate: string
  lender: string
  interestRatePct: string
}
