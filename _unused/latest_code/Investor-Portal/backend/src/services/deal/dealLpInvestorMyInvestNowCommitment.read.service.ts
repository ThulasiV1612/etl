import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import {
  parseInvestorQuestionnaireAnswersJson,
} from "./investorQuestionnaireAnswers.service.js";
import {
  parseInvestorW9FormJson,
  type InvestorW9FormData,
} from "./investorW9Form.service.js";
import { isLpInvestorRole } from "./dealInvestment.service.js";
import { resolveInvestNowViewerContactOnDeal } from "./dealInvestNowViewerContact.service.js";
import {
  isDocSignedEsignCompleted,
  isDocSignedEsignPending,
} from "../../constants/deal-doc-signed.js";

const DOC_SIGNED_ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function investNowCalendarDocSignedDate(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? "").trim();
  if (!s || isDocSignedEsignPending(s) || isDocSignedEsignCompleted(s)) {
    return null;
  }
  const day = s.slice(0, 10);
  return DOC_SIGNED_ISO_DAY_RE.test(day) ? day : null;
}

function normContactKey(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

export type MyInvestNowCommitmentReadResult =
  | {
      ok: true;
      investmentId: string;
      profileId: string;
      userInvestorProfileId: string;
      committedAmount: string;
      fundingMethod: string;
      investorClass: string;
      status: string;
      docSignedDate: string | null;
      questionnaireAnswers: Record<string, string>;
      w9Form: Omit<InvestorW9FormData, "ssn"> | null;
    }
  | { ok: false; message: string };

function w9FormForClient(
  raw: string | null | undefined,
): Omit<InvestorW9FormData, "ssn"> | null {
  const parsed = parseInvestorW9FormJson(raw);
  if (!parsed) return null;
  const { ssn: _omit, ...rest } = parsed;
  return rest;
}

export type ReadMyInvestNowCommitmentInput = {
  dealId: string;
  viewerEmailNorm: string;
  viewerUserId: string;
  investmentId?: string;
  userInvestorProfileId?: string;
  profileId?: string;
};

/**
 * Loads saved Invest Now progress for one book profile / investment row (LP viewer only).
 */
export async function readMyInvestNowCommitment(
  params: ReadMyInvestNowCommitmentInput,
): Promise<MyInvestNowCommitmentReadResult> {
  const dealId = String(params.dealId ?? "").trim();
  const email = String(params.viewerEmailNorm ?? "").trim().toLowerCase();
  if (!dealId) return { ok: false, message: "Missing deal id" };
  if (!email.includes("@")) return { ok: false, message: "Invalid viewer email" };

  const investmentId = String(params.investmentId ?? "").trim();
  const uip = String(params.userInvestorProfileId ?? "").trim();
  const profileId = String(params.profileId ?? "").trim();

  const viewerUserId = String(params.viewerUserId ?? "").trim();
  const { resolvePortalUserContactKeysOnDeal } = await import(
    "./dealMemberEsignStatus.service.js"
  );
  const contactKeys = await resolvePortalUserContactKeysOnDeal(dealId, {
    email,
    userId: viewerUserId,
  });
  const viewerContact = await resolveInvestNowViewerContactOnDeal({
    dealId,
    viewerEmailNorm: email,
    viewerUserId,
  });
  const viewerContactKey = normContactKey(viewerContact.contactMemberId);

  const rows = await db
    .select()
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, dealId))
    .orderBy(desc(dealInvestment.createdAt));

  const rowOwnedByViewer = (row: (typeof rows)[number]): boolean => {
    const cid = normContactKey(row.contactId);
    if (!cid) return false;
    if (contactKeys.has(cid)) return true;
    return Boolean(viewerContactKey && cid === viewerContactKey);
  };

  let match: (typeof rows)[number] | undefined;

  if (investmentId) {
    match = rows.find(
      (r) =>
        String(r.id).toLowerCase() === investmentId.toLowerCase() &&
        isLpInvestorRole(r.investor_role) &&
        rowOwnedByViewer(r),
    );
  } else {
    for (const r of rows) {
      if (!isLpInvestorRole(r.investor_role)) continue;
      if (!rowOwnedByViewer(r)) continue;
      if (uip) {
        const rowUip = String(r.userInvestorProfileId ?? "").trim().toLowerCase();
        if (rowUip !== uip.toLowerCase()) continue;
      }
      if (profileId && String(r.profileId ?? "").trim() !== profileId) continue;
      match = r;
      break;
    }
  }

  if (!match) {
    return {
      ok: false,
      message: "No saved investment progress was found for this profile on this deal.",
    };
  }

  const answers = parseInvestorQuestionnaireAnswersJson(
    match.investorQuestionnaireAnswersJson,
  );

  return {
    ok: true,
    investmentId: String(match.id),
    profileId: String(match.profileId ?? "").trim(),
    userInvestorProfileId: String(match.userInvestorProfileId ?? "").trim(),
    committedAmount: String(match.commitmentAmount ?? "").trim(),
    fundingMethod: String(match.fundingMethod ?? "").trim(),
    investorClass: String(match.investorClass ?? "").trim(),
    status: String(match.status ?? "").trim(),
    docSignedDate: investNowCalendarDocSignedDate(match.docSignedDate),
    questionnaireAnswers: answers ?? {},
    w9Form: w9FormForClient(match.investorW9FormJson),
  };
}
