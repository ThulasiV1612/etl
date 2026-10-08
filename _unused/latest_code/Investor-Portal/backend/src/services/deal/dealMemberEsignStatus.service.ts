import { and, eq, like, sql } from "drizzle-orm";
import {
  appendEsignSendToBundle,
  esignBundleHasPending,
  esignBundleIsAllCompleted,
  latestEsignSentMsFromRawJson,
  parseEsignStatusBundle,
  parseEsignStatusJson,
  serializeEsignStatusBundle,
  type DealInvestorEsignDocumentRef,
  type StoredDealInvestorEsignSend,
} from "../../constants/deal-investor-esign-status.js";
import {
  DOC_SIGNED_ESIGN_COMPLETED,
  DOC_SIGNED_ESIGN_PENDING,
} from "../../constants/deal-doc-signed.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { resolveEmailForContactMemberId } from "./dealMemberInvitationEmail.service.js";
import { isLpInvestorRole } from "./dealInvestment.service.js";
import { resolveInvestNowViewerContactOnDeal } from "./dealInvestNowViewerContact.service.js";
import { viewerOwnsContactKey } from "./dealLpViewerIdentity.service.js";

export type InvestorEsignRowTarget = {
  table: "investment" | "lp";
  id: string;
};

type EsignTargetCandidate = {
  target: InvestorEsignRowTarget;
  sentMs: number;
};

function normEmail(s: string): string {
  return s.trim().toLowerCase();
}

function normContactKey(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function latestSentMsFromBundle(
  raw: string | null | undefined,
): number {
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.some((s) => s.sentAt?.trim())) return -1;
  return bundle.sends.reduce((max, s) => {
    const t = new Date(s.sentAt).getTime();
    return t > max ? t : max;
  }, -1);
}

function pickBestEsignTargetCandidate(
  candidates: EsignTargetCandidate[],
): InvestorEsignRowTarget | null {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.sentMs !== a.sentMs) return b.sentMs - a.sentMs;
    if (a.target.table === "investment" && b.target.table === "lp") return -1;
    if (a.target.table === "lp" && b.target.table === "investment") return 1;
    return 0;
  });
  return candidates[0]!.target;
}

/**
 * Contact keys for a signed-in investor on this deal (`users.id`, `contact.id`,
 * `deal_lp_investor.contact_member_id`, etc.) — Invest Now stores `deal_investment.contact_id`
 * as the roster contact id, not always `users.id`.
 */
