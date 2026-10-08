import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  listDealsForViewerIncludingAssignedParticipation,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  completeDistributionRun,
  deletePriorDistribution,
  getDistributionSetupBundle,
  getMyDistributionDetailForDeal,
  getMyDistributionsForDeal,
  listMyDistributionsForViewer,
  replacePriorDistributions,
  saveDistributionSetupBundle,
  updatePriorDistributionInvestorPercent,
} from "../../services/distributionSetup/distributionSetup.service.js";
import type {
  DistributionFeeConfig,
  DistributionPaymentRow,
  DistributionSetupSaveInput,
  DistributionWaterfalls,
  DistributionWfKind,
  DistributionWfSource,
} from "../../services/distributionSetup/distributionSetup.types.js";
import {
  DISTRIBUTION_AMOUNT_MODES,
  DISTRIBUTION_WF_KINDS,
  DISTRIBUTION_WF_SOURCES,
} from "../../services/distributionSetup/distributionSetup.types.js";
import type { InvestorPaymentLineInput } from "../../services/distributionSetup/investorDistributionAllocation.js";

function paramId(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>;
  return {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function parseRow(raw: unknown): DistributionPaymentRow | null {
  const o = asRecord(raw);
  const kind = str(o.kind);
  if (!(DISTRIBUTION_WF_KINDS as readonly string[]).includes(kind)) return null;
  const mode = str(o.amountMode ?? o.amount_mode) || "calc";
  const amountMode = (DISTRIBUTION_AMOUNT_MODES as readonly string[]).includes(
    mode,
  )
    ? (mode as DistributionPaymentRow["amountMode"])
    : "calc";
  const payToRaw = Array.isArray(o.payTo)
    ? o.payTo
    : Array.isArray(o.pay_to)
      ? o.pay_to
      : [];
  const catchup = asRecord(o.catchup);
  return {
    id: str(o.id) || `row_${Date.now().toString(36)}`,
    kind: kind as DistributionWfKind,
    name: str(o.name) || kind,
    payTo: payToRaw.map((id) => str(id)).filter(Boolean),
    amountMode,
    inputAmount: str(o.inputAmount ?? o.input_amount) || "0",
    catchupPct: str(catchup.pct ?? o.catchupPct ?? o.catchup_pct) || "20",
  };
}

function parseSaveInput(body: unknown): DistributionSetupSaveInput | null {
  if (body == null || typeof body !== "object" || Array.isArray(body))
    return null;
  const b = body as Record<string, unknown>;
  const wfRaw = asRecord(b.waterfalls ?? b);
  const operatingRaw = Array.isArray(wfRaw.operating) ? wfRaw.operating : [];
  const capitalRaw = Array.isArray(wfRaw.capital)
    ? wfRaw.capital
    : Array.isArray(wfRaw.capital_event)
      ? wfRaw.capital_event
      : [];
  const operating = operatingRaw
    .map(parseRow)
    .filter((r): r is DistributionPaymentRow => r != null);
  const capital = capitalRaw
    .map(parseRow)
    .filter((r): r is DistributionPaymentRow => r != null);
  const waterfalls: DistributionWaterfalls = { operating, capital };
  const setupName = str(b.setupName ?? b.setup_name);
  const dayRaw = str(b.dayCountMode ?? b.day_count_mode).toLowerCase();
  const dayCountMode =
    dayRaw === "from_accrual_start" || dayRaw === "period_window"
      ? (dayRaw as "from_accrual_start" | "period_window")
      : undefined;
  const accrual = str(
    b.defaultAccrualStartIso ?? b.default_accrual_start_iso,
  ).slice(0, 10);
  let distributionFee: DistributionFeeConfig | null | undefined;
  if ("distributionFee" in b || "distribution_fee" in b) {
    const feeRaw = b.distributionFee ?? b.distribution_fee;
    if (feeRaw == null) {
      distributionFee = null;
    } else {
      const fee = asRecord(feeRaw);
      const splitsRaw = Array.isArray(fee.classSplits)
        ? fee.classSplits
        : Array.isArray(fee.class_splits)
          ? fee.class_splits
          : [];
      const classSplits = splitsRaw
        .map((item) => {
          const row = asRecord(item);
          const classId = str(row.classId ?? row.class_id);
          if (!classId) return null;
          const pct = str(row.percent ?? row.pct ?? row.percentage) || "0";
          return { classId, percent: pct };
        })
        .filter((s): s is { classId: string; percent: string } => s != null);
      const periodStart = str(
        fee.periodStart ??
          fee.period_start ??
          fee.startDate ??
          fee.start_date,
      ).slice(0, 10);
      const periodEnd = str(fee.periodEnd ?? fee.period_end).slice(0, 10);
      const legacyDistDate = str(
        fee.distributionDate ?? fee.distribution_date,
      ).slice(0, 10);
      const resolvedStart = /^\d{4}-\d{2}-\d{2}$/.test(periodStart)
        ? periodStart
        : /^\d{4}-\d{2}-\d{2}$/.test(legacyDistDate)
          ? legacyDistDate
          : "";
      const resolvedEnd = /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
        ? periodEnd
        : "";
      const name = str(fee.name);
      const type =
        str(fee.type ?? fee.feeType ?? fee.fee_type) || (name ? name : "");
      const typeOptionsRaw = Array.isArray(fee.typeOptions)
        ? fee.typeOptions
        : Array.isArray(fee.type_options)
          ? fee.type_options
          : [];
      const typeOptions = typeOptionsRaw
        .map((item) => str(item))
        .filter(Boolean);
      distributionFee = {
        name,
        type,
        typeOptions,
        cashAvailable: str(fee.cashAvailable ?? fee.cash_available) || "0",
        periodFactor: str(fee.periodFactor ?? fee.period_factor) || "0.25",
        periodStart: resolvedStart,
        periodEnd: resolvedEnd,
        classSplits,
      };
    }
  }
  return {
    waterfalls,
    ...(setupName ? { setupName } : {}),
    ...(dayCountMode ? { dayCountMode } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(accrual)
      ? { defaultAccrualStartIso: accrual }
      : {}),
    ...(distributionFee !== undefined ? { distributionFee } : {}),
  };
}

async function assertDealAccess(
  req: Request,
  dealId: string,
): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string }
> {
  const user = await getValidJwtUser(req);
  if (!user?.id)
    return { ok: false, status: 401, message: "Authorization required" };
  const scope = await resolveDealViewerScope(
    user.id,
    user.userRole,
    requestedOrganizationIdFromRequest(req),
  );
  if (!(await assertDealIdInViewerScope(dealId, scope)))
    return { ok: false, status: 404, message: "Deal not found" };
  return { ok: true };
}

export async function getDealDistributionSetup(req: Request, res: Response) {
  try {
    const dealId = paramId(req.params.dealId);
    if (!dealId) {
      res.status(400).json({ message: "dealId is required" });
      return;
    }
    const access = await assertDealAccess(req, dealId);
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }
    const bundle = await getDistributionSetupBundle(dealId);
    if (!bundle) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.json({ distributionSetup: bundle });
  } catch (err) {
    console.error("getDealDistributionSetup", err);
    res.status(500).json({ message: "Failed to load distribution setup" });
  }
}

