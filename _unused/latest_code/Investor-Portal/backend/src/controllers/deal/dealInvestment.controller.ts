import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { reconcileAssigningDealUsersForDeal } from "../../services/deal/assigningDealUser.service.js";
import {
  enrichFullInvestorApiFromLpRoster,
  filterMergedLpInvestorsForCoSponsorViewer,
  getLpInvestorsTabPayload,
  shouldScopeInvestorsToCoSponsorAddedOnly,
  mergeDealLpRosterIntoFullInvestorRows,
} from "../../services/deal/dealLpInvestor.service.js";
import {
  buildInvestorKpisFromRows,
  DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
  enrichInvestorApiRowsWithAddedBy,
  redactCoSponsorAddedInvestorEmailsForLeadAdminViewer,
  getDealInvestmentById,
  getLatestCommitmentAmountForDealContact,
  insertDealInvestment,
  isLpInvestorRole,
  listDealInvestmentsByDealId,
  mapDealInvestmentsToInvestorApi,
  resolveInvestorClassForDealInvestment,
  saveSubscriptionDocument,
  updateDealInvestment,
} from "../../services/deal/dealInvestment.service.js";
import { sendDealFundApprovedNotification } from "../../services/deal/dealFundApprovedEmail.service.js";
import { upsertDealMemberForDeal } from "../../services/deal/dealMember.service.js";
import {
  assertEligibleForNewDealRosterAdd,
  isDealRosterEligibilityError,
} from "../../services/user/portalUserRosterGuard.service.js";
import { sendDealMemberInviteForInvestmentIfRequested } from "../../services/deal/dealMemberInvitationEmail.service.js";
import { viewerCanApproveDealFundOnDeal } from "../../services/deal/dealMemberScope.service.js";
import { dealInvestmentEsignIsFullyCompleted } from "../../constants/deal-investor-esign-status.js";
import { logSocDealInvestmentWrite } from "../../audit/index.js";
import { assertExtraCompanyUserAllowedForAdd } from "../../services/billing/dealExtraCompanyUser.service.js";
import { EXTRA_COMPANY_USER_PAYMENT_REQUIRED } from "../../config/stripe.config.js";

const FUND_APPROVAL_FORBIDDEN_MESSAGE =
  "Only the lead sponsor, admin sponsor, or company admin can approve the fund.";
const FUND_APPROVAL_REQUIRES_ESIGN_MESSAGE =
  "Complete e-sign before approving the fund.";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  // multipart parsers may expose duplicate keys as string[]
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

function parseExtras(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) return j.map((x) => String(x));
    } catch {
      /* ignore */
    }
  }
  return [];
}

function isAutosaveBody(b: Record<string, unknown>): boolean {
  const v = bodyString(b.autosave);
  return v === "true" || v === "1" || v.toLowerCase() === "yes";
}

/** Deal Members roster adds may omit class; investments with an explicit class are validated. */
async function resolveDealInvestmentInvestorClass(
  dealId: string,
  investorClass: string,
) {
  const trimmed = investorClass.trim();
  if (!trimmed) {
    return resolveInvestorClassForDealInvestment(dealId, investorClass, {
      optional: true,
    });
  }
  return resolveInvestorClassForDealInvestment(dealId, investorClass);
}

