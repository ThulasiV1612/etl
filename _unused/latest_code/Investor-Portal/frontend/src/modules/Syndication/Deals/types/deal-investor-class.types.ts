/** Single LP waterfall / hurdle row (stored inside `advanced_options_json`). */
export interface LpHurdleItem {
  id: string
  expanded: boolean
  upsideLpPct: string
  upsideGpPct: string
  cocReturnPct: string
  hurdleName: string
  preferredReturnType: string
  finalHurdle: string
  advancedOpen: boolean
  /** Advanced (hurdle-level) */
  catchUpPreferredReturns: string
  honorOnlyOnCapitalEvent: string
  dayCountConvention: string
  compoundingPeriod: string
  startDateOverride: string
  endDate: string
}

export interface InvestorClassAdvancedForm {
  investmentType: string
  /** Class-level preferred return (Mezzanine main form). */
  classPreferredReturnType: string
  /** Mezzanine — average annual return rate (e.g. `8%`). */
  classPreferredReturnPct: string
  /** Mezzanine — basis for accrual (e.g. capital balance). */
  preferredReturnAccruesOn: string
  /** Mezzanine — day count for average annual return. */
  classDayCountConvention: string
  classStartDateOverride: string
  classEndDate: string
  classPrefReturnAdvancedOpen: boolean
  classCatchUpPreferredReturns: string
  classHonorOnlyOnCapitalEvent: string
  classCompoundingPeriod: string
  entityLegalOwnershipPct: string
  entityLegalOwnershipFrozen: boolean
  distributionSharePct: string
  distributionShareFrozen: boolean
  maximumInvestment: string
  targetIrr: string
  assetTags: string[]
  waitlistStatus: string
  hurdles: LpHurdleItem[]
}

export interface DealInvestorClass {
  id: string
  dealId: string
  name: string
  subscriptionType: string
  entityName: string
  startDate: string
  offeringSize: string
  raiseAmountDistributions: string
  billingRaiseQuota: string
  minimumInvestment: string
  numberOfUnits: string
  pricePerUnit: string
  status: string
  visibility: string
  advancedOptionsJson: string
  createdAt: string
  updatedAt: string
}

export interface DealInvestorClassFormValues {
  name: string
  subscriptionType: string
  entityName: string
  startDate: string
  offeringSize: string
  raiseAmountDistributions: string
  billingRaiseQuota: string
  minimumInvestment: string
  numberOfUnits: string
  pricePerUnit: string
  status: string
  visibility: string
  advanced: InvestorClassAdvancedForm
}
