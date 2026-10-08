import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../database/db.js";
import { contact, dealMember, users } from "../../schema/schema.js";
import {
  dealLpInvestor,
  type DealLpInvestorRow,
} from "../../schema/deal.schema/deal-lp-investor.schema.js";
import {
  dealInvestment,
  type DealInvestmentRow,
} from "../../schema/deal.schema/deal-investment.schema.js";
import { assertEligibleForNewDealRosterAdd } from "../user/portalUserRosterGuard.service.js";
import { syncDealInvestorEsignStatusesForDeal } from "./dealMemberEsignCompletion.service.js";
import { sqlPreserveSendInvitationMailOnUpsert } from "./dealMember.service.js";
import {
  buildInvestorKpisFromRows,
  committedNumericFromDealInvestmentRow,
  DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
  enrichInvestorApiRowsWithAddedBy,
  enrichInvestorRolesForDealRows,
  filterInvestorRowsVisibleToCoSponsor,
  redactCoSponsorAddedInvestorEmailsForLeadAdminViewer,
  insertDealInvestment,
  isLpInvestorRole,
  LP_INVESTOR_ROLE_STORED,
  listDealInvestmentsByDealId,
  loadInvitationMailSentFlags,
  mapRowToInvestorApi,
  mapContactIdsToCanonicalCommitmentKeys,
  resolveFirstInvestorClassForDeal,
  resolveInvestorClassForDealInvestment,
  resolveUserInvestorProfileNamesByIds,
  resolveUsersByContactIds,
  rowIsGeneralPartnerForRoster,
} from "./dealInvestment.service.js";
import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";
import type { DealViewerScope } from "./dealForm.service.js";
import {
  listDealIdsWhereViewerIsCoSponsor,
  listDealIdsWhereViewerIsLeadOrAdminSponsor,
  listEquivalentPortalUserIdsForUser,
  resolveViewerDealMemberRoleOnDeal,
} from "./dealMemberScope.service.js";
import { resolveInvestNowViewerContactOnDeal } from "./dealInvestNowViewerContact.service.js";

function normalizeContactKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

type LpRosterPercentFields = {
  percentOfClassOwnership: string;
  percentOfClassDistributions: string;
  entityOwnershipPercent: string;
  distributionAllocationPercent: string;
};

function percentFieldsFromLpRosterRow(
  m: DealLpInvestorRow,
): LpRosterPercentFields {
  return {
    percentOfClassOwnership: String(m.percentOfClassOwnership ?? "").trim(),
    percentOfClassDistributions: String(
      m.percentOfClassDistributions ?? "",
    ).trim(),
    entityOwnershipPercent: String(m.entityOwnershipPercent ?? "").trim(),
    distributionAllocationPercent: String(
      m.distributionAllocationPercent ?? "",
    ).trim(),
  };
}

/**
 * Index LP roster percents by LP row id and by canonical contact key
 * (email-linked user UUID ↔ contact UUID), so investment rows still get DB %.
 */
async function indexLpRosterPercents(params: {
  roster: DealLpInvestorRow[];
  investorContactIds: string[];
}): Promise<{
  byLpId: Map<string, LpRosterPercentFields>;
  lookupByContactId: (
    contactId: string | null | undefined,
  ) => LpRosterPercentFields | undefined;
}> {
  const byLpId = new Map<string, LpRosterPercentFields>();
  const byCanonical = new Map<string, LpRosterPercentFields>();

  const allRawIds: string[] = [];
  for (const m of params.roster) {
    const k = normalizeContactKey(m.contactMemberId);
    if (k) allRawIds.push(k);
  }
  for (const raw of params.investorContactIds) {
    const k = normalizeContactKey(raw);
    if (k) allRawIds.push(k);
  }

  const rawToCanonical =
    await mapContactIdsToCanonicalCommitmentKeys(allRawIds);

  for (const m of params.roster) {
    const pct = percentFieldsFromLpRosterRow(m);
    byLpId.set(String(m.id).toLowerCase(), pct);
    const contactKey = normalizeContactKey(m.contactMemberId);
    if (!contactKey) continue;
    const canonical = rawToCanonical.get(contactKey) ?? `id:${contactKey}`;
    byCanonical.set(canonical, pct);
  }

  return {
    byLpId,
    lookupByContactId(contactId) {
      const contactKey = normalizeContactKey(String(contactId ?? ""));
      if (!contactKey) return undefined;
      const canonical = rawToCanonical.get(contactKey) ?? `id:${contactKey}`;
      return byCanonical.get(canonical);
    },
  };
}

/** True when the viewer’s roster row on this deal is Co-sponsor (contact or user id match). */
export async function isViewerCoSponsorOnDeal(
  dealId: string,
  userId: string,
): Promise<boolean> {
  const role = await resolveViewerDealMemberRoleOnDeal(dealId, userId);
  return role === "co_sponsor";
}

/**
 * Co-sponsors see investors associated with them via Sponsor name on the deal
 * (Investor → Sponsor/Co-sponsor). Lead / admin sponsors see the full roster.
 */
export async function shouldScopeInvestorsToCoSponsorAddedOnly(
  dealId: string,
  userId: string,
): Promise<boolean> {
  return isViewerCoSponsorOnDeal(dealId, userId);
}

/**
 * Co-sponsors see investors whose Sponsor name relationship resolves to them
 * (including equivalent portal accounts).
 */
export async function filterMergedLpInvestorsForCoSponsorViewer(
  dealId: string,
  viewerUserId: string,
  merged: DealInvestmentRow[],
): Promise<DealInvestmentRow[]> {
  return filterInvestorRowsVisibleToCoSponsor(dealId, viewerUserId, merged);
}

export type CoSponsorVisibleInvestorMatchKeys = {
  investmentIds: Set<string>;
  contactIds: Set<string>;
  emails: Set<string>;
};

/**
 * Keys of investors a co-sponsor may pay out. Returns null when the viewer
 * should see the full roster (lead / admin / not co-sponsor-scoped).
 */