/** Multipart / JSON: optional `fund_approved` / `fundApproved`; preserves `fallback` when absent. */
function fundApprovedFromRequestBody(
  b: Record<string, unknown>,
  fallback: boolean,
): boolean {
  const has =
    Object.prototype.hasOwnProperty.call(b, "fund_approved") ||
    Object.prototype.hasOwnProperty.call(b, "fundApproved");
  if (!has) return fallback;
  const raw = (b as { fund_approved?: unknown; fundApproved?: unknown })
    .fund_approved ?? (b as { fundApproved?: unknown }).fundApproved;
  if (typeof raw === "boolean") return raw;
  const s = bodyString(raw).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

async function rejectIfExtraCompanyUserUnpaid(
  res: Response,
  params: { dealId: string; contactId: string; investorRole: string },
): Promise<boolean> {
  const check = await assertExtraCompanyUserAllowedForAdd(params);
  if (check.ok) return false;
  if (check.payload.code === EXTRA_COMPANY_USER_PAYMENT_REQUIRED) {
    res.status(check.status).json(check.payload);
    return true;
  }
  res.status(check.status).json({ message: check.payload.message });
  return true;
}

export async function getDealInvestors(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string" ? req.params.dealId : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const q = req.query as Record<string, unknown>;
    const lpRaw = q.lpInvestorsOnly ?? q.lp_investors_only ?? q.lp;
    const lpInvestorsOnly =
      lpRaw === "1" ||
      lpRaw === "true" ||
      String(lpRaw).toLowerCase() === "yes";
    if (lpInvestorsOnly) {
      const { kpis, investors } = await getLpInvestorsTabPayload(
        dealId,
        user.id,
      );
      res.status(200).json({ kpis, investors });
      return;
    }
    try {
      const { syncDealInvestorEsignStatusesForDeal } = await import(
        "../../services/deal/dealMemberEsignCompletion.service.js"
      );
      await syncDealInvestorEsignStatusesForDeal(dealId);
    } catch (err) {
      console.warn("syncDealInvestorEsignStatusesForDeal:", err);
    }
    let rows = await listDealInvestmentsByDealId(dealId, {
      lpInvestorsOnly: false,
    });
    rows = await mergeDealLpRosterIntoFullInvestorRows(dealId, rows);
    if (await shouldScopeInvestorsToCoSponsorAddedOnly(dealId, user.id)) {
      rows = await filterMergedLpInvestorsForCoSponsorViewer(
        dealId,
        user.id,
        rows,
      );
    }
    const mapped = await mapDealInvestmentsToInvestorApi(rows);
    const withLpRosterMeta = await enrichFullInvestorApiFromLpRoster(
      dealId,
      rows,
      mapped,
    );
    const withAddedBy = await enrichInvestorApiRowsWithAddedBy(
      dealId,
      withLpRosterMeta,
      user.id,
    );
    const investors = await redactCoSponsorAddedInvestorEmailsForLeadAdminViewer(
      dealId,
      user.id,
      withAddedBy,
    );
    const kpis = buildInvestorKpisFromRows(rows);
    res.status(200).json({
      kpis,
      investors,
    });
  } catch (err) {
    console.error("getDealInvestors:", err);
    res.status(500).json({ message: "Could not load investors" });
  }
}

/**
 * GET /deals/:dealId/commitment-amount?contact_id=...
 * Isolated lookup: latest stored `commitment_amount` for this deal + contact (viewer-scoped).
 */
