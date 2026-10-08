import type { Request, Response } from "express";
import {
  logSocDealMemberInvitationSent,
  logSocDestructiveDealAction,
} from "../../audit/index.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import {
  deleteDealMemberRosterEntry,
  listDealMembersMappedToInvestorApi,
  markDealMemberInvitationMailSent,
  resolveDealLeadSponsorDisplayName,
} from "../../services/deal/dealMember.service.js";
import { sendDealMemberInvitationEmail } from "../../services/deal/dealMemberInvitationEmail.service.js";
import { isPortalUserSponsorOnDeal } from "../../services/deal/dealMemberScope.service.js";
import {
  dealHasEsignTemplateDocuments,
  getDealEsignTemplatesState,
  isEsignTemplateReady,
  parseSendEsignFileIds,
  resolveEsignFilesByIds,
} from "../../services/deal/dealEsignTemplates.service.js";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { getAddDealFormById } from "../../services/deal/dealForm.service.js";
import { parseEsignStatusJson, esignCategoryFromCommitmentProfileId } from "../../constants/deal-investor-esign-status.js";
import {
  getInvestorEsignStatusWithDropboxSync,
  syncDealInvestorEsignByTarget,
  commitmentProfileIdForEsignTarget,
} from "../../services/deal/dealMemberEsignCompletion.service.js";
import { resolveEsignFilesForInvestorProfile } from "../../services/deal/dealEsignProfileTemplate.service.js";
import {
  findInvestorEsignTargetByMetadata,
  markDealInvestorEsignPending,
  readInvestorEsignStatusJson,
  resolveEsignTargetForInvestorRowId,
} from "../../services/deal/dealMemberEsignStatus.service.js";
import {
  applyInvestorPreviewToEsignDocuments,
  createInvestorSignatureRequest,
  esignDocumentsFromSelectedFiles,
  esignTemplateDisplayNameForFile,
} from "../../services/deal/dealMemberSendEsign.service.js";
import { sendDealMemberSendEsignEmail } from "../../services/deal/dealMemberSendEsign.service.js";
import { resolveViewerDealMemberRoleOnDeal } from "../../services/deal/dealMemberScope.service.js";
import {
  getViewerCoSponsorEmailIntercept,
  normalizeCoSponsorEmailIntercept,
  updateViewerCoSponsorEmailIntercept,
} from "../../services/deal/dealCoSponsorEmailIntercept.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  decodeOfferingPreviewSponsorRefParam,
  resolveOfferingPreviewSponsorAttribution,
} from "../../services/deal/offeringPreviewSponsorRef.service.js";

/**
 * GET /deals/:dealId/members — roster from `deal_member`, merged with investment
 * data (commitment = sum of all `deal_investment` rows per contact on this deal;
 * other fields from the newest matching investment row).
 */
export async function getDealMembers(
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
    const refRaw =
      req.query.referring_sponsor_ref ??
      req.query.referringSponsorRef ??
      req.query.ref;
    const sponsorRef = decodeOfferingPreviewSponsorRefParam(
      typeof refRaw === "string"
        ? refRaw
        : Array.isArray(refRaw) && typeof refRaw[0] === "string"
          ? refRaw[0]
          : "",
    );

    const [membersRaw, viewerDealMemberRole, leadSponsorDisplayName] =
      await Promise.all([
        listDealMembersMappedToInvestorApi(dealId, user.id),
        resolveViewerDealMemberRoleOnDeal(dealId, user.id),
        resolveDealLeadSponsorDisplayName(dealId),
      ]);
    const members =
      viewerDealMemberRole === "co_sponsor" ? [] : membersRaw;

    const referringSponsor = sponsorRef
      ? await resolveOfferingPreviewSponsorAttribution(dealId, sponsorRef)
      : null;
    if (process.env.DEAL_MEMBERS_COMMIT_DEBUG === "1") {
      console.log(
        `[deal members commit debug] dealId=${dealId} rows=${members.length}`,
      );
      for (const m of members) {
        console.log(
          `  id=${m.id} name=${JSON.stringify(m.displayName)} committed=${JSON.stringify(m.committed)} commitmentAmountRaw=${JSON.stringify(m.commitmentAmountRaw)}`,
        );
      }
    }
    res.status(200).json({
      members,
      viewerDealMemberRole,
      leadSponsorDisplayName: leadSponsorDisplayName || undefined,
      ...(referringSponsor
        ? {
            referringSponsorDisplayName: referringSponsor.displayName,
            referringSponsorRef: sponsorRef,
          }
        : {}),
    });
  } catch (err) {
    console.error("getDealMembers:", err);
    res.status(500).json({ message: "Could not load deal members" });
  }
}

