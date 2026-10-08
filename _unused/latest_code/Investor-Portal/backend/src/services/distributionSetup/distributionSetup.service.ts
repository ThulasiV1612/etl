/**
 * Distribution Setup — load/save waterfall payment rows.
 * Prior distributions are backend-sourced (not edited in the simulator).
 * Classes + promote come from Class Setup; this module stores waterfalls + prior history.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { distributionLogs } from "../../schema/deal.schema/distribution-logs.schema.js";
import { getClassSetupBundle } from "../classSetup/classSetup.service.js";
import {
  fundedNumericForInvestorKpiRow,
  listDealInvestmentsByDealId,
  mapContactIdsToCanonicalCommitmentKeys,
  mapDealInvestmentsToInvestorApi,
} from "../deal/dealInvestment.service.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  type DealViewerScope,
} from "../deal/dealAccess.service.js";
import {
  normalizePayToAgainstClasses,
  parseDistributionSetupDocument,
  seedDefaultPayTo,
  serializeDistributionSetupJson,
} from "./distributionSetup.mapper.js";
import type {
  DistributionSetupBundle,
  DistributionSetupSaveInput,
  DistributionWaterfalls,
  DistributionWfSource,
  PriorDistributionRecord,
} from "./distributionSetup.types.js";
import { emptyWaterfalls } from "./distributionSetup.types.js";
import {
  allocateByCapitalFallback,
  allocateFeeByClassSplits,
  filterPaymentsForViewer,
  listViewerInvestmentMatchKeys,
  serializeInvestorPaymentLines,
  type InvestorPaymentLine,
  type InvestorPaymentLineInput,
} from "./investorDistributionAllocation.js";

function newDistributionId(): string {
  return `dist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatUsdPlain(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return String(Math.round(v * 100) / 100);
}

export async function getDistributionSetupBundle(
  dealId: string,
): Promise<DistributionSetupBundle | null> {
  const classBundle = await getClassSetupBundle(dealId);
  if (!classBundle) return null;

  const [deal] = await db
    .select({
      distributionSetupJson: addDealForm.distributionSetupJson,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);

  const parsed = parseDistributionSetupDocument(
    deal?.distributionSetupJson ?? "{}",
  );
  let waterfalls = parsed.waterfalls;

  const classIds = new Set(
    classBundle.classes.map((c) => c.id).filter((id): id is string => Boolean(id)),
  );
  const classRefs = classBundle.classes
    .filter((c) => c.id)
    .map((c) => ({ id: c.id as string, classType: c.classType }));

  waterfalls = seedDefaultPayTo(waterfalls, classRefs);
  waterfalls = normalizePayToAgainstClasses(waterfalls, classIds);

  return {
    dealId: classBundle.dealId,
    dealName: classBundle.dealName,
    targetRaise: classBundle.meta.targetRaise,
    setupName: parsed.setupName || "",
    dayCountMode: parsed.dayCountMode,
    defaultAccrualStartIso: parsed.defaultAccrualStartIso || undefined,
    waterfalls,
    priorDistributions: parsed.priorDistributions,
    classes: classBundle.classes
      .filter((c) => c.id)
      .map((c) => ({
        id: c.id as string,
        name: c.name,
        classType: c.classType,
        actuallyFunded: c.actuallyFunded,
        equityPct: c.equityPct,
        preferredReturn: {
          enabled: c.preferredReturn.enabled,
          rate: c.preferredReturn.rate,
        },
        prefEquity: { ...c.prefEquity },
        mezz: { ...c.mezz },
      })),
    promote: {
      hurdles: classBundle.meta.promote.hurdles.map((h) => ({
        id: h.id,
        rate: h.rate,
        basis: h.basis,
        measuredOn: h.measuredOn,
      })),
      shares: classBundle.meta.promote.shares,
    },
    ...(parsed.distributionFee
      ? { distributionFee: parsed.distributionFee }
      : {}),
  };
}

export async function saveDistributionSetupBundle(params: {
  dealId: string;
  input: DistributionSetupSaveInput;
}): Promise<{ bundle: DistributionSetupBundle; error?: string }> {
  const existing = await getDistributionSetupBundle(params.dealId);
  if (!existing) {
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        targetRaise: "0",
        setupName: "",
        waterfalls: emptyWaterfalls(),
        priorDistributions: [],
        classes: [],
        promote: { hurdles: [], shares: {} },
      },
      error: "Deal not found",
    };
  }

  const classIds = new Set(existing.classes.map((c) => c.id));
  const waterfalls: DistributionWaterfalls = normalizePayToAgainstClasses(
    {
      operating: params.input.waterfalls?.operating ?? [],
      capital: params.input.waterfalls?.capital ?? [],
    },
    classIds,
  );

  if (waterfalls.operating.length === 0 && waterfalls.capital.length === 0) {
    return { bundle: existing, error: "At least one payment row is required" };
  }

  const setupName =
    params.input.setupName != null
      ? String(params.input.setupName).trim()
      : (existing.setupName ?? "");
  const dayCountMode =
    params.input.dayCountMode === "from_accrual_start" ||
    params.input.dayCountMode === "period_window"
      ? params.input.dayCountMode
      : (existing.dayCountMode ?? "period_window");
  const defaultAccrualStartIso = (() => {
    if (params.input.defaultAccrualStartIso != null) {
      const t = String(params.input.defaultAccrualStartIso).trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
    }
    return existing.defaultAccrualStartIso ?? "";
  })();
  const distributionFee =
    params.input.distributionFee !== undefined
      ? params.input.distributionFee
      : (existing.distributionFee ?? null);

  if (distributionFee?.name?.trim()) {
    const feeKey = distributionFee.name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const clash = existing.priorDistributions.find((p) => {
      const src = String(p.source ?? "")
        .trim()
        .toLowerCase();
      if (src === "fee" || src === "distribution_fee") return false;
      const priorKey = String(p.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      return Boolean(priorKey) && priorKey === feeKey;
    });
    if (clash) {
      return {
        bundle: existing,
        error:
          "This fee name is already used by an Operating or Capital event distribution. Choose a unique name.",
      };
    }
  }

  // Preserve backend prior distributions — waterfall save must not wipe history.
  await db
    .update(addDealForm)
    .set({
      distributionSetupJson: serializeDistributionSetupJson(
        waterfalls,
        existing.priorDistributions,
        setupName,
        { dayCountMode, defaultAccrualStartIso, distributionFee },
      ),
    })
    .where(eq(addDealForm.id, params.dealId));

  const bundle = await getDistributionSetupBundle(params.dealId);
  return {
    bundle: bundle ?? {
      ...existing,
      waterfalls,
      setupName,
      dayCountMode,
      defaultAccrualStartIso: defaultAccrualStartIso || undefined,
      ...(distributionFee ? { distributionFee } : {}),
    },
  };
}

export type CompleteDistributionInput = {
  source: DistributionWfSource | "fee";
  amount: number;
  date?: string;
  name?: string;
  notes?: string;
  period?: "monthly" | "quarterly" | "annual";
  periodStart?: string;
  periodEnd?: string;
  paymentDate?: string;
  distributionType?: string;
  deductsFrom?: string;
  visible?: boolean;
  /** When set, update this prior run in place instead of appending. */
  replaceDistributionId?: string;
  /** Waterfall-accurate investor lines from the simulator (optional). */
  investorPayments?: InvestorPaymentLineInput[];
};

