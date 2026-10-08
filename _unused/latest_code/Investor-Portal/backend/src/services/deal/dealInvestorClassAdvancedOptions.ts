/**
 * Normalize and validate `advanced_options_json` for deal investor classes.
 * Persists mezzanine preferred-return settings (average annual return, IRR, ROI, etc.).
 */

export const INVESTOR_CLASS_SUBSCRIPTION_TYPES = [
  "lp",
  "gp",
  "mezzanine",
  "preferred_equity",
] as const;

export const MEZZANINE_PREFERRED_RETURN_TYPES = [
  "average_annual_return",
  "cash_on_cash",
  "irr",
  "roi",
  "preferred",
] as const;

export type MezzaninePreferredReturnType =
  (typeof MEZZANINE_PREFERRED_RETURN_TYPES)[number];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function readField(
  o: Record<string, unknown>,
  camel: string,
  snake: string,
): string {
  const direct = str(o[camel])
  if (direct) return direct
  return str(o[snake])
}

function normalizePctForStorage(raw: string, fallback = "0%"): string {
  const t = raw.replace(/%/g, "").trim()
  if (!t) return fallback
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return fallback
  return `${n}%`
}

function isMezzaninePrefType(value: string): value is MezzaninePreferredReturnType {
  return (MEZZANINE_PREFERRED_RETURN_TYPES as readonly string[]).includes(
    value.trim(),
  );
}

function normalizeMezzanineAdvanced(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...parsed }

  out.investmentType = "debt"

  const prefTypeRaw = readField(
    out,
    "classPreferredReturnType",
    "class_preferred_return_type",
  )
  const prefType = isMezzaninePrefType(prefTypeRaw) ? prefTypeRaw : ""

  if (prefType) {
    out.classPreferredReturnType = prefType
    out.class_preferred_return_type = prefType
  } else {
    delete out.classPreferredReturnType
    delete out.class_preferred_return_type
  }

  const pct = normalizePctForStorage(
    readField(out, "classPreferredReturnPct", "class_preferred_return_pct"),
  )
  out.classPreferredReturnPct = pct
  out.class_preferred_return_pct = pct

  if (
    prefType === "average_annual_return" ||
    prefType === "cash_on_cash" ||
    prefType === "irr"
  ) {
    const accrues =
      readField(out, "preferredReturnAccruesOn", "preferred_return_accrues_on") ||
      "capital_balance"
    out.preferredReturnAccruesOn = accrues
    out.preferred_return_accrues_on = accrues

    const dayCount =
      readField(out, "classDayCountConvention", "class_day_count_convention") ||
      "actual_365"
    out.classDayCountConvention = dayCount
    out.class_day_count_convention = dayCount
  }

  if (prefType === "average_annual_return" || prefType === "cash_on_cash") {
    const startOverride = readField(
      out,
      "classStartDateOverride",
      "class_start_date_override",
    )
    out.classStartDateOverride = startOverride
    out.class_start_date_override = startOverride

    const endDate = readField(out, "classEndDate", "class_end_date")
    out.classEndDate = endDate
    out.class_end_date = endDate

    const catchUp =
      readField(
        out,
        "classCatchUpPreferredReturns",
        "class_catch_up_preferred_returns",
      ) || "yes"
    out.classCatchUpPreferredReturns = catchUp
    out.class_catch_up_preferred_returns = catchUp

    const honorCapital =
      readField(
        out,
        "classHonorOnlyOnCapitalEvent",
        "class_honor_only_on_capital_event",
      ) || "no"
    out.classHonorOnlyOnCapitalEvent = honorCapital
    out.class_honor_only_on_capital_event = honorCapital

    const compounding =
      readField(out, "classCompoundingPeriod", "class_compounding_period") ||
      "none"
    out.classCompoundingPeriod = compounding
    out.class_compounding_period = compounding
  }

  return out
}

export function normalizeInvestorClassAdvancedOptionsJson(params: {
  subscriptionType: string;
  advancedOptionsJson: string;
  maximumInvestment?: string;
}): { json: string; error?: string } {
  const subscriptionType = params.subscriptionType.trim().toLowerCase()
  let parsed: Record<string, unknown> = {}

  const raw = params.advancedOptionsJson?.trim()
  if (raw) {
    try {
      const o = JSON.parse(raw) as unknown
      if (o != null && typeof o === "object" && !Array.isArray(o)) {
        parsed = o as Record<string, unknown>
      }
    } catch {
      return { json: "{}", error: "advanced_options_json must be valid JSON" }
    }
  }

  const maxInvestment = params.maximumInvestment?.trim()
  if (maxInvestment) {
    parsed.maximumInvestment = maxInvestment
  }

  if (subscriptionType === "preferred_equity") {
    const out = { ...parsed, investmentType: "preferred_equity" }
    return { json: JSON.stringify(out) }
  }

  if (subscriptionType === "mezzanine") {
    const prefType = readField(
      parsed,
      "classPreferredReturnType",
      "class_preferred_return_type",
    )
    if (!prefType) {
      return {
        json: "{}",
        error: "Preferred return type is required for mezzanine classes",
      }
    }
    if (!isMezzaninePrefType(prefType)) {
      return {
        json: "{}",
        error: `Invalid preferred return type: ${prefType}`,
      }
    }
    const pctRaw = readField(
      parsed,
      "classPreferredReturnPct",
      "class_preferred_return_pct",
    )
    const pctNum = parseFloat(pctRaw.replace(/%/g, "").trim())
    if (!pctRaw || !Number.isFinite(pctNum)) {
      return {
        json: "{}",
        error: "Preferred return is required for mezzanine classes",
      }
    }
    if (
      prefType === "average_annual_return" ||
      prefType === "cash_on_cash" ||
      prefType === "irr"
    ) {
      if (
        !readField(parsed, "preferredReturnAccruesOn", "preferred_return_accrues_on")
      ) {
        return {
          json: "{}",
          error: "Preferred return accrues on is required",
        }
      }
      if (
        !readField(parsed, "classDayCountConvention", "class_day_count_convention")
      ) {
        return {
          json: "{}",
          error: "Day count convention is required",
        }
      }
    }
    parsed = normalizeMezzanineAdvanced(parsed)
  }

  try {
    return { json: JSON.stringify(parsed) }
  } catch {
    return { json: "{}", error: "Could not serialize advanced_options_json" }
  }
}