/**
 * GET /deals/:dealId/referring-sponsor?ref=…
 * Resolves the sponsor name encoded in an offering preview link for Invest Now onboarding.
 */
export async function getDealReferringSponsor(
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
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const refRaw =
    req.query.referring_sponsor_ref ??
    req.query.referringSponsorRef ??
    req.query.ref;
  const sponsorRef = decodeOfferingPreviewSponsorRefParam(
    typeof refRaw === "string"
      ? refRaw
      : Array.isArray(refRaw) && typeof refRaw[0] === "string"
        ? refRaw[0]
        : "",
  );
  if (!sponsorRef) {
    res.status(400).json({ message: "Missing or invalid ref parameter." });
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
    const referringSponsor = await resolveOfferingPreviewSponsorAttribution(
      dealId,
      sponsorRef,
    );
    if (!referringSponsor) {
      res.status(404).json({ message: "Invalid or expired sponsor link." });
      return;
    }
    res.status(200).json({
      referringSponsorDisplayName: referringSponsor.displayName,
      referringSponsorRef: sponsorRef,
    });
  } catch (err) {
    console.error("getDealReferringSponsor:", err);
    res.status(500).json({ message: "Could not resolve referring sponsor." });
  }
}

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

/**
 * POST /deals/:dealId/members/send-invitation-email
 * Body: {
 *   to_email: string
 *   member_display_name?: string
 *   invitation_source?: "investor" | "deal_member" (default: investor) — from Investors tab vs Deal members
 *   deal_member_role?: string — Role label from Deal members tab when source is deal_member
 * }
 * Sends the invitation email template using SMTP / env from `.env.local`.
 */
export async function postDealMemberInvitationEmail(
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
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const toEmail = bodyString(b.to_email ?? b.toEmail);
  const memberDisplayName = bodyString(b.member_display_name ?? b.memberDisplayName);
  const sourceRaw = bodyString(
    b.invitation_source ?? b.invitationSource,
  ).toLowerCase();
  const invitationSource: "investor" | "deal_member" =
    sourceRaw === "deal_member" || sourceRaw === "member" ? "deal_member" : "investor";
  const dealMemberRole = bodyString(b.deal_member_role ?? b.dealMemberRole);
  const contactMemberId = bodyString(
    b.contact_member_id ?? b.contactMemberId ?? b.roster_id ?? b.rosterId,
  );

  if (!toEmail.trim() || !toEmail.includes("@")) {
    res.status(400).json({ message: "Valid to_email is required" });
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

    const result = await sendDealMemberInvitationEmail({
      dealId,
      toEmail: toEmail.trim(),
      memberDisplayName: memberDisplayName.trim() || undefined,
      invitationSource,
      dealMemberRoleLabel:
        invitationSource === "deal_member" ? dealMemberRole.trim() : "",
    });

    if (!result.ok) {
      const msg =
        result.error instanceof Error
          ? result.error.message
          : "Could not send email";
      res.status(502).json({ message: msg });
      return;
    }
    await markDealMemberInvitationMailSent(dealId, {
      toEmail: toEmail.trim(),
      ...(contactMemberId ? { contactMemberId } : {}),
    });
    logSocDealMemberInvitationSent({
      actorUserId: user.id,
      dealId: dealId.trim(),
    });
    res.status(200).json({ message: "Invitation email sent" });
  } catch (err) {
    console.error("postDealMemberInvitationEmail:", err);
    res.status(500).json({ message: "Could not send invitation email" });
  }
}