export async function putDealDistributionSetup(req: Request, res: Response) {
  try {
    const dealId = paramId(req.params.dealId);
    if (!dealId) {
      res.status(400).json({ message: "dealId is required" });
      return;
    }
    const access = await assertDealAccess(req, dealId);
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }

    // Clear completed runs only (keeps waterfall). Uses this existing PUT so
    // clients do not depend on a separate route that may not be remounted yet.
    const bodyRec = asRecord(req.body);
    if (bodyRec.clearPriors === true || bodyRec.clear_priors === true) {
      const cleared = await replacePriorDistributions({
        dealId,
        priorDistributions: [],
      });
      if (cleared.error) {
        res.status(400).json({
          message: cleared.error,
          distributionSetup: cleared.bundle,
        });
        return;
      }
      res.json({ distributionSetup: cleared.bundle });
      return;
    }

    const input = parseSaveInput(req.body);
    if (!input) {
      res.status(400).json({ message: "Invalid distribution setup payload" });
      return;
    }
    const { bundle, error } = await saveDistributionSetupBundle({
      dealId,
      input,
    });
    if (error) {
      res.status(400).json({ message: error, distributionSetup: bundle });
      return;
    }

    // Optional: record a completed run in the same PUT (avoids a separate POST
    // that older API processes may not have mounted yet).
    const completeBody = bodyRec.complete;
    if (completeBody != null) {
      const completeInput = parseCompleteInput(completeBody);
      if (!completeInput) {
        res.status(400).json({
          message:
            "Invalid complete payload. Provide source (operating|capital|fee) and amount.",
          distributionSetup: bundle,
        });
        return;
      }
      const completed = await completeDistributionRun({
        dealId,
        input: completeInput,
      });
      if (completed.error) {
        res.status(400).json({
          message: completed.error,
          distributionSetup: completed.bundle,
        });
        return;
      }
      res.json({
        distributionSetup: completed.bundle,
        record: completed.record,
      });
      return;
    }

    res.json({ distributionSetup: bundle });
  } catch (err) {
    console.error("putDealDistributionSetup", err);
    res.status(500).json({ message: "Failed to save distribution setup" });
  }
}

