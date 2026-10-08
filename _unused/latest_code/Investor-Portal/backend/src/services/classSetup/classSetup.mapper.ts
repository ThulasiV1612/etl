/**
 * Maps between Class Setup payloads and deal_investor_class / advanced_options_json.
 * Merges Class Setup fields into advanced_options_json without dropping unrelated keys
 * (overview, invest-now, and other consumers still read that blob).
 */

import type { DealInvestorClassRow } from "../../schema/deal.schema/deal-investor-class.schema.js";
import type { InvestorClassInput } from "../deal/dealInvestorClass.service.js";
import type {
  ClassSetupClassPayload,
  ClassSetupDealMeta,
  ClassSetupFinalTier,
  ClassSetupHurdleTier,
  ClassSetupMezzTerms,
  ClassSetupPrefEquityTerms,
  ClassSetupPreferredReturn,
  ClassSetupPromoteHurdle,
  ClassSetupPromoteSchedule,
  ClassSetupType,
  PromoteHurdleBasis,
  PromoteMeasuredOn,
} from "./classSetup.types.js";
import {
  CLASS_SETUP_TYPES,
  COMPOUNDING_MODES,
  DISTRIBUTION_FREQUENCIES,
  PREFERRED_TYPES,
  PROMOTE_HURDLE_BASES,
  PROMOTE_MEASURED_ON,
} from "./classSetup.types.js";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function numStr(v: unknown, fallback = "0"): string {
  const t = str(v).replace(/[$,%\s,]/g, "");
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : fallback;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const o = JSON.parse(raw || "{}") as unknown;
    if (o != null && typeof o === "object" && !Array.isArray(o))
      return o as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>;
  return {};
}

function readNested(
  adv: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return asRecord(adv[key] ?? adv.classSetup);
}

function isClassSetupType(v: string): v is ClassSetupType {
  return (CLASS_SETUP_TYPES as readonly string[]).includes(v);
}

function defaultPreferredReturn(): ClassSetupPreferredReturn {
  return {
    enabled: false,
    rate: "7",
    preferredType: "single",
    currentPortion: "",
    accruedPortion: "",
    compounding: "simple",
    distributionFrequency: "quarterly",
  };
}

function defaultPrefEquity(): ClassSetupPrefEquityTerms {
  return { totalRate: "15", currentRate: "8", accrualRate: "7" };
}

function defaultMezz(): ClassSetupMezzTerms {
  return { rate: "10", pay: "Current pay" };
}

function defaultFinalTier(): ClassSetupFinalTier {
  return { lpPct: "70", gpPct: "30" };
}