/**
 * Record a completed distribution run (appends to priorDistributions,
 * or replaces an existing run when replaceDistributionId is set).
 * Does not change waterfall configuration.
 */
export async function completeDistributionRun(params: {
  dealId: string;
  input: CompleteDistributionInput;
}): Promise<{ bundle: DistributionSetupBundle; error?: string; record?: PriorDistributionRecord }> {
  const amount = Number(params.input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const existing = await getDistributionSetupBundle(params.dealId);
    return {
      bundle:
        existing ??
        ({
          dealId: params.dealId,
          dealName: "",
          targetRaise: "0",
          setupName: "",
          waterfalls: emptyWaterfalls(),
          priorDistributions: [],
          classes: [],
          promote: { hurdles: [], shares: {} },
        } satisfies DistributionSetupBundle),
      error: "Cash amount must be greater than zero",
    };
  }

  const [deal] = await db
    .select({
      distributionSetupJson: addDealForm.distributionSetupJson,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, params.dealId))
    .limit(1);

  if (!deal) {
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        targetRaise: "0",
        setupName: "",
        waterfalls: emptyWaterfalls(),
        priorDistributions: [],
        classes: [],
        promote: { hurdles: [], shares: {} },
      },
      error: "Deal not found",
    };
  }

  const parsed = parseDistributionSetupDocument(
    deal.distributionSetupJson ?? "{}",
  );
  const sourceRaw = String(params.input.source ?? "")
    .trim()
    .toLowerCase();
  const source: "operating" | "capital" | "fee" =
    sourceRaw === "capital" || sourceRaw === "capital_event"
      ? "capital"
      : sourceRaw === "fee" || sourceRaw === "distribution_fee"
        ? "fee"
        : "operating";
  const date =
    params.input.date && /^\d{4}-\d{2}-\d{2}/.test(params.input.date.trim())
      ? params.input.date.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const name =
    params.input.name?.trim() ||
    (source === "capital"
      ? `Capital event · ${date}`
      : source === "fee"
        ? `Acquisition fee · ${date}`
        : `Operating · ${date}`);
  const notes = params.input.notes?.trim() || "";
  const periodRaw = params.input.period;
  const period =
    periodRaw === "monthly" ||
    periodRaw === "quarterly" ||
    periodRaw === "annual"
      ? periodRaw
      : undefined;

  const replaceId = String(params.input.replaceDistributionId ?? "").trim();
  const nameKey = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (nameKey) {
    const feeKey = String(parsed.distributionFee?.name ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    // Fee completes intentionally use the fee name; Operating/Capital must not.
    if (source !== "fee" && feeKey && feeKey === nameKey) {
      return {
        bundle: (await getDistributionSetupBundle(params.dealId)) ?? {
          dealId: params.dealId,
          dealName: "",
          targetRaise: "0",
          setupName: parsed.setupName || "",
          waterfalls: parsed.waterfalls,
          priorDistributions: parsed.priorDistributions,
          classes: [],
          promote: { hurdles: [], shares: {} },
          ...(parsed.distributionFee
            ? { distributionFee: parsed.distributionFee }
            : {}),
        },
        error:
          "This distribution name is already used on the Distribution Fee tab. Choose a unique name.",
      };
    }
    // Duplicate names across Distributions runs are allowed.
  }

  let investorPayments = serializeInvestorPaymentLines(
    params.input.investorPayments,
  );
  if (source === "fee") {
    const scoped = await buildFeeClassScopedPayments(
      params.dealId,
      amount,
      parsed.distributionFee,
    );
    if (scoped.error) {
      const bundle = await getDistributionSetupBundle(params.dealId);
      return {
        bundle:
          bundle ??
          ({
            ...parsed,
            dealId: params.dealId,
          } as DistributionSetupBundle),
        error: scoped.error,
      };
    }
    if (investorPayments.length === 0) {
      investorPayments = scoped.lines;
    }
  } else if (investorPayments.length === 0) {
    investorPayments = await buildFallbackInvestorPayments(
      params.dealId,
      amount,
    );
  }

  const replaceIndex = replaceId
    ? parsed.priorDistributions.findIndex(
        (p) => String(p.id).trim() === replaceId,
      )
    : -1;
  if (replaceId && replaceIndex < 0) {
    const bundle = await getDistributionSetupBundle(params.dealId);
    return {
      bundle:
        bundle ??
        ({
          ...parsed,
          dealId: params.dealId,
        } as DistributionSetupBundle),
      error: "Distribution not found for edit",
    };
  }

  const amountKey = formatUsdPlain(amount).replace(/[^0-9.-]/g, "");
  // Ignore accidental double-complete (same date + amount + source + name),
  // unless we are intentionally replacing that same run.
  // Different names in the same period are allowed and create separate rows.
  if (!replaceId) {
    const existingDuplicate = parsed.priorDistributions.find((p) => {
      const priorAmt = String(p.amount ?? "").replace(/[^0-9.-]/g, "");
      const priorSrc = String(p.source ?? "").toLowerCase();
      const priorName = String(p.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      return (
        p.date === date &&
        priorAmt === amountKey &&
        priorSrc === source &&
        priorName === nameKey
      );
    });
    if (existingDuplicate) {
      const bundle = await getDistributionSetupBundle(params.dealId);
      return {
        bundle:
          bundle ??
          ({
            ...parsed,
            dealId: params.dealId,
          } as DistributionSetupBundle),
        record: existingDuplicate,
      };
    }
  }

  const periodStart =
    params.input.periodStart &&
    /^\d{4}-\d{2}-\d{2}/.test(params.input.periodStart.trim())
      ? params.input.periodStart.trim().slice(0, 10)
      : undefined;
  const periodEnd =
    params.input.periodEnd &&
    /^\d{4}-\d{2}-\d{2}/.test(params.input.periodEnd.trim())
      ? params.input.periodEnd.trim().slice(0, 10)
      : undefined;
  const paymentDate =
    params.input.paymentDate &&
    /^\d{4}-\d{2}-\d{2}/.test(params.input.paymentDate.trim())
      ? params.input.paymentDate.trim().slice(0, 10)
      : date;
  const distributionType =
    params.input.distributionType?.trim() ||
    (source === "fee" ? name : "preferred_return");
  const deductsFrom =
    params.input.deductsFrom?.trim() ||
    (source === "fee" ? "fee" : "accrued_pref");
  const visible = params.input.visible !== false;

  const record: PriorDistributionRecord = {
    id: replaceId || newDistributionId(),
    amount: formatUsdPlain(amount),
    date,
    source,
    name,
    ...(notes ? { notes } : {}),
    ...(period ? { period } : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    paymentDate,
    distributionType,
    deductsFrom,
    visible,
    ...(investorPayments.length ? { investorPayments } : {}),
  };

  const nextPriors = (
    replaceIndex >= 0
      ? parsed.priorDistributions.map((p, i) =>
          i === replaceIndex ? record : p,
        )
      : [...parsed.priorDistributions, record]
  ).sort((a, b) => a.date.localeCompare(b.date));

  await db
    .update(addDealForm)
    .set({
      distributionSetupJson: serializeDistributionSetupJson(
        parsed.waterfalls,
        nextPriors,
        parsed.setupName,
        {
          dayCountMode: parsed.dayCountMode,
          defaultAccrualStartIso: parsed.defaultAccrualStartIso,
          distributionFee: parsed.distributionFee ?? null,
        },
      ),
    })
    .where(eq(addDealForm.id, params.dealId));

  const bundle = await getDistributionSetupBundle(params.dealId);
  if (!bundle) {
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        targetRaise: "0",
        setupName: parsed.setupName || "",
        waterfalls: parsed.waterfalls,
        priorDistributions: nextPriors,
        classes: [],
        promote: { hurdles: [], shares: {} },
      },
      error: "DISTRIBUTION_COMPLETE_RELOAD_FAILED",
    };
  }
  return { bundle, record };
}

