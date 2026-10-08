import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { dealMember } from "../../schema/deal.schema/deal-member.schema.js";
import type { DealInvestmentRow } from "../../schema/deal.schema/deal-investment.schema.js";
import {
  committedNumericFromDealInvestmentRow,
  isLpInvestorRole,
  mapContactIdsToCanonicalCommitmentKeys,
} from "./dealInvestment.service.js";

function rosterContactKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maps distinct deal_member labels to a coarse bucket for reporting.
 */
export function sponsorRoleBucketFromLabels(
  labels: string[],
): "lead" | "admin" | "co_sponsor" | null {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("lead sponsor") || l === "lead sponsor"))
    return "lead";
  if (lower.some((l) => l.includes("admin sponsor") || l === "admin sponsor"))
    return "admin";
  if (
    lower.some(
      (l) => l.includes("co-sponsor") || l.includes("co sponsor"),
    )
  )
    return "co_sponsor";
  return null;
}

function bucketFromRoleRaw(raw: string): "lead" | "admin" | "co_sponsor" | null {
  return sponsorRoleBucketFromLabels([raw]);
}

/**
 * One round-trip: portal users in scope who appear on `deal_member` with a sponsor role.
 * Returns map userId -> best bucket (lead > admin > co_sponsor).
 */
async function loadSponsorUsersByOrganization(
  organizationId: string | null,
): Promise<{
  bucketByUserKey: Map<string, "lead" | "admin" | "co_sponsor">;
  sponsorUserIds: string[];
}> {
  const orgOk = organizationId && ORG_UUID_RE.test(organizationId.trim());
  const sqlText = `
    SELECT DISTINCT u.id::text AS user_id, trim(dm.deal_member_role) AS role
    FROM users u
    INNER JOIN deal_member dm ON (
      trim(dm.contact_member_id) = u.id::text
      OR EXISTS (
        SELECT 1 FROM contact c
        WHERE c.id::text = trim(both from dm.contact_member_id)
          AND lower(trim(c.email)) = lower(trim(u.email))
      )
    )
    WHERE trim(dm.deal_member_role) <> ''
      AND lower(trim(dm.deal_member_role)) IN (
        'lead sponsor',
        'admin sponsor',
        'co-sponsor',
        'co sponsor'
      )
      ${orgOk ? "AND u.organization_id = $1::uuid" : ""}
  `;
  const res = await pool.query<{ user_id: string; role: string }>(
    sqlText,
    orgOk ? [organizationId!.trim()] : [],
  );
  const priority: Record<"lead" | "admin" | "co_sponsor", number> = {
    lead: 3,
    admin: 2,
    co_sponsor: 1,
  };
  const bucketByUserKey = new Map<string, "lead" | "admin" | "co_sponsor">();
  const idSet = new Set<string>();
  for (const row of res.rows) {
    const uidFull = String(row.user_id ?? "").trim();
    const uid = uidFull.toLowerCase();
    const b = bucketFromRoleRaw(String(row.role ?? ""));
    if (!b || !uid) continue;
    idSet.add(uidFull);
    const prev = bucketByUserKey.get(uid);
    if (!prev || priority[b] > priority[prev]) bucketByUserKey.set(uid, b);
  }
  return {
    bucketByUserKey,
    sponsorUserIds: [...idSet],
  };
}

async function listDealIdsForOrganizationScope(
  organizationId: string | null | undefined,
): Promise<string[]> {
  if (organizationId && ORG_UUID_RE.test(organizationId.trim())) {
    const rows = await db
      .select({ id: addDealForm.id })
      .from(addDealForm)
      .where(eq(addDealForm.organizationId, organizationId.trim()));
    return rows.map((r) => String(r.id));
  }
  const rows = await db.select({ id: addDealForm.id }).from(addDealForm);
  return rows.map((r) => String(r.id));
}

/**
 * Per-deal: roster `added_by` keyed by **canonical** investor id (same as Deal Members /
 * `mapContactIdsToCanonicalCommitmentKeys`), so investments match roster even when
 * `contact_id` is a user uuid and roster row uses contact uuid (or vice versa).
 */
