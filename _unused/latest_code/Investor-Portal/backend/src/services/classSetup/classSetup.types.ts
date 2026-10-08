/** Class Setup domain types — configuration only (no distribution math). */

export const CLASS_SETUP_TYPES = [
  "lp",
  "gp",
  "preferred_equity",
  "mezzanine",
] as const;

export type ClassSetupType = (typeof CLASS_SETUP_TYPES)[number];

export const CLASS_SETUP_STATUSES = ["draft", "active", "closed"] as const;
export type ClassSetupStatus = (typeof CLASS_SETUP_STATUSES)[number];

export const PREFERRED_TYPES = ["single", "split"] as const;
export type PreferredType = (typeof PREFERRED_TYPES)[number];

export const COMPOUNDING_MODES = ["simple", "compound"] as const;
export type CompoundingMode = (typeof COMPOUNDING_MODES)[number];

export const DISTRIBUTION_FREQUENCIES = [
  "monthly",
  "quarterly",
  "annually",
] as const;
export type DistributionFrequency = (typeof DISTRIBUTION_FREQUENCIES)[number];

export interface ClassSetupHurdleTier {
  id: string;
  hurdleRate: string;
  lpPct: string;
  gpPct: string;
}

export interface ClassSetupPreferredReturn {
  enabled: boolean;
  rate: string;
  preferredType: PreferredType;
  currentPortion: string;
  accruedPortion: string;
  compounding: CompoundingMode;
  distributionFrequency: DistributionFrequency;
}

export interface ClassSetupPrefEquityTerms {
  totalRate: string;
  currentRate: string;
  accrualRate: string;
}

export interface ClassSetupMezzTerms {
  rate: string;
  pay: string;
}

export interface ClassSetupFinalTier {
  lpPct: string;
  gpPct: string;
}

export interface ClassSetupClassPayload {
  id?: string;
  name: string;
  classType: ClassSetupType;
  displayOrder: number;
  status: ClassSetupStatus;
  classGroup: string;
  mapsTo?: string;
  committedCapital: string;
  actuallyFunded: string;
  minimumInvestment: string;
  equityPct: string;
  preferredReturn: ClassSetupPreferredReturn;
  prefEquity: ClassSetupPrefEquityTerms;
  mezz: ClassSetupMezzTerms;
  waterfallTiers: ClassSetupHurdleTier[];
  finalTier: ClassSetupFinalTier;
}

export const PROMOTE_HURDLE_BASES = [
  "IRR",
  "Cash-on-cash",
  "Cumulative return",
] as const;
export type PromoteHurdleBasis = (typeof PROMOTE_HURDLE_BASES)[number];

export const PROMOTE_MEASURED_ON = [
  "LP classes",
  "Each class individually",
  "Whole deal",
] as const;
export type PromoteMeasuredOn = (typeof PROMOTE_MEASURED_ON)[number];

export interface ClassSetupPromoteHurdle {
  id: string;
  rate: string;
  basis: PromoteHurdleBasis;
  measuredOn: PromoteMeasuredOn;
}

export interface ClassSetupPromoteSchedule {
  hurdles: ClassSetupPromoteHurdle[];
  /** Share % per stage keyed by investor class id. */
  shares: Record<string, string[]>;
}

export interface ClassSetupDealMeta {
  targetRaise: string;
  latestChanges: string;
  promote: ClassSetupPromoteSchedule;
}

export interface ClassSetupBundle {
  dealId: string;
  dealName: string;
  meta: ClassSetupDealMeta;
  classes: ClassSetupClassPayload[];
}

export interface ClassSetupSaveInput {
  meta: ClassSetupDealMeta;
  classes: ClassSetupClassPayload[];
}
