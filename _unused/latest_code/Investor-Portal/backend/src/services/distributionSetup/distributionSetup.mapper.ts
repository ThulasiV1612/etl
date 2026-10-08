import type {
  DistributionAmountMode,
  DistributionFeeConfig,
  DistributionPaymentRow,
  DistributionWaterfalls,
  DistributionWfKind,
  InvestorDistributionPayment,
  PriorDistributionRecord,
} from "./distributionSetup.types.js";
import {
  DISTRIBUTION_AMOUNT_MODES,
  DISTRIBUTION_WF_KINDS,
  emptyWaterfalls,
} from "./distributionSetup.types.js";
import {
  normalizeInvestorPaymentLines,
  serializeInvestorPaymentLines,
} from "./investorDistributionAllocation.js";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function numStr(v: unknown, fallback = "0"): string {
  const t = str(v).replace(/[$,%\s,]/g, "");
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>;
  return {};
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

function parseRow(raw: unknown, index: number): DistributionPaymentRow | null {
  const o = asRecord(raw);
  const kindRaw = str(o.kind);
  if (!(DISTRIBUTION_WF_KINDS as readonly string[]).includes(kindRaw))
    return null;
  const modeRaw = str(o.amountMode ?? o.amount_mode) || "calc";
  const amountMode = (DISTRIBUTION_AMOUNT_MODES as readonly string[]).includes(
    modeRaw,
  )
    ? (modeRaw as DistributionAmountMode)
    : "calc";
  const payToRaw = Array.isArray(o.payTo)
    ? o.payTo
    : Array.isArray(o.pay_to)
      ? o.pay_to
      : [];
  const catchup = asRecord(o.catchup);
  return {
    id: str(o.id) || `row_${index + 1}`,
    kind: kindRaw as DistributionWfKind,
    name: str(o.name) || kindRaw,
    payTo: payToRaw.map((id) => str(id)).filter(Boolean),
    amountMode,
    inputAmount: numStr(o.inputAmount ?? o.input_amount, "0"),
    catchupPct: numStr(catchup.pct ?? o.catchupPct ?? o.catchup_pct, "20"),
  };
}

function parseRows(raw: unknown): DistributionPaymentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r, i) => parseRow(r, i))
    .filter((r): r is DistributionPaymentRow => r != null);
}