export async function resolvePortalUserContactKeysOnDeal(
  dealId: string,
  opts: { email: string; userId: string },
): Promise<Set<string>> {
  const keys = new Set<string>();
  const uid = opts.userId.trim().toLowerCase();
  const email = normEmail(opts.email);
  if (uid) keys.add(uid);
  if (email.includes("@")) keys.add(email);

  if (email.includes("@")) {
    const [portalUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${email}`)
      .limit(1);
    const portalUid = portalUser?.id
      ? String(portalUser.id).trim().toLowerCase()
      : "";
    if (portalUid) keys.add(portalUid);
  }

  const roster = await db
    .select({
      contactMemberId: dealLpInvestor.contactMemberId,
      email: dealLpInvestor.email,
    })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  for (const row of roster) {
    const cid = normContactKey(row.contactMemberId);
    if (!cid) continue;
    const rowEmail = normEmail(String(row.email ?? ""));
    if (email && rowEmail === email) keys.add(cid);
    if (uid && cid === uid) keys.add(cid);
    if (email.includes("@")) {
      const resolved = await resolveEmailForContactMemberId(cid);
      if (resolved && normEmail(resolved) === email) keys.add(cid);
    }
  }

  const investments = await db
    .select({ contactId: dealInvestment.contactId })
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, dealId));

  for (const inv of investments) {
    const cid = normContactKey(inv.contactId);
    if (!cid) continue;
    if (keys.has(cid)) continue;
    if (email.includes("@")) {
      const resolved = await resolveEmailForContactMemberId(cid);
      if (resolved && normEmail(resolved) === email) keys.add(cid);
    }
  }

  return keys;
}

/**
 * Investors tab row id (LP roster or `deal_investment`) → DB row that stores eSign JSON.
 * `deal_investment.id` is pinned to that commitment (multi-profile Invest Now).
 * LP roster id still resolves via contact to the row with the latest send.
 */
export async function resolveEsignTargetForInvestorRowId(
  dealId: string,
  rowId: string,
): Promise<InvestorEsignRowTarget | null> {
  const id = rowId.trim();
  if (!id) return null;

  const [inv] = await db
    .select({
      id: dealInvestment.id,
      contactId: dealInvestment.contactId,
      esignStatusJson: dealInvestment.esignStatusJson,
    })
    .from(dealInvestment)
    .where(and(eq(dealInvestment.id, id), eq(dealInvestment.dealId, dealId)))
    .limit(1);
  if (inv) {
    return { table: "investment", id: inv.id };
  }

  const candidates: EsignTargetCandidate[] = [];
  const contactKeys = new Set<string>();

  const pushCandidate = (
    target: InvestorEsignRowTarget,
    esignStatusJson: string | null | undefined,
  ) => {
    const sentMs = latestSentMsFromBundle(esignStatusJson);
    if (sentMs < 0) return;
    const dup = candidates.find(
      (c) =>
        c.target.table === target.table && c.target.id === target.id,
    );
    if (dup) {
      if (sentMs > dup.sentMs) dup.sentMs = sentMs;
      return;
    }
    candidates.push({ target, sentMs });
  };

  const [lp] = await db
    .select({
      id: dealLpInvestor.id,
      contactMemberId: dealLpInvestor.contactMemberId,
      esignStatusJson: dealLpInvestor.esignStatusJson,
    })
    .from(dealLpInvestor)
    .where(and(eq(dealLpInvestor.id, id), eq(dealLpInvestor.dealId, dealId)))
    .limit(1);
  if (lp) {
    const ck = normContactKey(lp.contactMemberId);
    if (ck) contactKeys.add(ck);
    pushCandidate({ table: "lp", id: lp.id }, lp.esignStatusJson);
  }

  if (contactKeys.size > 0) {
    const investments = await db
      .select({
        id: dealInvestment.id,
        contactId: dealInvestment.contactId,
        esignStatusJson: dealInvestment.esignStatusJson,
      })
      .from(dealInvestment)
      .where(eq(dealInvestment.dealId, dealId));

    for (const row of investments) {
      const ck = normContactKey(row.contactId);
      if (!ck || !contactKeys.has(ck)) continue;
      pushCandidate({ table: "investment", id: row.id }, row.esignStatusJson);
    }

    const roster = await db
      .select({
        id: dealLpInvestor.id,
        contactMemberId: dealLpInvestor.contactMemberId,
        esignStatusJson: dealLpInvestor.esignStatusJson,
      })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, dealId));

    for (const row of roster) {
      const ck = normContactKey(row.contactMemberId);
      if (!ck || !contactKeys.has(ck)) continue;
      pushCandidate({ table: "lp", id: row.id }, row.esignStatusJson);
    }
  }

  const best = pickBestEsignTargetCandidate(candidates);
  if (best) return best;

  if (lp) return { table: "lp", id: lp.id };
  return null;
}

function committedNumericFromAmountFields(
  primary: string | null | undefined,
  extras: string[] | null | undefined,
): number {
  const raw = [primary, ...(extras ?? []).map(String)];
  const nums = raw
    .map((s) => parseFloat(String(s).replace(/[^0-9.-]/g, "")))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0);
}

/** Investor has committed capital (required before embedded signing in the portal, not for sponsor Send E-sign onboarding). */
export async function investorEsignTargetHasPositiveCommitment(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<boolean> {
  if (target.table === "investment") {
    const [row] = await db
      .select({
        commitmentAmount: dealInvestment.commitmentAmount,
        extraContributionAmounts: dealInvestment.extraContributionAmounts,
      })
      .from(dealInvestment)
      .where(
        and(eq(dealInvestment.id, target.id), eq(dealInvestment.dealId, dealId)),
      )
      .limit(1);
    if (!row) return false;
    return committedNumericFromAmountFields(
      row.commitmentAmount,
      row.extraContributionAmounts as string[] | null,
    ) > 0;
  }

  const [row] = await db
    .select({ committed_amount: dealLpInvestor.committed_amount })
    .from(dealLpInvestor)
    .where(
      and(eq(dealLpInvestor.id, target.id), eq(dealLpInvestor.dealId, dealId)),
    )
    .limit(1);
  if (!row) return false;
  return committedNumericFromAmountFields(row.committed_amount, null) > 0;
}

async function resolveInvestorEsignTarget(
  dealId: string,
  opts: { rosterId?: string; toEmail?: string },
): Promise<InvestorEsignRowTarget | null> {
  const id = opts.rosterId?.trim();
  if (id) {
    const resolved = await resolveEsignTargetForInvestorRowId(dealId, id);
    if (resolved) return resolved;
  }

  const email = opts.toEmail?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;

  const [lpByEmail] = await db
    .select({ id: dealLpInvestor.id })
    .from(dealLpInvestor)
    .where(
      and(
        eq(dealLpInvestor.dealId, dealId),
        sql`lower(trim(${dealLpInvestor.email})) = ${email}`,
      ),
    )
    .limit(1);
  if (lpByEmail) return { table: "lp", id: lpByEmail.id };

  const [portalUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${email}`)
    .limit(1);
  if (portalUser?.id) {
    const uid = String(portalUser.id).trim().toLowerCase();
    const investments = await db
      .select({ id: dealInvestment.id, contactId: dealInvestment.contactId })
      .from(dealInvestment)
      .where(eq(dealInvestment.dealId, dealId));
    for (const inv of investments) {
      if (String(inv.contactId ?? "").trim().toLowerCase() === uid) {
        return { table: "investment", id: inv.id };
      }
    }
  }

  return null;
}

async function applyInvestorEsignPatch(
  dealId: string,
  target: InvestorEsignRowTarget,
  patch: {
    docSignedDate: string;
    esignStatusJson: string;
  },
): Promise<void> {
  if (target.table === "investment") {
    await db
      .update(dealInvestment)
      .set(patch)
      .where(eq(dealInvestment.id, target.id));
    await mirrorEsignPatchToLpRosterForInvestment(dealId, target.id, patch);
    return;
  }
  await db
    .update(dealLpInvestor)
    .set(patch)
    .where(eq(dealLpInvestor.id, target.id));
}

/** Keep LP roster row in sync when Invest Now writes eSign on `deal_investment`. */
async function mirrorEsignPatchToLpRosterForInvestment(
  dealId: string,
  investmentId: string,
  patch: { docSignedDate: string; esignStatusJson: string },
): Promise<void> {
  const [inv] = await db
    .select({ contactId: dealInvestment.contactId })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, investmentId),
        eq(dealInvestment.dealId, dealId),
      ),
    )
    .limit(1);
  const contactKey = String(inv?.contactId ?? "").trim().toLowerCase();
  if (!contactKey) return;

  await db
    .update(dealLpInvestor)
    .set(patch)
    .where(
      and(
        eq(dealLpInvestor.dealId, dealId),
        sql`lower(trim(${dealLpInvestor.contactMemberId})) = ${contactKey}`,
      ),
    );
}

