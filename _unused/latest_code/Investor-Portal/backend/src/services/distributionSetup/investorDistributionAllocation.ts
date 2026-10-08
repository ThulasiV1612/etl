import { pool } from "../../database/db.js";

/**
 * Allocate a completed distribution amount across funded investors.
 * Preferred path: client sends waterfall-accurate lines on complete.
 * Fallback: capital-weighted share of the run total (class-aware when class is known).
 */

export type InvestorPaymentLineInput = {
  investorId: string;
  contactId?: string;
  userEmail?: string;
  investorName: string;
  classId: string;
  className: string;
  capital: number;
  percentOfClass: number;
  percentOfDeal?: number;
  payment: number;
};

export type InvestorPaymentLine = {
  investorId: string;
  contactId: string;
  userEmail: string;
  investorName: string;
  classId: string;
  className: string;
  capital: string;
  percentOfClass: string;
  percentOfDeal?: string;
  payment: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return String(Math.round(v * 100) / 100);
}

function pct(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return String(Math.round(v * 1000) / 1000);
}

function hasPercentField(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  return String(raw).trim() !== "";
}

function withDealPercents(
  lines: Array<Omit<InvestorPaymentLine, "percentOfDeal"> & { percentOfDeal?: string }>,
): InvestorPaymentLine[] {
  const dealCap = lines.reduce((s, l) => s + num(l.capital), 0);
  return lines.map((l) => {
    const stored = hasPercentField(l.percentOfDeal)
      ? pct(num(l.percentOfDeal))
      : "";
    return {
      ...l,
      percentOfDeal:
        stored ||
        pct(dealCap > 0 ? (num(l.capital) / dealCap) * 100 : 0),
    };
  });
}

export function normalizeInvestorPaymentLines(
  raw: unknown,
): InvestorPaymentLine[] {
  if (!Array.isArray(raw)) return [];
  const out: Array<
    Omit<InvestorPaymentLine, "percentOfDeal"> & { percentOfDeal?: string }
  > = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const payment = num(o.payment);
    const investorId = str(o.investorId ?? o.investor_id);
    if (!investorId || !(payment >= 0)) continue;
    const dealRaw = o.percentOfDeal ?? o.percent_of_deal;
    out.push({
      investorId,
      contactId: str(o.contactId ?? o.contact_id),
      userEmail: str(o.userEmail ?? o.user_email).toLowerCase(),
      investorName: str(o.investorName ?? o.investor_name) || "—",
      classId: str(o.classId ?? o.class_id),
      className: str(o.className ?? o.class_name) || "—",
      capital: money(num(o.capital)),
      percentOfClass: pct(num(o.percentOfClass ?? o.percent_of_class)),
      ...(hasPercentField(dealRaw)
        ? { percentOfDeal: pct(num(dealRaw)) }
        : {}),
      payment: money(payment),
    });
  }
  return withDealPercents(out);
}

export function serializeInvestorPaymentLines(
  lines:
    | InvestorPaymentLine[]
    | InvestorPaymentLineInput[]
    | Array<{
        investorId: string;
        contactId?: string;
        userEmail?: string;
        investorName: string;
        classId: string;
        className: string;
        capital: string | number;
        percentOfClass: string | number;
        percentOfDeal?: string | number;
        payment: string | number;
      }>
    | undefined,
): InvestorPaymentLine[] {
  if (!lines?.length) return [];
  return withDealPercents(
    lines.map((l) => {
      const dealRaw =
        "percentOfDeal" in l ? (l as { percentOfDeal?: unknown }).percentOfDeal : undefined;
      return {
        investorId: str(l.investorId),
        contactId: str(l.contactId),
        userEmail: str(l.userEmail).toLowerCase(),
        investorName: str(l.investorName) || "—",
        classId: str(l.classId),
        className: str(l.className) || "—",
        capital: money(num(l.capital)),
        percentOfClass: pct(num(l.percentOfClass)),
        ...(hasPercentField(dealRaw)
          ? { percentOfDeal: pct(num(dealRaw)) }
          : {}),
        payment: money(num(l.payment)),
      };
    }),
  );
}

/**
 * Capital-weighted fallback when waterfall lines were not supplied.
 * Splits `amount` across investors proportional to capital within each class,
 * then class share of total capital.
 * When any investor in a class has `percentOfClassDistributions`, that share is used instead.
 */
