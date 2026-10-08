export const DEAL_STATUSES = [
  "draft_hidden",
  "coming_soon",
  "open_soft_commitment",
  "open_hard_commitment",
  "open_investment",
  "waitlist",
  "closed",
  "past",
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

export function isDealStatus(raw: string | null | undefined): raw is DealStatus {
  return DEAL_STATUSES.includes(raw as DealStatus);
}

export function normalizeDealStatus(
  raw: string | null | undefined,
): DealStatus | null {
  const v = String(raw ?? "").trim();
  return isDealStatus(v) ? v : null;
}

const STATUSES_REQUIRING_INVESTOR_CLASS = new Set<DealStatus>([
  "open_soft_commitment",
  "open_hard_commitment",
  "open_investment",
  "waitlist",
]);

/** Soft/hard commit, open to investment, and waitlist require at least one class. */
export function offeringStatusRequiresInvestorClass(
  raw: string | null | undefined,
): boolean {
  const status = normalizeDealStatus(raw);
  return status != null && STATUSES_REQUIRING_INVESTOR_CLASS.has(status);
}