/**
 * Replace or clear completed distribution runs for a deal.
 * Does not change waterfall / class configuration.
 * Pass an empty array to clear all prior distributions (test data cleanup).
 */
export async function replacePriorDistributions(params: {
  dealId: string;
  priorDistributions: PriorDistributionRecord[];
}): Promise<{ bundle: DistributionSetupBundle; error?: string }> {
  const existing = await getDistributionSetupBundle(params.dealId);
  if (!existing) {
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        targetRaise: "0",
        setupName: "",
        waterfalls: emptyWaterfalls(),
        priorDistributions: [],
        classes: [],
        promote: { hurdles: [], shares: {} },
      },
      error: "Deal not found",
    };
  }

  const nextPriors = [...(params.priorDistributions ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  await db
    .update(addDealForm)
    .set({
      distributionSetupJson: serializeDistributionSetupJson(
        existing.waterfalls,
        nextPriors,
        existing.setupName,
        {
          dayCountMode: existing.dayCountMode,
          defaultAccrualStartIso: existing.defaultAccrualStartIso,
          distributionFee: existing.distributionFee ?? null,
        },
      ),
    })
    .where(eq(addDealForm.id, params.dealId));

  const bundle = await getDistributionSetupBundle(params.dealId);
  return {
    bundle: bundle ?? { ...existing, priorDistributions: nextPriors },
  };
}

/**
 * Delete one completed distribution run by id.
 */
export async function deletePriorDistribution(params: {
  dealId: string;
  distributionId: string;
  reason?: string;
}): Promise<{ bundle: DistributionSetupBundle; error?: string }> {
  const existing = await getDistributionSetupBundle(params.dealId);
  if (!existing) {
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        targetRaise: "0",
        setupName: "",
        waterfalls: emptyWaterfalls(),
        priorDistributions: [],
        classes: [],
        promote: { hurdles: [], shares: {} },
      },
      error: "Deal not found",
    };
  }
  const distId = String(params.distributionId ?? "").trim();
  if (!distId) {
    return { bundle: existing, error: "Missing distribution id" };
  }
  const target = existing.priorDistributions.find(
    (p) => String(p.id).trim() === distId,
  );
  if (!target) {
    return { bundle: existing, error: "Distribution not found" };
  }
  const reason = String(params.reason ?? "").trim();
  if (!reason) {
    return { bundle: existing, error: "Deletion reason is required" };
  }
  console.info(
    "[distribution] deleted prior run",
    JSON.stringify({
      dealId: params.dealId,
      distributionId: distId,
      name: target.name ?? "",
      source: target.source ?? "",
      reason,
    }),
  );
  const nextPriors = existing.priorDistributions.filter(
    (p) => String(p.id).trim() !== distId,
  );
  return replacePriorDistributions({
    dealId: params.dealId,
    priorDistributions: nextPriors,
  });
}