export function allocateByCapitalFallback(params: {
  amount: number;
  investors: Array<{
    id: string;
    contactId?: string;
    userEmail?: string;
    displayName: string;
    investorClass: string;
    capital: number;
    percentOfClassDistributions?: string | number | null;
  }>;
  classes: Array<{ id: string; name: string }>;
}): InvestorPaymentLine[] {
  const amount = params.amount;
  if (!(amount > 0) || params.investors.length === 0) return [];

  const classByKey = new Map<string, { id: string; name: string }>();
  for (const c of params.classes) {
    classByKey.set(c.id.toLowerCase(), c);
    classByKey.set(c.name.trim().toLowerCase(), c);
  }

  type Acc = {
    investor: (typeof params.investors)[number];
    classId: string;
    className: string;
    capital: number;
    storedPct: number | null;
  };
  const matched: Acc[] = [];
  for (const inv of params.investors) {
    const hasStored =
      String(inv.percentOfClassDistributions ?? "")
        .replace(/[^0-9.-]/g, "")
        .trim() !== "";
    const stored = hasStored
      ? Math.min(100, Math.max(0, num(inv.percentOfClassDistributions)))
      : null;
    if (!(inv.capital > 0) && stored == null) continue;
    const key = str(inv.investorClass).toLowerCase();
    const cls = classByKey.get(key);
    if (!cls) continue;
    matched.push({
      investor: inv,
      classId: cls.id,
      className: cls.name,
      capital: inv.capital,
      storedPct: stored,
    });
  }
  if (matched.length === 0) {
    // No class match — split across all funded investors by capital.
    const total = params.investors.reduce(
      (s, i) => s + Math.max(0, i.capital),
      0,
    );
    if (!(total > 0)) return [];
    return withDealPercents(
      params.investors
        .filter((i) => i.capital > 0)
        .map((i) => ({
          investorId: i.id,
          contactId: str(i.contactId),
          userEmail: str(i.userEmail).toLowerCase(),
          investorName: i.displayName || "—",
          classId: "",
          className: str(i.investorClass) || "—",
          capital: money(i.capital),
          percentOfClass: pct((i.capital / total) * 100),
          payment: money(amount * (i.capital / total)),
        })),
    );
  }

  const byClass = new Map<string, Acc[]>();
  for (const row of matched) {
    const list = byClass.get(row.classId) ?? [];
    list.push(row);
    byClass.set(row.classId, list);
  }

  let totalCapital = 0;
  const capitalByClass = new Map<string, number>();
  for (const row of matched) {
    capitalByClass.set(
      row.classId,
      (capitalByClass.get(row.classId) ?? 0) + Math.max(0, row.capital),
    );
    totalCapital += Math.max(0, row.capital);
  }
  if (!(totalCapital > 0)) {
    // Pure %-based allocation across classes equally by stored weight sum.
    const weightByClass = new Map<string, number>();
    for (const [classId, members] of byClass) {
      weightByClass.set(
        classId,
        members.reduce((s, m) => s + (m.storedPct ?? 0), 0),
      );
    }
    const weightTotal = [...weightByClass.values()].reduce((s, w) => s + w, 0);
    if (!(weightTotal > 0)) return [];
    const out: InvestorPaymentLine[] = [];
    for (const [classId, members] of byClass) {
      const classWeight = weightByClass.get(classId) ?? 0;
      const classPay = amount * (classWeight / weightTotal);
      const memberWeight = members.reduce((s, m) => s + (m.storedPct ?? 0), 0);
      for (const row of members) {
        const share =
          memberWeight > 0 ? (row.storedPct ?? 0) / memberWeight : 0;
        out.push({
          investorId: row.investor.id,
          contactId: str(row.investor.contactId),
          userEmail: str(row.investor.userEmail).toLowerCase(),
          investorName: row.investor.displayName || "—",
          classId: row.classId,
          className: row.className,
          capital: money(row.capital),
          percentOfClass: pct(row.storedPct ?? share * 100),
          payment: money(classPay * share),
        });
      }
    }
    return withDealPercents(out);
  }

  const out: InvestorPaymentLine[] = [];
  for (const [classId, members] of byClass) {
    const classCap = capitalByClass.get(classId) ?? 0;
    const classShare = classCap > 0 ? classCap / totalCapital : 0;
    const classPay = amount * classShare;
    const useStored = members.some((m) => m.storedPct != null);
    const weights = members.map((m) =>
      useStored ? (m.storedPct ?? 0) : Math.max(0, m.capital),
    );
    const weightTotal = weights.reduce((s, w) => s + w, 0);
    members.forEach((row, i) => {
      const weight = weights[i] ?? 0;
      const within = weightTotal > 0 ? weight / weightTotal : 0;
      out.push({
        investorId: row.investor.id,
        contactId: str(row.investor.contactId),
        userEmail: str(row.investor.userEmail).toLowerCase(),
        investorName: row.investor.displayName || "—",
        classId: row.classId,
        className: row.className,
        capital: money(row.capital),
        percentOfClass: pct(
          useStored && row.storedPct != null
            ? row.storedPct
            : within * 100,
        ),
        payment: money(classPay * within),
      });
    });
  }
  return withDealPercents(out);
}

