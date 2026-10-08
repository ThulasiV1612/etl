export {
  preferredReturnActual365,
  preferredReturnByPeriod,
  investorDistributionPercent,
  investorPaymentFromPercent,
  investorPaymentFromCapital,
  investorShortfall,
  investorPaidAfterShortfall,
  allocateCashByRequired,
  catchupDue,
  promoteResidualShare,
} from "./helpers/formulas"

export {
  inclusiveDayCount,
  accrualDayCount,
  parseIsoDate,
  maxIsoDate,
} from "./helpers/dateCalculator"

export { roundMoney, roundPct, allocateCentsByWeight } from "./helpers/rounding"

export {
  classPreferredDue,
  preferredDueForCapital,
  daysForAccrual,
} from "./preferredDue"
export type {
  PrefAccrualContext,
  PreferredDayCountMode,
  InvestmentAccrualLine,
} from "./preferredDue"

export const WATERFALL_RULES = {
  dayCountBasis: 365,
  stopWhenHurdleUnpaid: true,
  shortfallAllocation: "pro_rata_by_required" as const,
  compoundingDefault: "none" as const,
  preferredFormula: "capital × rate × days / 365" as const,
} as const
