/** Row shape for the syndication deals listing table */
export interface DealListRow {
  id: string
  dealName: string
  dealType: string
  dealStage: string
  totalInProgress: string
  totalAccepted: string
  raiseTarget: string
  distributions: string
  investors: string
  closeDateDisplay: string
  createdDateDisplay: string
  /** Shown in Deals list “Start date” column; falls back to created date in API layer */
  startDateDisplay?: string
  /** Shown in “Investments” column when API does not send a dedicated value */
  investmentsDisplay?: string
  /** e.g. Class A, LP — from API when available */
  investorClass?: string
  /** Client-side or API: archived deals appear under Archives tab */
  archived?: boolean
  /** City + country from API (dashboard cards / search) */
  locationDisplay?: string
  /** ISO timestamp for sorting */
  createdAt?: string
  /** Relative paths under uploads/, joined with `;` when multiple */
  assetImagePath?: string | null
  /** Full URL (https or data:image) for dashboard / preview hero when set */
  galleryCoverImageUrl?: string
  /** From list API — used to detect incomplete deal form (Draft badge) */
  secType?: string
  owningEntityName?: string
  propertyName?: string
  city?: string
  /** From list API — investor offering workflow status (`offering_status`). */
  offeringStatus?: string
  /**
   * When `includeParticipantDeals` is set: false for dashboard “opportunity” deals
   * where roster APIs (`/investors`, `/members`) are not readable for this viewer.
   */
  rosterReadable?: boolean
  /** LP / sponsor role label from investing deals list API. */
  yourRole?: string
  /** From enriched list API (investor class advanced JSON) */
  investmentType?: string
  /** First asset tag from investor class advanced JSON */
  propertyType?: string
  /** Average review score 0–5 (list API or client) */
  reviewRating?: number
  /** Number of reviews (list API) */
  reviewCount?: number
  /** True when the signed-in viewer is Lead Sponsor on this deal. */
  viewerIsLeadSponsor?: boolean
  /** False when this viewer is a co-sponsor (or LP) and must not edit the deal. */
  viewerCanEditDeal?: boolean
  /** ISO timestamp of this deal’s next SaaS billing date (lead sponsors only). */
  nextBillingDate?: string | null
  /** When SaaS billing / paywall starts for this deal. */
  saasBillingStartsAt?: string | null
  billingSubscriptionStatus?: string
  billingPlanId?: string | null
  suggestedPlanId?: string | null
  needsPlanUpgrade?: boolean
  /** Billable deal with unpaid or expired MRR — listed, but view/edit is locked. */
  billingAccessLocked?: boolean
  billingLockReason?: "unpaid" | "expired" | "past_due" | null
}

export type DealTypeOption = "equity" | "debt" | "real_estate" | "other"

export const DEAL_TYPE_LABELS: Record<DealTypeOption, string> = {
  equity: "Equity",
  debt: "Debt",
  real_estate: "Real estate",
  other: "Other",
}

export const DEAL_STAGE_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "Raising capital", label: "Raising capital" },
  { value: "Closed", label: "Closed" },
  { value: "Draft", label: "Draft" },
] as const

export const DEAL_TYPE_FILTERS = [
  { value: "", label: "All types" },
  { value: "equity", label: "Equity" },
  { value: "debt", label: "Debt" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" },
] as const

/** Create-deal wizard — Deal type dropdown (spreadsheet options) */
export interface DealFormTypeOption {
  value: string
  label: string
  /** Shown via info icon when this option is selected */
  infoText?: string
}

export const DEAL_FORM_TYPE_OPTIONS: DealFormTypeOption[] = [
  { value: "direct_syndication", label: "Direct syndication" },
  { value: "fund", label: "Fund" },
  // {
  //   value: "flexible_fund",
  //   label: "Flexible fund",
  //   infoText: "LPs select specific holdings in the fund to invest in.",
  // },
  // { value: "spv_fund", label: "SPV fund" },
  // { value: "angel_investment", label: "Angel Investment" },
  // {
  //   value: "qualified_opportunity_fund",
  //   label: "Qualified opportunity fund",
  // },
  // { value: "reit", label: "REIT" },
  // {
  //   value: "delaware_statutory_trust_1031",
  //   label: "Delaware statutory trust (1031 exchange)",
  // },
  { value: "exchange_1031", label: "1031 exchange" },
  {
    value: "direct_syndication_1031",
    label: "Direct syndication with 1031 exchange",
  },
  {
    value: "JV (Joint Venture)",
    label: "JV (Joint Venture)",
  },
]

/** Step 1 — Deal form (wizard) */
export type DealStageOption ="Draft"| "capital_raising" | "managing_asset" | "liquidated"

export interface DealStageChoice {
  value: DealStageOption
  label: string
  hint?: string
}

export const DEAL_STAGE_CHOICES: DealStageChoice[] = [
  {
    value: "Draft",
    label: "Draft",
    // hint: "Actively raising equity.",
  },
  {
    value: "capital_raising",
    label: "Capital Raising",
    hint: "Actively raising equity.",
  },
  {
    value: "managing_asset",
    label: "Asset managing",
    hint: "Fully funded and closed the deal. Currently managing the asset.",
  },
  {
    value: "liquidated",
    label: "Liquidated",
    hint: "Property sold.",
  },
  //   value: "raising_capital",
  //   label: "Raising capital",
  //   hint: "Actively raising equity.",
  // },
  // {
  //   value: "asset_managing",
  //   label: "Asset managing",
  //   hint: "Fully funded and closed the deal. Currently managing the asset.",
  // },
  // {
  //   value: "liquidated",
  //   label: "Liquidated",
  //   hint: "Property sold.",
  // },
]

export type YesNo = "yes" | "no"

export interface DealStepDraft {
  dealName: string
  dealType: string
  dealStage: DealStageOption | ""
  secType: string
  closeDate: string
  owningEntityName: string
  fundsBeforeGpCountersigns: YesNo | ""
  autoFundingAfterGpCountersigns: YesNo | ""
}

export function emptyDealStepDraft(): DealStepDraft {
  return {
    dealName: "",
    dealType: "",
    dealStage: "",
    secType: "",
    closeDate: "",
    owningEntityName: "",
    fundsBeforeGpCountersigns: "",
    autoFundingAfterGpCountersigns: "",
  }
}

/** Step 2 — Asset / property form */
export interface AssetStepDraft {
  propertyName: string
  country: string
  streetAddress1: string
  streetAddress2: string
  city: string
  state: string
  zipCode: string
}

export const DEFAULT_ASSET_COUNTRY = "US"

export const COUNTRY_OPTIONS = [
  { value: "US", label: "United States of America" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "OTHER", label: "Other" },
] as const

export function emptyAssetStepDraft(): AssetStepDraft {
  return {
    propertyName: "",
    country: DEFAULT_ASSET_COUNTRY,
    streetAddress1: "",
    streetAddress2: "",
    city: "",
    state: "",
    zipCode: "",
  }
}