export async function readInvestorEsignStatusJson(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<string | null> {
  if (target.table === "investment") {
    const [row] = await db
      .select({ esignStatusJson: dealInvestment.esignStatusJson })
      .from(dealInvestment)
      .where(
        and(
          eq(dealInvestment.id, target.id),
          eq(dealInvestment.dealId, dealId),
        ),
      )
      .limit(1);
    return row?.esignStatusJson ?? null;
  }
  const [row] = await db
    .select({ esignStatusJson: dealLpInvestor.esignStatusJson })
    .from(dealLpInvestor)
    .where(
      and(eq(dealLpInvestor.id, target.id), eq(dealLpInvestor.dealId, dealId)),
    )
    .limit(1);
  return row?.esignStatusJson ?? null;
}

/**
 * After send-esign, mark Signed as pending and store workflow timestamps (sent → …).
 */
export async function markDealInvestorEsignPending(
  dealId: string,
  opts: {
    rosterId?: string;
    toEmail?: string;
    /** When set (Invest Now), write eSign JSON on this commitment row exactly. */
    target?: InvestorEsignRowTarget;
    documents?: DealInvestorEsignDocumentRef[];
    signatureRequestId?: string;
    signatureId?: string;
  },
): Promise<void> {
  const target =
    opts.target ?? (await resolveInvestorEsignTarget(dealId, opts));
  if (!target) return;

  const raw = await readInvestorEsignStatusJson(dealId, target);
  const existing = parseEsignStatusBundle(raw) ?? { version: 2 as const, sends: [] };
  const bundle = appendEsignSendToBundle(existing, {
    documents: opts.documents ?? [],
    signatureRequestId: opts.signatureRequestId,
    signatureId: opts.signatureId,
  });

  const docSignedDate = esignBundleIsAllCompleted(bundle)
    ? DOC_SIGNED_ESIGN_COMPLETED
    : DOC_SIGNED_ESIGN_PENDING;

  await applyInvestorEsignPatch(dealId, target, {
    docSignedDate,
    esignStatusJson: serializeEsignStatusBundle(bundle),
  });
}

export async function updateDealInvestorEsignSend(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
  updater: (current: StoredDealInvestorEsignSend) => StoredDealInvestorEsignSend,
): Promise<void> {
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.length) return;

  const sigId = signatureRequestId.trim();
  const idx = bundle.sends.findIndex(
    (s) => s.signatureRequestId?.trim() === sigId,
  );
  if (idx < 0) return;

  bundle.sends[idx] = updater(bundle.sends[idx]!);

  const docSignedDate = esignBundleIsAllCompleted(bundle)
    ? DOC_SIGNED_ESIGN_COMPLETED
    : esignBundleHasPending(bundle)
      ? DOC_SIGNED_ESIGN_PENDING
      : DOC_SIGNED_ESIGN_COMPLETED;

  await applyInvestorEsignPatch(dealId, target, {
    docSignedDate,
    esignStatusJson: serializeEsignStatusBundle(bundle),
  });
}

