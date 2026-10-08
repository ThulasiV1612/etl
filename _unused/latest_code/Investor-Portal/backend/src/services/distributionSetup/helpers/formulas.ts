/**
 * Backend formula helpers — mirrors frontend distribution-setup/engine.
 * Used for validation / future server-side waterfall runs.
 */

export function roundMoney(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(Math.max(0, n) * f) / f;
}

/** Preferred / CoC due — actual/365. */
export function preferredReturnActual365(params: {
  capital: number;
  annualRate: number;
  days: number;
  dayCountBasis?: number;
}): number {
  const basis =
    params.dayCountBasis && params.dayCountBasis > 0
      ? params.dayCountBasis
      : 365;
  if (!(params.capital > 0) || !(params.annualRate > 0) || !(params.days > 0))
    return 0;
  return roundMoney(
    params.capital * params.annualRate * (params.days / basis),
  );
}

export function investorShortfall(params: {
  investorRequired: number;
  totalRequired: number;
  totalShortfall: number;
}): number {
  if (!(params.totalRequired > 0) || !(params.totalShortfall > 0)) return 0;
  return roundMoney(
    (params.investorRequired / params.totalRequired) * params.totalShortfall,
  );
}

export function allocateCashByRequired(params: {
  availableCash: number;
  requiredByKey: Record<string, number>;
}): Record<string, number> {
  const entries = Object.entries(params.requiredByKey);
  const totalRequired = entries.reduce((s, [, v]) => s + Math.max(0, v), 0);
  const out: Record<string, number> = {};
  if (!(totalRequired > 0) || !(params.availableCash > 0)) {
    for (const [k] of entries) out[k] = 0;
    return out;
  }
  const scale = Math.min(1, params.availableCash / totalRequired);
  for (const [k, req] of entries)
    out[k] = roundMoney(Math.max(0, req) * scale);
  return out;
}

export const WATERFALL_RULES = {
  dayCountBasis: 365,
  stopWhenHurdleUnpaid: true,
  shortfallAllocation: "pro_rata_by_required",
  compoundingDefault: "none",
} as const;
