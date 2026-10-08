import {
  enrichInvestorApiRowsWithAddedBy,
  listDealInvestmentsByDealId,
  mapDealInvestmentsToInvestorApi,
} from "./dealInvestment.service.js";
import {
  enrichFullInvestorApiFromLpRoster,
  mergeDealLpRosterIntoFullInvestorRows,
} from "./dealLpInvestor.service.js";
import { listDealMembersMappedToInvestorApi } from "./dealMember.service.js";
import {
  isPortalUserCoSponsorOnDeal,
  listEquivalentPortalUserIdsForUser,
} from "./dealMemberScope.service.js";
import { normalizeCoSponsorEmailIntercept } from "./dealCoSponsorEmailIntercept.service.js";
import type { DealInvestorCommunicationRecipient } from "../../schema/deal.schema/deal-investor-communication-mail.schema.js";

function displayRoleLabel(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "—") return "—";
  const lower = t.toLowerCase().replace(/[_-]+/g, " ");
  if (lower === "lp investors" || lower === "lp investor") return "LP Investor";
  if (lower === "admin sponsor") return "Admin sponsor";
  if (lower === "co sponsor") return "Co-sponsor";
  if (lower === "lead sponsor") return "Lead Sponsor";
  if (lower === "deal member") return "General Partner";
  if (lower === "general partner") return "Team Member";
  return t;
}

function usableEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function isLpApiRow(row: {
  investorRole?: string;
  investorClass?: string;
}): boolean {
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
  return role !== "lead sponsor" && role !== "admin sponsor" && role !== "co-sponsor";
}

function roleIsAdminSponsor(role: string): boolean {
  return role.trim().toLowerCase() === "admin sponsor";
}

function roleIsCoSponsor(role: string): boolean {
  const t = role.trim().toLowerCase();
  return t === "co-sponsor" || t === "co sponsor";
}

function sourceRowIdFromRecipient(
  r: DealInvestorCommunicationRecipient & { sourceRowId?: string; sourceKind?: string },
): string {
  const explicit = String(r.sourceRowId ?? "").trim();
  if (explicit) return explicit;
  const id = String(r.id ?? "").trim();
  const m = /^(?:investor|member)-([0-9a-f-]{36})/i.exec(id);
  return m?.[1] ?? id;
}

export async function loadUnredactedDealInvestors(
  dealId: string,
  viewerUserId: string,
) {
  let rows = await listDealInvestmentsByDealId(dealId, { lpInvestorsOnly: false });
  rows = await mergeDealLpRosterIntoFullInvestorRows(dealId, rows);
  const mapped = await mapDealInvestmentsToInvestorApi(rows);
  const withLpRosterMeta = await enrichFullInvestorApiFromLpRoster(
    dealId,
    rows,
    mapped,
  );
  return enrichInvestorApiRowsWithAddedBy(dealId, withLpRosterMeta, viewerUserId);
}