export async function listCoSponsorVisibleInvestorMatchKeys(
  dealId: string,
  viewerUserId: string | null | undefined,
): Promise<CoSponsorVisibleInvestorMatchKeys | null> {
  const uid = String(viewerUserId ?? "").trim();
  if (!uid) return null;
  if (!(await shouldScopeInvestorsToCoSponsorAddedOnly(dealId, uid))) {
    return null;
  }
  const rows = await listDealInvestmentsByDealId(dealId);
  const visible = await filterInvestorRowsVisibleToCoSponsor(dealId, uid, rows);
  const resolved = await resolveUsersByContactIds(visible);
  const investmentIds = new Set<string>();
  const contactIds = new Set<string>();
  const emails = new Set<string>();
  for (const row of visible) {
    const mapped = mapRowToInvestorApi(row, resolved);
    const invId = String(mapped.id ?? row.id ?? "").trim().toLowerCase();
    const contactId = String(mapped.contactId ?? row.contactId ?? "")
      .trim()
      .toLowerCase();
    const email = String(mapped.userEmail ?? "").trim().toLowerCase();
    if (invId) investmentIds.add(invId);
    if (contactId) contactIds.add(contactId);
    if (email.includes("@")) emails.add(email);
  }
  return { investmentIds, contactIds, emails };
}

const LP_INVESTOR_TABLE_ROLE = "LP Investor";

/** `investor_role` on synthetic merged rows: prefer column on `deal_lp_investor`, else canonical LP value. */
function investorRoleFromDealLpInvestorRow(m: DealLpInvestorRow): string {
  const r = String(m.role ?? "").trim();
  if (r) return r;
  return LP_INVESTOR_ROLE_STORED;
}

async function resolveEmailForContactMemberId(rawCid: string): Promise<string> {
  const cid = String(rawCid ?? "").trim();
  if (!cid) return "";
  const [uRow] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, cid))
    .limit(1);
  const fromUser = String(uRow?.email ?? "")
    .trim()
    .toLowerCase();
  if (fromUser) return fromUser;
  const [cRow] = await db
    .select({ email: contact.email })
    .from(contact)
    .where(sql`${contact.id}::text = ${cid}`)
    .limit(1);
  return String(cRow?.email ?? "")
    .trim()
    .toLowerCase();
}

export function syntheticInvestmentFromDealLpInvestor(
  m: DealLpInvestorRow,
): DealInvestmentRow {
  return {
    id: m.id,
    dealId: m.dealId,
    offeringId: "",
    contactId: m.contactMemberId,
    contactDisplayName: String(m.investorName ?? "").trim(),
    profileId: m.profileId?.trim() ?? "",
    userInvestorProfileId: m.userInvestorProfileId ?? null,
    investor_role: investorRoleFromDealLpInvestorRow(m),
    fundApproved: false,
    fundApprovedBy: null,
    fundApprovedAt: null,
    fundApprovedCommitmentSnapshot: "",
    status: "",
    investorClass: m.investorClass,
    docSignedDate: m.docSignedDate?.trim() ?? null,
    esignStatusJson: m.esignStatusJson?.trim() ?? null,
    investorQuestionnaireAnswersJson: null,
    investorW9FormJson: null,
    fundingMethod: "",
    commitmentAmount: m.committed_amount,
    extraContributionAmounts: [],
    documentStoragePath: null,
    createdAt: m.createdAt,
  };
}

/**
 * `GET /deals/:dealId/investors` (full roster) is built from `deal_investment` only.
 * Contacts that exist only on `deal_lp_investor` (e.g. sponsor added LP, $0, no
 * `deal_investment` row yet) would be missing — add them so investing `/deals`
 * and the Investors tab can match the user by email.
 */
export async function mergeDealLpRosterIntoFullInvestorRows(
  dealId: string,
  investments: DealInvestmentRow[],
): Promise<DealInvestmentRow[]> {
  const roster = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  const withInvestmentContact = new Set<string>();
  const allRawContactIds: string[] = [];
  for (const inv of investments) {
    const k = normalizeContactKey(inv.contactId ?? "");
    if (!k) continue;
    withInvestmentContact.add(k);
    allRawContactIds.push(k);
  }
  for (const m of roster) {
    const k = normalizeContactKey(m.contactMemberId);
    if (k) allRawContactIds.push(k);
  }
  const rawToCanonical =
    await mapContactIdsToCanonicalCommitmentKeys(allRawContactIds);
  const withInvestmentCanonical = new Set<string>();
  for (const raw of withInvestmentContact) {
    withInvestmentCanonical.add(rawToCanonical.get(raw) ?? `id:${raw}`);
  }

  const extra: DealInvestmentRow[] = [];
  for (const m of roster) {
    const k = normalizeContactKey(m.contactMemberId);
    if (!k) continue;
    const canonical = rawToCanonical.get(k) ?? `id:${k}`;
    if (withInvestmentContact.has(k) || withInvestmentCanonical.has(canonical)) {
      continue;
    }
    extra.push(syntheticInvestmentFromDealLpInvestor(m));
  }
  if (extra.length === 0) return investments;
  return [...investments, ...extra].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Investors tab list: every `deal_investment` row on this deal (one API line per
 * investment / commitment), plus `deal_lp_investor` contacts that have no
 * investment row yet.
 *
 * Does **not** collapse multiple investments for the same contact into one line —
 * each commitment is listed separately with its own amount.
 */
/** Lead / Admin / Co-sponsor — Deal Members roles (not LP-only). */
function isDealMembersSponsorRole(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return (
    s === "lead sponsor" ||
    s === "admin sponsor" ||
    s === "co-sponsor"
  );
}

/**
 * Investors tab: each LP commitment, plus Lead/Admin/Co only when they are also
 * investors (on the LP roster or have a positive commitment).
 * General partners (GP role or GP class) are listed on Deal Members → General Partners.
 */
export async function listMergedLpInvestorsForDeal(
  dealId: string,
): Promise<DealInvestmentRow[]> {
  const allInvestments = await listDealInvestmentsByDealId(dealId, {
    lpInvestorsOnly: false,
  });
  const autosaveKey = normalizeContactKey(
    DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
  );

  const investments = allInvestments.filter((inv) => {
    const k = normalizeContactKey(inv.contactId ?? "");
    return Boolean(k) && k !== autosaveKey;
  });

  const roster = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId))
    .orderBy(desc(dealLpInvestor.updatedAt));

  const allRawContactIds: string[] = [];
  for (const inv of investments) {
    const k = normalizeContactKey(inv.contactId ?? "");
    if (k) allRawContactIds.push(k);
  }
  for (const m of roster) {
    const k = normalizeContactKey(m.contactMemberId);
    if (k) allRawContactIds.push(k);
  }
  const rawToCanonical =
    await mapContactIdsToCanonicalCommitmentKeys(allRawContactIds);

  function canonicalOf(raw: string): string {
    const k = normalizeContactKey(raw);
    if (!k) return "";
    return rawToCanonical.get(k) ?? `id:${k}`;
  }

  const rosterByCanonical = new Map<string, DealLpInvestorRow>();
  for (const m of roster) {
    const k = normalizeContactKey(m.contactMemberId);
    if (!k) continue;
    const c = canonicalOf(k);
    if (!c) continue;
    const prev = rosterByCanonical.get(c);
    if (!prev || new Date(m.updatedAt) > new Date(prev.updatedAt))
      rosterByCanonical.set(c, m);
  }

  const classes = await listInvestorClassesByDealId(dealId);

  const rows: DealInvestmentRow[] = [];
  const coveredCanonical = new Set<string>();

  for (const inv of investments) {
    const k = normalizeContactKey(inv.contactId ?? "");
    const canonical = k ? canonicalOf(k) : "";
    const role = inv.investor_role ?? "";
    if (rowIsGeneralPartnerForRoster(role, inv.investorClass, classes)) {
      continue;
    }
    const onLpRoster = Boolean(canonical && rosterByCanonical.has(canonical));
    const lpRole = isLpInvestorRole(role);
    const sponsorRole = isDealMembersSponsorRole(role);
    const committed = committedNumericFromDealInvestmentRow(inv);

    // LP commitments always show. Lead/Admin/Co only when they are also investors.
    const include =
      lpRole || onLpRoster || (sponsorRole && committed > 0);

    if (!include) continue;

    rows.push(inv);
    if (canonical) coveredCanonical.add(canonical);
  }

  for (const [canonical, m] of rosterByCanonical) {
    if (coveredCanonical.has(canonical)) continue;
    if (rowIsGeneralPartnerForRoster(m.role, m.investorClass, classes)) {
      continue;
    }
    rows.push(syntheticInvestmentFromDealLpInvestor(m));
    coveredCanonical.add(canonical);
  }

  rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return rows;
}