async function loadAllocationInvestors(dealId: string): Promise<{
  investors: Array<{
    id: string;
    contactId: string;
    userEmail: string;
    displayName: string;
    investorClass: string;
    capital: number;
    percentOfClassDistributions: string;
  }>;
  classes: Array<{ id: string; name: string }>;
}> {
  const classBundle = await getClassSetupBundle(dealId);
  const rows = await listDealInvestmentsByDealId(dealId);
  const apiRows = await mapDealInvestmentsToInvestorApi(rows);
  const roster = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  const allRawIds: string[] = [];
  for (const m of roster) {
    const k = String(m.contactMemberId ?? "")
      .trim()
      .toLowerCase();
    if (k) allRawIds.push(k);
  }
  for (const r of apiRows) {
    const k = String(r.contactId ?? "")
      .trim()
      .toLowerCase();
    if (k) allRawIds.push(k);
  }
  const rawToCanonical =
    await mapContactIdsToCanonicalCommitmentKeys(allRawIds);

  const pctByCanonical = new Map<string, string>();
  for (const m of roster) {
    const contactKey = String(m.contactMemberId ?? "")
      .trim()
      .toLowerCase();
    if (!contactKey) continue;
    const canonical = rawToCanonical.get(contactKey) ?? `id:${contactKey}`;
    pctByCanonical.set(
      canonical,
      String(m.percentOfClassDistributions ?? "").trim(),
    );
  }

  const investors = apiRows.map((r, i) => {
    const dbRow = rows[i];
    const capital = dbRow
      ? fundedNumericForInvestorKpiRow(dbRow)
      : Number(String(r.committed ?? "").replace(/[^0-9.-]/g, "")) || 0;
    const contactKey = String(r.contactId ?? "")
      .trim()
      .toLowerCase();
    const canonical = contactKey
      ? rawToCanonical.get(contactKey) ?? `id:${contactKey}`
      : "";
    return {
      id: String(r.id ?? ""),
      contactId: String(r.contactId ?? ""),
      userEmail: String(r.userEmail ?? ""),
      displayName: String(r.displayName ?? ""),
      investorClass: String(r.investorClass ?? ""),
      capital: Number.isFinite(capital) ? capital : 0,
      percentOfClassDistributions: canonical
        ? pctByCanonical.get(canonical) ?? ""
        : "",
    };
  });
  return {
    investors,
    classes: (classBundle?.classes ?? [])
      .filter((c) => c.id)
      .map((c) => ({ id: c.id as string, name: c.name })),
  };
}

