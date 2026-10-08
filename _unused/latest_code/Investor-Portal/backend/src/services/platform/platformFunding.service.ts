import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/schema.js";
import {
  committedNumericFromDealInvestmentRow,
  fundedNumericForInvestorKpiRow,
} from "../deal/dealInvestment.service.js";

export const FUNDING_PERIODS = [
  "7d",
  "30d",
  "90d",
  "12m",
  "all",
] as const;

export type FundingPeriod = (typeof FUNDING_PERIODS)[number];

export type FundingGranularity = "day" | "week" | "month";

export type FundingSeriesPoint = {
  bucket: string;
  label: string;
  amountUsd: number;
  cumulativeUsd: number;
  investmentCount: number;
};

export type PlatformFundingSeries = {
  period: FundingPeriod;
  granularity: FundingGranularity;
  from: string;
  to: string;
  points: FundingSeriesPoint[];
  totalInPeriodUsd: number;
  totalFundedAllTimeUsd: number;
};

export function parseFundingPeriod(raw: unknown): FundingPeriod | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return (FUNDING_PERIODS as readonly string[]).includes(s)
    ? (s as FundingPeriod)
    : null;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function periodRange(period: FundingPeriod): {
  from: Date;
  to: Date;
  granularity: FundingGranularity;
} {
  const to = startOfUtcDay(new Date());
  const toExclusive = addUtcDays(to, 1);
  let from: Date;
  let granularity: FundingGranularity;

  switch (period) {
    case "7d":
      from = addUtcDays(to, -6);
      granularity = "day";
      break;
    case "30d":
      from = addUtcDays(to, -29);
      granularity = "day";
      break;
    case "90d":
      from = addUtcDays(to, -89);
      granularity = "week";
      break;
    case "12m":
      from = addUtcDays(to, -364);
      granularity = "week";
      break;
    case "all":
    default:
      from = new Date(Date.UTC(2020, 0, 1));
      granularity = "month";
      break;
  }

  return { from, to: toExclusive, granularity };
}

function bucketKeyForDate(d: Date, granularity: FundingGranularity): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (granularity === "month") {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  if (granularity === "week") {
    const start = startOfUtcDay(d);
    return start.toISOString().slice(0, 10);
  }
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function labelForBucket(key: string, granularity: FundingGranularity): string {
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  const dt = new Date(`${key}T00:00:00.000Z`);
  if (granularity === "week") {
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function enumerateBuckets(
  from: Date,
  toExclusive: Date,
  granularity: FundingGranularity,
): string[] {
  const keys: string[] = [];
  let cursor = startOfUtcDay(from);
  const end = startOfUtcDay(toExclusive);
  while (cursor < end) {
    keys.push(bucketKeyForDate(cursor, granularity));
    if (granularity === "month") {
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    } else if (granularity === "week") {
      cursor = addUtcDays(cursor, 7);
    } else {
      cursor = addUtcDays(cursor, 1);
    }
  }
  return keys;
}

/** Approved funding uses approval timestamp; otherwise commitment date. */
function fundingEventAt(row: {
  fundApproved: boolean;
  fundApprovedAt: Date | null;
  createdAt: Date;
}): Date {
  if (row.fundApproved && row.fundApprovedAt) {
    return new Date(row.fundApprovedAt);
  }
  return new Date(row.createdAt);
}

function fundingAmountUsd(row: Parameters<typeof committedNumericFromDealInvestmentRow>[0]): number {
  if (row.fundApproved) {
    return fundedNumericForInvestorKpiRow(row);
  }
  return committedNumericFromDealInvestmentRow(row);
}

export async function getPlatformFundingSeries(
  period: FundingPeriod,
): Promise<PlatformFundingSeries> {
  const { from, to, granularity } = periodRange(period);

  const rows = await db.select().from(dealInvestment);

  let totalFundedAllTimeUsd = 0;
  const amountByBucket = new Map<string, number>();
  const countByBucket = new Map<string, number>();

  for (const row of rows) {
    const amount = fundingAmountUsd(row);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (row.fundApproved) {
      totalFundedAllTimeUsd += fundedNumericForInvestorKpiRow(row);
    }

    const eventAt = fundingEventAt(row);
    if (eventAt < from || eventAt >= to) continue;

    const key = bucketKeyForDate(eventAt, granularity);
    amountByBucket.set(key, (amountByBucket.get(key) ?? 0) + amount);
    countByBucket.set(key, (countByBucket.get(key) ?? 0) + 1);
  }

  const bucketKeys = enumerateBuckets(from, to, granularity);
  let cumulative = 0;
  let totalInPeriodUsd = 0;
  const points: FundingSeriesPoint[] = bucketKeys.map((bucket) => {
    const amountUsd = Math.round((amountByBucket.get(bucket) ?? 0) * 100) / 100;
    totalInPeriodUsd += amountUsd;
    cumulative += amountUsd;
    return {
      bucket,
      label: labelForBucket(bucket, granularity),
      amountUsd,
      cumulativeUsd: Math.round(cumulative * 100) / 100,
      investmentCount: countByBucket.get(bucket) ?? 0,
    };
  });

  return {
    period,
    granularity,
    from: from.toISOString().slice(0, 10),
    to: addUtcDays(startOfUtcDay(to), -1).toISOString().slice(0, 10),
    points,
    totalInPeriodUsd: Math.round(totalInPeriodUsd * 100) / 100,
    totalFundedAllTimeUsd: Math.round(totalFundedAllTimeUsd * 100) / 100,
  };
}
