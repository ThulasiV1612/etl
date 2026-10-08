/** Distribution Setup — waterfall configuration (no production payment runs). */

export const DISTRIBUTION_WF_KINDS = [
  "LP_PREF",
  "PREF_CURRENT",
  "PREF_ACCRUED",
  "ROC",
  "CATCHUP",
] as const;

export type DistributionWfKind = (typeof DISTRIBUTION_WF_KINDS)[number];

export const DISTRIBUTION_WF_SOURCES = ["operating", "capital"] as const;
export type DistributionWfSource = (typeof DISTRIBUTION_WF_SOURCES)[number];

export const DISTRIBUTION_AMOUNT_MODES = ["calc", "input"] as const;
export type DistributionAmountMode = (typeof DISTRIBUTION_AMOUNT_MODES)[number];

export interface DistributionPaymentRow {
  id: string;
  kind: DistributionWfKind;
  name: string;
  payTo: string[];
  amountMode: DistributionAmountMode;
  inputAmount: string;
  catchupPct?: string;
}

export interface DistributionWaterfalls {
  operating: DistributionPaymentRow[];
  capital: DistributionPaymentRow[];
}

/** Per-investor payment line persisted on a completed distribution. */
export interface InvestorDistributionPayment {
  investorId: string;
  contactId?: string;
  userEmail?: string;
  investorName: string;
  classId: string;
  className: string;
  capital: string;
  percentOfClass: string;
  /** Investor share of the whole deal (0–100). Optional on older runs. */
  percentOfDeal?: string;
  payment: string;
}

/** Recorded prior cash distributions (backend-sourced; not user-typed in the simulator). */
export interface PriorDistributionRecord {
  id: string;
  amount: string;
  date: string;
  /** operating | capital — waterfall source when known. */
  source?: string;
  /** Distribution name (portal label — not memo). */
  name?: string;
  notes?: string;
  /** Period used when the run was completed. */
  period?: "monthly" | "quarterly" | "annual";
  periodStart?: string;
  periodEnd?: string;
  paymentDate?: string;
  distributionType?: string;
  deductsFrom?: string;
  visible?: boolean;
  /** Snapshot of investor payments at complete time. */
  investorPayments?: InvestorDistributionPayment[];
}

export interface DistributionSetupBundle {
  dealId: string;
  dealName: string;
  targetRaise: string;
  /** Optional display name for this deal’s distribution setup configuration. */
  setupName?: string;
  /**
   * Preferred day-count mode persisted with the setup.
   * period_window = clip to period (Woodland).
   * from_accrual_start = accrual start → period end (Wildflower).
   */
  dayCountMode?: "period_window" | "from_accrual_start";
  /** Deal-level accrual start YYYY-MM-DD (Wildflower A1 = close / first funded). */
  defaultAccrualStartIso?: string;
  waterfalls: DistributionWaterfalls;
  /** Past distributions from the backend — used by the simulator / IRR hurdles. */
  priorDistributions: PriorDistributionRecord[];
  /** Snapshot from Class Setup for builder + simulator. */
  classes: Array<{
    id: string;
    name: string;
    classType: string;
    actuallyFunded: string;
    equityPct: string;
    preferredReturn: {
      enabled: boolean;
      rate: string;
    };
    prefEquity: {
      totalRate: string;
      currentRate: string;
      accrualRate: string;
    };
    mezz: { rate: string; pay: string };
  }>;
  promote: {
    hurdles: Array<{
      id: string;
      rate: string;
      basis: string;
      measuredOn: string;
    }>;
    shares: Record<string, string[]>;
  };
  /** Optional fee allocation from the Distribution Fee tab. */
  distributionFee?: DistributionFeeConfig;
}

export interface DistributionSetupSaveInput {
  waterfalls: DistributionWaterfalls;
  setupName?: string;
  dayCountMode?: "period_window" | "from_accrual_start";
  defaultAccrualStartIso?: string;
  distributionFee?: DistributionFeeConfig | null;
}

/** Class percentage for Distribution Fee allocation. */
export interface DistributionFeeClassSplit {
  classId: string;
  percent: string;
}

/** Distribution Fee tab — fee name, cash window, class split. */
export interface DistributionFeeConfig {
  name: string;
  /** Fee type label (shown as Type on Distributions). */
  type: string;
  /** Saved type choices for the creatable Type dropdown. */
  typeOptions: string[];
  cashAvailable: string;
  periodFactor: string;
  /** Inclusive period start YYYY-MM-DD */
  periodStart: string;
  /** Inclusive period end YYYY-MM-DD */
  periodEnd: string;
  classSplits: DistributionFeeClassSplit[];
}

export const KIND_LABELS: Record<DistributionWfKind, string> = {
  LP_PREF: "LP preferred return",
  PREF_CURRENT: "Preferred equity current coupon",
  PREF_ACCRUED: "Preferred equity accrued balance",
  ROC: "Return of capital",
  CATCHUP: "GP catch-up",
};

export function emptyWaterfalls(): DistributionWaterfalls {
  return {
    operating: [
      {
        id: "t1",
        kind: "PREF_CURRENT",
        name: "Preferred equity — current pay",
        payTo: [],
        amountMode: "calc",
        inputAmount: "0",
      },
      {
        id: "t2",
        kind: "LP_PREF",
        name: "LP preferred return (+ arrears)",
        payTo: [],
        amountMode: "calc",
        inputAmount: "0",
      },
    ],
    capital: [
      {
        id: "c1",
        kind: "PREF_ACCRUED",
        name: "Preferred equity — accrued balance",
        payTo: [],
        amountMode: "calc",
        inputAmount: "0",
      },
      {
        id: "c2",
        kind: "ROC",
        name: "Preferred equity — redeem principal",
        payTo: [],
        amountMode: "calc",
        inputAmount: "0",
      },
      {
        id: "c3",
        kind: "ROC",
        name: "Return of LP capital",
        payTo: [],
        amountMode: "calc",
        inputAmount: "0",
      },
    ],
  };
}