export type LpInvestorApiRow = ReturnType<typeof mapRowToInvestorApi> & {
  investorKind?: "investment" | "lp_investor";
  addedByDisplayName?: string;
};

export async function mapMergedLpRowsToInvestorApi(
  dealId: string,
  rows: DealInvestmentRow[],
  lpRowIds: Set<string>,
): Promise<LpInvestorApiRow[]> {
  const enriched =
    rows.length > 0 ? await enrichInvestorRolesForDealRows(dealId, rows) : rows;
  const resolved = await resolveUsersByContactIds(enriched);
  const profileNames = await resolveUserInvestorProfileNamesByIds(
    enriched.map((r) => String(r.userInvestorProfileId ?? "")),
  );
  const flags =
    enriched.length > 0
      ? await loadInvitationMailSentFlags(dealId, enriched, lpRowIds)
      : [];
  const out: LpInvestorApiRow[] = [];
  enriched.forEach((r, i) => {
    const base = mapRowToInvestorApi(r, resolved, {
      invitationMailSent: flags[i] === true,
    });
    const profileKey = String(r.userInvestorProfileId ?? "")
      .trim()
      .toLowerCase();
    const profileName = profileKey
      ? profileNames.get(profileKey)
      : undefined;
    const idKey = String(r.id ?? "").toLowerCase();
    const kind: "investment" | "lp_investor" = lpRowIds.has(idKey)
      ? "lp_investor"
      : "investment";
    out.push({
      ...base,
      ...(profileName ? { userInvestorProfileName: profileName } : {}),
      investorKind: kind,
    });
  });
  return out;
}

/** Build LP investor id set by comparing merged rows to DB lp table (source of truth). */
export async function resolveLpRosterIdSet(
  dealId: string,
  mergedRows: DealInvestmentRow[],
): Promise<Set<string>> {
  const lpDb = await db
    .select({ id: dealLpInvestor.id })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));
  const allowed = new Set(lpDb.map((r) => String(r.id).toLowerCase()));
  const out = new Set<string>();
  for (const row of mergedRows) {
    const id = String(row.id ?? "").toLowerCase();
    if (allowed.has(id)) out.add(id);
  }
  return out;
}

export async function buildLpInvestorsFromMerged(
  dealId: string,
  merged: DealInvestmentRow[],
  viewerUserId?: string | null,
): Promise<{
  investors: LpInvestorApiRow[];
  kpis: ReturnType<typeof buildInvestorKpisFromRows>;
}> {
  const kpis = buildInvestorKpisFromRows(merged);
  const lpRosterIds = await resolveLpRosterIdSet(dealId, merged);
  const base = await mapMergedLpRowsToInvestorApi(dealId, merged, lpRosterIds);

  const roster = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  const rosterEmailByLpId = new Map<string, string>();
  for (const m of roster) {
    const em = String(m.email ?? "").trim();
    if (em) rosterEmailByLpId.set(String(m.id).toLowerCase(), em);
  }

  const { byLpId, lookupByContactId } = await indexLpRosterPercents({
    roster,
    investorContactIds: base.map((inv) => String(inv.contactId ?? "")),
  });

  const investorsMerged = base.map((inv) => {
    const id = String(inv.id ?? "").toLowerCase();
    const storedEmail = lpRosterIds.has(id)
      ? rosterEmailByLpId.get(id)
      : undefined;
    const emailPatch = storedEmail?.trim()
      ? { userEmail: storedEmail.trim() }
      : {};
    const pct =
      byLpId.get(id) ?? lookupByContactId(inv.contactId);
    const pctPatch = pct
      ? {
          percentOfClassOwnership: pct.percentOfClassOwnership,
          percentOfClassDistributions: pct.percentOfClassDistributions,
          entityOwnershipPercent: pct.entityOwnershipPercent,
          distributionAllocationPercent: pct.distributionAllocationPercent,
        }
      : {};
    return { ...inv, ...emailPatch, ...pctPatch };
  });

  const withAddedBy = await enrichInvestorApiRowsWithAddedBy(
    dealId,
    investorsMerged,
    viewerUserId,
  );
  const investors = viewerUserId?.trim()
    ? await redactCoSponsorAddedInvestorEmailsForLeadAdminViewer(
        dealId,
        viewerUserId.trim(),
        withAddedBy,
      )
    : withAddedBy;

  return { investors, kpis };
}

/**
 * After create/update, the tab list may return the shadowed `deal_investment` row
 * (different id / contact UUID). Resolve by LP id, then exact contact, then canonical.
 */
