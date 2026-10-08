import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";
import {
  resolveUserDisplayNamesByIds,
  resolveUserEmailsByIds,
} from "./dealInvestment.service.js";
import { loadUnredactedDealInvestors } from "./dealInvestorCommunicationRouting.service.js";
import { listDealMembersMappedToInvestorApi } from "./dealMember.service.js";
import { listEquivalentPortalUserIdsForUsers } from "./dealMemberScope.service.js";
import { loadCoSponsorEmailInterceptByUserLower } from "./dealCoSponsorEmailIntercept.service.js";

export type DealDocumentSharedAudience = {
  allInvestors: boolean;
  investorIds: string[];
  sponsorUserIds: string[];
  classIds: string[];
};

export type DealDocumentSharedRecipient = {
  toEmail: string;
  memberDisplayName?: string;
};

type InvestorLike = {
  id?: string;
  contactId?: string;
  profileId?: string;
  userInvestorProfileId?: string;
  offeringId?: string;
  displayName?: string;
  userDisplayName?: string;
  userEmail?: string;
  investorClass?: string;
  investorRole?: string;
  addedByUserId?: string;
  addedByEmail?: string;
  addedByDisplayName?: string;
  addedByIsCoSponsorOnDeal?: boolean;
};

function usableEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email.includes("@")) return "";
  if (email === "email unavailable" || email === "redacted") return "";
  return email;
}

function displayNameOf(row: InvestorLike): string | undefined {
  const name =
    String(row.displayName ?? "").trim() ||
    String(row.userDisplayName ?? "").trim();
  if (!name || name === "—") return undefined;
  return name;
}

function isLpApiRow(row: InvestorLike): boolean {
  const role = String(row.investorRole ?? "").trim().toLowerCase();
  if (
    role === "lp_investors" ||
    role === "lp investors" ||
    role === "lp investor"
  ) {
    return true;
  }
  const cls = String(row.investorClass ?? "").trim().toLowerCase();
  if (/\bgp\b|general partner/.test(cls)) return false;
  if (/\blp\b|limited partner/.test(cls)) return true;
  return (
    role !== "lead sponsor" &&
    role !== "admin sponsor" &&
    role !== "co-sponsor" &&
    role !== "co sponsor"
  );
}