/**
 * POST /deals/:dealId/members/send-esign
 * Body: { to_email: string, member_display_name?: string, roster_id?: string, file_ids?: string[] }
 * Lead, admin, or co-sponsor on this deal only. Sends eSign notification email to the investor.
 */
export async function postDealMemberSendEsign(
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
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const toEmail = bodyString(b.to_email ?? b.toEmail);
  const memberDisplayName = bodyString(b.member_display_name ?? b.memberDisplayName);
  const rosterId = bodyString(b.roster_id ?? b.rosterId);

  if (!toEmail.trim() || !toEmail.includes("@")) {
    res.status(400).json({ message: "Valid to_email is required" });
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

    const isSponsor = await isPortalUserSponsorOnDeal(dealId, user.id);
    if (!isSponsor) {
      res.status(403).json({
        message:
          "Only a lead sponsor, admin sponsor, or co-sponsor on this deal can send eSign documents",
      });
      return;
    }

    const esignState = await getDealEsignTemplatesState(dealId);
    if (!dealHasEsignTemplateDocuments(esignState)) {
      res.status(400).json({
        message:
          "Upload at least one document on the eSign Templates tab before sending",
      });
      return;
    }

    const fileIds = parseSendEsignFileIds(b.file_ids ?? b.fileIds);
    if (fileIds.length === 0) {
      res.status(400).json({
        message: "Select at least one document to send",
      });
      return;
    }

    const selectedFiles = resolveEsignFilesByIds(esignState, fileIds);
    if (selectedFiles.length !== fileIds.length) {
      res.status(400).json({
        message: "One or more selected documents are invalid for this deal",
      });
      return;
    }

    const notReady = selectedFiles.filter((f) => !isEsignTemplateReady(f));
    if (notReady.length > 0) {
      res.status(400).json({
        message:
          "Each selected document must have a saved eSign template before sending",
      });
      return;
    }

    if (!getActiveEsignProvider()) {
      res.status(503).json({
        message:
          "eSign is not configured. Set SIGNFLOW_API_BASE_URL + SIGNFLOW_API_KEY (see API_INTEGRATION.md) or Dropbox Sign credentials.",
      });
      return;
    }

    const deal = await getAddDealFormById(dealId);
    const dealName = deal?.dealName?.trim() || "Deal";
    const resolvedRosterId = rosterId.trim();
    if (!resolvedRosterId) {
      res.status(400).json({ message: "roster_id is required for eSign" });
      return;
    }

    const esignTarget =
      (await resolveEsignTargetForInvestorRowId(dealId, resolvedRosterId)) ??
      (await findInvestorEsignTargetByMetadata(dealId, resolvedRosterId));
    if (!esignTarget) {
      res.status(400).json({ message: "Investor roster entry not found on this deal" });
      return;
    }

    if (getActiveEsignProvider()) {
      try {
        await syncDealInvestorEsignByTarget(dealId, esignTarget);
      } catch (err) {
        console.warn("syncDealInvestorEsignByTarget before send:", err);
      }
    }
    const commitmentProfileId =
      (await commitmentProfileIdForEsignTarget(dealId, esignTarget)) ?? undefined;
    const preferredCategoryId =
      esignCategoryFromCommitmentProfileId(commitmentProfileId) ?? undefined;
    const esignApi = parseEsignStatusJson(
      await readInvestorEsignStatusJson(dealId, esignTarget),
      preferredCategoryId,
    );
    if (esignApi?.completedAt?.trim()) {
      res.status(400).json({
        message:
          "E-sign is already completed for this investor's profile. Open the Signed column for status and signed documents.",
      });
      return;
    }

    if (commitmentProfileId) {
      const applicable = await resolveEsignFilesForInvestorProfile(
        esignState.files,
        commitmentProfileId,
      );
      const applicableIds = new Set(applicable.map((f) => f.id));
      const invalid = selectedFiles.filter((f) => !applicableIds.has(f.id));
      if (invalid.length > 0 || applicable.length === 0) {
        res.status(400).json({
          message:
            "The selected document is not configured for this investor's profile. Add investor fields for their profile in the eSign template editor.",
        });
        return;
      }
    }

    let signatureRequestId: string | undefined;
    let signatureId: string | undefined;
    let investorPreviewRelativePath: string | undefined;
    try {
      const sig = await createInvestorSignatureRequest({
        dealId,
        rosterId: resolvedRosterId,
        toEmail: toEmail.trim(),
        memberDisplayName: memberDisplayName.trim() || undefined,
        dealName,
        selectedFiles,
        esignTarget,
        commitmentProfileId,
      });
      if (!sig) {
        res.status(502).json({
          message: "Could not create Dropbox Sign signature request",
        });
        return;
      }
      signatureRequestId = sig.signatureRequestId;
      signatureId = sig.signatureId;
      investorPreviewRelativePath = sig.investorPreviewRelativePath;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not create Dropbox Sign signature request";
      res.status(502).json({ message: msg });
      return;
    }

    await markDealInvestorEsignPending(dealId, {
      rosterId: resolvedRosterId,
      toEmail: toEmail.trim(),
      documents: applyInvestorPreviewToEsignDocuments(
        esignDocumentsFromSelectedFiles(selectedFiles),
        investorPreviewRelativePath,
      ),
      signatureRequestId,
      signatureId,
    });

    try {
      const { notifySequentialInvestorsSignTurnAvailable } = await import(
        "../../services/deal/dealEsignStageNotificationEmail.service.js"
      );
      await notifySequentialInvestorsSignTurnAvailable(dealId);
    } catch (err) {
      console.warn(
        "notifySequentialInvestorsSignTurnAvailable (member send esign):",
        err,
      );
    }

    const result = await sendDealMemberSendEsignEmail({
      dealId,
      toEmail: toEmail.trim(),
      memberDisplayName: memberDisplayName.trim() || undefined,
      documentNames: selectedFiles.map((f) => esignTemplateDisplayNameForFile(f)),
    });

    if (!result.ok) {
      const msg =
        result.error instanceof Error
          ? result.error.message
          : "Could not send eSign email";
      res.status(502).json({
        message: `${msg} The signing request was created and is pending for this investor; resend the email when ready.`,
      });
      return;
    }

    res.status(200).json({ message: "E-sign email sent" });
  } catch (err) {
    console.error("postDealMemberSendEsign:", err);
    res.status(500).json({ message: "Could not send eSign email" });
  }
}