export async function findMergedInvestorForLpRosterRow(
  investors: LpInvestorApiRow[],
  lpRow: Pick<DealLpInvestorRow, "id" | "contactMemberId">,
): Promise<LpInvestorApiRow | undefined> {
  const rowId = String(lpRow.id ?? "").toLowerCase();
  const byId = investors.find((x) => String(x.id ?? "").toLowerCase() === rowId);
  if (byId) return byId;

  const rowContact = normalizeContactKey(lpRow.contactMemberId);
  if (!rowContact) return undefined;

  const byExact = investors.find(
    (x) => normalizeContactKey(String(x.contactId ?? "")) === rowContact,
  );
  if (byExact) return byExact;

  const allRaw = [
    rowContact,
    ...investors.map((x) => normalizeContactKey(String(x.contactId ?? ""))),
  ].filter(Boolean);
  const rawToCanonical = await mapContactIdsToCanonicalCommitmentKeys(allRaw);
  const targetCanonical = rawToCanonical.get(rowContact) ?? `id:${rowContact}`;
  return investors.find((x) => {
    const k = normalizeContactKey(String(x.contactId ?? ""));
    if (!k) return false;
    return (rawToCanonical.get(k) ?? `id:${k}`) === targetCanonical;
  });
}

type FullRosterInvestorApiRow = ReturnType<typeof mapRowToInvestorApi>;

/**
 * Full investor roster (`GET /deals/:id/investors`): patch invite email and
 * `investorKind` for rows sourced from `deal_lp_investor` (same as LP tab path).
 */
export async function enrichFullInvestorApiFromLpRoster(
  dealId: string,
  mergedRows: DealInvestmentRow[],
  investors: FullRosterInvestorApiRow[],
): Promise<
  Array<FullRosterInvestorApiRow & { investorKind?: "investment" | "lp_roster" }>
> {
  const lpRosterIds = await resolveLpRosterIdSet(dealId, mergedRows);

  const roster = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  if (roster.length === 0) return investors;

  const rosterEmailByLpId = new Map<string, string>();
  for (const m of roster) {
    const em = String(m.email ?? "").trim();
    if (em) rosterEmailByLpId.set(String(m.id).toLowerCase(), em);
  }

  const { byLpId, lookupByContactId } = await indexLpRosterPercents({
    roster,
    investorContactIds: investors.map((inv) => String(inv.contactId ?? "")),
  });

  return investors.map((inv) => {
    const id = String(inv.id ?? "").toLowerCase();
    const isLpRoster = lpRosterIds.has(id);
    const storedEmail = isLpRoster
      ? rosterEmailByLpId.get(id)?.trim()
      : undefined;
    const pct = byLpId.get(id) ?? lookupByContactId(inv.contactId);
    return {
      ...inv,
      ...(storedEmail ? { userEmail: storedEmail } : {}),
      ...(pct
        ? {
            percentOfClassOwnership: pct.percentOfClassOwnership,
            percentOfClassDistributions: pct.percentOfClassDistributions,
            entityOwnershipPercent: pct.entityOwnershipPercent,
            distributionAllocationPercent: pct.distributionAllocationPercent,
          }
        : {}),
      ...(isLpRoster ? { investorKind: "lp_roster" as const } : {}),
    };
  });
}

/**
 * GET /deals/:dealId/investors?lp=1 — when `viewerUserId` is a Co-sponsor on the deal,
 * investors/KPIs are restricted to rows they added.
 */
export async function getLpInvestorsTabPayload(
  dealId: string,
  viewerUserId?: string | null,
): Promise<{
  kpis: ReturnType<typeof buildInvestorKpisFromRows>;
  investors: LpInvestorApiRow[];
}> {
  try {
    await syncDealInvestorEsignStatusesForDeal(dealId);
  } catch (err) {
    console.warn("syncDealInvestorEsignStatusesForDeal:", err);
  }

  let merged = await listMergedLpInvestorsForDeal(dealId);
  const uid = viewerUserId?.trim();
  if (uid && (await shouldScopeInvestorsToCoSponsorAddedOnly(dealId, uid))) {
    merged = await filterMergedLpInvestorsForCoSponsorViewer(
      dealId,
      uid,
      merged,
    );
  }
  return buildLpInvestorsFromMerged(dealId, merged, uid);
}

export type UpsertDealLpInvestorInput = {
  contactMemberId: string;
  contactDisplayName: string;
  profileId: string;
  userInvestorProfileId?: string | null;
  investorClass: string;
  sendInvitationMail: string;
  addedByUserId: string;
  /** From client when known (UI already has email); else resolved from contact/users by id. */
  emailFromClient?: string | null;
  /** From client (e.g. `lp_investors`); else {@link LP_INVESTOR_TABLE_ROLE}. */
  roleFromClient?: string | null;
  /** Percent of class (ownership). */
  percentOfClassOwnership?: string | null;
  /** Percent of class (distributions). */
  percentOfClassDistributions?: string | null;
  /** Entity Ownership % (optional). */
  entityOwnershipPercent?: string | null;
  /** Distribution Allocation % (optional). */
  distributionAllocationPercent?: string | null;
};

export const LP_INVESTOR_ALREADY_ON_DEAL_MESSAGE =
  "This person is already on the Investors list for this deal.";

export async function findDealLpInvestorByDealAndContact(
  dealId: string,
  contactMemberId: string,
): Promise<DealLpInvestorRow | undefined> {
  const did = String(dealId ?? "").trim();
  const cid = String(contactMemberId ?? "").trim();
  if (!did || !cid) return undefined;
  const [row] = await db
    .select()
    .from(dealLpInvestor)
    .where(
      and(
        eq(dealLpInvestor.dealId, did),
        eq(dealLpInvestor.contactMemberId, cid),
      ),
    )
    .limit(1);
  return row;
}