function isoDateOnly(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parsePeriod(
  raw: unknown,
): "monthly" | "quarterly" | "annual" | undefined {
  const t = str(raw).toLowerCase();
  if (t === "monthly" || t === "month") return "monthly";
  if (t === "annual" || t === "yearly" || t === "year") return "annual";
  if (t === "quarterly" || t === "quarter") return "quarterly";
  const n = Number(str(raw).replace(/[^0-9.]/g, ""));
  if (Number.isFinite(n) && n > 0) {
    const ppy = Math.round(1 / n);
    if (ppy === 12) return "monthly";
    if (ppy === 1) return "annual";
    if (ppy === 4) return "quarterly";
  }
  return undefined;
}

export function parsePriorDistributionsJson(
  raw: unknown,
): PriorDistributionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: PriorDistributionRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = asRecord(raw[i]);
    const amount = numStr(o.amount, "");
    const date = isoDateOnly(str(o.date));
    if (!amount || Number(amount) === 0 || !date) continue;
    const sourceRaw = str(o.source ?? o.waterfall ?? o.wf).toLowerCase();
    const source =
      sourceRaw === "capital" || sourceRaw === "capital_event"
        ? "capital"
        : sourceRaw === "fee" || sourceRaw === "distribution_fee"
          ? "fee"
          : sourceRaw === "operating"
            ? "operating"
            : str(o.source);
    const period = parsePeriod(o.period ?? o.periodFactor ?? o.period_factor);
    const investorPayments = normalizeInvestorPaymentLines(
      o.investorPayments ?? o.investor_payments,
    );
    const periodStart = isoDateOnly(
      str(o.periodStart ?? o.period_start),
    );
    const periodEnd = isoDateOnly(str(o.periodEnd ?? o.period_end));
    const paymentDate = isoDateOnly(
      str(o.paymentDate ?? o.payment_date),
    );
    const distributionType = str(
      o.distributionType ?? o.distribution_type ?? o.type,
    );
    const deductsFrom = str(o.deductsFrom ?? o.deducts_from);
    const visibleRaw = o.visible ?? o.isVisible ?? o.is_visible;
    const visible =
      visibleRaw === false ||
      visibleRaw === 0 ||
      String(visibleRaw).toLowerCase() === "false"
        ? false
        : visibleRaw == null
          ? undefined
          : true;
    out.push({
      id: str(o.id) || `dist_${date}_${i + 1}`,
      amount,
      date,
      ...(source ? { source } : {}),
      ...(str(o.name) ? { name: str(o.name) } : {}),
      ...(str(o.notes ?? o.note) ? { notes: str(o.notes ?? o.note) } : {}),
      ...(period ? { period } : {}),
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
      ...(paymentDate ? { paymentDate } : {}),
      ...(distributionType ? { distributionType } : {}),
      ...(deductsFrom ? { deductsFrom } : {}),
      ...(visible != null ? { visible } : {}),
      ...(investorPayments.length ? { investorPayments } : {}),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function parseDistributionFee(raw: unknown): DistributionFeeConfig | undefined {
  const o = asRecord(raw);
  if (Object.keys(o).length === 0) return undefined;
  const splitsRaw = Array.isArray(o.classSplits)
    ? o.classSplits
    : Array.isArray(o.class_splits)
      ? o.class_splits
      : [];
  const classSplits = splitsRaw
    .map((item) => {
      const row = asRecord(item);
      const classId = str(row.classId ?? row.class_id);
      if (!classId) return null;
      return {
        classId,
        percent: numStr(row.percent ?? row.pct ?? row.percentage, "0"),
      };
    })
    .filter((s): s is { classId: string; percent: string } => s != null);
  const periodFactor = str(o.periodFactor ?? o.period_factor) || "0.25";
  const periodStart = str(
    o.periodStart ?? o.period_start ?? o.startDate ?? o.start_date,
  ).slice(0, 10);
  const periodEnd = str(o.periodEnd ?? o.period_end).slice(0, 10);
  const legacyDistDate = str(
    o.distributionDate ?? o.distribution_date,
  ).slice(0, 10);
  const resolvedStart = /^\d{4}-\d{2}-\d{2}$/.test(periodStart)
    ? periodStart
    : /^\d{4}-\d{2}-\d{2}$/.test(legacyDistDate)
      ? legacyDistDate
      : "";
  const resolvedEnd = /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : "";
  const name = str(o.name);
  const type =
    str(o.type ?? o.feeType ?? o.fee_type) || (name ? name : "");
  const typeOptionsRaw = Array.isArray(o.typeOptions)
    ? o.typeOptions
    : Array.isArray(o.type_options)
      ? o.type_options
      : [];
  const typeOptions = typeOptionsRaw
    .map((item) => str(item))
    .filter(Boolean);
  return {
    name,
    type,
    typeOptions,
    cashAvailable: numStr(o.cashAvailable ?? o.cash_available, "0"),
    periodFactor,
    periodStart: resolvedStart,
    periodEnd: resolvedEnd,
    classSplits,
  };
}

function serializeDistributionFee(
  fee: DistributionFeeConfig | null | undefined,
): DistributionFeeConfig | undefined {
  if (fee == null) return undefined;
  const name = str(fee.name);
  const type = str(fee.type) || name;
  const classSplits = (fee.classSplits ?? [])
    .map((s) => ({
      classId: str(s.classId),
      percent: numStr(s.percent, "0"),
    }))
    .filter((s) => s.classId);
  if (!name && !type && classSplits.length === 0 && !str(fee.cashAvailable))
    return undefined;
  const periodStart = str(fee.periodStart).slice(0, 10);
  const periodEnd = str(fee.periodEnd).slice(0, 10);
  const typeOptions = (fee.typeOptions ?? [])
    .map((t) => str(t))
    .filter(Boolean);
  return {
    name,
    type,
    typeOptions,
    cashAvailable: numStr(fee.cashAvailable, "0"),
    periodFactor: str(fee.periodFactor) || "0.25",
    periodStart: /^\d{4}-\d{2}-\d{2}$/.test(periodStart) ? periodStart : "",
    periodEnd: /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : "",
    classSplits,
  };
}

export function parseDistributionSetupDocument(raw: string): {
  waterfalls: DistributionWaterfalls;
  priorDistributions: PriorDistributionRecord[];
  setupName: string;
  dayCountMode: "period_window" | "from_accrual_start";
  defaultAccrualStartIso: string;
  distributionFee?: DistributionFeeConfig;
} {
  const o = parseJsonObject(raw);
  const wf = asRecord(o.waterfalls ?? o);
  const defaults = emptyWaterfalls();
  const operating = parseRows(wf.operating);
  const capital = parseRows(wf.capital ?? wf.capital_event);
  const dayRaw = str(o.dayCountMode ?? o.day_count_mode).toLowerCase();
  const dayCountMode =
    dayRaw === "from_accrual_start" ? "from_accrual_start" : "period_window";
  const accrualRaw = str(
    o.defaultAccrualStartIso ?? o.default_accrual_start_iso,
  ).slice(0, 10);
  const distributionFee = parseDistributionFee(
    o.distributionFee ?? o.distribution_fee,
  );
  return {
    waterfalls: {
      operating: operating.length > 0 ? operating : defaults.operating,
      capital: capital.length > 0 ? capital : defaults.capital,
    },
    priorDistributions: parsePriorDistributionsJson(
      o.priorDistributions ?? o.prior_distributions,
    ),
    setupName: str(o.setupName ?? o.setup_name),
    dayCountMode,
    defaultAccrualStartIso: /^\d{4}-\d{2}-\d{2}$/.test(accrualRaw)
      ? accrualRaw
      : "",
    ...(distributionFee ? { distributionFee } : {}),
  };
}

/** @deprecated Prefer parseDistributionSetupDocument — kept for call sites that only need waterfalls. */
export function parseDistributionSetupJson(raw: string): DistributionWaterfalls {
  return parseDistributionSetupDocument(raw).waterfalls;
}

export function serializeDistributionSetupJson(
  waterfalls: DistributionWaterfalls,
  priorDistributions: PriorDistributionRecord[] = [],
  setupName = "",
  options?: {
    dayCountMode?: "period_window" | "from_accrual_start";
    defaultAccrualStartIso?: string;
    distributionFee?: DistributionFeeConfig | null;
  },
): string {
  const mapRow = (r: DistributionPaymentRow) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    payTo: r.payTo ?? [],
    amountMode: r.amountMode,
    inputAmount: numStr(r.inputAmount, "0"),
    catchup: { pct: numStr(r.catchupPct, "20") },
  });
  const dayCountMode =
    options?.dayCountMode === "from_accrual_start"
      ? "from_accrual_start"
      : options?.dayCountMode === "period_window"
        ? "period_window"
        : undefined;
  const accrual = str(options?.defaultAccrualStartIso).slice(0, 10);
  const distributionFee = serializeDistributionFee(options?.distributionFee);
  return JSON.stringify({
    ...(str(setupName) ? { setupName: str(setupName) } : {}),
    ...(dayCountMode ? { dayCountMode } : {}),
    ...( /^\d{4}-\d{2}-\d{2}$/.test(accrual)
      ? { defaultAccrualStartIso: accrual }
      : {}),
    ...(distributionFee ? { distributionFee } : {}),
    waterfalls: {
      operating: (waterfalls.operating ?? []).map(mapRow),
      capital: (waterfalls.capital ?? []).map(mapRow),
    },
    priorDistributions: (priorDistributions ?? []).map((p) => ({
      id: str(p.id) || `dist_${isoDateOnly(p.date)}_${numStr(p.amount, "0")}`,
      amount: numStr(p.amount, "0"),
      date: isoDateOnly(p.date),
      ...(str(p.source) ? { source: str(p.source) } : {}),
      ...(str(p.name) ? { name: str(p.name) } : {}),
      ...(str(p.notes) ? { notes: str(p.notes) } : {}),
      ...(p.period === "monthly" ||
      p.period === "quarterly" ||
      p.period === "annual"
        ? { period: p.period }
        : {}),
      ...(isoDateOnly(str(p.periodStart))
        ? { periodStart: isoDateOnly(str(p.periodStart)) }
        : {}),
      ...(isoDateOnly(str(p.periodEnd))
        ? { periodEnd: isoDateOnly(str(p.periodEnd)) }
        : {}),
      ...(isoDateOnly(str(p.paymentDate))
        ? { paymentDate: isoDateOnly(str(p.paymentDate)) }
        : {}),
      ...(str(p.distributionType)
        ? { distributionType: str(p.distributionType) }
        : {}),
      ...(str(p.deductsFrom) ? { deductsFrom: str(p.deductsFrom) } : {}),
      ...(p.visible === false ? { visible: false } : {}),
      ...((p.investorPayments?.length ?? 0) > 0
        ? {
            investorPayments: serializeInvestorPaymentLines(
              p.investorPayments as InvestorDistributionPayment[],
            ),
          }
        : {}),
    })),
    updatedAt: new Date().toISOString(),
  });
}

export function normalizePayToAgainstClasses(
  waterfalls: DistributionWaterfalls,
  classIds: Set<string>,
): DistributionWaterfalls {
  const scrub = (rows: DistributionPaymentRow[]) =>
    rows.map((r) => ({
      ...r,
      payTo: (r.payTo ?? []).filter((id) => classIds.has(id)),
    }));
  return {
    operating: scrub(waterfalls.operating),
    capital: scrub(waterfalls.capital),
  };
}

/** Seed payTo from class types when rows have empty payTo (first open). */
export function seedDefaultPayTo(
  waterfalls: DistributionWaterfalls,
  classes: Array<{ id: string; classType: string }>,
): DistributionWaterfalls {
  const lpIds = classes.filter((c) => c.classType === "lp").map((c) => c.id);
  const prefIds = classes
    .filter((c) => c.classType === "preferred_equity")
    .map((c) => c.id);
  const gpIds = classes.filter((c) => c.classType === "gp").map((c) => c.id);

  function fill(row: DistributionPaymentRow): DistributionPaymentRow {
    if ((row.payTo ?? []).length > 0) return row;
    if (row.kind === "LP_PREF") return { ...row, payTo: [...lpIds] };
    if (row.kind === "ROC") {
      // Capital-event pref redeem rows are ROC kind but target preferred equity.
      const name = row.name.toLowerCase();
      if (name.includes("preferred")) return { ...row, payTo: [...prefIds] };
      return { ...row, payTo: [...lpIds] };
    }
    if (row.kind === "PREF_CURRENT" || row.kind === "PREF_ACCRUED")
      return { ...row, payTo: [...prefIds] };
    if (row.kind === "CATCHUP") return { ...row, payTo: [...gpIds] };
    return row;
  }

  return {
    operating: waterfalls.operating.map(fill),
    capital: waterfalls.capital.map(fill),
  };
}