/**
 * GET /deals/:dealId/members/:rowId/esign-status
 * Syncs viewed / signed / completed timestamps from Dropbox Sign for the status popup.
 */
export async function getDealMemberEsignStatus(
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
  const rowId =
    typeof req.params.rowId === "string"
      ? req.params.rowId
      : req.params.rowId?.[0];
  if (!dealId?.trim() || !rowId?.trim()) {
    res.status(400).json({ message: "Missing deal id or row id" });
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

    const isSponsor = await isPortalUserSponsorOnDeal(dealId, user.id);
    if (!isSponsor) {
      res.status(403).json({
        message:
          "Only a lead sponsor, admin sponsor, or co-sponsor on this deal can view eSign status",
      });
      return;
    }

    const result = await getInvestorEsignStatusWithDropboxSync(
      dealId.trim(),
      rowId.trim(),
    );
    if (!result.sends.length && !result.status?.sentAt) {
      res.status(404).json({ message: "No eSign request found for this investor" });
      return;
    }

    res.status(200).json({
      status: result.status
        ? {
            sentAt: result.status.sentAt,
            viewedAt: result.status.viewedAt,
            signedAt: result.status.signedAt,
            completedAt: result.status.completedAt,
            signatureRequestId: result.status.signatureRequestId,
            documents: result.status.documents,
          }
        : null,
      sends: result.sends.map((send) => ({
        categoryId: send.categoryId,
        sentAt: send.sentAt,
        viewedAt: send.viewedAt,
        signedAt: send.signedAt,
        completedAt: send.completedAt,
        signatureRequestId: send.signatureRequestId,
        signatureId: send.signatureId,
        documents: send.documents,
      })),
      dropbox: result.dropbox,
      syncedAt: result.syncedAt,
    });
  } catch (err) {
    console.error("getDealMemberEsignStatus:", err);
    res.status(500).json({ message: "Could not load eSign status from Dropbox Sign" });
  }
}