export type FeeClassSplitInput = {
  classId: string;
  percent: string | number;
};

export type AllocateFeeByClassSplitsResult = {
  lines: InvestorPaymentLine[];
  blockedClassNames: string[];
};

/**
 * Class-scoped fee allocation.
 * A class is paid only when it has a positive percentage and at least one
 * investor. Empty mentioned classes do not spill their share to other classes;
 * the caller should refuse the whole run when `blockedClassNames` is not empty.
 */
export function allocateFeeByClassSplits(params: {
  amount: number;
  splits: FeeClassSplitInput[];
  investors: Array<{
    id: string;
    contactId?: string;
    userEmail?: string;
    displayName: string;
    investorClass: string;
    capital: number;
    percentOfClassDistributions?: string | number | null;
  }>;
  classes: Array<{ id: string; name: string }>;
}): AllocateFeeByClassSplitsResult {
  const amount = params.amount;
  if (!(amount > 0)) return { lines: [], blockedClassNames: [] };

  const classByKey = new Map<string, { id: string; name: string }>();
  for (const c of params.classes) {
    classByKey.set(c.id.toLowerCase(), c);
    classByKey.set(c.name.trim().toLowerCase(), c);
  }

  type Acc = {
    investor: (typeof params.investors)[number];
    classId: string;
    className: string;
    capital: number;
    storedPct: number | null;
  };
  const matched: Acc[] = [];
  for (const inv of params.investors) {
    const hasStored =
      String(inv.percentOfClassDistributions ?? "")
        .replace(/[^0-9.-]/g, "")
        .trim() !== "";
    const stored = hasStored
      ? Math.min(100, Math.max(0, num(inv.percentOfClassDistributions)))
      : null;
    const key = str(inv.investorClass).toLowerCase();
    const cls = classByKey.get(key);
    if (!cls) continue;
    matched.push({
      investor: inv,
      classId: cls.id,
      className: cls.name,
      capital: inv.capital,
      storedPct: stored,
    });
  }

  const byClass = new Map<string, Acc[]>();
  for (const row of matched) {
    const list = byClass.get(row.classId) ?? [];
    list.push(row);
    byClass.set(row.classId, list);
  }

  const blockedClassNames: string[] = [];
  const seenBlocked = new Set<string>();
  const out: InvestorPaymentLine[] = [];

  for (const split of params.splits) {
    const pctValue = num(split.percent);
    if (!(pctValue > 0)) continue;
    const cls =
      classByKey.get(str(split.classId).toLowerCase()) ??
      params.classes.find((c) => c.id === str(split.classId));
    if (!cls) continue;
    const members = byClass.get(cls.id) ?? [];
    if (members.length === 0) {
      if (!seenBlocked.has(cls.id)) {
        seenBlocked.add(cls.id);
        blockedClassNames.push(cls.name || "Class");
      }
      continue;
    }
    const classPay = amount * (pctValue / 100);
    const useStored = members.some((m) => m.storedPct != null);
    const weights = members.map((m) =>
      useStored ? (m.storedPct ?? 0) : Math.max(0, m.capital),
    );
    const weightTotal = weights.reduce((s, w) => s + w, 0);
    const equal = !(weightTotal > 0);
    members.forEach((row, i) => {
      const within = equal
        ? 1 / members.length
        : (weights[i] ?? 0) / weightTotal;
      const payment = classPay * within;
      if (!(payment > 0)) return;
      out.push({
        investorId: row.investor.id,
        contactId: str(row.investor.contactId),
        userEmail: str(row.investor.userEmail).toLowerCase(),
        investorName: row.investor.displayName || "—",
        classId: row.classId,
        className: row.className,
        capital: money(row.capital),
        percentOfClass: pct(
          useStored && row.storedPct != null ? row.storedPct : within * 100,
        ),
        payment: money(payment),
      });
    });
  }

  return {
    lines: blockedClassNames.length > 0 ? [] : withDealPercents(out),
    blockedClassNames,
  };
}

