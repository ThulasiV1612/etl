import { eq, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { contact, dealMember } from "../../schema/schema.js";
import {
  dealLpInvestor,
  type DealLpInvestorRow,
} from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { resolveEmailForContactMemberId } from "./dealMemberInvitationEmail.service.js";

export type ResolveInvestNowViewerContactResult = {
  lpInvestorRow: DealLpInvestorRow | undefined;
  contactMemberId: string;
};

/**
 * Contact key for `deal_investment.contact_id` / `deal_lp_investor.contact_member_id`
 * when a signed-in LP starts or continues Invest Now.
 *
 * Self-service onboarding does not require the sponsor to add the investor first:
 * the portal user's id (or a contact row matching their email) is used and the
 * LP roster row is created on the first commitment save.
 */
export async function resolveInvestNowViewerContactOnDeal(params: {
  dealId: string;
  viewerEmailNorm: string;
  viewerUserId: string;
}): Promise<ResolveInvestNowViewerContactResult> {
  const dealId = String(params.dealId ?? "").trim();
  const email = String(params.viewerEmailNorm ?? "").trim().toLowerCase();
  const viewerUserId = String(params.viewerUserId ?? "").trim();

  const matchRows = await db
    .select()
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));

  let lpInvestorRow: DealLpInvestorRow | undefined;
  for (const row of matchRows) {
    const em = await resolveEmailForContactMemberId(row.contactMemberId);
    if (email && em === email) {
      lpInvestorRow = row;
      break;
    }
  }

  if (lpInvestorRow?.contactMemberId) {
    return {
      lpInvestorRow,
      contactMemberId: String(lpInvestorRow.contactMemberId).trim(),
    };
  }

  let contactMemberId = "";
  const preferred = new Set<string>();
  if (viewerUserId) preferred.add(viewerUserId);

  const byEmail =
    email.includes("@")
      ? await db
          .select({ id: contact.id })
          .from(contact)
          .where(sql`lower(trim(${contact.email})) = ${email}`)
      : [];

  for (const row of byEmail) {
    const cid = String(row.id ?? "").trim();
    if (cid) preferred.add(cid);
  }

  if (viewerUserId) {
    const memberRows = await db
      .select({ contactMemberId: dealMember.contactMemberId })
      .from(dealMember)
      .where(eq(dealMember.dealId, dealId));

    for (const row of memberRows) {
      const cid = String(row.contactMemberId ?? "").trim();
      if (!cid) continue;
      if (preferred.has(cid)) {
        contactMemberId = cid;
        break;
      }
    }

    if (!contactMemberId && email.includes("@")) {
      for (const row of memberRows) {
        const cid = String(row.contactMemberId ?? "").trim();
        if (!cid) continue;
        const em = await resolveEmailForContactMemberId(cid);
        if (em === email) {
          contactMemberId = cid;
          break;
        }
      }
    }
  }

  if (!contactMemberId && viewerUserId) {
    contactMemberId = viewerUserId;
  }
  if (!contactMemberId && byEmail.length > 0) {
    const cid = String(byEmail[0]?.id ?? "").trim();
    if (cid) contactMemberId = cid;
  }

  return { lpInvestorRow, contactMemberId };
}