/** Investor opened embedded signing (Invest Now / portal) — sets Viewed on the active send. */
export async function markDealInvestorEsignViewed(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
): Promise<void> {
  const sigId = signatureRequestId.trim();
  if (!sigId) return;

  await updateDealInvestorEsignSend(dealId, target, sigId, (current) => {
    if (current.viewedAt?.trim() || current.completedAt?.trim()) return current;
    return {
      ...current,
      viewedAt: new Date().toISOString(),
    };
  });
}

/**
 * After embedded sign (before Dropbox webhook), record Signed so the Investors tab
 * updates immediately; Dropbox sync may still promote to Completed later.
 */
export async function markDealInvestorEsignSignedOptimistic(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
): Promise<void> {
  const sigId = signatureRequestId.trim();
  if (!sigId) return;

  const now = new Date().toISOString();
  await updateDealInvestorEsignSend(dealId, target, sigId, (current) => {
    if (current.completedAt?.trim()) return current;
    return {
      ...current,
      viewedAt: current.viewedAt ?? now,
      signedAt: current.signedAt ?? now,
    };
  });
}

/** @deprecated Prefer updateDealInvestorEsignSend — updates the only / first matching send. */
export async function updateDealInvestorEsignStatus(
  dealId: string,
  target: InvestorEsignRowTarget,
  updater: (current: StoredDealInvestorEsignSend) => StoredDealInvestorEsignSend,
): Promise<void> {
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.length) return;

  const sigId =
    bundle.sends.find((s) => !s.completedAt?.trim())?.signatureRequestId?.trim() ??
    bundle.sends[bundle.sends.length - 1]?.signatureRequestId?.trim();
  if (!sigId) return;

  await updateDealInvestorEsignSend(dealId, target, sigId, updater);
}