export async function upsertDealLpInvestor(
  dealId: string,
  input: UpsertDealLpInvestorInput,
): Promise<DealLpInvestorRow> {
  const cid = input.contactMemberId.trim();

  console.log("contactmember id", cid);

  if (!cid) throw new Error("contact_member_id required");

  const existing = await findDealLpInvestorByDealAndContact(dealId, cid);
  if (!existing) {
    await assertEligibleForNewDealRosterAdd(cid);
  }

  const send =
    String(input.sendInvitationMail ?? "").toLowerCase() === "yes"
      ? "yes"
      : "no";
  const profileId = String(input.profileId ?? "").trim();
  const uip = String(input.userInvestorProfileId ?? "").trim() || null;
  const now = new Date();
  const fromClientEmail = String(input.emailFromClient ?? "").trim();
  const fromClientRole = String(input.roleFromClient ?? "").trim();
  const resolvedEmail =
    fromClientEmail || (await resolveEmailForContactMemberId(cid));
  const roleToStore = fromClientRole || LP_INVESTOR_TABLE_ROLE;
  const ownershipPct = String(input.percentOfClassOwnership ?? "").trim();
  const distributionsPct = String(
    input.percentOfClassDistributions ?? "",
  ).trim();
  const entityOwnershipPct = String(input.entityOwnershipPercent ?? "").trim();
  const distributionAllocationPct = String(
    input.distributionAllocationPercent ?? "",
  ).trim();
  const investorName = await resolveInvestorNameForUpsert({
    contactMemberId: cid,
    contactDisplayName: input.contactDisplayName,
  });

  const [row] = await db
    .insert(dealLpInvestor)
    .values({
      dealId,
      investorName,
      addedBy: input.addedByUserId,
      contactMemberId: cid,
      email: resolvedEmail || null,
      role: roleToStore,
      profileId,
      userInvestorProfileId: uip,
      investorClass: input.investorClass?.trim() ?? "",
      percentOfClassOwnership: ownershipPct,
      percentOfClassDistributions: distributionsPct,
      entityOwnershipPercent: entityOwnershipPct,
      distributionAllocationPercent: distributionAllocationPct,
      sendInvitationMail: send,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dealLpInvestor.dealId, dealLpInvestor.contactMemberId],
      set: {
        investorName,
        addedBy: sql`COALESCE(${dealLpInvestor.addedBy}, ${input.addedByUserId}::uuid)`,
        email: resolvedEmail || null,
        role: roleToStore,
        profileId,
        userInvestorProfileId: uip,
        investorClass: input.investorClass?.trim() ?? "",
        percentOfClassOwnership: ownershipPct,
        percentOfClassDistributions: distributionsPct,
        entityOwnershipPercent: entityOwnershipPct,
        distributionAllocationPercent: distributionAllocationPct,
        sendInvitationMail: sqlPreserveSendInvitationMailOnUpsert(
          input.sendInvitationMail,
          dealLpInvestor.sendInvitationMail,
        ),
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("UPSERT_DEAL_LP_INVESTOR_FAILED");
  return row;
}

export async function updateDealLpInvestorById(
  dealId: string,
  lpInvestorId: string,
  input: UpsertDealLpInvestorInput,
): Promise<DealLpInvestorRow | null> {
  const cid = input.contactMemberId.trim();
  console.log("contact member id 2", cid)
  if (!cid) return null;
  const send =
    String(input.sendInvitationMail ?? "").toLowerCase() === "yes"
      ? "yes"
      : "no";
  const profileId = String(input.profileId ?? "").trim();
  const now = new Date();
  const fromClientEmail = String(input.emailFromClient ?? "").trim();
  const fromClientRole = String(input.roleFromClient ?? "").trim();
  const resolvedEmail =
    fromClientEmail || (await resolveEmailForContactMemberId(cid));
  const roleToStore = fromClientRole || LP_INVESTOR_TABLE_ROLE;

  const [existing] = await db
    .select({
      sendInvitationMail: dealLpInvestor.sendInvitationMail,
      contactMemberId: dealLpInvestor.contactMemberId,
    })
    .from(dealLpInvestor)
    .where(
      and(
        eq(dealLpInvestor.dealId, dealId),
        eq(dealLpInvestor.id, lpInvestorId),
      ),
    )
    .limit(1);
  const prevContactId = String(existing?.contactMemberId ?? "").trim();
  if (prevContactId.toLowerCase() !== cid.toLowerCase()) {
    await assertEligibleForNewDealRosterAdd(cid);
  }
  const sendToStore =
    send === "yes"
      ? "yes"
      : String(existing?.sendInvitationMail ?? "").toLowerCase().trim() === "yes"
        ? "yes"
        : "no";
  const ownershipPct = String(input.percentOfClassOwnership ?? "").trim();
  const distributionsPct = String(
    input.percentOfClassDistributions ?? "",
  ).trim();
  const entityOwnershipPct = String(input.entityOwnershipPercent ?? "").trim();
  const distributionAllocationPct = String(
    input.distributionAllocationPercent ?? "",
  ).trim();
  const investorName = await resolveInvestorNameForUpsert({
    contactMemberId: cid,
    contactDisplayName: input.contactDisplayName,
  });

  const [row] = await db
    .update(dealLpInvestor)
    .set({
      contactMemberId: cid,
      investorName,
      email: resolvedEmail || null,
      role: roleToStore,
      profileId,
      investorClass: input.investorClass?.trim() ?? "",
      percentOfClassOwnership: ownershipPct,
      percentOfClassDistributions: distributionsPct,
      entityOwnershipPercent: entityOwnershipPct,
      distributionAllocationPercent: distributionAllocationPct,
      sendInvitationMail: sendToStore,
      updatedAt: now,
    })
    .where(
      and(
        eq(dealLpInvestor.dealId, dealId),
        eq(dealLpInvestor.id, lpInvestorId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getDealLpInvestorById(
  dealId: string,
  id: string,
): Promise<DealLpInvestorRow | undefined> {
  const rows = await db
    .select()
    .from(dealLpInvestor)
    .where(and(eq(dealLpInvestor.dealId, dealId), eq(dealLpInvestor.id, id)))
    .limit(1);
  return rows[0];
}

/**
 * Resolve the `deal_lp_investor` row for Edit: by LP id first, then exact /
 * canonical contact match (investment rows often use a different contact UUID).
 */
export async function resolveDealLpInvestorForEdit(
  dealId: string,
  params: { lpInvestorId?: string | null; contactId?: string | null },
): Promise<DealLpInvestorRow | undefined> {
  const did = String(dealId ?? "").trim();
  if (!did) return undefined;

  const lpId = String(params.lpInvestorId ?? "").trim();
  if (lpId) {
    const byId = await getDealLpInvestorById(did, lpId);
    if (byId) return byId;
  }

  const contactId = String(params.contactId ?? "").trim();
  if (!contactId) return undefined;

  const exact = await findDealLpInvestorByDealAndContact(did, contactId);
  if (exact) return exact;

  const roster = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, did));
  if (roster.length === 0) return undefined;

  const allRaw = [
    contactId,
    ...roster.map((m) => String(m.contactMemberId ?? "").trim()),
  ].filter(Boolean);
  const rawToCanonical =
    await mapContactIdsToCanonicalCommitmentKeys(allRaw);
  const targetKey = normalizeContactKey(contactId);
  const targetCanonical =
    rawToCanonical.get(targetKey) ?? `id:${targetKey}`;

  return roster.find((m) => {
    const k = normalizeContactKey(m.contactMemberId);
    if (!k) return false;
    if (k === targetKey) return true;
    return (rawToCanonical.get(k) ?? `id:${k}`) === targetCanonical;
  });
}

async function resolveDisplayNameForContactMemberId(
  rawCid: string,
): Promise<string> {
  const cid = String(rawCid ?? "").trim();
  if (!cid) return "";
  const [uRow] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, cid))
    .limit(1);
  if (uRow) {
    const name = `${String(uRow.firstName ?? "").trim()} ${String(uRow.lastName ?? "").trim()}`.trim();
    if (name) return name;
    const em = String(uRow.email ?? "").trim();
    if (em) return em;
  }
  const [cRow] = await db
    .select({
      fullName: contact.fullName,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    })
    .from(contact)
    .where(sql`${contact.id}::text = ${cid}`)
    .limit(1);
  if (!cRow) return "";
  const full = String(cRow.fullName ?? "").trim();
  if (full) return full;
  const name = `${String(cRow.firstName ?? "").trim()} ${String(cRow.lastName ?? "").trim()}`.trim();
  if (name) return name;
  return String(cRow.email ?? "").trim();
}

/** Prefer client display name; else resolve from contact / user. */
async function resolveInvestorNameForUpsert(params: {
  contactMemberId: string;
  contactDisplayName?: string | null;
}): Promise<string> {
  const fromClient = String(params.contactDisplayName ?? "").trim();
  if (fromClient && fromClient !== "—") return fromClient;
  return resolveDisplayNameForContactMemberId(params.contactMemberId);
}

/** API shape for Edit LP investor — always sourced from `deal_lp_investor`. */
export async function mapDealLpInvestorRowToEditApi(
  row: DealLpInvestorRow,
): Promise<{
  id: string
  contactId: string
  displayName: string
  userEmail: string
  profileId: string
  investorClass: string
  investorRole: string
  percentOfClassOwnership: string
  percentOfClassDistributions: string
  entityOwnershipPercent: string
  distributionAllocationPercent: string
  investorKind: "lp_roster"
}> {
  const contactId = String(row.contactMemberId ?? "").trim();
  const storedName = String(row.investorName ?? "").trim();
  const displayName =
    storedName || (await resolveDisplayNameForContactMemberId(contactId));
  const email =
    String(row.email ?? "").trim() ||
    (await resolveEmailForContactMemberId(contactId));
  return {
    id: row.id,
    contactId,
    displayName: displayName || email || "—",
    userEmail: email || "—",
    profileId: String(row.profileId ?? "").trim(),
    investorClass: String(row.investorClass ?? "").trim(),
    investorRole: investorRoleFromDealLpInvestorRow(row),
    percentOfClassOwnership: String(row.percentOfClassOwnership ?? "").trim(),
    percentOfClassDistributions: String(
      row.percentOfClassDistributions ?? "",
    ).trim(),
    entityOwnershipPercent: String(row.entityOwnershipPercent ?? "").trim(),
    distributionAllocationPercent: String(
      row.distributionAllocationPercent ?? "",
    ).trim(),
    investorKind: "lp_roster",
  };
}

export async function deleteDealLpInvestorById(
  dealId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(dealLpInvestor)
    .where(and(eq(dealLpInvestor.dealId, dealId), eq(dealLpInvestor.id, id)))
    .returning({ id: dealLpInvestor.id });
  return deleted.length > 0;
}

const LP_ROLE_SQL = ["lp_investors", "LP Investors"] as const;

/** Extra LP investor rows not represented by an LP `deal_investment` (for deal list counts). */
export async function countExtraLpRosterOnlyByDealIds(
  dealIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(dealIds.filter(Boolean))];
  for (const id of ids) map.set(id, 0);
  if (ids.length === 0) return map;

  for (const dealId of ids) {
    const invContacts = await db
      .select({ contactId: dealInvestment.contactId })
      .from(dealInvestment)
      .where(
        and(
          eq(dealInvestment.dealId, dealId),
          inArray(dealInvestment.investor_role, [...LP_ROLE_SQL]),
        ),
      );
    const invKeys = new Set(
      invContacts.map((r) => normalizeContactKey(r.contactId ?? "")),
    );
    const rFull = await db
      .select({ contactMemberId: dealLpInvestor.contactMemberId })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, dealId));
    let n = 0;
    for (const r of rFull) {
      const k = normalizeContactKey(r.contactMemberId);
      if (k && !invKeys.has(k)) n += 1;
    }
    map.set(dealId, n);
  }
  return map;
}

