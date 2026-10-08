import type { AddDealFormRow } from "../../schema/deal.schema/add-deal-form.schema.js";
import { sumCommittedAmountForDeal } from "./dealInvestment.service.js";
import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";

function parseMoneyDigits(raw: string): number {
  const n = Number.parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatUsdNonZero(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export type EnrichedDealListRowFields = {
  raiseTarget: string;
  totalAccepted: string;
  totalInProgress: string;
  investmentType: string;
  propertyType: string;
};

/**
 * Fills deals-list KPI columns and investor-class-derived labels for dashboard cards.
 * Offering size = sum of investor-class offering sizes (else $0).
 * Total accepted = sum of investment commitment amounts.
 * Total in-progress = max(0, offering total − accepted) as remaining raise.
 */
export async function enrichDealListRowForApi(
  row: AddDealFormRow,
): Promise<EnrichedDealListRowFields> {
  const dealId = String(row.id);
  const classes = await listInvestorClassesByDealId(dealId);
  let sumOffering = 0;
  for (const c of classes) {
    sumOffering += parseMoneyDigits(String(c.offeringSize ?? ""));
  }

  const sumCommitted = await sumCommittedAmountForDeal(dealId);
  const remaining = Math.max(0, sumOffering - sumCommitted);

  let investmentType = "";
  let propertyType = "";
  if (classes.length > 0) {
    try {
      const raw = JSON.parse(classes[0]!.advancedOptionsJson || "{}") as Record<
        string,
        unknown
      >;
      if (typeof raw.investmentType === "string" && raw.investmentType.trim()) {
        investmentType = raw.investmentType.trim();
      }
      const tags = Array.isArray(raw.assetTags)
        ? raw.assetTags.filter((x): x is string => typeof x === "string")
        : [];
      if (tags.length > 0 && tags[0]!.trim()) propertyType = tags[0]!.trim();
    } catch {
      /* ignore malformed JSON */
    }
  }

  return {
    raiseTarget: sumOffering > 0 ? formatUsdNonZero(sumOffering) : "$0",
    totalAccepted: sumCommitted > 0 ? formatUsdNonZero(sumCommitted) : "$0",
    totalInProgress: formatUsdNonZero(remaining),
    investmentType: investmentType || "—",
    propertyType: propertyType || "—",
  };
}