export async function findInvestorEsignTargetBySignatureRequestId(
  dealId: string,
  signatureRequestId: string,
): Promise<InvestorEsignRowTarget | null> {
  const sigId = signatureRequestId.trim();
  if (!sigId) return null;

  const investments = await db
    .select({
      id: dealInvestment.id,
      esignStatusJson: dealInvestment.esignStatusJson,
    })
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, dealId));

  for (const row of investments) {
    const bundle = parseEsignStatusBundle(row.esignStatusJson);
    if (bundle?.sends.some((s) => s.signatureRequestId?.trim() === sigId)) {
      return { table: "investment", id: row.id };
    }
  }

  const lps = await db
    .select({
      id: dealLpInvestor.id,
      esignStatusJson: dealLpInvestor.esignStatusJson,
    })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  for (const row of lps) {
    const bundle = parseEsignStatusBundle(row.esignStatusJson);
    if (bundle?.sends.some((s) => s.signatureRequestId?.trim() === sigId)) {
      return { table: "lp", id: row.id };
    }
  }

  return null;
}

export type InvestorEsignContext = {
  dealId: string;
  target: InvestorEsignRowTarget;
};

/** Resolve deal + investor row from a SignFlow/Dropbox `signatureRequestId` (webhook lookup). */
export async function findInvestorEsignContextBySignatureRequestId(
  signatureRequestId: string,
): Promise<InvestorEsignContext | null> {
  const sigId = signatureRequestId.trim();
  if (!sigId) return null;

  const jsonNeedle = `%"signatureRequestId":"${sigId}"%`;

  const investments = await db
    .select({
      id: dealInvestment.id,
      dealId: dealInvestment.dealId,
      esignStatusJson: dealInvestment.esignStatusJson,
    })
    .from(dealInvestment)
    .where(like(dealInvestment.esignStatusJson, jsonNeedle))
    .limit(5);

  for (const row of investments) {
    const bundle = parseEsignStatusBundle(row.esignStatusJson);
    if (bundle?.sends.some((s) => s.signatureRequestId?.trim() === sigId)) {
      return { dealId: row.dealId, target: { table: "investment", id: row.id } };
    }
  }

  const lps = await db
    .select({
      id: dealLpInvestor.id,
      dealId: dealLpInvestor.dealId,
      esignStatusJson: dealLpInvestor.esignStatusJson,
    })
    .from(dealLpInvestor)
    .where(like(dealLpInvestor.esignStatusJson, jsonNeedle))
    .limit(5);

  for (const row of lps) {
    const bundle = parseEsignStatusBundle(row.esignStatusJson);
    if (bundle?.sends.some((s) => s.signatureRequestId?.trim() === sigId)) {
      return { dealId: row.dealId, target: { table: "lp", id: row.id } };
    }
  }

  return null;
}

export async function findInvestorEsignTargetByMetadata(
  dealId: string,
  rosterId: string,
): Promise<InvestorEsignRowTarget | null> {
  const fromRow = await resolveEsignTargetForInvestorRowId(dealId, rosterId);
  if (fromRow) return fromRow;
  return resolveInvestorEsignTarget(dealId, { rosterId });
}