export async function applyInvestorCommunicationDeliveryRouting(params: {
  dealId: string;
  senderId: string;
  recipients: DealInvestorCommunicationRecipient[];
}): Promise<{
  recipients: DealInvestorCommunicationRecipient[];
  deliveryEmails: string[];
}> {
  const { dealId, senderId, recipients } = params;
  if (recipients.length === 0) {
    return { recipients, deliveryEmails: [] };
  }

  const senderIsCoSponsor = await isPortalUserCoSponsorOnDeal(dealId, senderId);
  if (senderIsCoSponsor) {
    return restrictDeliveryToCoSponsorOwnLps({
      dealId,
      senderId,
      recipients,
    });
  }

  const [investors, members] = await Promise.all([
    loadUnredactedDealInvestors(dealId, senderId),
    listDealMembersMappedToInvestorApi(dealId, senderId),
  ]);
  const investorById = new Map(
    investors.map((row) => [String(row.id ?? "").trim().toLowerCase(), row]),
  );
  const memberById = new Map(
    members.map((row) => [String(row.id ?? "").trim().toLowerCase(), row]),
  );

  const delivery = new Set<string>();
  const out: DealInvestorCommunicationRecipient[] = [];
  const heldSponsorEmails = new Set<string>();

  for (const selected of recipients) {
    const rowId = sourceRowIdFromRecipient(selected).toLowerCase();
    const investor = investorById.get(rowId);
    const member = memberById.get(rowId);
    const row = investor ?? member;
    if (!row) {
      const fallback = usableEmail(selected.email) || usableEmail(selected.sponsorEmail);
      if (fallback) delivery.add(fallback);
      out.push(selected);
      continue;
    }

    const displayName =
      String(row.displayName ?? "").trim() ||
      String(row.userDisplayName ?? "").trim() ||
      usableEmail(row.userEmail) ||
      selected.displayName;
    const lpEmail = usableEmail(row.userEmail);
    const sponsorEmail = usableEmail(
      (row as { addedByEmail?: string }).addedByEmail,
    );
    const sponsorName = String(
      (row as { addedByDisplayName?: string }).addedByDisplayName ?? "",
    ).trim();
    const addedByUserId = String(
      (row as { addedByUserId?: string }).addedByUserId ?? "",
    ).trim();
    const isCoAdded =
      (row as { addedByIsCoSponsorOnDeal?: boolean }).addedByIsCoSponsorOnDeal ===
      true;
    const intercept = normalizeCoSponsorEmailIntercept(
      (row as { addedByCoSponsorEmailIntercept?: string })
        .addedByCoSponsorEmailIntercept,
    );
    const roleLabel = displayRoleLabel(
      String(row.investorRole ?? "").trim() || selected.roleLabel || "—",
    );
    const classKind = isLpApiRow(row) ? "lp" : "gp";
    const holdAtCoSponsor =
      classKind === "lp" && isCoAdded && intercept === "no";
    const passThroughWithCoSponsor =
      classKind === "lp" && isCoAdded && intercept === "yes";

    if (holdAtCoSponsor) {
      if (sponsorEmail) {
        delivery.add(sponsorEmail);
        heldSponsorEmails.add(sponsorEmail);
      }
      continue;
    }

    if (passThroughWithCoSponsor) {
      if (lpEmail) delivery.add(lpEmail);
      else if (usableEmail(selected.email)) delivery.add(usableEmail(selected.email));
      if (sponsorEmail) delivery.add(sponsorEmail);
      out.push({
        ...selected,
        displayName,
        email: lpEmail || usableEmail(selected.email),
        groups: selected.groups?.length ? selected.groups : ["investor"],
        roleLabel,
        classKind,
        requiresCosponsorRelease: undefined,
        sponsorName: sponsorName || undefined,
        sponsorEmail: sponsorEmail || undefined,
        addedByUserId: addedByUserId || undefined,
        addedByIsCoSponsor: true,
        sourceRowId: sourceRowIdFromRecipient(selected) || undefined,
        sourceKind: "investor",
      });
      continue;
    }

    const memberRole = String(row.investorRole ?? "");
    if (roleIsAdminSponsor(memberRole) || roleIsCoSponsor(memberRole)) {
      if (lpEmail) delivery.add(lpEmail);
      out.push({
        ...selected,
        displayName,
        email: lpEmail || selected.email,
        groups: selected.groups?.includes("deal_member")
          ? selected.groups
          : ["deal_member"],
        roleLabel,
        classKind: "gp",
      });
      continue;
    }

    if (lpEmail) delivery.add(lpEmail);
    else if (usableEmail(selected.email)) delivery.add(usableEmail(selected.email));
    out.push({
      ...selected,
      displayName,
      email: lpEmail || selected.email,
      groups: selected.groups?.length ? selected.groups : ["investor"],
      roleLabel,
      classKind,
      requiresCosponsorRelease: undefined,
      sponsorName: sponsorName || undefined,
      sponsorEmail: sponsorEmail || undefined,
      addedByUserId: addedByUserId || undefined,
    });
  }

  for (const sponsorEmail of heldSponsorEmails) {
    const existing = out.find(
      (r) => usableEmail(r.email) === sponsorEmail && r.classKind === "gp",
    );
    if (existing) {
      existing.heldLpReleasePending = true;
      continue;
    }
    const member = members.find(
      (row) => usableEmail(row.userEmail) === sponsorEmail,
    );
    out.push({
      id: `held-cosponsor-${sponsorEmail}`,
      displayName:
        String(member?.displayName ?? member?.userDisplayName ?? "").trim() ||
        sponsorEmail,
      email: sponsorEmail,
      groups: ["deal_member"],
      roleLabel: "Co-sponsor",
      classKind: "gp",
      sponsorEmail,
      heldLpReleasePending: true,
      addedByIsCoSponsor: true,
    });
  }

  return { recipients: out, deliveryEmails: [...delivery] };
}

async function restrictDeliveryToCoSponsorOwnLps(params: {
  dealId: string;
  senderId: string;
  recipients: DealInvestorCommunicationRecipient[];
}): Promise<{
  recipients: DealInvestorCommunicationRecipient[];
  deliveryEmails: string[];
}> {
  const { dealId, senderId, recipients } = params;
  const [investors, equivIds] = await Promise.all([
    loadUnredactedDealInvestors(dealId, senderId),
    listEquivalentPortalUserIdsForUser(senderId),
  ]);
  const ownerIds = new Set(
    equivIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
  );
  const ownerEmails = new Set(
    investors
      .filter((row) => {
        const uid = String(
          (row as { addedByUserId?: string }).addedByUserId ?? "",
        )
          .trim()
          .toLowerCase();
        return Boolean(uid && ownerIds.has(uid));
      })
      .map((row) => usableEmail((row as { addedByEmail?: string }).addedByEmail))
      .filter(Boolean),
  );
  const ownLps = investors.filter((row) => {
    if (!isLpApiRow(row)) return false;
    const uid = String(
      (row as { addedByUserId?: string }).addedByUserId ?? "",
    )
      .trim()
      .toLowerCase();
    const sponsor = usableEmail(
      (row as { addedByEmail?: string }).addedByEmail,
    );
    return (
      (uid && ownerIds.has(uid)) || (sponsor && ownerEmails.has(sponsor))
    );
  });
  const allowedLpEmails = new Set(
    ownLps.map((row) => usableEmail(row.userEmail)).filter(Boolean),
  );
  const allowedRowIds = new Set(
    ownLps
      .map((row) => String(row.id ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  const scoped: DealInvestorCommunicationRecipient[] = [];
  for (const r of recipients) {
    if (r.classKind === "gp") continue;
    const addedBy = String(r.addedByUserId ?? "").trim().toLowerCase();
    const sponsor = usableEmail(r.sponsorEmail);
    const email = usableEmail(r.email);
    const rowId = sourceRowIdFromRecipient(r).toLowerCase();
    const owned =
      (addedBy && ownerIds.has(addedBy)) ||
      (sponsor && ownerEmails.has(sponsor)) ||
      (rowId && allowedRowIds.has(rowId)) ||
      (email && allowedLpEmails.has(email));
    if (!owned) continue;
    scoped.push({
      ...r,
      classKind: "lp",
      groups: r.groups?.length ? r.groups : ["investor"],
      requiresCosponsorRelease: undefined,
    });
  }

  const deliveryEmails = [
    ...new Set(scoped.map((r) => usableEmail(r.email)).filter(Boolean)),
  ];
  return { recipients: scoped, deliveryEmails };
}
