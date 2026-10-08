import { and, desc, eq, or, sql, type AnyColumn } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  dealMember,
  type DealMemberRow,
} from "../../schema/deal.schema/deal-member.schema.js";
import {
  dealInvestment,
  type DealInvestmentRow,
} from "../../schema/deal.schema/deal-investment.schema.js";
import {
  dealLpInvestor,
  type DealLpInvestorRow,
} from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { users } from "../../schema/auth.schema/signin.js";
import { contact } from "../../schema/contact.schema.js";
import { assertEligibleForNewDealRosterAdd } from "../user/portalUserRosterGuard.service.js";
import {
  applyTotalCommittedToDealInvestmentRowForCanonical,
  enrichInvestorRolesForDealRows,
  formatCommittedUsdWhole,
  GENERAL_PARTNER_ROLE_STORED,
  groupDealInvestmentsByCanonicalKey,
  listDealInvestmentsByDealId,
  mapContactIdsToCanonicalCommitmentKeys,
  loadInvitationMailSentFlags,
  mapRowToInvestorApi,
  resolveUserDisplayNamesByIds,
  resolveUserInvestorProfileNamesByIds,
  resolveUsersByContactIds,
  rowIsGeneralPartnerForRoster,
  sumCommittedFromInvestorsAddedByMemberContacts,
  totalCommittedByCanonicalKeyFromRows,
  DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
} from "./dealInvestment.service.js";
import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";

export type UpsertDealMemberInput = {
  contactMemberId: string;
  dealMemberRole: string;
  sendInvitationMail: string;
  /** Set on insert only; not overwritten on conflict update. */
  addedByUserId: string;
};

/** Stored `deal_member.deal_member_role` for the single Lead Sponsor slot per deal. */
export const LEAD_SPONSOR_DEAL_MEMBER_ROLE = "Lead Sponsor";