/** First LP or investment row for this investor email on the deal (for portal document access). */
export async function findInvestorEsignTargetForEmail(
  dealId: string,
  email: string,
): Promise<InvestorEsignRowTarget | null> {
  return resolveInvestorEsignTarget(dealId, { toEmail: email });
}

export type InvestNowEsignTargetOpts = {
  email: string;
  userId: string;
  /** Saved Investing → Profiles row (same type, different display names). */
  userInvestorProfileId?: string | null;
  /** When known, pin eSign to this commitment row. */
  investmentId?: string | null;
  /** Commitment profile type (individual, llc_corp_trust_etc, …). */
  profileId?: string | null;
};

function normUuidKey(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Invest Now / portal signing: prefer `deal_investment` with positive commitment
 * (same row as the commitment API), not an LP roster match by email alone.
 */
export async function findInvestorEsignTargetForInvestNowCommitment(
  dealId: string,
  opts: InvestNowEsignTargetOpts,
): Promise<InvestorEsignRowTarget | null> {
  const contactKeys = await resolvePortalUserContactKeysOnDeal(dealId, opts);
  const viewerContact = await resolveInvestNowViewerContactOnDeal({
    dealId,
    viewerEmailNorm: normEmail(opts.email),
    viewerUserId: String(opts.userId ?? "").trim(),
  });
  const viewerContactKey = normContactKey(viewerContact.contactMemberId);

  const ownsContact = (contactId: string | null | undefined): boolean =>
    viewerOwnsContactKey(contactId, contactKeys, viewerContactKey);

  const investmentId = String(opts.investmentId ?? "").trim();
  if (investmentId) {
    const [row] = await db
      .select({ contactId: dealInvestment.contactId })
      .from(dealInvestment)
      .where(
        and(
          eq(dealInvestment.id, investmentId),
          eq(dealInvestment.dealId, dealId),
        ),
      )
      .limit(1);
    const cid = normContactKey(row?.contactId);
    if (cid && ownsContact(cid)) {
      const target: InvestorEsignRowTarget = {
        table: "investment",
        id: investmentId,
      };
      if (await investorEsignTargetHasPositiveCommitment(dealId, target)) {
        return target;
      }
    }
  }

  const uip = normUuidKey(opts.userInvestorProfileId);
  const profileType = String(opts.profileId ?? "").trim();

  const investments = await db
    .select({
      id: dealInvestment.id,
      contactId: dealInvestment.contactId,
      profileId: dealInvestment.profileId,
      userInvestorProfileId: dealInvestment.userInvestorProfileId,
      esignStatusJson: dealInvestment.esignStatusJson,
      createdAt: dealInvestment.createdAt,
      investor_role: dealInvestment.investor_role,
    })
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, dealId));

  if (uip) {
    let matched: InvestorEsignRowTarget | null = null;
    let matchedCreatedMs = -1;
    for (const inv of investments) {
      if (!ownsContact(inv.contactId)) continue;
      if (normUuidKey(inv.userInvestorProfileId) !== uip) continue;
      if (profileType && String(inv.profileId ?? "").trim() !== profileType) {
        continue;
      }
      const target: InvestorEsignRowTarget = { table: "investment", id: inv.id };
      if (!(await investorEsignTargetHasPositiveCommitment(dealId, target))) {
        continue;
      }
      const createdMs = new Date(inv.createdAt).getTime();
      if (!matched || createdMs > matchedCreatedMs) {
        matched = target;
        matchedCreatedMs = Number.isFinite(createdMs) ? createdMs : -1;
      }
    }
    if (matched) return matched;
  }

  let bestTarget: InvestorEsignRowTarget | null = null;
  let bestEsignMs = -1;
  let bestLpRole = false;
  let bestCreatedMs = -1;

  for (const inv of investments) {
    if (!ownsContact(inv.contactId)) continue;
    const target: InvestorEsignRowTarget = { table: "investment", id: inv.id };
    if (!(await investorEsignTargetHasPositiveCommitment(dealId, target))) {
      continue;
    }
    const esignMs = latestEsignSentMsFromRawJson(inv.esignStatusJson);
    const createdMs = new Date(inv.createdAt).getTime();
    const lpRole = isLpInvestorRole(inv.investor_role);
    const better =
      !bestTarget ||
      esignMs > bestEsignMs ||
      (esignMs === bestEsignMs &&
        (lpRole && !bestLpRole
          ? true
          : lpRole === bestLpRole && createdMs > bestCreatedMs));
    if (better) {
      bestTarget = target;
      bestEsignMs = esignMs;
      bestLpRole = lpRole;
      bestCreatedMs = Number.isFinite(createdMs) ? createdMs : -1;
    }
  }
  if (bestTarget) return bestTarget;

  const legacy = await findInvestorEsignTargetForEmail(
    dealId,
    normEmail(opts.email),
  );
  if (
    legacy &&
    (await investorEsignTargetHasPositiveCommitment(dealId, legacy))
  ) {
    return legacy;
  }

  return null;
}