async function buildFallbackInvestorPayments(
  dealId: string,
  amount: number,
): Promise<InvestorPaymentLine[]> {
  const loaded = await loadAllocationInvestors(dealId);
  return allocateByCapitalFallback({
    amount,
    investors: loaded.investors,
    classes: loaded.classes,
  });
}

function blockedFeeClassMessage(names: string[]): string {
  if (names.length === 0) return "";
  const listed =
    names.length === 1
      ? names[0]!
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? "has" : "have";
  return `${listed} ${verb} a percentage allocated but no class investors. Distributions are class-scoped, so that class is not paid and this distribution is not paid to other classes either.`;
}

async function buildFeeClassScopedPayments(
  dealId: string,
  amount: number,
  fee:
    | {
        classSplits?: Array<{ classId: string; percent: string | number }>;
      }
    | null
    | undefined,
): Promise<{ lines: InvestorPaymentLine[]; error?: string }> {
  const loaded = await loadAllocationInvestors(dealId);
  const splits = fee?.classSplits ?? [];
  const result = allocateFeeByClassSplits({
    amount,
    splits,
    investors: loaded.investors,
    classes: loaded.classes,
  });
  if (result.blockedClassNames.length > 0) {
    return { lines: [], error: blockedFeeClassMessage(result.blockedClassNames) };
  }
  return { lines: result.lines };
}

/**
 * Edit an investor's % of class, % of deal, and/or payment on a completed distribution.
 * Manual values are stored as entered — editing one field does not derive the other.
 * Syncs % of class onto `deal_lp_investor.percent_of_class_distributions` when that field is edited.
 * Syncs % of deal onto `deal_lp_investor.entity_ownership_percent` when that field is edited.
 */