export async function getDealCommitmentAmountByContact(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const q = req.query as Record<string, unknown>;
  const contactId = bodyString(q.contact_id ?? q.contactId).trim();

  if (!dealId?.trim()) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  if (!contactId) {
    res
      .status(400)
      .json({ message: "Missing contact_id query parameter" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const commitmentAmount = await getLatestCommitmentAmountForDealContact(
      dealId.trim(),
      contactId,
    );
    res.status(200).json({
      dealId: dealId.trim(),
      contactId,
      commitmentAmount,
      found: commitmentAmount != null,
    });
  } catch (err) {
    console.error("getDealCommitmentAmountByContact:", err);
    res.status(500).json({ message: "Could not load commitment amount" });
  }
}

export async function putDealInvestment(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const investmentId =
    typeof req.params.investmentId === "string"
      ? req.params.investmentId
      : req.params.investmentId?.[0];
  if (!dealId || !investmentId) {
    res.status(400).json({ message: "Missing deal id or investment id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const autosave = isAutosaveBody(b);
  const offeringId = bodyString(b.offering_id);
  let contactId = bodyString(b.contact_id);
  const contactDisplayName = bodyString(b.contact_display_name);
  const contactEmail = bodyString(
    b.contact_email ?? b.contactEmail ?? b.email,
  );
  const profileId = bodyString(b.profile_id);
  const userInvestorProfileIdFromBody = bodyString(
    b.user_investor_profile_id ?? b.userInvestorProfileId,
  ).trim();
  const hasUipInBody =
    Object.prototype.hasOwnProperty.call(b, "user_investor_profile_id") ||
    Object.prototype.hasOwnProperty.call(b, "userInvestorProfileId");
  const investor_role = bodyString(b.investor_role);
  const status = bodyString(b.status);
  const investorClass = bodyString(b.investor_class);
  const docSignedDate = bodyString(b.doc_signed_date) || null;
  let commitmentAmount = bodyString(b.commitment_amount);
  const extraContributionAmounts = parseExtras(b.extra_contribution_amounts);
  const sendInvitationMailRaw = bodyString(b.send_invitation_mail);
  /** Autosave updates draft rows only; invitation mail is persisted/sent on explicit Save. */
  const sendInvitationMail = autosave ? "no" : sendInvitationMailRaw;

  if (autosave) {
    if (!contactId.trim()) {
      contactId = DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER;
    }
    if (!commitmentAmount.trim()) {
      commitmentAmount = "0";
    }
  } else {
    if (!contactId.trim()) {
      res.status(400).json({ message: "Member (contact) is required" });
      return;
    }
    if (!commitmentAmount.trim()) {
      res.status(400).json({ message: "Commitment amount is required" });
      return;
    }
  }

  const file = req.file;
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const classResolution = await resolveDealInvestmentInvestorClass(
      dealId,
      investorClass,
    );
    if (!classResolution.ok) {
      res.status(400).json({ message: classResolution.message });
      return;
    }
    const resolvedInvestorClass = classResolution.storedInvestorClass;

    const existing = await getDealInvestmentById(dealId, investmentId);
    if (!existing) {
      res.status(404).json({ message: "Investment not found" });
      return;
    }

    const contactIsPlaceholder =
      contactId.trim() === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER;
    if (!contactIsPlaceholder) {
      const prevContactId = String(existing.contactId ?? "").trim();
      if (prevContactId.toLowerCase() !== contactId.trim().toLowerCase()) {
        await assertEligibleForNewDealRosterAdd(contactId.trim());
      }
    }
    if (
      await rejectIfExtraCompanyUserUnpaid(res, {
        dealId,
        contactId,
        investorRole: investor_role,
      })
    ) {
      return;
    }

    const fundApproved = fundApprovedFromRequestBody(b, existing.fundApproved);
    const fundApprovedBecameTrue = fundApproved && !existing.fundApproved;
    if (fundApprovedBecameTrue) {
      if (
        !(await viewerCanApproveDealFundOnDeal({
          dealId,
          userId: user.id,
          userRole: user.userRole,
        }))
      ) {
        res.status(403).json({ message: FUND_APPROVAL_FORBIDDEN_MESSAGE });
        return;
      }
      if (
        !dealInvestmentEsignIsFullyCompleted({
          esignStatusJson: existing.esignStatusJson,
          docSignedDate: existing.docSignedDate,
          profileId: existing.profileId,
        })
      ) {
        res.status(400).json({ message: FUND_APPROVAL_REQUIRES_ESIGN_MESSAGE });
        return;
      }
    }
    const fundApprovedBy = fundApproved
      ? fundApprovedBecameTrue
        ? user.id
        : String(existing.fundApprovedBy ?? "").trim() || user.id
      : null;
    const fundApprovedAt = fundApproved
      ? fundApprovedBecameTrue
        ? new Date()
        : existing.fundApprovedAt ?? new Date()
      : null;

    let documentStoragePath: string | null = existing.documentStoragePath;
    if (file && "buffer" in file && file.buffer && file.buffer.length > 0) {
      documentStoragePath = await saveSubscriptionDocument({
        dealId,
        file: {
          buffer: file.buffer,
          originalname: file.originalname || "document",
        },
      });
    }

    const oldUip = String(existing.userInvestorProfileId ?? "").trim();
    const newUip = userInvestorProfileIdFromBody;
    const switchingBookProfile =
      !autosave &&
      Boolean(oldUip) &&
      Boolean(newUip) &&
      oldUip.toLowerCase() !== newUip.toLowerCase();

    const row = switchingBookProfile
      ? await insertDealInvestment({
          dealId,
          input: {
            offeringId,
            contactId,
            contactDisplayName,
            profileId,
            userInvestorProfileId: newUip,
            investor_role,
            fundApproved,
            fundApprovedBy,
            fundApprovedAt,
            status,
            investorClass: resolvedInvestorClass,
            docSignedDate,
            commitmentAmount,
            extraContributionAmounts,
            documentStoragePath,
          },
        })
      : await updateDealInvestment({
          dealId,
          investmentId,
          input: {
            offeringId,
            contactId,
            contactDisplayName,
            profileId,
            ...(hasUipInBody
              ? { userInvestorProfileId: userInvestorProfileIdFromBody || null }
              : {}),
            investor_role,
            fundApproved,
            fundApprovedBy,
            fundApprovedAt,
            status,
            investorClass: resolvedInvestorClass,
            docSignedDate,
            commitmentAmount,
            extraContributionAmounts,
            documentStoragePath,
          },
        });
    if (!row) {
      res.status(404).json({ message: "Investment not found" });
      return;
    }
    if (!contactIsPlaceholder && !isLpInvestorRole(investor_role)) {
      await upsertDealMemberForDeal(dealId, {
        contactMemberId: contactId,
        dealMemberRole: investor_role,
        sendInvitationMail,
        addedByUserId: user.id,
      });
    }
    await reconcileAssigningDealUsersForDeal(dealId, user.id);
    /* Invitation email only on explicit Save — not on debounced autosave (would spam). */
    if (!autosave && !contactIsPlaceholder) {
      await sendDealMemberInviteForInvestmentIfRequested({
        dealId,
        contactId,
        contactDisplayName: contactDisplayName.trim(),
        sendInvitationMail,
        dealMemberRole: investor_role,
         contactEmail: contactEmail.trim() || null,
        invitationSource: "deal_member",
      });
    }
    const fundNewlyApproved =
      fundApproved &&
      !autosave &&
      !contactIsPlaceholder &&
      (switchingBookProfile || !existing.fundApproved);
    if (fundNewlyApproved) {
      await sendDealFundApprovedNotification({
        dealId,
        contactId,
        contactDisplayName: contactDisplayName.trim(),
      });
    }
    const [investor] = await mapDealInvestmentsToInvestorApi([row]);
    if (!autosave) {
      const fundApprovalChanged =
        Boolean(existing.fundApproved) !== Boolean(row.fundApproved);
      logSocDealInvestmentWrite({
        operation: switchingBookProfile ? "create" : "update",
        actorUserId: user.id,
        dealId,
        investmentId: row.id,
        fundApproved: Boolean(row.fundApproved),
        fundApprovalChanged: switchingBookProfile ? undefined : fundApprovalChanged,
        subscriptionDocumentAttached: Boolean(documentStoragePath),
      });
    }
    console.log("[putDealInvestment] saved to database", {
      deal_investment: {
        id: row.id,
        deal_id: row.dealId,
        offering_id: row.offeringId,
        contact_id: row.contactId,
        contact_display_name: row.contactDisplayName,
        profile_id: row.profileId,
        investor_role: row.investor_role,
        status: row.status,
        fund_approved: row.fundApproved,
        investor_class: row.investorClass,
        doc_signed_date: row.docSignedDate,
        commitment_amount: row.commitmentAmount,
        extra_contribution_amounts: row.extraContributionAmounts,
        document_storage_path: row.documentStoragePath ?? null,
      },
      deal_member_upsert: {
        deal_id: dealId,
        added_by: user.id,
        contact_member_id: contactId,
        deal_member_role: investor_role,
        send_invitation_mail: sendInvitationMail,
      },
    });
    if (switchingBookProfile) {
      res.status(201).json({
        message: "Investment recorded for this profile; previous commitment row kept.",
        investor,
      });
    } else {
      res.status(200).json({
        message: "Investment updated",
        investor,
      });
    }
  } catch (err) {
    if (isDealRosterEligibilityError(err)) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("putDealInvestment:", err);
    res.status(500).json({ message: "Could not update investment" });
  }
}

export async function postDealInvestment(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const dealId =
    typeof req.params.dealId === "string" ? req.params.dealId : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const autosave = isAutosaveBody(b);
  const offeringId = bodyString(b.offering_id);
  let contactId = bodyString(b.contact_id);
  const contactDisplayName = bodyString(b.contact_display_name);
  const contactEmail = bodyString(
    b.contact_email ?? b.contactEmail ?? b.email,
  );
  const profileId = bodyString(b.profile_id);
  const userInvestorProfileId = bodyString(
    b.user_investor_profile_id ?? b.userInvestorProfileId,
  ).trim();
  const investor_role = bodyString(b.investor_role);

  const status = bodyString(b.status);
  const investorClass = bodyString(b.investor_class);
  const docSignedDate = bodyString(b.doc_signed_date) || null;
  let commitmentAmount = bodyString(b.commitment_amount);
  const extraContributionAmounts = parseExtras(b.extra_contribution_amounts);
  const sendInvitationMailRaw = bodyString(b.send_invitation_mail);
  /** Autosave updates draft rows only; invitation mail is persisted/sent on explicit Save. */
  const sendInvitationMail = autosave ? "no" : sendInvitationMailRaw;

  if (isLpInvestorRole(investor_role)) {
    res.status(400).json({
      message:
        "LP investors are stored in deal_lp_investor. Use POST /deals/:dealId/lp-investors (JSON), not POST .../investments.",
    });
    return;
  }

  if (autosave) {
    if (!contactId.trim()) {
      contactId = DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER;
    }
    if (!commitmentAmount.trim()) {
      commitmentAmount = "0";
    }
  } else {
    if (!contactId.trim()) {
      res.status(400).json({ message: "Member (contact) is required" });
      return;
    }
    if (!commitmentAmount.trim()) {
      res.status(400).json({ message: "Commitment amount is required" });
      return;
    }
  }

  const file = req.file;
  let documentStoragePath: string | null = null;

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const classResolution = await resolveDealInvestmentInvestorClass(
      dealId,
      investorClass,
    );
    if (!classResolution.ok) {
      res.status(400).json({ message: classResolution.message });
      return;
    }
    const resolvedInvestorClass = classResolution.storedInvestorClass;

    const contactIsPlaceholder =
      contactId.trim() === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER;
    if (!contactIsPlaceholder) {
      await assertEligibleForNewDealRosterAdd(contactId.trim());
    }
    if (
      await rejectIfExtraCompanyUserUnpaid(res, {
        dealId,
        contactId,
        investorRole: investor_role,
      })
    ) {
      return;
    }

    const fundApproved = fundApprovedFromRequestBody(b, false);
    if (fundApproved && !autosave) {
      if (
        !(await viewerCanApproveDealFundOnDeal({
          dealId,
          userId: user.id,
          userRole: user.userRole,
        }))
      ) {
        res.status(403).json({ message: FUND_APPROVAL_FORBIDDEN_MESSAGE });
        return;
      }
      const esignStatusJson = bodyString(b.esignStatusJson ?? b.esign_status_json);
      const docSignedDate = bodyString(b.docSignedDate ?? b.doc_signed_date);
      const profileId = bodyString(b.profileId ?? b.profile_id);
      if (
        !dealInvestmentEsignIsFullyCompleted({
          esignStatusJson: esignStatusJson || null,
          docSignedDate: docSignedDate || null,
          profileId: profileId || null,
        })
      ) {
        res.status(400).json({ message: FUND_APPROVAL_REQUIRES_ESIGN_MESSAGE });
        return;
      }
    }
    const fundApprovedBy = fundApproved ? user.id : null;
    const fundApprovedAt = fundApproved ? new Date() : null;

    if (file && "buffer" in file && file.buffer && file.buffer.length > 0) {
      documentStoragePath = await saveSubscriptionDocument({
        dealId,
        file: {
          buffer: file.buffer,
          originalname: file.originalname || "document",
        },
      });
    }

    const row = await insertDealInvestment({
      dealId,
      input: {
        offeringId,
        contactId,
        contactDisplayName,
        profileId,
        userInvestorProfileId: userInvestorProfileId || null,
        investor_role,
        fundApproved,
        fundApprovedBy,
        fundApprovedAt,
        status,
        investorClass: resolvedInvestorClass,
        docSignedDate,
        commitmentAmount,
        extraContributionAmounts,
        documentStoragePath,
      },
    });

    if (!contactIsPlaceholder) {
      await upsertDealMemberForDeal(dealId, {
        contactMemberId: contactId,
        dealMemberRole: investor_role,
        sendInvitationMail,
        addedByUserId: user.id,
      });
    }
    await reconcileAssigningDealUsersForDeal(dealId, user.id);
    if (!autosave && !contactIsPlaceholder) {
      await sendDealMemberInviteForInvestmentIfRequested({
        dealId,
        contactId,
        contactDisplayName: contactDisplayName.trim(),
        sendInvitationMail,
        dealMemberRole: investor_role,
        contactEmail: contactEmail.trim() || null,
        invitationSource: "deal_member",
      });
    }
    if (!autosave && !contactIsPlaceholder && fundApproved) {
      await sendDealFundApprovedNotification({
        dealId,
        contactId,
        contactDisplayName: contactDisplayName.trim(),
      });
    }
    const [investor] = await mapDealInvestmentsToInvestorApi([row]);
    if (!autosave) {
      logSocDealInvestmentWrite({
        operation: "create",
        actorUserId: user.id,
        dealId,
        investmentId: row.id,
        fundApproved: Boolean(row.fundApproved),
        subscriptionDocumentAttached: Boolean(documentStoragePath),
      });
    }
    console.log("[postDealInvestment] saved to database", {
      deal_investment: {
        id: row.id,
        deal_id: row.dealId,
        offering_id: row.offeringId,
        contact_id: row.contactId,
        contact_display_name: row.contactDisplayName,
        profile_id: row.profileId,
        investor_role: row.investor_role,
        status: row.status,
        fund_approved: row.fundApproved,
        investor_class: row.investorClass,
        doc_signed_date: row.docSignedDate,
        commitment_amount: row.commitmentAmount,
        extra_contribution_amounts: row.extraContributionAmounts,
        document_storage_path: row.documentStoragePath ?? null,
      },
      deal_member_upsert: {
        deal_id: dealId,
        added_by: user.id,
        contact_member_id: contactId,
        deal_member_role: investor_role,
        send_invitation_mail: sendInvitationMail,
      },
    });
    res.status(201).json({
      message: "Investment recorded",
      investor,
    });
  } catch (err) {
    if (isDealRosterEligibilityError(err)) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("postDealInvestment:", err);
    res.status(500).json({ message: "Could not save investment" });
  }
}