function newId(): string {
  return `tier_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapHurdlesFromAdvanced(
  adv: Record<string, unknown>,
): { tiers: ClassSetupHurdleTier[]; finalTier: ClassSetupFinalTier } {
  const setup = readNested(adv, "classSetup");
  const setupTiers = setup.waterfallTiers;
  if (Array.isArray(setupTiers) && setupTiers.length > 0) {
    const tiers = setupTiers.map((t, i) => {
      const row = asRecord(t);
      return {
        id: str(row.id) || `tier_${i + 1}`,
        hurdleRate: numStr(row.hurdleRate ?? row.hurdle_rate, "0"),
        lpPct: numStr(row.lpPct ?? row.lp_pct, "0"),
        gpPct: numStr(row.gpPct ?? row.gp_pct, "0"),
      };
    });
    const ft = asRecord(setup.finalTier ?? setup.final_tier);
    return {
      tiers,
      finalTier: {
        lpPct: numStr(ft.lpPct ?? ft.lp_pct, "70"),
        gpPct: numStr(ft.gpPct ?? ft.gp_pct, "30"),
      },
    };
  }

  const hurdles = Array.isArray(adv.hurdles) ? adv.hurdles : [];
  const tiers: ClassSetupHurdleTier[] = [];
  let finalTier = defaultFinalTier();

  for (let i = 0; i < hurdles.length; i++) {
    const h = asRecord(hurdles[i]);
    const isFinal =
      str(h.finalHurdle ?? h.final_hurdle).toLowerCase() === "yes";
    if (isFinal) {
      finalTier = {
        lpPct: numStr(h.upsideLpPct ?? h.upside_lp_pct, "70"),
        gpPct: numStr(h.upsideGpPct ?? h.upside_gp_pct, "30"),
      };
      continue;
    }
    tiers.push({
      id: str(h.id) || `tier_${i + 1}`,
      hurdleRate: numStr(h.cocReturnPct ?? h.coc_return_pct, "0"),
      lpPct: numStr(h.upsideLpPct ?? h.upside_lp_pct, "0"),
      gpPct: numStr(h.upsideGpPct ?? h.upside_gp_pct, "0"),
    });
  }

  return { tiers, finalTier };
}

function mapPreferredFromAdvanced(
  adv: Record<string, unknown>,
  classType: ClassSetupType,
): ClassSetupPreferredReturn {
  const setup = readNested(adv, "classSetup");
  const pref = asRecord(setup.preferredReturn ?? setup.preferred_return);
  if (Object.keys(pref).length > 0) {
    const preferredTypeRaw = str(pref.preferredType ?? pref.preferred_type);
    const compoundingRaw = str(pref.compounding);
    const freqRaw = str(
      pref.distributionFrequency ?? pref.distribution_frequency,
    );
    return {
      enabled: Boolean(pref.enabled),
      rate: numStr(pref.rate, "7"),
      preferredType: (PREFERRED_TYPES as readonly string[]).includes(
        preferredTypeRaw,
      )
        ? (preferredTypeRaw as ClassSetupPreferredReturn["preferredType"])
        : "single",
      currentPortion: numStr(pref.currentPortion ?? pref.current_portion, ""),
      accruedPortion: numStr(pref.accruedPortion ?? pref.accrued_portion, ""),
      compounding: (COMPOUNDING_MODES as readonly string[]).includes(
        compoundingRaw,
      )
        ? (compoundingRaw as ClassSetupPreferredReturn["compounding"])
        : "simple",
      distributionFrequency: (
        DISTRIBUTION_FREQUENCIES as readonly string[]
      ).includes(freqRaw)
        ? (freqRaw as ClassSetupPreferredReturn["distributionFrequency"])
        : "quarterly",
    };
  }

  if (classType !== "lp") return defaultPreferredReturn();

  const rateFromClass = str(
    adv.classPreferredReturnPct ?? adv.class_preferred_return_pct,
  ).replace(/%/g, "");
  const compounding =
    str(adv.classCompoundingPeriod ?? adv.class_compounding_period) === "none"
      ? "simple"
      : "compound";

  return {
    ...defaultPreferredReturn(),
    enabled: Boolean(rateFromClass) || Boolean(adv.hurdles),
    rate: numStr(rateFromClass, "7"),
    compounding,
  };
}

function parsePromoteSchedule(raw: unknown): ClassSetupPromoteSchedule {
  const o = asRecord(raw);
  const hurdlesRaw = Array.isArray(o.hurdles) ? o.hurdles : [];
  const hurdles: ClassSetupPromoteHurdle[] = hurdlesRaw.map((h, i) => {
    const row = asRecord(h);
    const basisRaw = str(row.basis);
    const measuredRaw = str(row.measuredOn ?? row.measured_on);
    const basis = (PROMOTE_HURDLE_BASES as readonly string[]).includes(basisRaw)
      ? (basisRaw as PromoteHurdleBasis)
      : "Cumulative return";
    const measuredOn = (PROMOTE_MEASURED_ON as readonly string[]).includes(
      measuredRaw,
    )
      ? (measuredRaw as PromoteMeasuredOn)
      : "LP classes";
    return {
      id: str(row.id) || `h${i + 1}`,
      rate: numStr(row.rate, i === 0 ? "12" : "15"),
      basis,
      measuredOn,
    };
  });

  const sharesRaw = asRecord(o.shares);
  const shares: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(sharesRaw)) {
    if (!Array.isArray(val)) continue;
    shares[key] = val.map((v) => numStr(v, "0"));
  }

  if (hurdles.length === 0) {
    hurdles.push({
      id: "h1",
      rate: "12",
      basis: "Cumulative return",
      measuredOn: "LP classes",
    });
  }

  return { hurdles, shares };
}

export function parseDealClassSetupMeta(raw: string): ClassSetupDealMeta {
  const o = parseJsonObject(raw);
  return {
    targetRaise: numStr(o.targetRaise ?? o.target_raise, "0"),
    latestChanges: str(o.latestChanges ?? o.latest_changes),
    promote: parsePromoteSchedule(o.promote),
  };
}

export function serializeDealClassSetupMeta(meta: ClassSetupDealMeta): string {
  const promote = meta.promote ?? { hurdles: [], shares: {} };
  return JSON.stringify({
    targetRaise: numStr(meta.targetRaise, "0"),
    latestChanges: str(meta.latestChanges),
    promote: {
      hurdles: (promote.hurdles ?? []).map((h, i) => ({
        id: str(h.id) || `h${i + 1}`,
        rate: numStr(h.rate, "0"),
        basis: h.basis,
        measuredOn: h.measuredOn,
      })),
      shares: Object.fromEntries(
        Object.entries(promote.shares ?? {}).map(([k, arr]) => [
          k,
          (arr ?? []).map((v) => numStr(v, "0")),
        ]),
      ),
    },
    updatedAt: new Date().toISOString(),
  });
}

export function rowToClassSetupPayload(
  row: DealInvestorClassRow,
  index: number,
): ClassSetupClassPayload {
  const adv = parseJsonObject(row.advancedOptionsJson);
  const setup = readNested(adv, "classSetup");
  const classTypeRaw = str(row.subscriptionType).toLowerCase();
  const classType: ClassSetupType = isClassSetupType(classTypeRaw)
    ? classTypeRaw
    : "lp";

  const equityFromAdv = str(
    setup.equityPct ??
      setup.equity_pct ??
      adv.entityLegalOwnershipPct ??
      adv.entity_legal_ownership_pct,
  ).replace(/%/g, "");

  const { tiers, finalTier } = mapHurdlesFromAdvanced(adv);
  const prefEquityRaw = asRecord(setup.prefEquity ?? setup.pref_equity);
  const mezzRaw = asRecord(setup.mezz ?? adv.mezz);

  return {
    id: row.id,
    name: row.name || `Class ${index + 1}`,
    classType,
    displayOrder:
      Number(setup.displayOrder ?? setup.display_order ?? index) || index,
    status: (str(row.status) as ClassSetupClassPayload["status"]) || "draft",
    classGroup:
      str(setup.classGroup ?? setup.class_group) || row.entityName || "",
    mapsTo:
      str(setup.mapsTo ?? setup.maps_to) ||
      `Investor Class ${index + 1}`,
    committedCapital: row.offeringSize || "0",
    actuallyFunded: numStr(
      setup.actuallyFunded ??
        setup.actually_funded ??
        row.raiseAmountDistributions,
      "0",
    ),
    minimumInvestment: row.minimumInvestment || "0",
    equityPct:
      classType === "preferred_equity" || classType === "mezzanine"
        ? "0"
        : numStr(equityFromAdv, "0"),
    preferredReturn: mapPreferredFromAdvanced(adv, classType),
    prefEquity: {
      totalRate: numStr(
        prefEquityRaw.totalRate ?? prefEquityRaw.total_rate,
        "15",
      ),
      currentRate: numStr(
        prefEquityRaw.currentRate ?? prefEquityRaw.current_rate,
        "8",
      ),
      accrualRate: numStr(
        prefEquityRaw.accrualRate ?? prefEquityRaw.accrual_rate,
        "7",
      ),
    },
    mezz: {
      rate: numStr(mezzRaw.rate, "10"),
      pay: str(mezzRaw.pay) || "Current pay",
    },
    waterfallTiers: tiers,
    finalTier,
  };
}

function buildHurdlesForAdvanced(payload: ClassSetupClassPayload): unknown[] {
  const hurdles = payload.waterfallTiers.map((t, i) => ({
    id: t.id || newId(),
    expanded: i === 0,
    upsideLpPct: `${numStr(t.lpPct)}%`,
    upsideGpPct: `${numStr(t.gpPct)}%`,
    cocReturnPct: `${numStr(t.hurdleRate)}%`,
    hurdleName: `Tier ${i + 1}`,
    preferredReturnType: "cash_on_cash",
    finalHurdle: "no",
    advancedOpen: false,
    catchUpPreferredReturns: "yes",
    honorOnlyOnCapitalEvent: "no",
    dayCountConvention: "actual_365",
    compoundingPeriod: "none",
    startDateOverride: "",
    endDate: "",
  }));

  hurdles.push({
    id: `final_${payload.id || newId()}`,
    expanded: false,
    upsideLpPct: `${numStr(payload.finalTier.lpPct)}%`,
    upsideGpPct: `${numStr(payload.finalTier.gpPct)}%`,
    cocReturnPct: "0%",
    hurdleName: "Final Tier",
    preferredReturnType: "cash_on_cash",
    finalHurdle: "yes",
    advancedOpen: false,
    catchUpPreferredReturns: "yes",
    honorOnlyOnCapitalEvent: "no",
    dayCountConvention: "actual_365",
    compoundingPeriod: "none",
    startDateOverride: "",
    endDate: "",
  });

  return hurdles;
}

export function classSetupPayloadToInvestorClassInput(
  payload: ClassSetupClassPayload,
  existingAdvancedJson?: string,
): InvestorClassInput {
  const existing = parseJsonObject(existingAdvancedJson || "{}");
  const isFixed =
    payload.classType === "preferred_equity" ||
    payload.classType === "mezzanine";
  const equityPct = isFixed ? "0" : numStr(payload.equityPct, "0");
  const equityPctLabel = `${equityPct}%`;

  const classSetupBlock = {
    displayOrder: payload.displayOrder,
    classGroup: payload.classGroup,
    mapsTo: payload.mapsTo || "",
    actuallyFunded: numStr(payload.actuallyFunded, "0"),
    equityPct,
    preferredReturn: payload.preferredReturn,
    prefEquity: payload.prefEquity,
    mezz: payload.mezz,
    waterfallTiers: payload.waterfallTiers,
    finalTier: payload.finalTier,
  };

  const advanced: Record<string, unknown> = {
    ...existing,
    classSetup: classSetupBlock,
    entityLegalOwnershipPct: equityPctLabel,
    entity_legal_ownership_pct: equityPctLabel,
    distributionSharePct: isFixed ? "0%" : equityPctLabel,
    distribution_share_pct: isFixed ? "0%" : equityPctLabel,
  };

  if (payload.classType === "lp" || payload.classType === "gp") {
    advanced.hurdles = buildHurdlesForAdvanced(payload);
    if (payload.preferredReturn.enabled) {
      advanced.classPreferredReturnPct = `${numStr(payload.preferredReturn.rate)}%`;
      advanced.class_preferred_return_pct = `${numStr(payload.preferredReturn.rate)}%`;
      advanced.classCompoundingPeriod =
        payload.preferredReturn.compounding === "compound"
          ? "annually"
          : "none";
      advanced.class_compounding_period = advanced.classCompoundingPeriod;
    }
  }

  if (payload.classType === "mezzanine") {
    advanced.investmentType = "debt";
    advanced.classPreferredReturnType = "average_annual_return";
    advanced.class_preferred_return_type = "average_annual_return";
    advanced.classPreferredReturnPct = `${numStr(payload.mezz.rate)}%`;
    advanced.class_preferred_return_pct = `${numStr(payload.mezz.rate)}%`;
    advanced.preferredReturnAccruesOn = "capital_balance";
    advanced.preferred_return_accrues_on = "capital_balance";
    advanced.classDayCountConvention = "actual_365";
    advanced.class_day_count_convention = "actual_365";
    advanced.classCompoundingPeriod = "none";
    advanced.class_compounding_period = "none";
    advanced.classCatchUpPreferredReturns = "yes";
    advanced.class_catch_up_preferred_returns = "yes";
    advanced.classHonorOnlyOnCapitalEvent = "no";
    advanced.class_honor_only_on_capital_event = "no";
  }

  if (payload.classType === "preferred_equity") {
    advanced.investmentType = "preferred_equity";
    advanced.classPreferredReturnType = "preferred";
    advanced.class_preferred_return_type = "preferred";
    advanced.classPreferredReturnPct = `${numStr(payload.prefEquity.totalRate)}%`;
    advanced.class_preferred_return_pct = `${numStr(payload.prefEquity.totalRate)}%`;
  }

  return {
    name: payload.name.trim(),
    subscriptionType: payload.classType,
    entityName: payload.classGroup.trim(),
    startDate: "",
    offeringSize: numStr(payload.committedCapital, "0"),
    raiseAmountDistributions: numStr(payload.actuallyFunded, "0"),
    billingRaiseQuota: "",
    minimumInvestment: numStr(payload.minimumInvestment, "0"),
    numberOfUnits: str(existing.numberOfUnits) || "",
    pricePerUnit: str(existing.pricePerUnit) || "",
    status: payload.status || "draft",
    visibility: str(existing.visibility) || "",
    advancedOptionsJson: JSON.stringify(advanced),
  };
}

export function emptyClassSetupPayload(
  classType: ClassSetupType,
  displayOrder: number,
): ClassSetupClassPayload {
  const groups: Record<ClassSetupType, string> = {
    lp: "Class A",
    gp: "Class C",
    preferred_equity: "Class B",
    mezzanine: "Class M",
  };

  return {
    name: groups[classType],
    classType,
    displayOrder,
    status: "draft",
    classGroup: groups[classType],
    mapsTo: `Investor Class`,
    committedCapital: "0",
    actuallyFunded: "0",
    minimumInvestment: classType === "gp" ? "0" : "25000",
    equityPct: "0",
    preferredReturn: {
      ...defaultPreferredReturn(),
      enabled: classType === "lp",
    },
    prefEquity: defaultPrefEquity(),
    mezz: defaultMezz(),
    waterfallTiers:
      classType === "lp" || classType === "gp"
        ? [
            {
              id: newId(),
              hurdleRate: "7",
              lpPct: "70",
              gpPct: "30",
            },
          ]
        : [],
    finalTier: defaultFinalTier(),
  };
}

export function defaultClassName(classType: ClassSetupType, n: number): string {
  const base =
    classType === "lp"
      ? "Class A"
      : classType === "gp"
        ? "Class C"
        : classType === "preferred_equity"
          ? "Class B"
          : "Class M";
  return n > 1 ? `${base}-${n}` : base;
}