export async function updatePriorDistributionInvestorPercent(params: {
  dealId: string;
  distributionId: string;
  investorId: string;
  percentOfClass?: number;
  percentOfDeal?: number;
  payment?: number;
  /** Sponsor / admin who made the edit (required for distribution_logs). */
  actorUserId?: string | null;
  reason?: string | null;
}): Promise<{ bundle: DistributionSetupBundle; error?: string }> {
  const existing = await getDistributionSetupBundle(params.dealId);
  if (!existing) {
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        targetRaise: "0",
        setupName: "",
        waterfalls: emptyWaterfalls(),
        priorDistributions: [],
        classes: [],
        promote: { hurdles: [], shares: {} },
      },
      error: "Deal not found",
    };
  }

  const distId = String(params.distributionId ?? "").trim();
  const investorId = String(params.investorId ?? "").trim();
  const hasPct = Number.isFinite(params.percentOfClass);
  const hasDealPct = Number.isFinite(params.percentOfDeal);
  const hasPay = Number.isFinite(params.payment);
  if (!distId || !investorId) {
    return { bundle: existing, error: "Missing distribution or investor id" };
  }
  if (!hasPct && !hasPay && !hasDealPct) {
    return {
      bundle: existing,
      error: "Provide percentOfClass, percentOfDeal, and/or payment",
    };
  }

  const priorIndex = existing.priorDistributions.findIndex(
    (p) => String(p.id).trim() === distId,
  );
  if (priorIndex < 0) {
    return { bundle: existing, error: "Distribution not found" };
  }

  const prior = existing.priorDistributions[priorIndex]!;
  let lines = await ensureInvestorPaymentsOnPrior(params.dealId, prior);
  if (lines.length === 0) {
    return { bundle: existing, error: "No investor payments on this distribution" };
  }

  const target = lines.find(
    (l) => String(l.investorId).toLowerCase() === investorId.toLowerCase(),
  );
  if (!target) {
    return { bundle: existing, error: "Investor not found on this distribution" };
  }

  const oldPct = Math.max(0, Number(target.percentOfClass) || 0);
  const oldDealPct = Math.max(0, Number(target.percentOfDeal) || 0);
  const oldPay = Math.max(0, Number(target.payment) || 0);

  // Persist each field as provided; leave the unedited field unchanged.
  const nextPct = hasPct
    ? Math.max(0, Math.min(100, Number(params.percentOfClass)))
    : oldPct;
  const nextDealPct = hasDealPct
    ? Math.max(0, Math.min(100, Number(params.percentOfDeal)))
    : oldDealPct;
  const nextPayment = hasPay
    ? Math.round(Math.max(0, Number(params.payment)) * 100) / 100
    : oldPay;

  lines = lines.map((l) => {
    if (String(l.investorId).toLowerCase() !== investorId.toLowerCase()) {
      return l;
    }
    return {
      ...l,
      percentOfClass: String(Math.round(nextPct * 1000) / 1000),
      percentOfDeal: String(Math.round(nextDealPct * 1000) / 1000),
      payment: String(nextPayment),
    };
  });

  const nextPriors = existing.priorDistributions.map((p, i) =>
    i === priorIndex
      ? {
          ...p,
          investorPayments: serializeInvestorPaymentLines(lines),
        }
      : p,
  );

  await db
    .update(addDealForm)
    .set({
      distributionSetupJson: serializeDistributionSetupJson(
        existing.waterfalls,
        nextPriors,
        existing.setupName ?? "",
        {
          dayCountMode: existing.dayCountMode,
          defaultAccrualStartIso: existing.defaultAccrualStartIso,
          distributionFee: existing.distributionFee ?? null,
        },
      ),
    })
    .where(eq(addDealForm.id, params.dealId));

  const actorUserId = String(params.actorUserId ?? "").trim();
  if (actorUserId) {
    const pctChanged = Math.abs(oldPct - nextPct) > 0.0005;
    const dealPctChanged = Math.abs(oldDealPct - nextDealPct) > 0.0005;
    const payChanged = Math.abs(oldPay - nextPayment) > 0.005;
    if (pctChanged || dealPctChanged || payChanged) {
      await db.insert(distributionLogs).values({
        dealId: params.dealId,
        distributionId: distId,
        investorId,
        contactMemberId: String(target.contactId ?? "").trim(),
        actorUserId,
        action: "investor_payment_edit",
        reason: String(params.reason ?? "").trim(),
        changesJson: {
          investorName: target.investorName ?? "",
          classId: target.classId ?? "",
          className: target.className ?? "",
          percentOfClass: {
            from: Math.round(oldPct * 1000) / 1000,
            to: Math.round(nextPct * 1000) / 1000,
          },
          percentOfDeal: {
            from: Math.round(oldDealPct * 1000) / 1000,
            to: Math.round(nextDealPct * 1000) / 1000,
          },
          payment: {
            from: Math.round(oldPay * 100) / 100,
            to: Math.round(nextPayment * 100) / 100,
          },
          editSource:
            hasDealPct && !hasPct && !hasPay
              ? "percent_of_deal"
              : hasPay && !hasPct && !hasDealPct
                ? "payment"
                : hasPct && !hasPay && !hasDealPct
                  ? "percent_of_class"
                  : "mixed",
        },
      });
    }
  }

  // Sync roster % only for fields the user explicitly edited.
  if (hasPct || hasDealPct) {
    const contactId = String(target.contactId ?? "").trim();
    const rosterPatch: {
      updatedAt: Date;
      percentOfClassDistributions?: string;
      entityOwnershipPercent?: string;
    } = { updatedAt: new Date() };
    if (hasPct) {
      rosterPatch.percentOfClassDistributions = `${(Math.round(nextPct * 100) / 100).toFixed(2)}%`;
    }
    if (hasDealPct) {
      rosterPatch.entityOwnershipPercent = `${(Math.round(nextDealPct * 100) / 100).toFixed(2)}%`;
    }
    const roster = await db
      .select({
        id: dealLpInvestor.id,
        contactMemberId: dealLpInvestor.contactMemberId,
      })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, params.dealId));

    let matchedLpIds: string[] = [];
    if (contactId && roster.length > 0) {
      const allRaw = [
        contactId,
        ...roster.map((m) => String(m.contactMemberId ?? "").trim()),
      ].filter(Boolean);
      const rawToCanonical =
        await mapContactIdsToCanonicalCommitmentKeys(allRaw);
      const contactKey = contactId.trim().toLowerCase();
      const targetCanonical =
        rawToCanonical.get(contactKey) ?? `id:${contactKey}`;
      matchedLpIds = roster
        .filter((m) => {
          const k = String(m.contactMemberId ?? "")
            .trim()
            .toLowerCase();
          if (!k) return false;
          if (k === contactKey) return true;
          const canonical = rawToCanonical.get(k) ?? `id:${k}`;
          return canonical === targetCanonical;
        })
        .map((m) => m.id);
    }

    if (matchedLpIds.length > 0) {
      await db
        .update(dealLpInvestor)
        .set(rosterPatch)
        .where(
          and(
            eq(dealLpInvestor.dealId, params.dealId),
            inArray(dealLpInvestor.id, matchedLpIds),
          ),
        );
    } else if (contactId) {
      await db
        .update(dealLpInvestor)
        .set(rosterPatch)
        .where(
          and(
            eq(dealLpInvestor.dealId, params.dealId),
            eq(dealLpInvestor.contactMemberId, contactId),
          ),
        );
    } else {
      await db
        .update(dealLpInvestor)
        .set(rosterPatch)
        .where(
          and(
            eq(dealLpInvestor.dealId, params.dealId),
            eq(dealLpInvestor.id, investorId),
          ),
        );
    }
  }

  const bundle = await getDistributionSetupBundle(params.dealId);
  return { bundle: bundle ?? { ...existing, priorDistributions: nextPriors } };
}