function normalizeContactKey(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

function sendInvitationYesFromInput(raw: string | null | undefined): "yes" | "no" {
  return String(raw ?? "").toLowerCase() === "yes" ? "yes" : "no";
}

/**
 * On upsert, keep `send_invitation_mail = yes` when the client sends `no` (edit/autosave
 * default) so a prior successful invite is not cleared.
 */
export function sqlPreserveSendInvitationMailOnUpsert(
  incoming: string | null | undefined,
  existingColumn: AnyColumn,
) {
  const send = sendInvitationYesFromInput(incoming);
  return sql<string>`CASE WHEN ${send} = 'yes' THEN 'yes' WHEN lower(trim(coalesce(${existingColumn}, ''))) = 'yes' THEN 'yes' ELSE 'no' END`;
}

async function resolveInvitationMailContactKeys(input: {
  contactMemberId?: string;
  toEmail?: string;
}): Promise<string[]> {
  const contactKeys = new Set<string>();
  const cid = String(input.contactMemberId ?? "").trim();
  if (cid) contactKeys.add(normalizeContactKey(cid));

  const toEmail = String(input.toEmail ?? "").trim().toLowerCase();
  if (toEmail.includes("@")) {
    contactKeys.add(normalizeContactKey(toEmail));

    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${toEmail}`)
      .limit(1);
    if (u?.id) contactKeys.add(normalizeContactKey(String(u.id)));

    const [c] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(sql`lower(trim(${contact.email})) = ${toEmail}`)
      .limit(1);
    if (c?.id) contactKeys.add(normalizeContactKey(String(c.id)));
  }

  return [...contactKeys].filter(Boolean);
}

/**
 * Sets `send_invitation_mail = yes` on matching `deal_member` and `deal_lp_investor` rows
 * after a successful invite.
 */
export async function markDealMemberInvitationMailSent(
  dealId: string,
  input: { contactMemberId?: string; toEmail?: string },
): Promise<void> {
  const did = dealId.trim();
  if (!did) return;

  const keys = await resolveInvitationMailContactKeys(input);
  if (keys.length === 0) return;

  const now = new Date();
  const memberContactMatch = or(
    ...keys.map(
      (k) => sql`lower(trim(${dealMember.contactMemberId})) = ${k}`,
    ),
  );
  if (memberContactMatch) {
    await db
      .update(dealMember)
      .set({ sendInvitationMail: "yes", updatedAt: now })
      .where(and(eq(dealMember.dealId, did), memberContactMatch));
  }

  const lpContactMatch = or(
    ...keys.map(
      (k) => sql`lower(trim(${dealLpInvestor.contactMemberId})) = ${k}`,
    ),
  );
  if (lpContactMatch) {
    await db
      .update(dealLpInvestor)
      .set({ sendInvitationMail: "yes", updatedAt: now })
      .where(and(eq(dealLpInvestor.dealId, did), lpContactMatch));
  }
}

/** Canonical row for labels / ids when a contact has multiple investments (newest wins). */
function pickLatestInvestmentForDealMember(
  arr: DealInvestmentRow[],
): DealInvestmentRow | undefined {
  if (arr.length === 0) return undefined;
  return [...arr].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
}

function syntheticInvestmentFromDealMember(m: DealMemberRow): DealInvestmentRow {
  return {
    id: m.id,
    dealId: m.dealId,
    offeringId: "",
    contactId: m.contactMemberId,
    contactDisplayName: "",
    profileId: "",
    userInvestorProfileId: null,
    investor_role: m.dealMemberRole,
    fundApproved: false,
    fundApprovedBy: null,
    fundApprovedAt: null,
    fundApprovedCommitmentSnapshot: "",
    status: "",
    investorClass: "",
    docSignedDate: null,
    esignStatusJson: null,
    investorQuestionnaireAnswersJson: null,
    investorW9FormJson: null,
    fundingMethod: "",
    commitmentAmount: "",
    extraContributionAmounts: [],
    documentStoragePath: null,
    createdAt: m.createdAt,
  };
}

/** GP-class people who were stored on the LP roster still belong on General Partners. */
function syntheticInvestmentFromGpLpRoster(
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
    investor_role: GENERAL_PARTNER_ROLE_STORED,
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

type MemberListRowMeta = {
  addedBy: string | null;
  contactMemberId: string;
  investorKind?: "lp_roster";
};

/**
 * Upserts `(deal_id, contact_member_id)` when an investment is saved.
 * `added_by` is set on first insert only.
 */
export async function upsertDealMemberForDeal(
  dealId: string,
  input: UpsertDealMemberInput,
): Promise<void> {
  const cid = input.contactMemberId.trim();
  if (!cid) return;

  const [existing] = await db
    .select({ contactMemberId: dealMember.contactMemberId })
    .from(dealMember)
    .where(
      and(eq(dealMember.dealId, dealId), eq(dealMember.contactMemberId, cid)),
    )
    .limit(1);
  if (!existing) {
    await assertEligibleForNewDealRosterAdd(cid);
  }

  const send = sendInvitationYesFromInput(input.sendInvitationMail);
  const now = new Date();
  const role = input.dealMemberRole?.trim() ?? "";

  await db
    .insert(dealMember)
    .values({
      dealId,
      addedBy: input.addedByUserId,
      contactMemberId: cid,
      dealMemberRole: role,
      sendInvitationMail: send,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dealMember.dealId, dealMember.contactMemberId],
      set: {
        addedBy: sql`COALESCE(${dealMember.addedBy}, ${input.addedByUserId}::uuid)`,
        dealMemberRole: role,
        sendInvitationMail: sqlPreserveSendInvitationMailOnUpsert(
          input.sendInvitationMail,
          dealMember.sendInvitationMail,
        ),
        updatedAt: now,
      },
    });
}

/**
 * Adds the deal creator as Lead Sponsor on the roster when no other Lead Sponsor exists.
 */
export async function assignCreatorAsLeadSponsorOnDeal(
  dealId: string,
  creatorUserId: string,
): Promise<void> {
  const did = String(dealId ?? "").trim();
  const uid = String(creatorUserId ?? "").trim();
  if (!did || !uid) return;

  const [existingLeadSponsor] = await db
    .select({ contactMemberId: dealMember.contactMemberId })
    .from(dealMember)
    .where(
      and(
        eq(dealMember.dealId, did),
        sql`lower(trim(${dealMember.dealMemberRole})) = 'lead sponsor'`,
      ),
    )
    .limit(1);

  const existingContact = normalizeContactKey(
    existingLeadSponsor?.contactMemberId ?? "",
  );
  if (existingContact && existingContact !== normalizeContactKey(uid)) {
    return;
  }

  await upsertDealMemberForDeal(did, {
    contactMemberId: uid,
    dealMemberRole: LEAD_SPONSOR_DEAL_MEMBER_ROLE,
    sendInvitationMail: "no",
    addedByUserId: uid,
  });
}

/**
 * Lists deal members for the Deal Members tab: one row per `deal_member`, with
 * commitment = **sum** of all `deal_investment` rows for that contact on this deal,
 * and other fields from the **newest** matching investment when present.
 *
 * Co-sponsors do not use this list in the UI (General Partners tab is hidden);
 * the members API returns an empty roster for that role. Investors tab is scoped separately.
 */
export async function listDealMembersMappedToInvestorApi(
  dealId: string,
  _viewerUserId?: string | null,
): Promise<ReturnType<typeof mapRowToInvestorApi>[]> {
  const members = await db
    .select()
    .from(dealMember)
    .where(eq(dealMember.dealId, dealId))
    .orderBy(desc(dealMember.updatedAt));

  const [investments, classes, lpRoster] = await Promise.all([
    listDealInvestmentsByDealId(dealId),
    listInvestorClassesByDealId(dealId),
    db
      .select()
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, dealId)),
  ]);
  const allContactIdsForCanonical = [
    ...members.map((m) => m.contactMemberId),
    ...investments.map((inv) => inv.contactId),
    ...lpRoster.map((m) => m.contactMemberId),
  ];
  const rawToCanonical =
    await mapContactIdsToCanonicalCommitmentKeys(allContactIdsForCanonical);
  const totalByCanonical = totalCommittedByCanonicalKeyFromRows(
    investments,
    rawToCanonical,
  );
  const byCanonical = groupDealInvestmentsByCanonicalKey(
    investments,
    rawToCanonical,
  );

  function canonicalOf(raw: string): string {
    const k = normalizeContactKey(raw);
    if (!k) return "";
    return rawToCanonical.get(k) ?? `id:${k}`;
  }

  const rowsForMap: DealInvestmentRow[] = [];
  const rowMeta: MemberListRowMeta[] = [];
  const coveredCanonical = new Set<string>();

  for (const m of members) {
    const k = normalizeContactKey(m.contactMemberId);
    const canonicalKey = k
      ? rawToCanonical.get(k) ?? `id:${k}`
      : "id:__empty__";
    const arr = byCanonical.get(canonicalKey) ?? [];
    const rosterRole = m.dealMemberRole?.trim() ?? "";
    const picked = pickLatestInvestmentForDealMember(arr);
    const classForRow = picked?.investorClass ?? "";
    const effectiveRole = rowIsGeneralPartnerForRoster(
      rosterRole,
      classForRow,
      classes,
    )
      ? GENERAL_PARTNER_ROLE_STORED
      : rosterRole || picked?.investor_role;
    if (picked) {
      /** Roster role wins over `deal_investment.investor_role` (e.g. portal `deal_participant`). */
      const merged = applyTotalCommittedToDealInvestmentRowForCanonical(
        {
          ...picked,
          investor_role: effectiveRole || picked.investor_role,
        },
        totalByCanonical,
        canonicalKey,
      );
      rowsForMap.push(merged);
    } else {
      rowsForMap.push(
        applyTotalCommittedToDealInvestmentRowForCanonical(
          {
            ...syntheticInvestmentFromDealMember(m),
            investor_role: effectiveRole || rosterRole,
          },
          totalByCanonical,
          canonicalKey,
        ),
      );
    }
    rowMeta.push({
      addedBy: m.addedBy ?? null,
      contactMemberId: m.contactMemberId,
    });
    if (canonicalKey && canonicalKey !== "id:__empty__") {
      coveredCanonical.add(canonicalKey);
    }
  }

  for (const inv of investments) {
    const k = normalizeContactKey(inv.contactId ?? "");
    const canonical = k ? canonicalOf(k) : "";
    if (!canonical || coveredCanonical.has(canonical)) continue;
    if (
      !rowIsGeneralPartnerForRoster(inv.investor_role, inv.investorClass, classes)
    ) {
      continue;
    }
    rowsForMap.push(
      applyTotalCommittedToDealInvestmentRowForCanonical(
        { ...inv, investor_role: GENERAL_PARTNER_ROLE_STORED },
        totalByCanonical,
        canonical,
      ),
    );
    rowMeta.push({
      addedBy: null,
      contactMemberId: inv.contactId,
    });
    coveredCanonical.add(canonical);
  }

  for (const m of lpRoster) {
    const k = normalizeContactKey(m.contactMemberId);
    const canonical = k ? canonicalOf(k) : "";
    if (!canonical || coveredCanonical.has(canonical)) continue;
    if (!rowIsGeneralPartnerForRoster(m.role, m.investorClass, classes)) {
      continue;
    }
    rowsForMap.push(
      applyTotalCommittedToDealInvestmentRowForCanonical(
        syntheticInvestmentFromGpLpRoster(m),
        totalByCanonical,
        canonical,
      ),
    );
    rowMeta.push({
      addedBy: m.addedBy ?? null,
      contactMemberId: m.contactMemberId,
      investorKind: "lp_roster",
    });
    coveredCanonical.add(canonical);
  }

  const patched = await enrichInvestorRolesForDealRows(dealId, rowsForMap);
  const resolved = await resolveUsersByContactIds(patched);
  const profileNames = await resolveUserInvestorProfileNamesByIds(
    patched.map((r) => String(r.userInvestorProfileId ?? "")),
  );
  const addedByNames = await resolveUserDisplayNamesByIds(
    rowMeta.map((m) => m.addedBy),
  );

  const memberContactKeys = new Set<string>();
  for (const m of rowMeta) {
    const k = normalizeContactKey(m.contactMemberId);
    if (k) memberContactKeys.add(k);
  }
  const committedFromAddedInvestors =
    await sumCommittedFromInvestorsAddedByMemberContacts(
      dealId,
      memberContactKeys,
    );

  const invitationMailFlags = await loadInvitationMailSentFlags(
    dealId,
    patched,
    new Set<string>(),
  );

  return patched.map((r, i) => {
    const m = rowMeta[i];
    const invitationMailSent = invitationMailFlags[i] === true;
    const base = mapRowToInvestorApi(r, resolved, { invitationMailSent });
    const addedByRaw = m?.addedBy;
    const key = addedByRaw ? String(addedByRaw).toLowerCase() : "";
    const addedByDisplayName =
      key && addedByNames.has(key) ? addedByNames.get(key)! : "—";
    const memberCk = normalizeContactKey(m?.contactMemberId ?? "");
    const fromAdded = memberCk
      ? (committedFromAddedInvestors.get(memberCk) ?? 0)
      : 0;
    const profileKey = String(r.userInvestorProfileId ?? "")
      .trim()
      .toLowerCase();
    const userInvestorProfileName = profileKey
      ? profileNames.get(profileKey)
      : undefined;
    return {
      ...base,
      addedByDisplayName,
      addedInvestorsCommitted: formatCommittedUsdWhole(fromAdded),
      ...(userInvestorProfileName
        ? { userInvestorProfileName }
        : {}),
      ...(m?.investorKind ? { investorKind: m.investorKind } : {}),
    };
  });
}

/**
 * Removes a member from the deal roster. `rowId` is either `deal_investment.id`
 * (row merged with latest investment) or `deal_member.id` (member-only row).
 * When an investment id is passed, deletes all investments for that contact on
 * this deal, then the `deal_member` row.
 */
export async function deleteDealMemberRosterEntry(
  dealId: string,
  rowId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const invRows = await db
    .select()
    .from(dealInvestment)
    .where(
      and(eq(dealInvestment.id, rowId), eq(dealInvestment.dealId, dealId)),
    )
    .limit(1);

  if (invRows.length > 0) {
    const contactId = invRows[0]!.contactId.trim();
    if (!contactId) {
      await db
        .delete(dealInvestment)
        .where(
          and(eq(dealInvestment.id, rowId), eq(dealInvestment.dealId, dealId)),
        );
      return { ok: true };
    }
    await db
      .delete(dealInvestment)
      .where(
        and(eq(dealInvestment.dealId, dealId), eq(dealInvestment.contactId, contactId)),
      );
    await db
      .delete(dealMember)
      .where(
        and(eq(dealMember.dealId, dealId), eq(dealMember.contactMemberId, contactId)),
      );
    await db
      .delete(dealLpInvestor)
      .where(
        and(
          eq(dealLpInvestor.dealId, dealId),
          eq(dealLpInvestor.contactMemberId, contactId),
        ),
      );
    return { ok: true };
  }

  const deleted = await db
    .delete(dealMember)
    .where(and(eq(dealMember.id, rowId), eq(dealMember.dealId, dealId)))
    .returning({ id: dealMember.id });

  if (deleted.length > 0) return { ok: true };

  const lpRows = await db
    .select()
    .from(dealLpInvestor)
    .where(and(eq(dealLpInvestor.id, rowId), eq(dealLpInvestor.dealId, dealId)))
    .limit(1);

  if (lpRows.length > 0) {
    const contactId = String(lpRows[0]!.contactMemberId ?? "").trim();
    if (!contactId) {
      await db
        .delete(dealLpInvestor)
        .where(
          and(eq(dealLpInvestor.id, rowId), eq(dealLpInvestor.dealId, dealId)),
        );
      return { ok: true };
    }
    await db
      .delete(dealInvestment)
      .where(
        and(eq(dealInvestment.dealId, dealId), eq(dealInvestment.contactId, contactId)),
      );
    await db
      .delete(dealMember)
      .where(
        and(eq(dealMember.dealId, dealId), eq(dealMember.contactMemberId, contactId)),
      );
    await db
      .delete(dealLpInvestor)
      .where(
        and(
          eq(dealLpInvestor.dealId, dealId),
          eq(dealLpInvestor.contactMemberId, contactId),
        ),
      );
    return { ok: true };
  }

  return { ok: false, message: "Member or investment not found" };
}

function isLeadSponsorStoredRole(role: string | null | undefined): boolean {
  const t = String(role ?? "").trim().toLowerCase();
  return t === "lead sponsor" || t === "lead_sponsor";
}

function rosterPersonDisplayName(row: {
  displayName?: string;
  userDisplayName?: string;
}): string {
  const display = String(row.displayName ?? "").trim();
  if (display && display !== "—" && display !== "Draft") return display;
  const user = String(row.userDisplayName ?? "").trim();
  if (user && user !== "—") return user;
  return "";
}

/**
 * Lead sponsor person name for investor-facing surfaces (Invest Now, investments list).
 * Prefers `deal_member` Lead Sponsor; falls back to a matching `deal_investment` row.
 */
export async function resolveDealLeadSponsorDisplayName(
  dealId: string,
): Promise<string> {
  const d = String(dealId ?? "").trim();
  if (!d) return "";

  const members = await listDealMembersMappedToInvestorApi(d);
  const leadMember = members.find((m) =>
    isLeadSponsorStoredRole(m.investorRole),
  );
  if (leadMember) {
    const name = rosterPersonDisplayName(leadMember);
    if (name) return name;
  }

  const investments = await listDealInvestmentsByDealId(d);
  const leadInvestment = investments.find(
    (inv) =>
      isLeadSponsorStoredRole(inv.investor_role) &&
      String(inv.contactId ?? "").trim() !==
        DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
  );
  if (!leadInvestment) return "";

  const resolved = await resolveUsersByContactIds([leadInvestment]);
  const api = mapRowToInvestorApi(leadInvestment, resolved, {});
  return rosterPersonDisplayName(api);
}
