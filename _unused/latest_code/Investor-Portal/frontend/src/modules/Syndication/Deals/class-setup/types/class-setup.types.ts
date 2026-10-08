/** Class Setup frontend types — mirrors backend classSetup.types */

export type ClassSetupType = "lp" | "gp" | "preferred_equity" | "mezzanine"
export type ClassSetupStatus = "draft" | "active" | "closed"
export type PreferredType = "single" | "split"
export type CompoundingMode = "simple" | "compound"
export type DistributionFrequency = "monthly" | "quarterly" | "annually"

export interface ClassSetupHurdleTier {
  id: string
  hurdleRate: string
  lpPct: string
  gpPct: string
}

export interface ClassSetupPreferredReturn {
  enabled: boolean
  rate: string
  preferredType: PreferredType
  currentPortion: string
  accruedPortion: string
  compounding: CompoundingMode
  distributionFrequency: DistributionFrequency
}

export interface ClassSetupPrefEquityTerms {
  totalRate: string
  currentRate: string
  accrualRate: string
}

export interface ClassSetupMezzTerms {
  rate: string
  pay: string
}

export interface ClassSetupFinalTier {
  lpPct: string
  gpPct: string
}

/** Deal-level promote schedule — mirrors HTML Class Setup screen 1. */
export type PromoteHurdleBasis =
  | "IRR"
  | "Cash-on-cash"
  | "Cumulative return"

export type PromoteMeasuredOn =
  | "LP classes"
  | "Each class individually"
  | "Whole deal"

export interface ClassSetupPromoteHurdle {
  id: string
  rate: string
  basis: PromoteHurdleBasis
  measuredOn: PromoteMeasuredOn
}

export interface ClassSetupPromoteSchedule {
  hurdles: ClassSetupPromoteHurdle[]
  /** Share % per stage for each equity class (key = class id or clientKey). */
  shares: Record<string, string[]>
}

export interface ClassSetupClass {
  id?: string
  clientKey: string
  name: string
  classType: ClassSetupType
  displayOrder: number
  status: ClassSetupStatus
  classGroup: string
  /** Display label for “Maps to” column (investor class mapping). */
  mapsTo: string
  committedCapital: string
  actuallyFunded: string
  minimumInvestment: string
  equityPct: string
  preferredReturn: ClassSetupPreferredReturn
  prefEquity: ClassSetupPrefEquityTerms
  mezz: ClassSetupMezzTerms
  waterfallTiers: ClassSetupHurdleTier[]
  finalTier: ClassSetupFinalTier
  expanded: boolean
}

export interface ClassSetupDealMeta {
  targetRaise: string
  latestChanges: string
  promote: ClassSetupPromoteSchedule
}

export const PROMOTE_HURDLE_BASES: PromoteHurdleBasis[] = [
  "IRR",
  "Cash-on-cash",
  "Cumulative return",
]

export const PROMOTE_MEASURED_ON: PromoteMeasuredOn[] = [
  "LP classes",
  "Each class individually",
  "Whole deal",
]

export function emptyPromoteSchedule(): ClassSetupPromoteSchedule {
  return {
    hurdles: [
      {
        id: "h1",
        rate: "12",
        basis: "Cumulative return",
        measuredOn: "LP classes",
      },
    ],
    shares: {},
  }
}

export interface ClassSetupBundle {
  dealId: string
  dealName: string
  meta: ClassSetupDealMeta
  classes: ClassSetupClass[]
}

export interface ClassSetupCheck {
  id: string
  ok: boolean
  message: string
}

export interface ClassSetupFieldError {
  classKey: string
  field: string
  message: string
}

export interface ClassSetupValidation {
  checks: ClassSetupCheck[]
  fieldErrors: ClassSetupFieldError[]
  canSave: boolean
}

export const CLASS_TYPE_META: Record<
  ClassSetupType,
  { label: string; shortLabel: string; tone: string }
> = {
  lp: { label: "Limited Partner", shortLabel: "LP", tone: "lp" },
  gp: { label: "General Partner", shortLabel: "GP", tone: "gp" },
  preferred_equity: {
    label: "Preferred Equity",
    shortLabel: "Pref",
    tone: "pref",
  },
  mezzanine: { label: "Mezzanine", shortLabel: "Mezz", tone: "mezz" },
}