function parseInvestorPayments(raw: unknown): InvestorPaymentLineInput[] {
  if (!Array.isArray(raw)) return [];
  const out: InvestorPaymentLineInput[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const investorId = str(o.investorId ?? o.investor_id);
    const paymentRaw = o.payment;
    const payment =
      typeof paymentRaw === "number"
        ? paymentRaw
        : Number(str(paymentRaw).replace(/[^0-9.-]/g, ""));
    if (!investorId || !Number.isFinite(payment)) continue;
    out.push({
      investorId,
      contactId: str(o.contactId ?? o.contact_id) || undefined,
      userEmail: str(o.userEmail ?? o.user_email) || undefined,
      investorName: str(o.investorName ?? o.investor_name) || "—",
      classId: str(o.classId ?? o.class_id),
      className: str(o.className ?? o.class_name) || "—",
      capital: Number(str(o.capital).replace(/[^0-9.-]/g, "")) || 0,
      percentOfClass:
        Number(str(o.percentOfClass ?? o.percent_of_class).replace(/[^0-9.-]/g, "")) ||
        0,
      ...(str(o.percentOfDeal ?? o.percent_of_deal) !== ""
        ? {
            percentOfDeal:
              Number(
                str(o.percentOfDeal ?? o.percent_of_deal).replace(
                  /[^0-9.-]/g,
                  "",
                ),
              ) || 0,
          }
        : {}),
      payment,
    });
  }
  return out;
}