function rowMatchKeys(row: InvestorLike): string[] {
  return [
    row.id,
    row.contactId,
    row.profileId,
    row.userInvestorProfileId,
    row.offeringId,
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function investorRowMatchesDealClass(
  row: InvestorLike,
  classId: string,
  classes: Array<{ id: string; name: string }>,
): boolean {
  const rowClass = String(row.investorClass ?? "").trim();
  if (!rowClass || rowClass === "—") return false;
  if (rowClass === classId) return true;
  const cls = classes.find((c) => c.id === classId);
  const className = String(cls?.name ?? "").trim();
  return Boolean(className && rowClass === className);
}

function hasAudienceSelection(audience: DealDocumentSharedAudience): boolean {
  return (
    audience.allInvestors ||
    audience.investorIds.length > 0 ||
    audience.sponsorUserIds.length > 0 ||
    audience.classIds.length > 0
  );
}

/**
 * Resolve Shared With recipients from deal data (unredacted emails).
 * Lead/admin UIs hide co-sponsor LP emails; this still emails those LPs.
 * When any co-sponsor LP is notified, that co-sponsor is notified too
 * (unless they are the sender). Co-sponsor LPs from “Sponsor user investors”
 * are included only when intercept is No intercept (`yes`).
 */
export async function resolveDealDocumentSharedRecipients(params: {
  dealId: string;
  viewerUserId: string;
  audience: DealDocumentSharedAudience;
  extraRecipients?: DealDocumentSharedRecipient[];
}): Promise<DealDocumentSharedRecipient[]> {
  const byEmail = new Map<string, DealDocumentSharedRecipient>();

  function add(emailRaw: unknown, name?: string) {
    const email = usableEmail(emailRaw);
    if (!email || byEmail.has(email)) return;
    const n = String(name ?? "").trim();
    byEmail.set(email, {
      toEmail: email,
      memberDisplayName: n && n !== "—" ? n : undefined,
    });
  }

  for (const extra of params.extraRecipients ?? []) {
    add(extra.toEmail, extra.memberDisplayName);
  }

  if (!hasAudienceSelection(params.audience)) {
    return [...byEmail.values()];
  }

  const [investors, members, classRows, interceptByUser, viewerEquivIds] =
    await Promise.all([
      loadUnredactedDealInvestors(params.dealId, params.viewerUserId),
      listDealMembersMappedToInvestorApi(params.dealId, params.viewerUserId),
      listInvestorClassesByDealId(params.dealId),
      loadCoSponsorEmailInterceptByUserLower(params.dealId),
      listEquivalentPortalUserIdsForUsers([params.viewerUserId]),
    ]);
  const classes = classRows.map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ""),
  }));
  const lpRows = (investors as InvestorLike[]).filter(isLpApiRow);
  const memberRows = members as InvestorLike[];
  const viewerKeys = new Set(
    [...viewerEquivIds, params.viewerUserId]
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );

  const includedLpRows: InvestorLike[] = [];

  function includeLp(row: InvestorLike) {
    includedLpRows.push(row);
    add(row.userEmail, displayNameOf(row));
  }

  async function addCoSponsorsForIncludedLps() {
    const missingEmailIds = new Set<string>();
    for (const row of includedLpRows) {
      const adder = String(row.addedByUserId ?? "").trim().toLowerCase();
      if (!adder || viewerKeys.has(adder)) continue;
      const isCo =
        row.addedByIsCoSponsorOnDeal === true || interceptByUser.has(adder);
      if (!isCo) continue;
      add(row.addedByEmail, row.addedByDisplayName);
      if (!usableEmail(row.addedByEmail)) missingEmailIds.add(adder);
    }
    if (missingEmailIds.size === 0) return;
    const ids = [...missingEmailIds];
    const [emailsById, namesById] = await Promise.all([
      resolveUserEmailsByIds(ids),
      resolveUserDisplayNamesByIds(ids),
    ]);
    for (const id of ids) {
      add(emailsById.get(id), namesById.get(id));
    }
  }

  if (params.audience.allInvestors) {
    for (const row of lpRows) includeLp(row);
    await addCoSponsorsForIncludedLps();
    return [...byEmail.values()];
  }

  const investorIdSet = new Set(
    params.audience.investorIds
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
  if (investorIdSet.size > 0) {
    for (const row of lpRows) {
      if (rowMatchKeys(row).some((k) => investorIdSet.has(k))) {
        includeLp(row);
      }
    }
  }

  for (const classId of params.audience.classIds) {
    const cid = classId.trim();
    if (!cid) continue;
    for (const row of lpRows) {
      if (investorRowMatchesDealClass(row, cid, classes)) {
        includeLp(row);
      }
    }
  }

  const sponsorSeeds = [
    ...new Set(
      params.audience.sponsorUserIds.map((id) => id.trim()).filter(Boolean),
    ),
  ];
  if (sponsorSeeds.length > 0) {
    const equivIds = await listEquivalentPortalUserIdsForUsers(sponsorSeeds);
    const sponsorKeys = new Set(
      [...sponsorSeeds, ...equivIds]
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    );

    for (const row of lpRows) {
      const adder = String(row.addedByUserId ?? "").trim().toLowerCase();
      if (!adder || !sponsorKeys.has(adder)) continue;
      if (interceptByUser.get(adder) === "no") continue;
      includeLp(row);
    }

    const [emailsById, namesById] = await Promise.all([
      resolveUserEmailsByIds([...sponsorKeys]),
      resolveUserDisplayNamesByIds([...sponsorKeys]),
    ]);
    for (const key of sponsorKeys) {
      add(emailsById.get(key), namesById.get(key));
    }

    for (const member of memberRows) {
      const keys = rowMatchKeys(member);
      if (keys.some((k) => sponsorKeys.has(k))) {
        add(member.userEmail, displayNameOf(member));
      }
    }
  }

  await addCoSponsorsForIncludedLps();
  return [...byEmail.values()];
}