const DEAL_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Distinct LP roster rows in `deal_lp_investor` per deal (one row per contact), scoped by viewer:
 * - Co-sponsor on a deal (and not Lead/Admin on that deal): rows whose Sponsor name
 *   (`added_by`) is this viewer or an equivalent portal account — not the full roster.
 * - Platform admin, unauthenticated-style callers (`scope` null), and LP-email–scoped investors:
 *   total rows per deal.
 * - Company users (sponsors, company admin, etc.): rows where `added_by` references a user whose
 *   `organization_id` matches the viewer’s organization.
 */
export async function countDealLpInvestorsByDealIdsForViewer(
  dealIds: string[],
  scope: DealViewerScope | null,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of dealIds) map.set(String(id), 0);

  const uuidIds = [
    ...new Set(
      dealIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => DEAL_ID_UUID_RE.test(id.toLowerCase())),
    ),
  ];
  if (uuidIds.length === 0) return map;

  const viewerUserId = String(scope?.userId ?? "").trim();
  let coSponsorOnlyDealIds: string[] = [];
  if (viewerUserId && scope && !scope.isPlatformAdmin) {
    const [coIds, leadIds] = await Promise.all([
      listDealIdsWhereViewerIsCoSponsor(viewerUserId),
      listDealIdsWhereViewerIsLeadOrAdminSponsor(viewerUserId),
    ]);
    const leadSet = new Set(leadIds);
    const coOnly = new Set(coIds.filter((id) => !leadSet.has(id)));
    coSponsorOnlyDealIds = uuidIds.filter((id) => coOnly.has(id));
  }

  if (coSponsorOnlyDealIds.length > 0) {
    const equiv = await listEquivalentPortalUserIdsForUser(viewerUserId);
    const sponsorIds = equiv.length > 0 ? equiv : [viewerUserId];
    const res = await pool.query<{ deal_id: string; cnt: string }>(
      `SELECT lp.deal_id::text, COUNT(*)::int AS cnt
       FROM deal_lp_investor lp
       WHERE lp.deal_id = ANY($1::uuid[])
         AND lp.added_by = ANY($2::uuid[])
       GROUP BY lp.deal_id`,
      [coSponsorOnlyDealIds, sponsorIds],
    );
    for (const row of res.rows) {
      map.set(row.deal_id, Number(row.cnt));
    }
  }

  const remainingIds = uuidIds.filter(
    (id) => !coSponsorOnlyDealIds.includes(id),
  );
  if (remainingIds.length === 0) return map;

  const useTotalRosterCount =
    scope == null ||
    scope.isPlatformAdmin === true ||
    scope.seesAllDeals === true ||
    Boolean(scope.lpInvestorEmailScopedDealIds?.length);

  if (useTotalRosterCount) {
    const res = await pool.query<{ deal_id: string; cnt: string }>(
      `SELECT deal_id::text, COUNT(*)::int AS cnt
       FROM deal_lp_investor
       WHERE deal_id = ANY($1::uuid[])
       GROUP BY deal_id`,
      [remainingIds],
    );
    for (const row of res.rows) {
      map.set(row.deal_id, Number(row.cnt));
    }
    return map;
  }

  const orgId = scope.organizationId?.trim() ?? "";
  if (!orgId || !DEAL_ID_UUID_RE.test(orgId.toLowerCase())) {
    return map;
  }

  const res = await pool.query<{ deal_id: string; cnt: string }>(
    `SELECT lp.deal_id::text, COUNT(*)::int AS cnt
     FROM deal_lp_investor lp
     INNER JOIN users adder ON adder.id = lp.added_by
     WHERE lp.deal_id = ANY($1::uuid[])
       AND adder.organization_id = $2::uuid
     GROUP BY lp.deal_id`,
    [remainingIds, orgId],
  );
  for (const row of res.rows) {
    map.set(row.deal_id, Number(row.cnt));
  }
  return map;
}

