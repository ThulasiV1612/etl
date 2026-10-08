/** Distribution Setup frontend types — mirrors backend distributionSetup.types */

export type DistributionWfKind =
  | "LP_PREF"
  | "PREF_CURRENT"
  | "PREF_ACCRUED"
  | "ROC"
  | "CATCHUP"

export type DistributionWfSource = "operating" | "capital"
export type DistributionAmountMode = "calc" | "input"

export interface DistributionPaymentRow {
  id: string
  kind: DistributionWfKind
  name: string
  payTo: string[]
  amountMode: DistributionAmountMode
  inputAmount: string
  catchupPct: string
}

export interface DistributionWaterfalls {
  operating: DistributionPaymentRow[]
  capital: DistributionPaymentRow[]
}

/** Backend-sourced prior cash distributions (read-only in the simulator). */
export interface PriorDistributionRecord {
  id: string
  amount: string
  date: string
  source?: string
  /** Distribution name (portal “Distribution name” — not memo). */
  name?: string
  notes?: string
  /** Period used when the run was completed. */
  period?: "monthly" | "quarterly" | "annual"
  /** Accrual window start YYYY-MM-DD (may differ from payment date). */
  periodStart?: string
  /** Accrual window end YYYY-MM-DD. */
  periodEnd?: string
  /** When cash was/is paid YYYY-MM-DD (defaults to date). */
  paymentDate?: string
  /** e.g. preferred_return */
  distributionType?: string
  /** e.g. accrued_pref */
  deductsFrom?: string
  /** Investor portal visibility. */
  visible?: boolean
  investorPayments?: InvestorDistributionPayment[]
}

export interface InvestorDistributionPayment {
  investorId: string
  contactId?: string
  userEmail?: string
  investorName: string
  classId: string
  className: string
  capital: string
  percentOfClass: string
  percentOfDeal?: string
  payment: string
}

export interface DistributionSetupClass {
  id: string
  name: string
  classType: string
  actuallyFunded: string
  equityPct: string
  preferredReturn: { enabled: boolean; rate: string }
  prefEquity: {
    totalRate: string
    currentRate: string
    accrualRate: string
  }
  mezz: { rate: string; pay: string }
}

export interface DistributionSetupPromote {
  hurdles: Array<{
    id: string
    rate: string
    basis: string
    measuredOn: string
  }>
  shares: Record<string, string[]>
}

/** Class percentage row for an Acquisition Fee allocation. */
export interface DistributionFeeClassSplit {
  classId: string
  /** Percent of fee cash (0–100). */
  percent: string
}

/**
 * Acquisition Fee tab config — fee name + cash window + class split.
 * Class split is user-defined (not assumed GP-only).
 */
export interface DistributionFeeConfig {
  name: string
  /** Fee type label (shown as Type on Distributions). */
  type: string
  /** Saved type choices for the creatable Type dropdown. */
  typeOptions: string[]
  cashAvailable: string
  /** Period factor string: monthly 0.083333 | quarterly 0.25 | annual 1 */
  periodFactor: string
  /** Inclusive period start YYYY-MM-DD */
  periodStart: string
  /** Inclusive period end YYYY-MM-DD */
  periodEnd: string
  classSplits: DistributionFeeClassSplit[]
}

export interface DistributionSetupBundle {
  dealId: string
  dealName: string
  targetRaise: string
  /** Optional display name for this deal’s distribution setup configuration. */
  setupName: string
  /** period_window (Woodland) | from_accrual_start (Wildflower). */
  dayCountMode?: "period_window" | "from_accrual_start"
  /** Deal-level accrual start YYYY-MM-DD. */
  defaultAccrualStartIso?: string
  waterfalls: DistributionWaterfalls
  priorDistributions: PriorDistributionRecord[]
  classes: DistributionSetupClass[]
  promote: DistributionSetupPromote
  /** Optional fee allocation configured on the Acquisition Fee tab. */
  distributionFee?: DistributionFeeConfig
}

export const KIND_META: Record<
  DistributionWfKind,
  { label: string; defaultName: string }
> = {
  LP_PREF: {
    label: "LP preferred return",
    defaultName: "LP preferred return (+ arrears)",
  },
  PREF_CURRENT: {
    label: "Preferred equity current coupon",
    defaultName: "Preferred equity — current pay",
  },
  PREF_ACCRUED: {
    label: "Preferred equity accrued balance",
    defaultName: "Preferred equity — accrued balance",
  },
  ROC: {
    label: "Return of capital",
    defaultName: "Return of capital",
  },
  CATCHUP: {
    label: "GP catch-up",
    defaultName: "GP catch-up",
  },
}

export const CLASS_TYPE_TONE: Record<string, string> = {
  lp: "lp",
  gp: "gp",
  preferred_equity: "pref",
  mezzanine: "mezz",
}