export type ViewerPaymentMatchKeys = {
  userId: string;
  emailNorm: string;
  /** `deal_investment.id` rows owned by the viewer on this deal. */
  investmentIds: Set<string>;
  /** contact_id values on those rows (user id and/or contact table id). */
  contactIds: Set<string>;
};

/**
 * Resolve investment / contact keys for the signed-in viewer on one deal.
 * Matches the same participation rules as deal access (user id or contact email).
 */
export async function listViewerInvestmentMatchKeys(
  dealId: string,
  viewer: { userId: string; emailNorm: string },
): Promise<ViewerPaymentMatchKeys> {
  const uid = str(viewer.userId).toLowerCase();
  const email = str(viewer.emailNorm).toLowerCase();
  const investmentIds = new Set<string>();
  const contactIds = new Set<string>();
  if (uid) contactIds.add(uid);

  const did = str(dealId).toLowerCase();
  if (!did || !uid) {
    return { userId: uid, emailNorm: email, investmentIds, contactIds };
  }

  try {
    const res = await pool.query<{ id: string; contact_id: string }>(
      `SELECT di.id::text AS id, trim(both from di.contact_id) AS contact_id
       FROM deal_investment di
       WHERE di.deal_id = $1::uuid
         AND (
           lower(trim(both from di.contact_id)) = $2
           OR EXISTS (
             SELECT 1 FROM users u
             WHERE u.id::text = trim(both from di.contact_id)
               AND u.id = $3::uuid
           )
           OR EXISTS (
             SELECT 1 FROM contact c
             INNER JOIN users u ON lower(trim(u.email)) = lower(trim(c.email))
             WHERE c.id::text = trim(both from di.contact_id)
               AND u.id = $3::uuid
           )
           OR (
             $4 <> ''
             AND EXISTS (
               SELECT 1 FROM users u
               WHERE u.id::text = trim(both from di.contact_id)
                 AND lower(trim(u.email)) = $4
             )
           )
           OR (
             $4 <> ''
             AND EXISTS (
               SELECT 1 FROM contact c
               WHERE c.id::text = trim(both from di.contact_id)
                 AND lower(trim(c.email)) = $4
             )
           )
         )`,
      [did, uid, uid, email],
    );
    for (const row of res.rows) {
      const id = str(row.id).toLowerCase();
      const cid = str(row.contact_id).toLowerCase();
      if (id) investmentIds.add(id);
      if (cid) contactIds.add(cid);
    }
  } catch (err) {
    console.error("listViewerInvestmentMatchKeys", err);
  }

  return { userId: uid, emailNorm: email, investmentIds, contactIds };
}

export function filterPaymentsForViewer(
  lines: InvestorPaymentLine[],
  viewer: {
    userId: string;
    emailNorm: string;
    investmentIds?: Set<string>;
    contactIds?: Set<string>;
  },
): InvestorPaymentLine[] {
  const email = viewer.emailNorm.trim().toLowerCase();
  const uid = viewer.userId.trim().toLowerCase();
  const investmentIds = viewer.investmentIds;
  const contactIds = viewer.contactIds;
  return lines.filter((l) => {
    const invId = str(l.investorId).toLowerCase();
    const contactId = str(l.contactId).toLowerCase();
    const lineEmail = str(l.userEmail).toLowerCase();
    if (investmentIds?.size && invId && investmentIds.has(invId)) return true;
    if (contactIds?.size && contactId && contactIds.has(contactId)) return true;
    if (email && lineEmail && lineEmail === email) return true;
    if (uid && contactId && contactId === uid) return true;
    if (uid && invId && invId === uid) return true;
    return false;
  });
}