export type MyDistributionPaymentRow = {
  distributionId: string;
  dealId: string;
  dealName: string;
  date: string;
  source?: string;
  name?: string;
  period?: string;
  dealAmount: string;
  payment: string;
  capital: string;
  percentOfClass: string;
  classId: string;
  className: string;
  investorName: string;
};

async function ensureInvestorPaymentsOnPrior(
  dealId: string,
  prior: PriorDistributionRecord,
): Promise<InvestorPaymentLine[]> {
  if (prior.investorPayments?.length) {
    return serializeInvestorPaymentLines(prior.investorPayments);
  }
  const amount = Number(String(prior.amount).replace(/[^0-9.-]/g, ""));
  if (!(amount > 0)) return [];
  return buildFallbackInvestorPayments(dealId, amount);
}

async function viewerPaymentsForPrior(
  dealId: string,
  prior: PriorDistributionRecord,
  matchKeys: Awaited<ReturnType<typeof listViewerInvestmentMatchKeys>>,
): Promise<InvestorPaymentLine[]> {
  const stored = filterPaymentsForViewer(
    await ensureInvestorPaymentsOnPrior(dealId, prior),
    matchKeys,
  );
  if (stored.length > 0) return stored;
  // Snapshot missing identity (email/contact) — rebuild from current investments.
  const amount = Number(String(prior.amount).replace(/[^0-9.-]/g, ""));
  if (!(amount > 0)) return [];
  return filterPaymentsForViewer(
    await buildFallbackInvestorPayments(dealId, amount),
    matchKeys,
  );
}