async function sumLpCommitmentsByAdderUserIdForDeals(
  dealIds: string[],
  invRows: DealInvestmentRow[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (dealIds.length === 0) return totals;

  const invByDeal = new Map<string, DealInvestmentRow[]>();
  for (const inv of invRows) {
    const did = String(inv.dealId);
    const arr = invByDeal.get(did) ?? [];
    arr.push(inv);
    invByDeal.set(did, arr);
  }

  const [lpRows, memRows] = await Promise.all([
    db
      .select({
        dealId: dealLpInvestor.dealId,
        contactMemberId: dealLpInvestor.contactMemberId,
        addedBy: dealLpInvestor.addedBy,
      })
      .from(dealLpInvestor)
      .where(inArray(dealLpInvestor.dealId, dealIds)),
    db
      .select({
        dealId: dealMember.dealId,
        contactMemberId: dealMember.contactMemberId,
        addedBy: dealMember.addedBy,
      })
      .from(dealMember)
      .where(inArray(dealMember.dealId, dealIds)),
  ]);

  for (const dealId of dealIds) {
    const invs = invByDeal.get(dealId) ?? [];
    const lpForDeal = lpRows.filter((r) => String(r.dealId) === dealId);
    const memForDeal = memRows.filter((r) => String(r.dealId) === dealId);
    const allRawIds = [
      ...lpForDeal.map((m) => m.contactMemberId),
      ...memForDeal.map((m) => m.contactMemberId),
      ...invs.map((i) => i.contactId),
    ];
    const rawToCanonical =
      await mapContactIdsToCanonicalCommitmentKeys(allRawIds);

    const adderByCanonical = new Map<string, string>();
    /** Contacts that appear on the LP roster for this deal (canonical keys). */
    const lpRosterCanonicalKeys = new Set<string>();
    for (const m of lpForDeal) {
      const rk = rosterContactKey(m.contactMemberId);
      const ab = m.addedBy ? String(m.addedBy) : "";
      if (!rk || !ab) continue;
      const ck = rawToCanonical.get(rk) ?? `id:${rk}`;
      lpRosterCanonicalKeys.add(ck);
      if (!adderByCanonical.has(ck)) adderByCanonical.set(ck, ab);
    }
    for (const m of memForDeal) {
      const rk = rosterContactKey(m.contactMemberId);
      const ab = m.addedBy ? String(m.addedBy) : "";
      if (!rk || !ab) continue;
      const ck = rawToCanonical.get(rk) ?? `id:${rk}`;
      adderByCanonical.set(ck, ab);
    }

    for (const inv of invs) {
      const rkInv = rosterContactKey(inv.contactId);
      if (!rkInv) continue;
      const ckInv = rawToCanonical.get(rkInv) ?? `id:${rkInv}`;
      const countsAsLp =
        isLpInvestorRole(inv.investor_role) ||
        lpRosterCanonicalKeys.has(ckInv);
      if (!countsAsLp) continue;
      const adder = adderByCanonical.get(ckInv);
      if (!adder) continue;
      const n = committedNumericFromDealInvestmentRow(inv);
      if (!Number.isFinite(n) || n <= 0) continue;
      const key = adder.toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + n);
    }
  }

  return totals;
}

export type SponsorTotalInvestmentRow = {
  userId: string;
  userName: string;
  role: "lead" | "admin" | "co_sponsor";
  totalInvestment: number;
};

/**
 * Sums LP `deal_investment` commitment (primary + extra lines) for rows whose roster
 * `added_by` is the sponsor user, scoped to deals in the optional organization.
 * Uses batched queries (no per-deal loop). Null/invalid amounts count as 0.
 */
export async function listSponsorTotalInvestmentsForScope(opts: {
  /** When set, only deals owned by this org count. When null/undefined, all deals (platform-wide). */
  organizationId?: string | null;
}): Promise<SponsorTotalInvestmentRow[]> {
  const dealIds = await listDealIdsForOrganizationScope(
    opts.organizationId ?? null,
  );

  const { bucketByUserKey, sponsorUserIds } =
    await loadSponsorUsersByOrganization(
      opts.organizationId && ORG_UUID_RE.test(String(opts.organizationId).trim())
        ? String(opts.organizationId).trim()
        : null,
    );
  if (sponsorUserIds.length === 0) return [];

  let invRows: DealInvestmentRow[] = [];
  if (dealIds.length > 0) {
    invRows = await db
      .select()
      .from(dealInvestment)
      .where(inArray(dealInvestment.dealId, dealIds));
  }

  const userRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(inArray(users.id, sponsorUserIds));

  const totals = await sumLpCommitmentsByAdderUserIdForDeals(dealIds, invRows);

  const orgFilter =
    opts.organizationId && ORG_UUID_RE.test(opts.organizationId.trim())
      ? opts.organizationId.trim()
      : null;

  const out: SponsorTotalInvestmentRow[] = [];
  for (const u of userRows) {
    const uid = String(u.id ?? "").trim();
    if (!uid) continue;
    const bucket = bucketByUserKey.get(uid.toLowerCase());
    if (!bucket) continue;
    if (orgFilter) {
      const oid = u.organizationId ? String(u.organizationId).trim() : "";
      if (oid.toLowerCase() !== orgFilter.toLowerCase()) continue;
    }

    const fn = String(u.firstName ?? "").trim();
    const ln = String(u.lastName ?? "").trim();
    const un = String(u.username ?? "").trim();
    const userName =
      fn || ln ? `${fn} ${ln}`.trim() : un || "—";

    const totalInvestment = totals.get(uid.toLowerCase()) ?? 0;

    out.push({
      userId: uid,
      userName,
      role: bucket,
      totalInvestment,
    });
  }

  out.sort((a, b) => a.userName.localeCompare(b.userName));
  return out;
}