function normalizeCommittedAmountStored(raw: string): string {
  const t = String(raw ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!t) return "";
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

/** Matches portal investor profile keys (`deal_investment.profile_id`). */
const LP_COMMITMENT_PROFILE_IDS = new Set([
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc_corp_trust_etc",
]);

function normalizeLpCommitmentProfileId(
  raw: string | undefined,
): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  return LP_COMMITMENT_PROFILE_IDS.has(t) ? t : null;
}

/** Persist cumulative commitment as a plain numeric string (avoids float noise). */
function formatCumulativeCommitmentStored(total: number): string {
  if (!Number.isFinite(total) || total < 0) return "0";
  const rounded = Math.round(total * 100) / 100;
  return String(rounded);
}

async function sumLpDealInvestmentCommittedForContact(
  dealId: string,
  contactMemberId: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.dealId, dealId),
        eq(dealInvestment.contactId, contactMemberId),
      ),
    );
  let t = 0;
  for (const r of rows) {
    if (isLpInvestorRole(r.investor_role)) {
      t += committedNumericFromDealInvestmentRow(r);
    }
  }
  return formatCumulativeCommitmentStored(t);
}

/**
 * LP self-service: **adds** the submitted amount to the existing committed total on the latest
 * LP `deal_investment` for this deal + contact (locked row, single transaction). Creates a row
 * when missing (requires `profile_id` on first commit). If the request sends a **different**
 * commitment `profile_id` (individual / joint / …) than the locked row, a **new** `deal_investment`
 * is inserted for this tranche. Syncs `deal_lp_investor.committed_amount` to the sum of LP rows.
 */