/**
 * Deal-scoped distributions for the signed-in investor (their payment lines only).
 */
export async function getMyDistributionsForDeal(params: {
  dealId: string;
  scope: DealViewerScope;
  emailNorm: string;
}): Promise<{
  dealId: string;
  dealName: string;
  distributions: MyDistributionPaymentRow[];
  totalPayment: string;
} | null> {
  if (
    !(await assertDealIdReadableOrAssignedParticipant(
      params.dealId,
      params.scope,
    ))
  ) {
    return null;
  }
  const bundle = await getDistributionSetupBundle(params.dealId);
  if (!bundle) return null;

  const matchKeys = await listViewerInvestmentMatchKeys(params.dealId, {
    userId: params.scope.userId,
    emailNorm: params.emailNorm,
  });

  const out: MyDistributionPaymentRow[] = [];
  for (const prior of bundle.priorDistributions) {
    const lines = await viewerPaymentsForPrior(
      params.dealId,
      prior,
      matchKeys,
    );
    for (const line of lines) {
      out.push({
        distributionId: prior.id,
        dealId: bundle.dealId,
        dealName: bundle.dealName,
        date: prior.date,
        source: prior.source,
        name: prior.name,
        period: prior.period,
        dealAmount: prior.amount,
        payment: line.payment,
        capital: line.capital,
        percentOfClass: line.percentOfClass,
        classId: line.classId,
        className: line.className,
        investorName: line.investorName,
      });
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  const total = out.reduce((s, r) => {
    const n = Number(r.payment);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  return {
    dealId: bundle.dealId,
    dealName: bundle.dealName,
    distributions: out,
    totalPayment: formatUsdPlain(total),
  };
}

/**
 * One completed distribution, scoped to the signed-in investor's payment lines.
 */
export async function getMyDistributionDetailForDeal(params: {
  dealId: string;
  distributionId: string;
  scope: DealViewerScope;
  emailNorm: string;
}): Promise<{
  dealId: string;
  dealName: string;
  distribution: {
    id: string;
    date: string;
    source?: string;
    name?: string;
    notes?: string;
    period?: string;
    dealAmount: string;
  };
  payments: Array<{
    payment: string;
    capital: string;
    percentOfClass: string;
    classId: string;
    className: string;
    investorName: string;
  }>;
  totalPayment: string;
} | null> {
  if (
    !(await assertDealIdReadableOrAssignedParticipant(
      params.dealId,
      params.scope,
    ))
  ) {
    return null;
  }
  const bundle = await getDistributionSetupBundle(params.dealId);
  if (!bundle) return null;
  const prior =
    bundle.priorDistributions.find((p) => p.id === params.distributionId) ??
    null;
  if (!prior) return null;

  const matchKeys = await listViewerInvestmentMatchKeys(params.dealId, {
    userId: params.scope.userId,
    emailNorm: params.emailNorm,
  });
  const lines = await viewerPaymentsForPrior(
    params.dealId,
    prior,
    matchKeys,
  );
  const total = lines.reduce((s, r) => {
    const n = Number(r.payment);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  return {
    dealId: bundle.dealId,
    dealName: bundle.dealName,
    distribution: {
      id: prior.id,
      date: prior.date,
      source: prior.source,
      name: prior.name,
      notes: prior.notes,
      period: prior.period,
      dealAmount: prior.amount,
    },
    payments: lines.map((l) => ({
      payment: l.payment,
      capital: l.capital,
      percentOfClass: l.percentOfClass,
      classId: l.classId,
      className: l.className,
      investorName: l.investorName,
    })),
    totalPayment: formatUsdPlain(total),
  };
}

/**
 * Investor-scoped: payments across all deals the viewer can read.
 */
export async function listMyDistributionsForViewer(params: {
  scope: DealViewerScope;
  emailNorm: string;
  dealIds: string[];
}): Promise<{
  distributions: MyDistributionPaymentRow[];
  totalPayment: string;
}> {
  const all: MyDistributionPaymentRow[] = [];
  for (const dealId of params.dealIds) {
    const pack = await getMyDistributionsForDeal({
      dealId,
      scope: params.scope,
      emailNorm: params.emailNorm,
    });
    if (pack?.distributions.length) all.push(...pack.distributions);
  }
  all.sort((a, b) => b.date.localeCompare(a.date) || a.dealName.localeCompare(b.dealName));
  const total = all.reduce((s, r) => {
    const n = Number(r.payment);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  return { distributions: all, totalPayment: formatUsdPlain(total) };
}