function parseCompleteInput(body: unknown): {
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
  replaceDistributionId?: string;
  investorPayments?: InvestorPaymentLineInput[];
} | null {
  if (body == null || typeof body !== "object" || Array.isArray(body))
    return null;
  const b = body as Record<string, unknown>;
  const sourceRaw = str(b.source).toLowerCase();
  const allowedSources = [
    ...(DISTRIBUTION_WF_SOURCES as readonly string[]),
    "fee",
    "distribution_fee",
  ];
  if (!allowedSources.includes(sourceRaw)) {
    return null;
  }
  const source: DistributionWfSource | "fee" =
    sourceRaw === "capital" || sourceRaw === "capital_event"
      ? "capital"
      : sourceRaw === "fee" || sourceRaw === "distribution_fee"
        ? "fee"
        : "operating";
  const amountRaw = b.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : Number(str(amountRaw).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount)) return null;
  const periodRaw = str(b.period ?? b.periodFactor ?? b.period_factor).toLowerCase();
  let period: "monthly" | "quarterly" | "annual" | undefined;
  if (periodRaw === "monthly" || periodRaw === "month") period = "monthly";
  else if (periodRaw === "annual" || periodRaw === "yearly" || periodRaw === "year")
    period = "annual";
  else if (periodRaw === "quarterly" || periodRaw === "quarter")
    period = "quarterly";
  else {
    const factor = Number(periodRaw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(factor) && factor > 0) {
      const ppy = Math.round(1 / factor);
      if (ppy === 12) period = "monthly";
      else if (ppy === 1) period = "annual";
      else if (ppy === 4) period = "quarterly";
    }
  }
  const investorPayments = parseInvestorPayments(
    b.investorPayments ?? b.investor_payments,
  );
  const periodStart = str(b.periodStart ?? b.period_start).slice(0, 10);
  const periodEnd = str(b.periodEnd ?? b.period_end).slice(0, 10);
  const paymentDate = str(b.paymentDate ?? b.payment_date).slice(0, 10);
  const distributionType = str(
    b.distributionType ?? b.distribution_type ?? b.type,
  );
  const deductsFrom = str(b.deductsFrom ?? b.deducts_from);
  const replaceDistributionId = str(
    b.replaceDistributionId ?? b.replace_distribution_id,
  );
  const visibleRaw = b.visible;
  const visible =
    visibleRaw === false ||
    visibleRaw === 0 ||
    String(visibleRaw).toLowerCase() === "false"
      ? false
      : visibleRaw == null
        ? undefined
        : true;
  return {
    source,
    amount,
    date: str(b.date) || undefined,
    name: str(b.name) || undefined,
    notes: str(b.notes) || undefined,
    ...(period ? { period } : {}),
    ...( /^\d{4}-\d{2}-\d{2}$/.test(periodStart) ? { periodStart } : {}),
    ...( /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? { periodEnd } : {}),
    ...( /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? { paymentDate } : {}),
    ...(distributionType ? { distributionType } : {}),
    ...(deductsFrom ? { deductsFrom } : {}),
    ...(visible != null ? { visible } : {}),
    ...(replaceDistributionId ? { replaceDistributionId } : {}),
    ...(investorPayments.length ? { investorPayments } : {}),
  };
}

async function viewerEmailNorm(userId: string): Promise<string> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return String(row?.email ?? "").trim().toLowerCase();
}