/**
 * DELETE /deals/:dealId/members/:rowId — remove member from roster (investment id or deal_member id).
 */
export async function deleteDealMember(
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
  const rowId =
    typeof req.params.rowId === "string"
      ? req.params.rowId
      : req.params.rowId?.[0];
  if (!dealId?.trim() || !rowId?.trim()) {
    res.status(400).json({ message: "Missing deal id or row id" });
    return;
  }
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
    const result = await deleteDealMemberRosterEntry(dealId, rowId);
    if (!result.ok) {
      res.status(404).json({ message: result.message });
      return;
    }
    logSocDestructiveDealAction({
      action: "deal.member_remove",
      actorUserId: user.id,
      dealId: dealId.trim(),
      resourceId: rowId.trim(),
    });
    res.status(200).json({ message: "Member removed" });
  } catch (err) {
    console.error("deleteDealMember:", err);
    res.status(500).json({ message: "Could not remove member" });
  }
}

async function assertDealReadableForMemberSettings(
  req: Request,
  res: Response,
  userId: string,
  userRole: string | undefined,
): Promise<string | null> {
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return null;
  }
  const scope = await resolveDealViewerScope(
    userId,
    userRole,
    requestedOrganizationIdFromRequest(req),
  );
  if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
    res.status(404).json({ message: "Deal not found" });
    return null;
  }
  return dealId;
}

/**
 * GET /deals/:dealId/co-sponsor-email-intercept
 * Deal-scoped intercept preference for the signed-in co-sponsor only.
 */
export async function getDealCoSponsorEmailIntercept(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const dealId = await assertDealReadableForMemberSettings(
      req,
      res,
      user.id,
      user.userRole,
    );
    if (!dealId) return;
    const intercept = await getViewerCoSponsorEmailIntercept(dealId, user.id);
    if (intercept == null) {
      res.status(200).json({ applicable: false, intercept: null });
      return;
    }
    res.status(200).json({ applicable: true, intercept });
  } catch (err) {
    console.error("getDealCoSponsorEmailIntercept:", err);
    res.status(500).json({ message: "Could not load email intercept setting" });
  }
}

/**
 * PATCH /deals/:dealId/co-sponsor-email-intercept
 * Co-sponsor sets yes/no intercept for lead-sponsor emails on this deal.
 */
export async function patchDealCoSponsorEmailIntercept(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const dealId = await assertDealReadableForMemberSettings(
      req,
      res,
      user.id,
      user.userRole,
    );
    if (!dealId) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const raw =
      b.intercept ??
      b.emailIntercept ??
      b.leadSponsorEmailIntercept ??
      b.lead_sponsor_email_intercept;
    if (raw == null || String(raw).trim() === "") {
      res.status(400).json({
        message: "Field intercept is required (yes intercept or no intercept)",
      });
      return;
    }
    const value = normalizeCoSponsorEmailIntercept(raw);
    const updated = await updateViewerCoSponsorEmailIntercept(
      dealId,
      user.id,
      value,
    );
    if (updated == null) {
      res.status(403).json({
        message:
          "Email intercept is available only for a co-sponsor on this deal.",
      });
      return;
    }
    res.status(200).json({ applicable: true, intercept: updated });
  } catch (err) {
    console.error("patchDealCoSponsorEmailIntercept:", err);
    res.status(500).json({ message: "Could not save email intercept setting" });
  }
}