/**
 * Active eSign row for the signed-in portal user — only rows with `sentAt`,
 * preferring the most recently sent request (avoids wrong LP match without eSign).
 */
export async function findInvestorEsignTargetForPortalUser(
  dealId: string,
  opts: { email: string; userId: string },
): Promise<InvestorEsignRowTarget | null> {
  const email = normEmail(opts.email);
  const contactKeys = await resolvePortalUserContactKeysOnDeal(dealId, opts);
  const candidates: EsignTargetCandidate[] = [];

  const investments = await db
    .select({
      id: dealInvestment.id,
      esignStatusJson: dealInvestment.esignStatusJson,
      contactId: dealInvestment.contactId,
    })
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, dealId));

  for (const inv of investments) {
    const cid = normContactKey(inv.contactId);
    if (!cid || !contactKeys.has(cid)) continue;
    const sentMs = latestSentMsFromBundle(inv.esignStatusJson);
    if (sentMs < 0) continue;
    candidates.push({
      target: { table: "investment", id: inv.id },
      sentMs,
    });
  }

  const lps = await db
    .select({
      id: dealLpInvestor.id,
      esignStatusJson: dealLpInvestor.esignStatusJson,
      email: dealLpInvestor.email,
      contactMemberId: dealLpInvestor.contactMemberId,
    })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  for (const lp of lps) {
    const sentMs = latestSentMsFromBundle(lp.esignStatusJson);
    if (sentMs < 0) continue;
    const cid = normContactKey(lp.contactMemberId);
    const rowEmail = normEmail(String(lp.email ?? ""));
    const matches =
      (email && rowEmail === email) ||
      (cid && contactKeys.has(cid));
    if (!matches) continue;
    candidates.push({
      target: { table: "lp", id: lp.id },
      sentMs,
    });
  }

  return pickBestEsignTargetCandidate(candidates);
}

/** Portal eSign routes: scoped Invest Now row when provided, else latest sent / commitment. */
export async function resolveInvestorEsignTargetForSignedInInvestor(
  dealId: string,
  opts: InvestNowEsignTargetOpts,
): Promise<InvestorEsignRowTarget | null> {
  const hasScope =
    Boolean(String(opts.investmentId ?? "").trim()) ||
    Boolean(String(opts.userInvestorProfileId ?? "").trim()) ||
    Boolean(String(opts.profileId ?? "").trim());
  if (hasScope) {
    return findInvestorEsignTargetForInvestNowCommitment(dealId, opts);
  }
  let target = await findInvestorEsignTargetForPortalUser(dealId, opts);
  if (!target) {
    target = await findInvestorEsignTargetForInvestNowCommitment(dealId, opts);
  }
  return target;
}