export async function updateMyCommittedAmountForLpDeal(params: {
  dealId: string;
  viewerEmailNorm: string;
  /** JWT `sub` of the current viewer (used to link/create LP roster row from deal membership). */
  viewerUserId?: string;
  committedAmount: string;
  /** When set and valid, updates `deal_investment` + `deal_lp_investor`; required when no investment row exists yet. */
  profileId?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const e = String(params.viewerEmailNorm ?? "")
    .trim()
    .toLowerCase();
  if (!e.includes("@")) return { ok: false, message: "Invalid viewer email" };

  console.log("committed amount", params.committedAmount);

  const incrementStr = normalizeCommittedAmountStored(params.committedAmount);
  if (!incrementStr) {
    return {
      ok: false,
      message: "Additional commitment amount must be a number greater than 0",
    };
  }
  const increment = Number(incrementStr);
  if (!Number.isFinite(increment) || increment <= 0) {
    return {
      ok: false,
      message: "Additional commitment amount must be a number greater than 0",
    };
  }

  const rawProfile = String(params.profileId ?? "").trim();
  const profileOpt = normalizeLpCommitmentProfileId(
    rawProfile ? rawProfile : undefined,
  );
  if (rawProfile && !profileOpt) {
    return { ok: false, message: "Invalid investor profile." };
  }

  const viewerUserId = String(params.viewerUserId ?? "").trim();
  const resolvedContact = await resolveInvestNowViewerContactOnDeal({
      dealId: params.dealId,
      viewerEmailNorm: e,
      viewerUserId,
    });
  let target = resolvedContact.lpInvestorRow;
  const targetContactMemberId = resolvedContact.contactMemberId;
  if (!targetContactMemberId) {
    return {
      ok: false,
      message:
        "Could not link your account to this deal. Sign in with your investing email and try again.",
    };
  }

  const invCandidates = await db
    .select()
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.dealId, params.dealId),
        eq(dealInvestment.contactId, targetContactMemberId),
      ),
    )
    .orderBy(desc(dealInvestment.createdAt));

  let inv: DealInvestmentRow | undefined;
  for (const row of invCandidates) {
    if (isLpInvestorRole(row.investor_role)) {
      inv = row;
      break;
    }
  }
  const now = new Date();

  if (!inv) {
    if (!profileOpt) {
      return {
        ok: false,
        message:
          "Investor profile is required to record your first commitment on this deal.",
      };
    }
    const icRaw = target?.investorClass?.trim() ?? "";

    console.log("icRaw =>", icRaw);

    const classRes = icRaw
      ? await resolveInvestorClassForDealInvestment(params.dealId, icRaw)
      : await resolveFirstInvestorClassForDeal(params.dealId);
    if (!classRes.ok) return { ok: false, message: classRes.message };

    await insertDealInvestment({
      dealId: params.dealId,
      input: {
        offeringId: "",
        contactId: targetContactMemberId,
        contactDisplayName: "",
        profileId: profileOpt,
        investor_role: LP_INVESTOR_ROLE_STORED,
        fundApproved: false,
        status: "",
        investorClass: classRes.storedInvestorClass,
        docSignedDate: null,
        commitmentAmount: incrementStr,
        extraContributionAmounts: [],
        documentStoragePath: null,
      },
    });

    if (!target) {
      if (!viewerUserId) {
        return {
          ok: false,
          message:
            "Could not determine your account id for LP Investor linking.",
        };
      }
      target = await upsertDealLpInvestor(params.dealId, {
        contactMemberId: targetContactMemberId,
        contactDisplayName: "",
        profileId: profileOpt,
        investorClass: classRes.storedInvestorClass,
        sendInvitationMail: "no",
        addedByUserId: viewerUserId,
        emailFromClient: e,
        roleFromClient: LP_INVESTOR_TABLE_ROLE,
      });
      console.log("inside target", incrementStr);
    }
    await db
      .update(dealLpInvestor)
      .set({
        profileId: profileOpt,
        committed_amount: incrementStr,
        updatedAt: now,
      })
      .where(eq(dealLpInvestor.id, target.id));

    return { ok: true };
  }

  const oldKind = normalizeLpCommitmentProfileId(
    String(inv.profileId ?? ""),
  );
  const switchingCommitmentKind = Boolean(
    profileOpt && oldKind && profileOpt !== oldKind,
  );
  if (switchingCommitmentKind && profileOpt) {
    const rowProfileId = profileOpt;
    let roster: DealLpInvestorRow | undefined = target;
    if (!roster) {
      if (!viewerUserId) {
        return {
          ok: false,
          message:
            "Could not determine your account id for LP Investor linking.",
        };
      }
      const icRaw = inv.investorClass?.trim() ?? "";
      const classRes = icRaw
        ? await resolveInvestorClassForDealInvestment(
            params.dealId,
            icRaw,
          )
        : await resolveFirstInvestorClassForDeal(params.dealId);
      if (!classRes.ok) return { ok: false, message: classRes.message };
      roster = await upsertDealLpInvestor(params.dealId, {
        contactMemberId: targetContactMemberId,
        contactDisplayName: String(inv.contactDisplayName ?? "").trim() || "",
        profileId: rowProfileId,
        investorClass: classRes.storedInvestorClass,
        sendInvitationMail: "no",
        addedByUserId: viewerUserId,
        emailFromClient: e,
        roleFromClient: LP_INVESTOR_TABLE_ROLE,
      });
    }
    await insertDealInvestment({
      dealId: params.dealId,
      input: {
        offeringId: String(inv.offeringId ?? "").trim(),
        contactId: targetContactMemberId,
        contactDisplayName: String(inv.contactDisplayName ?? "").trim() || "",
        profileId: rowProfileId,
        userInvestorProfileId: null,
        investor_role: LP_INVESTOR_ROLE_STORED,
        fundApproved: false,
        status: "",
        investorClass: String(inv.investorClass ?? "").trim() || "",
        docSignedDate: null,
        commitmentAmount: incrementStr,
        extraContributionAmounts: [],
        documentStoragePath: null,
      },
    });
    const syncedSum = await sumLpDealInvestmentCommittedForContact(
      params.dealId,
      targetContactMemberId,
    );
    await db
      .update(dealLpInvestor)
      .set({
        committed_amount: syncedSum,
        updatedAt: now,
        profileId: rowProfileId,
      })
      .where(eq(dealLpInvestor.id, roster.id));
    return { ok: true };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT 1 FROM deal_investment WHERE id = ${inv.id}::uuid FOR UPDATE`,
      );
      const [fresh] = await tx
        .select()
        .from(dealInvestment)
        .where(eq(dealInvestment.id, inv.id))
        .limit(1);
      if (!fresh) {
        throw new Error("LP_COMMITMENT_ROW_MISSING");
      }
      const previous = committedNumericFromDealInvestmentRow(fresh);
      const newTotal = previous + increment;
      const wasFundApproved = Boolean(fresh.fundApproved);
      await tx
        .update(dealInvestment)
        .set({
          commitmentAmount: formatCumulativeCommitmentStored(newTotal),
          extraContributionAmounts: [],
          ...(profileOpt ? { profileId: profileOpt } : {}),
          ...(wasFundApproved
            ? { fundApproved: false, status: "" }
            : {}),
        })
        .where(eq(dealInvestment.id, inv.id));
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "LP_COMMITMENT_ROW_MISSING") {
      return {
        ok: false,
        message: "Could not update commitment (investment row missing).",
      };
    }
    throw e;
  }

  const [invAfterCommit] = await db
    .select({ commitmentAmount: dealInvestment.commitmentAmount })
    .from(dealInvestment)
    .where(eq(dealInvestment.id, inv.id))
    .limit(1);
  const syncedCommittedFromInvestment = String(
    invAfterCommit?.commitmentAmount ?? "",
  ).trim();

  if (!target) {
    if (!viewerUserId) {
      return {
        ok: false,
        message: "Could not determine your account id for LP roster linking.",
      };
    }
    const icRaw = inv.investorClass?.trim() ?? "";
    const classRes = icRaw
      ? await resolveInvestorClassForDealInvestment(params.dealId, icRaw)
      : await resolveFirstInvestorClassForDeal(params.dealId);
    if (!classRes.ok) return { ok: false, message: classRes.message };
    target = await upsertDealLpInvestor(params.dealId, {
      contactMemberId: targetContactMemberId,
      contactDisplayName: "",
      profileId: profileOpt ?? "",
      investorClass: classRes.storedInvestorClass,
      sendInvitationMail: "no",
      addedByUserId: viewerUserId,
      emailFromClient: e,
      roleFromClient: LP_INVESTOR_TABLE_ROLE,
    });
  }

  await db
    .update(dealLpInvestor)
    .set({
      committed_amount: syncedCommittedFromInvestment,
      updatedAt: now,
      ...(profileOpt ? { profileId: profileOpt } : {}),
    })
    .where(eq(dealLpInvestor.id, target.id));

  return { ok: true };
}