/** Deal-scoped: investor's distribution payments on one deal. */
export async function getDealMyDistributions(req: Request, res: Response) {
  try {
    const dealId = paramId(req.params.dealId);
    if (!dealId) {
      res.status(400).json({ message: "dealId is required" });
      return;
    }
    const user = await getValidJwtUser(req);
    if (!user?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const emailNorm = await viewerEmailNorm(user.id);
    const pack = await getMyDistributionsForDeal({
      dealId,
      scope,
      emailNorm,
    });
    if (!pack) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.json(pack);
  } catch (err) {
    console.error("getDealMyDistributions", err);
    res.status(500).json({ message: "Failed to load your distributions" });
  }
}

/** Deal-scoped: one completed distribution, viewer payment lines only. */
export async function getDealMyDistributionDetail(req: Request, res: Response) {
  try {
    const dealId = paramId(req.params.dealId);
    const distributionId = paramId(req.params.distributionId);
    if (!dealId || !distributionId) {
      res.status(400).json({ message: "dealId and distributionId are required" });
      return;
    }
    const user = await getValidJwtUser(req);
    if (!user?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const emailNorm = await viewerEmailNorm(user.id);
    const pack = await getMyDistributionDetailForDeal({
      dealId,
      distributionId,
      scope,
      emailNorm,
    });
    if (!pack) {
      res.status(404).json({ message: "Distribution not found" });
      return;
    }
    res.json(pack);
  } catch (err) {
    console.error("getDealMyDistributionDetail", err);
    res.status(500).json({ message: "Failed to load distribution details" });
  }
}

/** Investor-scoped: payments across deals the viewer can access. */
export async function getMyDistributions(req: Request, res: Response) {
  try {
    const user = await getValidJwtUser(req);
    if (!user?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const emailNorm = await viewerEmailNorm(user.id);
    const deals = await listDealsForViewerIncludingAssignedParticipation(scope);
    const dealIds = deals.map((d) => d.id).filter(Boolean);
    const pack = await listMyDistributionsForViewer({
      scope,
      emailNorm,
      dealIds,
    });
    res.json(pack);
  } catch (err) {
    console.error("getMyDistributions", err);
    res.status(500).json({ message: "Failed to load your distributions" });
  }
}

export async function postDealDistributionComplete(
  req: Request,
  res: Response,
) {
  try {
    const dealId = paramId(req.params.dealId);
    if (!dealId) {
      res.status(400).json({ message: "dealId is required" });
      return;
    }
    const access = await assertDealAccess(req, dealId);
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }
    const input = parseCompleteInput(req.body);
    if (!input) {
      res.status(400).json({
        message:
          "Invalid complete payload. Provide source (operating|capital|fee) and amount.",
      });
      return;
    }
    const { bundle, error, record } = await completeDistributionRun({
      dealId,
      input,
    });
    if (error) {
      res.status(400).json({ message: error, distributionSetup: bundle });
      return;
    }
    res.status(201).json({ distributionSetup: bundle, record });
  } catch (err) {
    console.error("postDealDistributionComplete", err);
    res.status(500).json({ message: "Failed to complete distribution" });
  }
}

/**
 * PATCH /deals/:dealId/distributions/:distributionId/investor-percent
 * Body: { investorId, percentOfClass? } and/or { percentOfDeal? } and/or { payment? }.
 */
export async function patchDealDistributionInvestorPercent(
  req: Request,
  res: Response,
) {
  try {
    const dealId = paramId(req.params.dealId);
    const distributionId = paramId(req.params.distributionId);
    if (!dealId || !distributionId) {
      res.status(400).json({ message: "dealId and distributionId are required" });
      return;
    }
    const access = await assertDealAccess(req, dealId);
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }
    const user = await getValidJwtUser(req);
    if (!user?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const b = asRecord(req.body);
    const investorId = str(b.investorId ?? b.investor_id);
    const pctRaw = b.percentOfClass ?? b.percent_of_class;
    const dealPctRaw = b.percentOfDeal ?? b.percent_of_deal;
    const payRaw = b.payment;
    const reason = str(b.reason);
    const hasPct =
      pctRaw !== undefined &&
      pctRaw !== null &&
      String(pctRaw).trim() !== "";
    const hasDealPct =
      dealPctRaw !== undefined &&
      dealPctRaw !== null &&
      String(dealPctRaw).trim() !== "";
    const hasPay =
      payRaw !== undefined &&
      payRaw !== null &&
      String(payRaw).trim() !== "";
    const percentOfClass = hasPct
      ? typeof pctRaw === "number"
        ? pctRaw
        : Number(String(pctRaw ?? "").replace(/[^0-9.-]/g, ""))
      : undefined;
    const percentOfDeal = hasDealPct
      ? typeof dealPctRaw === "number"
        ? dealPctRaw
        : Number(String(dealPctRaw ?? "").replace(/[^0-9.-]/g, ""))
      : undefined;
    const payment = hasPay
      ? typeof payRaw === "number"
        ? payRaw
        : Number(String(payRaw ?? "").replace(/[^0-9.-]/g, ""))
      : undefined;
    if (
      !investorId ||
      (!Number.isFinite(percentOfClass) &&
        !Number.isFinite(percentOfDeal) &&
        !Number.isFinite(payment))
    ) {
      res.status(400).json({
        message:
          "Provide investorId and percentOfClass (0–100), percentOfDeal (0–100), and/or payment.",
      });
      return;
    }
    const { bundle, error } = await updatePriorDistributionInvestorPercent({
      dealId,
      distributionId,
      investorId,
      actorUserId: user.id,
      ...(reason ? { reason } : {}),
      ...(Number.isFinite(percentOfClass)
        ? { percentOfClass: percentOfClass as number }
        : {}),
      ...(Number.isFinite(percentOfDeal)
        ? { percentOfDeal: percentOfDeal as number }
        : {}),
      ...(Number.isFinite(payment) ? { payment: payment as number } : {}),
    });
    if (error) {
      res.status(400).json({ message: error, distributionSetup: bundle });
      return;
    }
    res.json({ distributionSetup: bundle });
  } catch (err) {
    console.error("patchDealDistributionInvestorPercent", err);
    res.status(500).json({ message: "Failed to update investor percent" });
  }
}

/** DELETE one completed distribution run (keeps waterfall / class setup). */
export async function deleteDealPriorDistribution(
  req: Request,
  res: Response,
) {
  try {
    const dealId = paramId(req.params.dealId);
    const distributionId = paramId(req.params.distributionId);
    if (!dealId || !distributionId) {
      res.status(400).json({ message: "dealId and distributionId are required" });
      return;
    }
    const access = await assertDealAccess(req, dealId);
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }
    const reason = (() => {
      const b =
        req.body != null && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const fromBody = str(b.reason ?? b.deleteReason ?? b.delete_reason);
      if (fromBody) return fromBody;
      const fromQuery = str(req.query.reason);
      return fromQuery;
    })();
    if (!reason) {
      res.status(400).json({ message: "Deletion reason is required" });
      return;
    }
    const { bundle, error } = await deletePriorDistribution({
      dealId,
      distributionId,
      reason,
    });
    if (error) {
      res.status(error === "Distribution not found" ? 404 : 400).json({
        message: error,
        distributionSetup: bundle,
      });
      return;
    }
    res.json({ distributionSetup: bundle });
  } catch (err) {
    console.error("deleteDealPriorDistribution", err);
    res.status(500).json({ message: "Failed to delete distribution" });
  }
}

/**
 * PUT replace completed runs for a deal.
 * Body: { priorDistributions: [] } clears all (test-data cleanup).
 * Does not change waterfall configuration.
 */
export async function putDealPriorDistributions(req: Request, res: Response) {
  try {
    const dealId = paramId(req.params.dealId);
    if (!dealId) {
      res.status(400).json({ message: "dealId is required" });
      return;
    }
    const access = await assertDealAccess(req, dealId);
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }
    const b = asRecord(req.body);
    const raw = b.priorDistributions ?? b.prior_distributions;
    if (!Array.isArray(raw)) {
      res.status(400).json({
        message: "priorDistributions must be an array (use [] to clear).",
      });
      return;
    }
    // Only allow clear or pass-through of already-shaped records from client
    // that match existing ids when non-empty — for clear, empty array is enough.
    const existing = await getDistributionSetupBundle(dealId);
    if (!existing) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    let next: typeof existing.priorDistributions = [];
    if (raw.length === 0) {
      next = [];
    } else {
      const byId = new Map(existing.priorDistributions.map((p) => [p.id, p]));
      for (const item of raw) {
        const id = str(asRecord(item).id);
        const found = id ? byId.get(id) : undefined;
        if (found) next.push(found);
      }
    }
    const { bundle, error } = await replacePriorDistributions({
      dealId,
      priorDistributions: next,
    });
    if (error) {
      res.status(400).json({ message: error, distributionSetup: bundle });
      return;
    }
    res.json({ distributionSetup: bundle });
  } catch (err) {
    console.error("putDealPriorDistributions", err);
    res.status(500).json({ message: "Failed to update prior distributions" });
  }
}
